"use strict";
/**
 * Default Agent driver over queued turns and step-boundary input. Every request
 * is derived from the session log.
 * @module dsh-agent-loop/agent
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactLoopAgent = void 0;
var dsh_agent_1 = require("@z/dsh-agent");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_scope_1 = require("@z/dsh-scope");
var dsh_session_1 = require("@z/dsh-session");
var dsh_system_prompt_1 = require("@z/dsh-system-prompt");
var runtime_context_ts_1 = require("./runtime-context.ts");
var tool_calls_ts_1 = require("./tool-calls.ts");
/** Remove adapter-derived values before plugins propose the next request config. */
function requestProposal(header) {
    if (header.adapterDefaults === undefined)
        return header.config;
    var proposal = __assign({}, header.config);
    if (header.adapterDefaults.reasoningEffort === true)
        delete proposal.reasoningEffort;
    if (header.adapterDefaults.maxTokens === true)
        delete proposal.maxTokens;
    return proposal;
}
/** Drives one session through turn and step boundaries. */
var ReactLoopAgent = /** @class */ (function () {
    function ReactLoopAgent(loopCtx, id, options, session) {
        var _this = this;
        var _a, _b;
        this.loopCtx = loopCtx;
        this.id = id;
        this.options = options;
        this.session = session;
        this.activityDone = Promise.resolve();
        /** Whether this loop instance has appended its initial/resume request anchor. */
        this.requestHeaderLogged = false;
        this.dispatch = (0, dsh_agent_1.agentEvents)(loopCtx, this);
        this.inbox = new dsh_agent_1.Inbox(session, {
            inserted: function (message) { _this.dispatch.emit('agent/inbox/inserted', { message: message }); },
            discarded: function (message) { _this.dispatch.emit('agent/inbox/discarded', { message: message }); },
            claimed: function (message, turn) { _this.dispatch.emit('agent/inbox/claimed', { message: message, turn: turn }); },
        });
        var lastTurn = (_b = (_a = session.events.findLast(function (event) { return event.type === 'turn/start'; })) === null || _a === void 0 ? void 0 : _a.data.turn) !== null && _b !== void 0 ? _b : 0;
        this.phase = { kind: 'idle', lastTurn: lastTurn };
        this.scope = (0, dsh_scope_1.createScope)(loopCtx, this);
        this.ctx = this.scope.ctx.extend({ agent: this });
        this.runtimeContext = new runtime_context_ts_1.RuntimeContextProjection(this.ctx, session);
    }
    Object.defineProperty(ReactLoopAgent.prototype, "status", {
        get: function () {
            return this.phase.kind === 'idle' || this.phase.kind === 'maintenance' ? 'idle' : 'running';
        },
        enumerable: false,
        configurable: true
    });
    /** Commit a phase and publish its externally visible status transition. */
    ReactLoopAgent.prototype.setPhase = function (next) {
        var previousStatus = this.status;
        this.phase = next;
        var status = this.status;
        if (status !== previousStatus) {
            this.dispatch.emit('agent/status', { status: status });
        }
    };
    ReactLoopAgent.prototype.send = function (message, target, wakeup) {
        // Waking input cannot join an aborted activity, so it starts the next turn.
        // Captured before the insertion so a reentrant cancel from a splice observer cannot reclassify it.
        var wakingAfterAbort = wakeup && this.phase.kind !== 'idle' && this.phase.abort.signal.aborted;
        var resolvedTarget = wakingAfterAbort ? 'next-turn' : target;
        this.inbox.splice(resolvedTarget, Infinity, 0, [message]);
        if (wakeup)
            this.wakeDriver(wakingAfterAbort);
    };
    ReactLoopAgent.prototype.followup = function (input) {
        this.send(input, 'next-turn', true);
    };
    ReactLoopAgent.prototype.steer = function (input) {
        this.send(input, 'next-step', true);
    };
    ReactLoopAgent.prototype.inject = function (input) {
        this.send(input, 'next-step', false);
    };
    ReactLoopAgent.prototype.cancel = function (cause, options) {
        if (options === void 0) { options = {}; }
        if (!options.keepInbox) {
            this.inbox.clear();
            if (this.phase.kind !== 'idle')
                this.phase.wakeRequested = false;
        }
        if (this.phase.kind !== 'idle')
            this.phase.abort.abort(cause);
    };
    ReactLoopAgent.prototype.runMaintenance = function (job) {
        var _this = this;
        if (this.phase.kind !== 'idle')
            throw new Error("agent \"".concat(this.id, "\" already has active work"));
        var done = Promise.withResolvers();
        var maintenance = {
            kind: 'maintenance',
            abort: new AbortController(),
            lastTurn: this.phase.lastTurn,
            wakeRequested: false,
        };
        this.setPhase(maintenance);
        this.activityDone = done.promise;
        return (function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, , 2, 3]);
                        return [4 /*yield*/, job(maintenance.abort.signal)];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        this.setPhase({ kind: 'idle', lastTurn: maintenance.lastTurn });
                        if (maintenance.wakeRequested && this.inbox.hasPending)
                            this.wakeDriver();
                        done.resolve();
                        return [7 /*endfinally*/];
                    case 3: return [2 /*return*/];
                }
            });
        }); })();
    };
    /**
     * Start one driver, or latch its wake behind maintenance or an aborted
     * activity. A wake sent while idle always opens its turn boundary, even
     * when its message was cleared; only a latched replay is suppressed when
     * the queue no longer holds the wake.
     * @param wakeAfterAbort - the {@link send} classification, captured before
     *   the inbox insertion so a reentrant cancel cannot reclassify it.
     */
    ReactLoopAgent.prototype.wakeDriver = function (wakeAfterAbort) {
        var _this = this;
        if (wakeAfterAbort === void 0) { wakeAfterAbort = false; }
        if (this.phase.kind !== 'idle') {
            // Maintenance and aborted drivers cannot deliver the wake: latch it for
            // replay at convergence. Live drivers claim queued work themselves;
            // disposal never latches, so teardown waits on no model turn.
            var reason = this.phase.abort.signal.reason;
            if ((reason === null || reason === void 0 ? void 0 : reason.kind) !== 'disposed' && (this.phase.kind === 'maintenance' || wakeAfterAbort)) {
                this.phase.wakeRequested = true;
            }
            return;
        }
        var driver = Promise.withResolvers();
        this.activityDone = driver.promise;
        this.setPhase({
            kind: 'running',
            abort: new AbortController(),
            turn: this.phase.lastTurn,
            step: 0,
            wakeRequested: false,
        });
        this.loopCtx.agents.withInitiator(this, function () { return _this.kick(); }).then(driver.resolve, driver.reject);
    };
    ReactLoopAgent.prototype.whenIdle = function () {
        return __awaiter(this, void 0, void 0, function () {
            var activity;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (activity = this.activityDone)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        if (activity !== this.activityDone) return [3 /*break*/, 0];
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /** Report one failure at its live boundary, then preserve it for driver containment. */
    ReactLoopAgent.prototype.throwError = function (error) {
        var turn = this.phase.kind === 'running' ? this.phase.turn : this.phase.lastTurn;
        var step = this.phase.kind === 'running' ? this.phase.step : 0;
        this.dispatch.emit('agent/error', { turn: turn, step: step, error: error });
        throw error;
    };
    ReactLoopAgent.prototype.kick = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _error_1, _a, turn, wakeRequested;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 4, 5, 6]);
                        _b.label = 1;
                    case 1: return [4 /*yield*/, this.turn()];
                    case 2:
                        if (!_b.sent()) return [3 /*break*/, 3];
                        return [3 /*break*/, 1];
                    case 3: return [3 /*break*/, 6];
                    case 4:
                        _error_1 = _b.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        /* v8 ignore next -- kick owns a running phase until this driver boundary */
                        if (this.phase.kind === 'running') {
                            _a = this.phase, turn = _a.turn, wakeRequested = _a.wakeRequested;
                            this.setPhase({ kind: 'idle', lastTurn: turn });
                            if (wakeRequested && this.inbox.hasPending)
                                this.wakeDriver();
                        }
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    ReactLoopAgent.prototype.preStep = function (target, position) {
        return __awaiter(this, void 0, void 0, function () {
            var signal, claimed, assembly, sections, context, decision;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        /* v8 ignore next -- private callers establish the running phase before proposing a step */
                        if (this.phase.kind !== 'running')
                            throw new Error("agent \"".concat(this.id, "\": pre-step outside running phase"));
                        signal = this.phase.abort.signal;
                        claimed = this.inbox.claim(target, position.turn);
                        return [4 /*yield*/, this.loopCtx.systemPrompt.assemble((0, dsh_agent_1.assembleContextFor)(this, signal))];
                    case 1:
                        assembly = _a.sent();
                        signal.throwIfAborted();
                        sections = (0, dsh_system_prompt_1.renderContextSections)(assembly);
                        context = this.runtimeContext.project((0, dsh_system_prompt_1.joinContextSections)(sections), sections);
                        return [4 /*yield*/, this.dispatch.waterfall('agent/pre-step', __assign(__assign({ messages: claimed }, position), { signal: signal }), function () { return Promise.resolve({
                                kind: 'enter',
                                messages: context === undefined ? claimed : __spreadArray(__spreadArray([], claimed, true), [context], false),
                            }); })];
                    case 2:
                        decision = _a.sent();
                        signal.throwIfAborted();
                        return [2 /*return*/, decision.kind === 'reject' ? decision : __assign(__assign({}, decision), { assembly: assembly })];
                }
            });
        });
    };
    /** Open one turn before claiming its first proposed step. */
    ReactLoopAgent.prototype.turn = function () {
        return __awaiter(this, void 0, void 0, function () {
            var phase, signal, turn, turnEnds, target, step, decision, _i, _a, message, stepEnd, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (this.phase.kind !== 'running') {
                            this.throwError(new Error("agent \"".concat(this.id, "\": turn without driver reservation")));
                        }
                        phase = this.phase;
                        signal = phase.abort.signal;
                        signal.throwIfAborted();
                        turn = phase.turn + 1;
                        try {
                            this.session.append('turn/start', { turn: turn });
                        }
                        catch (error) {
                            this.throwError(error);
                        }
                        phase.turn = turn;
                        turnEnds = null;
                        target = 'next-turn';
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 11, 12, 13]);
                        _b.label = 2;
                    case 2:
                        if (!true) return [3 /*break*/, 10];
                        signal.throwIfAborted();
                        step = phase.step + 1;
                        return [4 /*yield*/, this.preStep(target, { turn: turn, step: step })];
                    case 3:
                        decision = _b.sent();
                        if (decision.kind === 'reject') {
                            turnEnds = { kind: 'blocked' };
                            return [2 /*return*/, false];
                        }
                        if (turnEnds && decision.messages.length === 0)
                            return [3 /*break*/, 10];
                        // A removed waking message or an enter decision rewritten to empty
                        // still owns the initial turn boundary, but it spends no model call.
                        if (phase.step === 0 && decision.messages.length === 0) {
                            turnEnds = { kind: 'completed' };
                            return [2 /*return*/, false];
                        }
                        signal.throwIfAborted();
                        this.session.append('step/start', { turn: turn, step: step });
                        phase.step = step;
                        _b.label = 4;
                    case 4:
                        _b.trys.push([4, , 6, 7]);
                        for (_i = 0, _a = decision.messages; _i < _a.length; _i++) {
                            message = _a[_i];
                            this.session.append('user/message', message, { surfaceOp: 'append' });
                        }
                        return [4 /*yield*/, this.step(decision.assembly)
                            // max-tokens stays sticky: a later completed step must not
                            // downgrade the turn outcome.
                        ];
                    case 5:
                        stepEnd = _b.sent();
                        // max-tokens stays sticky: a later completed step must not
                        // downgrade the turn outcome.
                        if (turnEnds === null || turnEnds.kind !== 'max-tokens')
                            turnEnds = stepEnd;
                        return [3 /*break*/, 7];
                    case 6:
                        this.session.append('step/end', { turn: turn, step: step });
                        return [7 /*endfinally*/];
                    case 7:
                        signal.throwIfAborted();
                        if (!(turnEnds && this.inbox.nextStep.length === 0)) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.dispatch.serial('agent/turn-stopping', { turn: turn, signal: signal })];
                    case 8:
                        _b.sent();
                        signal.throwIfAborted();
                        _b.label = 9;
                    case 9:
                        if (turnEnds && this.inbox.nextStep.length === 0)
                            return [3 /*break*/, 10];
                        target = 'next-step';
                        return [3 /*break*/, 2];
                    case 10: return [3 /*break*/, 13];
                    case 11:
                        error_1 = _b.sent();
                        if (signal.aborted) {
                            turnEnds = { kind: 'aborted', reason: signal.reason };
                            throw error_1;
                        }
                        // Every failure is structured: an `LlmError` keeps its facts, anything
                        // else flattens to `errorChain` text under the `UNKNOWN` code.
                        turnEnds = {
                            kind: 'error',
                            error: error_1 instanceof dsh_llm_1.LlmError
                                ? error_1.failure
                                : { message: (0, dsh_llm_1.errorChain)(error_1), code: 'UNKNOWN' },
                        };
                        this.throwError(error_1);
                        return [3 /*break*/, 13];
                    case 12:
                        try {
                            // oxlint-disable-next-line typescript/no-non-null-assertion -- every exit assigns a turn ending
                            this.session.append('turn/end', { turn: turn, reason: turnEnds });
                        }
                        catch (error) {
                            this.throwError(error);
                        }
                        return [7 /*endfinally*/];
                    case 13:
                        if (!this.inbox.hasPending)
                            return [2 /*return*/, false];
                        phase.abort = new AbortController();
                        // A fresh controller makes a latch set on the old one stale: the live driver claims the queue itself.
                        phase.wakeRequested = false;
                        phase.step = 0;
                        return [2 /*return*/, true];
                }
            });
        });
    };
    ReactLoopAgent.prototype.step = function (assembly) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, turn, step, signal, system, _b, request, preparedCall, assembler, chunkSeqs, stream, _c, stream_1, stream_1_1, chunk, e_1_1, error_2, content, finish, action, message, toolCalls, concluded;
            var _this = this;
            var _d, e_1, _e, _f;
            var _g;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        /* v8 ignore next -- private callers establish the running phase before executing a step */
                        if (this.phase.kind !== 'running')
                            throw new Error("agent \"".concat(this.id, "\": step outside running phase"));
                        _a = this.phase, turn = _a.turn, step = _a.step, signal = _a.abort.signal;
                        signal.throwIfAborted();
                        system = (0, dsh_system_prompt_1.renderPrompt)(assembly);
                        _h.label = 1;
                    case 1:
                        if (!true) return [3 /*break*/, 21];
                        return [4 /*yield*/, this.buildRequest(turn, step, assembly.tools, system, this.session.deriveMessages(), signal)];
                    case 2:
                        _b = _h.sent(), request = _b.request, preparedCall = _b.preparedCall;
                        assembler = new dsh_llm_1.BlockAssembler();
                        chunkSeqs = [];
                        _h.label = 3;
                    case 3:
                        _h.trys.push([3, 16, , 17]);
                        stream = (_g = preparedCall === null || preparedCall === void 0 ? void 0 : preparedCall.stream(request)) !== null && _g !== void 0 ? _g : this.loopCtx.llm.stream(request);
                        signal.throwIfAborted();
                        _h.label = 4;
                    case 4:
                        _h.trys.push([4, 9, 10, 15]);
                        _c = true, stream_1 = (e_1 = void 0, __asyncValues(stream));
                        _h.label = 5;
                    case 5: return [4 /*yield*/, stream_1.next()];
                    case 6:
                        if (!(stream_1_1 = _h.sent(), _d = stream_1_1.done, !_d)) return [3 /*break*/, 8];
                        _f = stream_1_1.value;
                        _c = false;
                        chunk = _f;
                        signal.throwIfAborted();
                        chunkSeqs.push(this.session.append('assistant/chunk', { turn: turn, step: step, chunk: chunk }).seq);
                        assembler.push(chunk);
                        _h.label = 7;
                    case 7:
                        _c = true;
                        return [3 /*break*/, 5];
                    case 8: return [3 /*break*/, 15];
                    case 9:
                        e_1_1 = _h.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 15];
                    case 10:
                        _h.trys.push([10, , 13, 14]);
                        if (!(!_c && !_d && (_e = stream_1.return))) return [3 /*break*/, 12];
                        return [4 /*yield*/, _e.call(stream_1)];
                    case 11:
                        _h.sent();
                        _h.label = 12;
                    case 12: return [3 /*break*/, 14];
                    case 13:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 14: return [7 /*endfinally*/];
                    case 15:
                        signal.throwIfAborted();
                        return [3 /*break*/, 17];
                    case 16:
                        error_2 = _h.sent();
                        if (signal.aborted) {
                            content = assembler.interruptedBlocks();
                            if (content.length > 0) {
                                this.session.append('assistant/message', __assign({ turn: turn, step: step, message: (0, dsh_llm_1.createAssistantMessage)({
                                        content: content,
                                        source: { provider: request.provider, model: request.model },
                                    }), interrupted: true }, assembler.usage === undefined ? {} : { usage: assembler.usage }), { surfaceOp: 'append', sourceEventSeqs: chunkSeqs });
                            }
                        }
                        throw error_2;
                    case 17:
                        finish = assembler.finish;
                        if (!(finish.kind === 'error' || finish.kind === 'aborted')) return [3 /*break*/, 19];
                        return [4 /*yield*/, this.dispatch.waterfall('agent/request-error', {
                                turn: turn,
                                step: step,
                                provider: request.provider,
                                failure: finish.failure,
                                retryPolicy: preparedCall === null || preparedCall === void 0 ? void 0 : preparedCall.retryPolicy,
                                signal: signal,
                            }, function () { return Promise.resolve(undefined); })];
                    case 18:
                        action = _h.sent();
                        signal.throwIfAborted();
                        if ((action === null || action === void 0 ? void 0 : action.kind) !== 'retry') {
                            throw new dsh_llm_1.LlmError(finish.failure.message, finish.failure.code, finish.failure);
                        }
                        return [3 /*break*/, 1];
                    case 19:
                        message = (0, dsh_llm_1.createAssistantMessage)({
                            content: assembler.blocks(),
                            source: __assign({ provider: request.provider, model: request.model }, assembler.replayState !== undefined ? { replayState: assembler.replayState } : {}),
                        });
                        this.session.append('assistant/message', __assign({ turn: turn, step: step, message: message }, assembler.usage === undefined ? {} : { usage: assembler.usage }), { surfaceOp: 'append', sourceEventSeqs: chunkSeqs });
                        if (finish.kind === 'max-tokens')
                            return [2 /*return*/, { kind: 'max-tokens' }];
                        toolCalls = message.content.filter(function (block) { return block.type === 'tool-call'; });
                        if (toolCalls.length === 0)
                            return [2 /*return*/, { kind: 'completed' }];
                        return [4 /*yield*/, (0, tool_calls_ts_1.executeToolCalls)(this.loopCtx, turn, step, toolCalls, signal, function (context) { return _this.inbox.splice('next-step', _this.inbox.nextStep.length, 0, [context]); })];
                    case 20:
                        concluded = (_h.sent()).concluded;
                        return [2 /*return*/, concluded ? { kind: 'completed' } : null];
                    case 21: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Compose one frozen request and bind it to the adapter registration that
     * resolved its exact-model defaults.
     */
    ReactLoopAgent.prototype.buildRequest = function (turn, step, tools, system, boundaryMessages, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var session, persistedHeader, persistedConfig, route, reasoningEffort, maxTokens, seedConfig, proposedConfig, config, preparedCall, error_3, header, baseline, contextWindow, requestContext, previousContext, request;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        session = this.session;
                        persistedHeader = session.requestHeader();
                        persistedConfig = persistedHeader === null || persistedHeader === void 0 ? void 0 : persistedHeader.config;
                        route = { provider: (_a = this.options.provider) !== null && _a !== void 0 ? _a : '', model: (_b = this.options.model) !== null && _b !== void 0 ? _b : '' };
                        reasoningEffort = (persistedConfig === null || persistedConfig === void 0 ? void 0 : persistedConfig.provider) === route.provider
                            && persistedConfig.model === route.model
                            && ((_c = persistedHeader === null || persistedHeader === void 0 ? void 0 : persistedHeader.adapterDefaults) === null || _c === void 0 ? void 0 : _c.reasoningEffort) !== true
                            ? persistedConfig.reasoningEffort
                            : undefined;
                        maxTokens = this.options.maxTokens;
                        seedConfig = (0, dsh_llm_1.deepFreeze)(structuredClone(this.requestHeaderLogged
                            // oxlint-disable-next-line typescript/no-non-null-assertion -- the instance logged the header it now folds
                            ? requestProposal(persistedHeader)
                            : __assign(__assign(__assign({}, route), reasoningEffort === undefined ? {} : { reasoningEffort: reasoningEffort }), maxTokens === undefined ? {} : { maxTokens: maxTokens })));
                        return [4 /*yield*/, this.dispatch.waterfall('agent/request', { turn: turn, step: step, signal: signal }, function () { return Promise.resolve(seedConfig); })];
                    case 1:
                        proposedConfig = _e.sent();
                        signal.throwIfAborted();
                        if (!proposedConfig.provider || !proposedConfig.model) {
                            throw new Error("agent \"".concat(this.id, "\" has no provider/model: set AgentOptions.provider and AgentOptions.model or supply both via the agent/request waterfall"));
                        }
                        _e.label = 2;
                    case 2:
                        _e.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.loopCtx.llm.prepareCall(proposedConfig, signal)];
                    case 3:
                        preparedCall = _e.sent();
                        config = preparedCall.config;
                        return [3 /*break*/, 5];
                    case 4:
                        error_3 = _e.sent();
                        // Middleware may serve an unregistered route; terminal dispatch still requires an adapter.
                        if (!(error_3 instanceof dsh_llm_1.LlmError) || error_3.code !== 'NO_ADAPTER')
                            throw error_3;
                        config = proposedConfig;
                        return [3 /*break*/, 5];
                    case 5:
                        signal.throwIfAborted();
                        header = (0, dsh_session_1.canonicalHeader)(__assign(__assign(__assign({ config: config }, preparedCall === undefined ? {} : { adapterDefaults: preparedCall.adapterDefaults }), system ? { system: system } : {}), tools.length > 0 ? { tools: tools } : {}));
                        baseline = this.session.requestHeader();
                        if (!this.requestHeaderLogged) {
                            this.session.append('request/header', { header: header, reason: baseline === undefined ? 'initial' : 'resume' });
                            this.requestHeaderLogged = true;
                        }
                        else if (baseline === undefined || !(0, dsh_session_1.headerEquals)(baseline, header)) {
                            this.session.append('request/header', { header: header, reason: 'change' });
                        }
                        contextWindow = (_d = preparedCall === null || preparedCall === void 0 ? void 0 : preparedCall.context) === null || _d === void 0 ? void 0 : _d.contextWindow;
                        requestContext = __assign({ provider: config.provider, model: config.model }, contextWindow === undefined ? {} : { contextWindow: contextWindow });
                        previousContext = session.requestContext();
                        if ((previousContext === null || previousContext === void 0 ? void 0 : previousContext.provider) !== requestContext.provider
                            || previousContext.model !== requestContext.model
                            || previousContext.contextWindow !== requestContext.contextWindow) {
                            session.append('request/context', requestContext);
                        }
                        signal.throwIfAborted();
                        request = (0, dsh_llm_1.markAgentLoopRequest)((0, dsh_llm_1.deepFreeze)(__assign(__assign(__assign(__assign(__assign({}, header.config), { messages: boundaryMessages }), header.system !== undefined ? { system: header.system } : {}), header.tools !== undefined ? { tools: header.tools } : {}), { sessionId: this.session.id, signal: signal })));
                        return [2 /*return*/, __assign({ request: request }, preparedCall === undefined ? {} : { preparedCall: preparedCall })];
                }
            });
        });
    };
    return ReactLoopAgent;
}());
exports.ReactLoopAgent = ReactLoopAgent;
