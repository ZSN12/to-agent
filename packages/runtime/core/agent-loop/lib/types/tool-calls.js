"use strict";
/**
 * Schedules one assistant step's tool calls. Exclusive calls form barriers;
 * parallel calls use a bounded rolling pool and are reclassified before start.
 * Dispatch may overlap, while policy, results, and result context remain
 * model-ordered. Abort or an internal scheduler failure stops replenishment
 * and drains started calls.
 *
 * Abort records synthetic error results for skipped calls so replay stays
 * valid. A terminal scheduler failure preserves already-recorded `tool/call`
 * events without fabricating results.
 * @module dsh-agent-loop/tool-calls
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeToolCalls = executeToolCalls;
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_tools_1 = require("@z/dsh-tools");
/**
 * Schedule one assistant step's tool calls by their live concurrency mode.
 * Ordinary completion and abort commit started-call results in order. Abort
 * drains them, records synthetic results for unstarted calls, and returns with
 * the signal still aborted after accepting started-call context through the
 * caller-supplied acceptor (the machine stages it in its next-step inbox for the
 * step boundary). An internal scheduler failure stops new dispatches, drains
 * already-started dispatches, and rejects with the first failure without
 * fabricating tool results.
 * The committed step's AgentLoop driver boundary supplies the initiating Agent
 * that becomes each explicit {@link ToolExecutionInput.agent}.
 *
 * @param ctx - loop context that owns the tool registry and carries the initiating Agent.
 * @param turn - current turn number.
 * @param step - current step number.
 * @param toolCalls - assistant calls in model order.
 * @param signal - abort signal shared by the step.
 * @param acceptContext - accepts committed result context for the next step boundary.
 */
function executeToolCalls(ctx, turn, step, toolCalls, signal, acceptContext) {
    return __awaiter(this, void 0, void 0, function () {
        var agent, session, planned, next, concluded, first, mode, group, outcome, _i, _a, call;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    agent = ctx.agents.requireInitiator();
                    session = agent.session;
                    planned = toolCalls.map(function (block) { return ({
                        block: block,
                        exec: {
                            callId: block.id,
                            name: block.name,
                            arguments: parseArguments(block.arguments),
                            agent: agent,
                            signal: signal,
                        },
                    }); });
                    next = 0;
                    concluded = false;
                    _b.label = 1;
                case 1:
                    if (!(next < planned.length)) return [3 /*break*/, 3];
                    first = planned[next];
                    mode = ctx.tools.executionMode(first.exec).kind;
                    group = mode === 'parallel' ? planned.slice(next) : [first];
                    return [4 /*yield*/, runGroup(ctx, turn, step, group, mode, signal, acceptContext)];
                case 2:
                    outcome = _b.sent();
                    next += outcome.consumed;
                    concluded || (concluded = outcome.concluded);
                    if (outcome.aborted) {
                        for (_i = 0, _a = planned.slice(next); _i < _a.length; _i++) {
                            call = _a[_i];
                            appendSkippedToolCall(session, turn, step, call.block);
                        }
                        return [2 /*return*/, { concluded: concluded }];
                    }
                    return [3 /*break*/, 1];
                case 3: return [2 /*return*/, { concluded: concluded }];
            }
        });
    });
}
/** Parse model arguments, preserving invalid JSON as text and mapping empty input to `{}`. */
function parseArguments(raw) {
    try {
        return raw ? JSON.parse(raw) : {};
    }
    catch (_a) {
        return raw;
    }
}
/**
 * Run one exclusive barrier or parallel pool. Later calls are reclassified
 * before start; an exclusive reclassification waits for the current pool to
 * drain and remains for the caller's next barrier. Results and contexts commit
 * in model order. Abort stops starts, drains and commits started calls, accepts
 * their contexts into the owning batch, records results for skipped calls, and
 * returns an aborted outcome. Scheduler failure drains dispatches without
 * committing synthetic recovery results.
 */
function runGroup(ctx, turn, step, group, mode, signal, acceptContext) {
    return __awaiter(this, void 0, void 0, function () {
        var session, maxParallelToolCalls, slots, callSeqs, nextToStart, committed, started, aborted, concluded, schedulerFailure, throwSchedulerFailure, commitReady, inFlight, startCall, fillPool, settledIndex, error_1, _i, _a, call;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    session = ctx.agents.requireInitiator().session;
                    maxParallelToolCalls = ctx.agentLoop.config.maxParallelToolCalls;
                    slots = group.map(function () { return undefined; });
                    callSeqs = group.map(function () { return -1; });
                    nextToStart = 0;
                    committed = 0;
                    started = 0;
                    aborted = signal.aborted;
                    concluded = false;
                    throwSchedulerFailure = function () {
                        if (schedulerFailure !== undefined)
                            throw schedulerFailure.error;
                    };
                    commitReady = function () { return __awaiter(_this, void 0, void 0, function () {
                        var slot, call, result, _a, _i, _b, context;
                        var _c;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    if (!(committed < group.length)) return [3 /*break*/, 4];
                                    slot = slots[committed];
                                    if (slot === undefined)
                                        return [3 /*break*/, 4];
                                    call = group[committed];
                                    if (!slot.needsPost) return [3 /*break*/, 2];
                                    return [4 /*yield*/, ctx.tools[dsh_tools_1.TOOL_RUNTIME_SCHEDULER].finalize(slot.exec, slot.result)];
                                case 1:
                                    _a = _d.sent();
                                    return [3 /*break*/, 3];
                                case 2:
                                    _a = ctx.tools[dsh_tools_1.TOOL_RUNTIME_SCHEDULER].finish(slot.exec, slot.result);
                                    _d.label = 3;
                                case 3:
                                    result = _a;
                                    // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded index
                                    appendToolResult(session, turn, step, call.block, result, callSeqs[committed]);
                                    for (_i = 0, _b = (_c = result.additionalContexts) !== null && _c !== void 0 ? _c : []; _i < _b.length; _i++) {
                                        context = _b[_i];
                                        acceptContext(context);
                                    }
                                    concluded || (concluded = result.concludesTurn === true);
                                    committed++;
                                    return [3 /*break*/, 0];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); };
                    inFlight = new Map();
                    startCall = function (index) { return __awaiter(_this, void 0, void 0, function () {
                        var call, prepared, promise;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    call = group[index];
                                    callSeqs[index] = appendToolCall(session, turn, step, call.block);
                                    started++;
                                    return [4 /*yield*/, ctx.tools[dsh_tools_1.TOOL_RUNTIME_SCHEDULER].prepare(call.exec)];
                                case 1:
                                    prepared = _a.sent();
                                    throwSchedulerFailure();
                                    switch (prepared.kind) {
                                        case 'dispatch': {
                                            promise = ctx.tools[dsh_tools_1.TOOL_RUNTIME_SCHEDULER].dispatch(prepared.exec).then(function (outcome) {
                                                slots[index] = { exec: prepared.exec, result: outcome.result, needsPost: outcome.kind === 'post-result' };
                                                return index;
                                            }, function (error) {
                                                schedulerFailure !== null && schedulerFailure !== void 0 ? schedulerFailure : (schedulerFailure = { error: error });
                                                return index;
                                            });
                                            inFlight.set(index, promise);
                                            break;
                                        }
                                        case 'post-result':
                                            slots[index] = { exec: prepared.exec, result: prepared.result, needsPost: true };
                                            break;
                                        case 'final-result':
                                            slots[index] = { exec: prepared.exec, result: prepared.result, needsPost: false };
                                            break;
                                        /* v8 ignore next -- closed-union exhaustiveness guard */
                                        default:
                                            (0, dsh_llm_1.assertNever)(prepared, 'tool-call scheduler prepare result');
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    }); };
                    fillPool = function () { return __awaiter(_this, void 0, void 0, function () {
                        var nextCall;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    if (!(!aborted && nextToStart < group.length && inFlight.size < maxParallelToolCalls)) return [3 /*break*/, 3];
                                    nextCall = group[nextToStart];
                                    if (nextToStart > 0 && mode === 'parallel'
                                        && ctx.tools.executionMode(nextCall.exec).kind !== 'parallel')
                                        return [3 /*break*/, 3];
                                    return [4 /*yield*/, startCall(nextToStart)];
                                case 1:
                                    _a.sent();
                                    nextToStart++;
                                    throwSchedulerFailure();
                                    return [4 /*yield*/, commitReady()];
                                case 2:
                                    _a.sent();
                                    throwSchedulerFailure();
                                    // Abort may arrive while pre-execute awaits.
                                    if (signal.aborted)
                                        aborted = true;
                                    return [3 /*break*/, 0];
                                case 3: return [2 /*return*/];
                            }
                        });
                    }); };
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 8, , 10]);
                    return [4 /*yield*/, fillPool()];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3:
                    if (!(inFlight.size > 0)) return [3 /*break*/, 7];
                    return [4 /*yield*/, Promise.race(inFlight.values())];
                case 4:
                    settledIndex = _b.sent();
                    inFlight.delete(settledIndex);
                    throwSchedulerFailure();
                    return [4 /*yield*/, commitReady()];
                case 5:
                    _b.sent();
                    throwSchedulerFailure();
                    // Abort may arrive while a tool or ordered commit awaits.
                    if (signal.aborted)
                        aborted = true;
                    return [4 /*yield*/, fillPool()];
                case 6:
                    _b.sent();
                    return [3 /*break*/, 3];
                case 7: return [3 /*break*/, 10];
                case 8:
                    error_1 = _b.sent();
                    schedulerFailure !== null && schedulerFailure !== void 0 ? schedulerFailure : (schedulerFailure = { error: error_1 });
                    return [4 /*yield*/, Promise.allSettled(inFlight.values())];
                case 9:
                    _b.sent();
                    throw schedulerFailure.error;
                case 10:
                    if (aborted) {
                        // Started calls and accepted context settle first; every remaining model
                        // call then receives an ordered synthetic result before the turn aborts.
                        for (_i = 0, _a = group.slice(started); _i < _a.length; _i++) {
                            call = _a[_i];
                            appendSkippedToolCall(session, turn, step, call.block);
                        }
                        return [2 /*return*/, { consumed: group.length, aborted: true, concluded: concluded }];
                    }
                    /* v8 ignore next -- unreachable: a non-aborted group commits every started call */
                    if (committed !== started)
                        throw new Error('tool-call scheduler: uncommitted settled calls');
                    return [2 /*return*/, { consumed: started, aborted: false, concluded: concluded }];
            }
        });
    });
}
/** Append the durable call/result pair for a model call skipped after cancellation. */
function appendSkippedToolCall(session, turn, step, block) {
    var callSeq = appendToolCall(session, turn, step, block);
    appendToolResult(session, turn, step, block, {
        content: [{ type: 'text', text: 'Error: tool call aborted before dispatch' }],
        isError: true,
        error: {
            message: 'tool call aborted before dispatch',
            info: { name: 'AbortError', code: dsh_tools_1.TOOL_ABORTED_BEFORE_DISPATCH },
        },
    }, callSeq);
}
/** Append a started call and return the event seq that its result must cite. */
function appendToolCall(session, turn, step, block) {
    var event = session.append('tool/call', { turn: turn, step: step, callId: block.id, name: block.name, arguments: block.arguments });
    return event.seq;
}
/** Append a model-ordered result linked to its call event. */
function appendToolResult(session, turn, step, block, result, callSeq) {
    var _a;
    var message = (0, dsh_llm_1.createToolResultMessage)({
        callId: block.id,
        content: result.content,
        isError: result.isError,
    });
    session.append('tool/result', __assign(__assign({ turn: turn, step: step, message: message }, ((_a = result.error) === null || _a === void 0 ? void 0 : _a.info) ? { error: result.error.info } : {}), result.meta !== undefined ? { meta: result.meta } : {}), { surfaceOp: 'append', sourceEventSeqs: [callSeq] });
}
