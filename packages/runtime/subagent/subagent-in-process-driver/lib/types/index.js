"use strict";
/**
 * Shared driver for in-process ONE-SHOT subagent providers. The agent factory's
 * creation transaction owns unpublished setup and rollback; after publication
 * the returned AgentHandle is the one quiescent lifecycle owner held by the
 * provider's caller.
 *
 * Continuable children never come through here: the continuation manager
 * composes and drives them directly, so this driver owns exactly one turn with
 * one result.
 *
 * @module @z/dsh-subagent-in-process-driver
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
exports.STRUCTURED_OUTPUT_INSTRUCTION = exports.STRUCTURED_OUTPUT_TOOL = void 0;
exports.startInProcessRun = startInProcessRun;
var node_crypto_1 = require("node:crypto");
var dsh_agent_1 = require("@z/dsh-agent");
var dsh_session_1 = require("@z/dsh-session");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_subagent_1 = require("@z/dsh-subagent");
var structured_ts_1 = require("./structured.ts");
var structured_ts_2 = require("./structured.ts");
Object.defineProperty(exports, "STRUCTURED_OUTPUT_TOOL", { enumerable: true, get: function () { return structured_ts_2.STRUCTURED_OUTPUT_TOOL; } });
Object.defineProperty(exports, "STRUCTURED_OUTPUT_INSTRUCTION", { enumerable: true, get: function () { return structured_ts_2.STRUCTURED_OUTPUT_INSTRUCTION; } });
/** Map a session turn outcome to the subagent seam's terminal vocabulary. */
function toStopReason(reason) {
    switch (reason === null || reason === void 0 ? void 0 : reason.kind) {
        case 'completed':
            return 'completed';
        case 'max-tokens':
            return 'max-tokens';
        case 'aborted':
            return 'aborted';
        // A pre-step rejection discarded the claimed prompt: the task was
        // declined, and the caller must not read the run as done.
        case 'blocked':
            return 'refusal';
        case 'error':
        case 'interrupted':
        default:
            return 'error';
    }
}
/** Error used when cancellation wins before the child publication boundary. */
function prePublicationAbort() {
    return new Error('subagent request was aborted before child publication');
}
/** Append one one-shot descriptor inside the child's initial turn before its first request. */
function attachDescriptorAppend(childCtx, descriptor) {
    var _this = this;
    var appended = false;
    childCtx.on('agent/pre-step', function (_a, next_1) { return __awaiter(_this, [_a, next_1], void 0, function (_b, next) {
        var decision;
        var agent = _b.agent;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, next()];
                case 1:
                    decision = _c.sent();
                    if (!appended && decision.kind === 'enter') {
                        appended = true;
                        agent.session.append('subagent/descriptor', descriptor);
                    }
                    return [2 /*return*/, decision];
            }
        });
    }); });
}
/**
 * Establish and drive one in-process one-shot child. Fulfillment means the agent
 * is already published in the registry and transfers its turn, cancellation,
 * and disposal work through the returned run. Rejection means the agent
 * factory's unpublished creation transaction reached quiescence without
 * publishing a child. Every start appends its resolved descriptor inside the
 * child's initial turn.
 * @param request - the trusted typed start request, including its required signal.
 * @param options - the optional fork seed.
 * @returns a published holder-owned run.
 */
function startInProcessRun(request, options) {
    return __awaiter(this, void 0, void 0, function () {
        var parent, childDepth, childId, seed, activationBoundary, inherited, structured, setup, handle;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    (0, dsh_subagent_1.assertSubagentMaxDepth)(request.maxDepth);
                    if (request.signal.aborted)
                        throw prePublicationAbort();
                    parent = request.parent;
                    childDepth = (0, dsh_subagent_1.resolveChildDepth)(parent, request.maxDepth);
                    childId = (0, dsh_session_1.SessionId)((0, node_crypto_1.randomUUID)());
                    seed = options.seed;
                    activationBoundary = (_a = seed === null || seed === void 0 ? void 0 : seed.length) !== null && _a !== void 0 ? _a : 0;
                    inherited = (0, dsh_subagent_1.captureDelegatedPolicyOverrides)(parent);
                    setup = function (childCtx) {
                        (0, dsh_subagent_1.appendDelegatedPolicyOverrides)(childCtx.agent.session, inherited);
                        (0, dsh_subagent_1.applyChildComposition)(childCtx, parent, {
                            persona: request.persona,
                            toolFilter: request.toolFilter,
                        });
                        if (request.outputSchema !== undefined) {
                            structured = (0, structured_ts_1.attachStructuredRuntime)(childCtx, request.outputSchema);
                        }
                        attachDescriptorAppend(childCtx, request.descriptor);
                    };
                    return [4 /*yield*/, parent.ctx.agents.create(__assign(__assign({ sessionId: childId, meta: (0, dsh_subagent_1.childSessionMeta)(parent, childDepth, activationBoundary) }, seed !== undefined ? { seed: seed } : {}), { agentOptions: (0, dsh_subagent_1.resolveChildAgentOptions)(parent, request.agentOptions, childDepth), signal: request.signal, setup: setup }))];
                case 1:
                    handle = _b.sent();
                    return [2 /*return*/, drivePublishedRun(handle, request.signal, request.prompt, childId, activationBoundary, structured)];
            }
        });
    });
}
/**
 * Wrap a published child in the single run lifecycle that owns signal handoff,
 * one turn, result settlement, and quiescent disposal.
 */
function drivePublishedRun(handle, signal, prompt, childId, boundary, structured) {
    var _this = this;
    var child = handle.agent;
    var flags = { cancelled: false };
    var onAbort = function () {
        flags.cancelled = true;
        child.cancel({ kind: 'parent' });
    };
    signal.addEventListener('abort', onAbort, { once: true });
    // Agent creation detaches its creation-only listener before returning. The
    // post-registration check closes that handoff without treating an already
    // published child as a failed start.
    if (signal.aborted)
        onAbort();
    var result = (function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, , 3, 4]);
                    if (!!flags.cancelled) return [3 /*break*/, 2];
                    child.followup((0, dsh_llm_1.createUserMessage)({ content: prompt, source: { kind: 'user' } }));
                    return [4 /*yield*/, child.whenIdle()];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/, readResult(child, boundary, flags.cancelled, structured ? { captured: structured.captured() } : undefined)];
                case 3:
                    signal.removeEventListener('abort', onAbort);
                    return [7 /*endfinally*/];
                case 4: return [2 /*return*/];
            }
        });
    }); })();
    return {
        id: childId,
        localAgent: child,
        result: result,
        dispose: function () {
            return __awaiter(this, void 0, void 0, function () {
                var settlements, disposal;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            signal.removeEventListener('abort', onAbort);
                            flags.cancelled = true;
                            return [4 /*yield*/, Promise.allSettled([handle.dispose(), result])];
                        case 1:
                            settlements = _a.sent();
                            disposal = settlements[0];
                            // The result channel owns run faults; disposal reports only failure to
                            // release the published handle after both operations settle.
                            if (disposal.status === 'rejected')
                                throw disposal.reason;
                            return [2 /*return*/];
                    }
                });
            });
        },
    };
}
/** Read one settled child's result from events after its activation boundary. */
function readResult(child, boundary, cancelled, structured) {
    var _a;
    var own = child.session.events.slice(boundary);
    // `droppedUnrun` is deliberately unread: a one-shot prompt is claimed by its
    // awaited first turn almost immediately, and the owner's own teardown is the
    // `cancelled` flag below. A cancellation with no accounting turn resolves
    // `error` through `toStopReason(undefined)`, which never overstates success.
    var lastEnd = (0, dsh_agent_1.foldConsumedWork)(own).end;
    // The seam's canonical selection rule; a partial answer survives cancel and truncation.
    var output = (_a = (0, dsh_subagent_1.finalAssistantOutput)(own)) !== null && _a !== void 0 ? _a : [];
    var recorded = toStopReason(lastEnd === null || lastEnd === void 0 ? void 0 : lastEnd.data.reason);
    // Disposal can tear the owner down before the loop records its ordinary
    // `aborted` end, yielding `disposed` instead.
    var stopReason = cancelled && recorded !== 'completed' ? 'aborted' : recorded;
    if (structured !== undefined) {
        if (structured.captured !== undefined) {
            return { output: output, structured: structured.captured.value, stopReason: stopReason };
        }
        if (stopReason === 'completed')
            return { output: output, stopReason: cancelled ? 'aborted' : 'error' };
    }
    return { output: output, stopReason: stopReason };
}
