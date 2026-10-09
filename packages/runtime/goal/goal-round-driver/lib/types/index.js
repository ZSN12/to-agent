"use strict";
/**
 * Same-session goal-round driver over public agent, session, and goal services.
 * @module @z/dsh-goal-round-driver
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.name = exports.renderGoalRoundPrompt = void 0;
exports.apply = apply;
var node_util_1 = require("node:util");
var cordis_1 = require("@z/cordis");
var dsh_llm_1 = require("@z/dsh-llm");
var prompt_ts_1 = require("./prompt.ts");
var prompt_ts_2 = require("./prompt.ts");
Object.defineProperty(exports, "renderGoalRoundPrompt", { enumerable: true, get: function () { return prompt_ts_2.renderGoalRoundPrompt; } });
exports.name = 'goal-round-driver';
exports.inject = ['agents', 'goals', 'sessions'];
/** Whether a source identifies an automatic, positive-numbered goal round. */
function isGoalRoundSource(source) {
    return source.kind === 'goal' && source.round > 0;
}
/** Compare a source to one reserved identity. */
function sameRound(source, round) {
    return source.goalId === round.goalId
        && source.revision === round.revision
        && source.round === round.round;
}
/** Compare the complete queued record to the driver's reservation. */
function sameQueued(content, source, attempt) {
    return isGoalRoundSource(source) && sameRound(source, attempt) && (0, node_util_1.isDeepStrictEqual)(content, attempt.content);
}
/** Exact current ref for a view. */
function goalRef(goal) {
    return { id: goal.id, revision: goal.revision };
}
/** Human-readable unexpected values for logs. */
function renderThrown(value) {
    return value instanceof Error ? value.message : String(value);
}
/** Install automatic same-session continuation and its race fences. */
function apply(ctx) {
    var states = new Map();
    /** Create state for an exact currently live agent. */
    function stateFor(agent) {
        var existing = states.get(agent);
        if (existing !== undefined)
            return existing;
        var state = {
            agent: agent,
            attempt: undefined,
            competingQueued: false,
            needsCheckpoint: false,
            requested: false,
            run: undefined,
            stopping: false,
        };
        states.set(agent, state);
        return state;
    }
    /** Read only when the exact Agent remains live. */
    function currentGoal(state) {
        if (ctx.agents.get(state.agent.id) !== state.agent)
            return undefined;
        return ctx.goals.get(state.agent);
    }
    /** Whether this exact lifecycle is quiescent with no competing prompt. */
    function readyToDrive(state) {
        return ctx.fiber.state === cordis_1.FiberState.ACTIVE
            && !state.stopping
            && ctx.agents.get(state.agent.id) === state.agent
            && state.agent.status === 'idle'
            && !state.competingQueued;
    }
    /** Recheck every condition that an awaited checkpoint may have changed. */
    function readyAfterCheckpoint(state) {
        return readyToDrive(state) && !state.needsCheckpoint;
    }
    /** Remove automatic authority while preserving the durable phase. */
    function disarm(state) {
        try {
            var goal = currentGoal(state);
            if ((goal === null || goal === void 0 ? void 0 : goal.activation) === 'armed')
                ctx.goals.disarm(state.agent);
        }
        catch (error) {
            ctx.logger.warn("goal-round-driver: could not disarm agent \"".concat(state.agent.id, "\": ").concat(renderThrown(error)));
        }
    }
    /** Preserve claimed step context when this driver drops only its own round. */
    function restoreOtherClaimed(agent, messages, messageId) {
        var retained = messages.filter(function (message) { return message.id !== messageId
            && !(message.source.kind === 'goal' && message.source.round === 0); });
        var _loop_1 = function (message) {
            if (agent.inbox.nextStep.some(function (candidate) { return candidate.id === message.id; })
                || agent.inbox.nextTurn.some(function (candidate) { return candidate.id === message.id; }))
                return "continue";
            agent.inbox.prepend('next-step', message);
        };
        for (var _i = 0, _a = retained.toReversed(); _i < _a.length; _i++) {
            var message = _a[_i];
            _loop_1(message);
        }
    }
    /** Process admitted work at quiescence, then reserve at most one next round. */
    function drive(state) {
        return __awaiter(this, void 0, void 0, function () {
            var agent, error_1, attempt, goal, round, content, message, reservation, latest;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        agent = state.agent;
                        if (!readyToDrive(state))
                            return [2 /*return*/];
                        if (!state.needsCheckpoint) return [3 /*break*/, 5];
                        state.needsCheckpoint = false;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, ctx.sessions.flush(agent.session)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        ctx.logger.warn("goal-round-driver: durability checkpoint failed for agent \"".concat(agent.id, "\": ").concat(renderThrown(error_1)));
                        disarm(state);
                        return [2 /*return*/];
                    case 4:
                        // A mutation or ordinary prompt may have arrived while the checkpoint
                        // was settling. Give it its own checkpoint / turn before reserving.
                        if (!readyAfterCheckpoint(state))
                            return [2 /*return*/];
                        _a.label = 5;
                    case 5:
                        attempt = state.attempt;
                        if (attempt !== undefined) {
                            state.attempt = undefined;
                            state.needsCheckpoint = true;
                            state.requested = true;
                            return [2 /*return*/];
                        }
                        goal = currentGoal(state);
                        if (goal === undefined || goal.phase !== 'active' || goal.activation !== 'armed')
                            return [2 /*return*/];
                        if (goal.roundsStarted >= goal.maxGoalRounds) {
                            ctx.goals.block(agent, goalRef(goal), {
                                code: 'round-limit',
                                message: "Goal reached its configured limit of ".concat(goal.maxGoalRounds, " rounds."),
                            });
                            return [2 /*return*/];
                        }
                        round = goal.roundsStarted + 1;
                        content = (0, prompt_ts_1.renderGoalRoundPrompt)(goal, round);
                        message = (0, dsh_llm_1.createUserMessage)({
                            content: content,
                            source: { kind: 'goal', goalId: goal.id, revision: goal.revision, round: round },
                        });
                        reservation = {
                            goalId: goal.id,
                            revision: goal.revision,
                            round: round,
                            messageId: message.id,
                            content: content,
                            phase: 'queued',
                            cancelled: false,
                            stale: false,
                        };
                        state.attempt = reservation;
                        try {
                            agent.followup(message);
                        }
                        catch (error) {
                            state.attempt = undefined;
                            ctx.logger.warn("goal-round-driver: could not queue round ".concat(round, " for agent \"").concat(agent.id, "\": ").concat(renderThrown(error)));
                            latest = currentGoal(state);
                            if (latest !== undefined && latest.id === goal.id && latest.revision === goal.revision
                                && latest.phase === 'active' && latest.activation === 'armed') {
                                ctx.goals.block(agent, goalRef(latest), {
                                    code: 'queue-failed',
                                    message: "Could not queue goal round ".concat(round, ": ").concat(renderThrown(error)),
                                });
                            }
                        }
                        return [2 /*return*/];
                }
            });
        });
    }
    /** Coalesce triggers onto one agent-local serialized driver. */
    function requestDrive(state) {
        var _this = this;
        /* v8 ignore next -- teardown may race a final trigger after synchronously closing the step fence */
        if (state.stopping)
            return;
        state.requested = true;
        if (state.run !== undefined)
            return;
        var run;
        try {
            run = ctx.agents.withoutInitiator(function () { return __awaiter(_this, void 0, void 0, function () {
                var error_2;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!(state.requested && !state.stopping)) return [3 /*break*/, 5];
                            state.requested = false;
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, drive(state)];
                        case 2:
                            _a.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            error_2 = _a.sent();
                            ctx.logger.warn("goal-round-driver: driver failed for agent \"".concat(state.agent.id, "\": ").concat(renderThrown(error_2)));
                            disarm(state);
                            return [3 /*break*/, 4];
                        case 4: return [3 /*break*/, 0];
                        case 5: return [2 /*return*/];
                    }
                });
            }); });
        }
        catch (error) {
            ctx.logger.warn("goal-round-driver: could not start driver for agent \"".concat(state.agent.id, "\": ").concat(renderThrown(error)));
            disarm(state);
            return;
        }
        state.run = run;
        var retire = function () {
            state.run = undefined;
            if (state.requested && !state.stopping)
                requestDrive(state);
        };
        void run.then(retire, function (error) {
            ctx.logger.warn("goal-round-driver: driver task rejected for agent \"".concat(state.agent.id, "\": ").concat(renderThrown(error)));
            disarm(state);
            retire();
        });
    }
    // One composite effect keeps the step fence installed until this
    // plugin's own scheduling tasks settle.
    ctx.effect(function () {
        /** Fail closed unless the queued prompt still owns the exact live revision. */
        function validReservation(state, content, source) {
            var attempt = state.attempt;
            var goal = currentGoal(state);
            return ctx.fiber.state === cordis_1.FiberState.ACTIVE
                && !state.stopping && attempt !== undefined && attempt.phase === 'claimed'
                && !attempt.stale && sameQueued(content, source, attempt)
                && goal !== undefined && goal.id === source.goalId && goal.revision === source.revision
                && goal.phase === 'active' && goal.activation === 'armed'
                && source.round === goal.roundsStarted + 1;
        }
        var _i, _a, agent, state;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    ctx.on('agent/error', function (_a) {
                        var agent = _a.agent;
                        var state = stateFor(agent);
                        disarm(state);
                    });
                    ctx.on('agent/created', function (_a) {
                        var agent = _a.agent;
                        stateFor(agent);
                    });
                    ctx.on('agent/disposed', function (_a) {
                        var agent = _a.agent;
                        states.delete(agent);
                    });
                    ctx.on('agent/session-start', function (_a) {
                        var agent = _a.agent;
                        var state = stateFor(agent);
                        state.attempt = undefined;
                        state.competingQueued = false;
                        state.needsCheckpoint = false;
                    });
                    ctx.on('agent/status', function (_a) {
                        var agent = _a.agent, status = _a.status;
                        var state = stateFor(agent);
                        if (status === 'idle') {
                            state.competingQueued = false;
                            var attempt = state.attempt;
                            var goal = currentGoal(state);
                            if (((attempt === null || attempt === void 0 ? void 0 : attempt.phase) === 'queued' || (attempt === null || attempt === void 0 ? void 0 : attempt.phase) === 'claimed' || (attempt === null || attempt === void 0 ? void 0 : attempt.cancelled))
                                && (goal === null || goal === void 0 ? void 0 : goal.phase) === 'active' && goal.activation === 'armed') {
                                state.attempt = undefined;
                                try {
                                    ctx.goals.pause(agent, goalRef(goal));
                                }
                                catch (error) {
                                    ctx.logger.warn("goal-round-driver: could not pause cancelled goal for agent \"".concat(agent.id, "\": ").concat(renderThrown(error)));
                                    disarm(state);
                                }
                            }
                            requestDrive(state);
                        }
                    });
                    ctx.on('goal/changed', function (_a) {
                        var agent = _a.agent;
                        var state = stateFor(agent);
                        state.needsCheckpoint = true;
                        requestDrive(state);
                    });
                    ctx.on('agent/inbox/inserted', function (_a) {
                        var agent = _a.agent, message = _a.message;
                        if (!agent.inbox.nextTurn.some(function (candidate) { return candidate.id === message.id; }))
                            return;
                        var state = stateFor(agent);
                        var attempt = state.attempt;
                        if (attempt !== undefined && sameQueued(message.content, message.source, attempt))
                            return;
                        state.competingQueued = true;
                        if ((attempt === null || attempt === void 0 ? void 0 : attempt.phase) === 'queued')
                            attempt.stale = true;
                    });
                    ctx.on('agent/inbox/claimed', function (_a) {
                        var agent = _a.agent, message = _a.message;
                        var state = stateFor(agent);
                        var attempt = state.attempt;
                        if (attempt !== undefined && sameQueued(message.content, message.source, attempt)) {
                            attempt.phase = 'claimed';
                        }
                    });
                    ctx.on('agent/inbox/discarded', function (_a) {
                        var agent = _a.agent, message = _a.message;
                        var state = stateFor(agent);
                        var attempt = state.attempt;
                        if (attempt !== undefined && sameQueued(message.content, message.source, attempt)) {
                            attempt.cancelled = true;
                        }
                    });
                    ctx.on('session/event', function (session, event) {
                        var _a, _b;
                        var agent = ctx.agents.get(session.id);
                        if (agent === undefined || agent.session !== session)
                            return;
                        var state = stateFor(agent);
                        switch (event.type) {
                            case 'user/message':
                                if (state.attempt !== undefined && event.data.id === state.attempt.messageId) {
                                    state.attempt.phase = 'admitted';
                                }
                                return;
                            case 'turn/end':
                                if (event.data.reason.kind === 'max-tokens') {
                                    disarm(state);
                                    return;
                                }
                                if (event.data.reason.kind !== 'aborted')
                                    return;
                                if (((_a = state.attempt) === null || _a === void 0 ? void 0 : _a.phase) === 'claimed' || ((_b = state.attempt) === null || _b === void 0 ? void 0 : _b.phase) === 'admitted') {
                                    state.attempt.cancelled = true;
                                }
                                else
                                    disarm(state);
                                return;
                            default:
                                return;
                        }
                    });
                    ctx.on('agent/pre-step', function (_a, next_1) { return __awaiter(_this, [_a, next_1], void 0, function (_b, next) {
                        var submitted, content, source, state, valid, attempt, decision, error_3, goal;
                        var agent = _b.agent, messages = _b.messages, signal = _b.signal;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    submitted = messages.find(function (message) {
                                        return isGoalRoundSource(message.source);
                                    });
                                    if (submitted === undefined)
                                        return [2 /*return*/, next()];
                                    content = submitted.content, source = submitted.source;
                                    state = stateFor(agent);
                                    valid = false;
                                    try {
                                        valid = validReservation(state, content, source);
                                    }
                                    catch (error) {
                                        ctx.logger.warn("goal-round-driver: pre-step check failed for agent \"".concat(agent.id, "\": ").concat(renderThrown(error)));
                                        disarm(state);
                                    }
                                    if (!valid) {
                                        attempt = state.attempt;
                                        if (attempt !== undefined && sameRound(source, attempt)) {
                                            attempt.stale = true;
                                            state.attempt = undefined;
                                        }
                                        restoreOtherClaimed(agent, messages, submitted.id);
                                        requestDrive(state);
                                        return [2 /*return*/, { kind: 'reject' }];
                                    }
                                    _c.label = 1;
                                case 1:
                                    _c.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, next()];
                                case 2:
                                    decision = _c.sent();
                                    return [3 /*break*/, 4];
                                case 3:
                                    error_3 = _c.sent();
                                    if (signal.aborted)
                                        throw error_3;
                                    // A throwing downstream hook drops the whole step proposal. Clear the
                                    // reservation before the balanced no-step turn returns to idle so the
                                    // next drive pass can reschedule the round.
                                    state.attempt = undefined;
                                    requestDrive(state);
                                    throw error_3;
                                case 4:
                                    if (signal.aborted) {
                                        if (decision.kind === 'enter')
                                            restoreOtherClaimed(agent, decision.messages, submitted.id);
                                        return [2 /*return*/, decision];
                                    }
                                    if (decision.kind === 'reject') {
                                        state.attempt = undefined;
                                        goal = currentGoal(state);
                                        if (goal !== undefined && goal.id === source.goalId && goal.revision === source.revision
                                            && goal.phase === 'active' && goal.activation === 'armed') {
                                            ctx.goals.block(agent, goalRef(goal), {
                                                code: 'prompt-rejected',
                                                message: 'Goal round was rejected before entering its step.',
                                            });
                                        }
                                        return [2 /*return*/, decision];
                                    }
                                    try {
                                        valid = validReservation(state, content, source);
                                    }
                                    catch (error) {
                                        ctx.logger.warn("goal-round-driver: post-decision check failed for agent \"".concat(agent.id, "\": ").concat(renderThrown(error)));
                                        disarm(state);
                                        valid = false;
                                    }
                                    if (!valid) {
                                        state.attempt = undefined;
                                        restoreOtherClaimed(agent, decision.messages, submitted.id);
                                        requestDrive(state);
                                        return [2 /*return*/, { kind: 'reject' }];
                                    }
                                    return [2 /*return*/, decision];
                            }
                        });
                    }); });
                    // Loading a lifecycle driver over existing agents never inherits hidden
                    // automatic authority from an earlier producer instance.
                    for (_i = 0, _a = ctx.agents.list(); _i < _a.length; _i++) {
                        agent = _a[_i];
                        state = stateFor(agent);
                        disarm(state);
                    }
                    // Yielded after listener registration, so this close runs first and the
                    // composite effect removes listeners only after its promise settles.
                    return [4 /*yield*/, function () { return __awaiter(_this, void 0, void 0, function () {
                            var waits, _i, _a, state, attempt;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        waits = [];
                                        for (_i = 0, _a = states.values(); _i < _a.length; _i++) {
                                            state = _a[_i];
                                            state.stopping = true;
                                            disarm(state);
                                            attempt = state.attempt;
                                            if (attempt !== undefined) {
                                                attempt.stale = true;
                                                /* v8 ignore next -- followup reserves the live agent before publishing a queued attempt */
                                                if (state.agent.status === 'running') {
                                                    state.agent.cancel({ kind: 'parent' });
                                                    waits.push(state.agent.whenIdle());
                                                }
                                            }
                                            if (state.run !== undefined)
                                                waits.push(state.run);
                                        }
                                        return [4 /*yield*/, Promise.allSettled(waits)];
                                    case 1:
                                        _b.sent();
                                        states.clear();
                                        return [2 /*return*/];
                                }
                            });
                        }); }];
                case 1:
                    // Yielded after listener registration, so this close runs first and the
                    // composite effect removes listeners only after its promise settles.
                    _b.sent();
                    return [2 /*return*/];
            }
        });
    }, 'goal-round-driver lifecycle');
}
