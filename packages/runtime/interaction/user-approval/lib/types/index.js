"use strict";
/**
 * Service Definition for the approval capability seam, covering requests, cancellation, audit, and per-session policy. Missing
 * answerers fail closed; grants apply only to the requested action.
 * @module @z/dsh-user-approval
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.ApprovalService = exports.APPROVAL_POLICIES = exports.ApprovalRequestId = void 0;
exports.effectiveApprovalPolicy = effectiveApprovalPolicy;
exports.setApprovalPolicy = setApprovalPolicy;
var node_crypto_1 = require("node:crypto");
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_scope_1 = require("@z/dsh-scope");
var types_ts_1 = require("./types.ts");
var types_ts_2 = require("./types.ts");
Object.defineProperty(exports, "ApprovalRequestId", { enumerable: true, get: function () { return types_ts_2.ApprovalRequestId; } });
/** Every {@link ApprovalOutcome}, for runtime normalization of answerer returns. */
var OUTCOMES = ['allowed-once', 'rejected', 'cancelled', 'unavailable'];
/** Every {@link ApprovalPolicy}, for option advertisement and runtime validation of untrusted policy strings. */
exports.APPROVAL_POLICIES = ['ask', 'never'];
/** Model-facing statement for the deterministic `'never'` policy. */
var NEVER_SENTENCE = 'Approval prompts are disabled in this session: actions that require approval are rejected automatically — do not request sandbox escalation (do not set `sandbox_permissions`).';
/** Model-facing statement for an interactive policy that may still fail closed. */
var ASK_SENTENCE = 'Approval policy: ask. Operations that require approval may ask through the configured answerers; without an available answerer, the request fails closed.';
/**
 * The session's approval-policy override: the last `approval/policy` event in
 * the log, or undefined when the session never switched (callers apply the
 * plugin's configured default). The pure fold — resume needs no catch-up
 * machinery because replaying the log IS the state.
 * @param events - session events in log order (other event types are skipped).
 * @returns the policy of the last switch event, or undefined without one.
 */
function effectiveApprovalPolicy(events) {
    for (var index = events.length - 1; index >= 0; index -= 1) {
        var event_1 = events[index];
        if (event_1.type === 'approval/policy')
            return event_1.data.policy;
    }
    return undefined;
}
/**
 * Whether the log currently sits inside an open turn (a `turn/start` not yet
 * closed by a `turn/end`) — the {@link ApprovalService.request} precondition.
 * The audit pair must be turn-enclosed: the turn is the durable log's
 * commit/replay boundary, so a bare event appended between turns is
 * indistinguishable from a crash tail and silently dropped on reload.
 */
function hasOpenTurn(events) {
    for (var index = events.length - 1; index >= 0; index -= 1) {
        var type = events[index].type;
        if (type === 'turn/start')
            return true;
        if (type === 'turn/end')
            return false;
    }
    return false;
}
/**
 * Append the sole durable representation of a session policy override. Invalid
 * values throw before the log changes; consumers fold the new value on each read.
 * @param session - the session the override belongs to.
 * @param policy - the policy in effect until the next switch.
 */
function setApprovalPolicy(session, policy) {
    if (!exports.APPROVAL_POLICIES.includes(policy)) {
        throw new TypeError('approval policy must be one of "ask" or "never"');
    }
    session.append('approval/policy', { policy: policy });
}
/**
 * Approval service that applies session policy before answerers and logs every
 * ask/outcome pair to the requesting session. It exposes deterministic policy
 * changes to the model through the runtime-context snapshot and switch notices.
 */
var ApprovalService = /** @class */ (function (_super) {
    __extends(ApprovalService, _super);
    function ApprovalService(ctx, config) {
        var _this = _super.call(this, ctx, 'approval') || this;
        _this.config = config;
        var effective = function (agent) { return _this.effectivePolicy(agent.session); };
        // The complete current value travels after retained history, so switching
        // policy does not rewrite the stable system-prompt cache prefix.
        ctx.inject(['systemPrompt'], function (scope) {
            scope.systemPrompt.context({
                name: 'approval:policy',
                order: 115,
                text: function (context) {
                    var agent = context.agent;
                    // A bare assemble() (tests, diagnostics) has no session to state.
                    if (agent === undefined)
                        return '';
                    var policy = effective(agent);
                    return policy === 'never' ? NEVER_SENTENCE : ASK_SENTENCE;
                },
            });
        });
        return _this;
    }
    /**
     * Switch one live agent's policy and queue the transition for its next model
     * step. Session initialization uses {@link setApprovalPolicy} directly
     * because there is no previously visible policy to change.
     * @param agent - the live agent whose policy is changing.
     * @param policy - the new effective policy.
     */
    ApprovalService.prototype.setPolicy = function (agent, policy) {
        var previous = this.effectivePolicy(agent.session);
        if (previous === policy)
            return;
        setApprovalPolicy(agent.session, policy);
        agent.inject((0, dsh_llm_1.createUserMessage)({
            content: [{
                    type: 'text',
                    text: "The approval policy changed from \"".concat(previous, "\" to \"").concat(policy, "\" (changed by the user)."),
                }],
            source: { kind: 'plugin', plugin: 'user-approval' },
        }));
    };
    /**
     * Ask the composed answerers to decide one readonly same-process request.
     * The service borrows the request, agent, session, and live signal directly.
     * The request requires an open turn because the audit pair must be enclosed
     * by the durable log's commit/replay boundary; an idle ask rejects before
     * appending anything. The answerer phase always produces an outcome: an
     * aborted signal yields `'cancelled'`, a missing or throwing answerer yields
     * `'unavailable'` (fail closed), and a rogue non-vocabulary return value is
     * normalized to `'unavailable'`. A failure that prevents either audit append
     * from committing still rejects because returning an unlogged decision would
     * violate the pair. Session contains post-commit observer failures, so an
     * authoritative append cannot reject the request or suppress its matching
     * audit event.
     * @param req - the pending decision (agent, tool identity, reason, signal).
     * @returns the closed outcome; `'allowed-once'` is the only grant.
     * @throws when no turn is open or either audit event fails before the session
     *   append commit point.
     */
    ApprovalService.prototype.request = function (req) {
        return __awaiter(this, void 0, void 0, function () {
            var session, id, outcome;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        session = req.agent.session;
                        if (!hasOpenTurn(session.events)) {
                            throw new Error('approval.request() outside an open turn: the approval/asked + approval/decided audit pair '
                                + 'must be turn-enclosed (a bare event between turns is crash-tail garbage on reload). '
                                + 'Ask from inside the turn that needs the decision.');
                        }
                        id = (0, types_ts_1.ApprovalRequestId)((0, node_crypto_1.randomUUID)());
                        session.append('approval/asked', __assign(__assign({ id: id, toolName: req.toolName }, req.callId !== undefined ? { callId: req.callId } : {}), req.reason !== undefined ? { reason: req.reason } : {}));
                        return [4 /*yield*/, this.decide(req, session)];
                    case 1:
                        outcome = _a.sent();
                        session.append('approval/decided', { id: id, outcome: outcome });
                        return [2 /*return*/, outcome];
                }
            });
        });
    };
    /**
     * The session's effective policy: its own `approval/policy` fold, else the
     * configured default (the schema already defaulted an omitted policy to
     * `'ask'`; the `??` only narrows the optional-input TYPE).
     * @param session - the exact accepted session whose policy applies.
     * @returns the policy every ask for this session resolves under right now.
     */
    ApprovalService.prototype.effectivePolicy = function (session) {
        var _a, _b;
        return (_b = (_a = this.overrideOf(session)) !== null && _a !== void 0 ? _a : this.config.policy) !== null && _b !== void 0 ? _b : 'ask';
    };
    /**
     * Read the session override without applying the configured default.
     * @param session - session whose log supplies the override.
     * @returns the last logged policy, or `undefined` without one.
     */
    ApprovalService.prototype.overrideOf = function (session) {
        return effectiveApprovalPolicy(session.events);
    };
    /**
     * Dispatch the waterfall, contained and raced against the request signal.
     * @param req - the borrowed public request.
     * @param session - the request agent's session used for policy lookup.
     * @returns the normalized closed outcome.
     */
    ApprovalService.prototype.decide = function (req, session) {
        return __awaiter(this, void 0, void 0, function () {
            var signal, answer;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal = req.signal;
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            return [2 /*return*/, 'cancelled'
                                // The 'never' policy is decided HERE, before any dispatch: a listener
                                // registered with `prepend: true` after this service mounts would sit
                                // ahead of any gate LISTENER, so a listener-shaped gate cannot keep the
                                // documented promise that 'never' rejects deterministically regardless
                                // of registration order — only the service's own request path can.
                            ];
                        // The 'never' policy is decided HERE, before any dispatch: a listener
                        // registered with `prepend: true` after this service mounts would sit
                        // ahead of any gate LISTENER, so a listener-shaped gate cannot keep the
                        // documented promise that 'never' rejects deterministically regardless
                        // of registration order — only the service's own request path can.
                        if (this.effectivePolicy(session) === 'never')
                            return [2 /*return*/, 'rejected'
                                // Enter the promise chain BEFORE dispatching: a listener that throws
                                // SYNCHRONOUSLY (before its first await) must land in the same rejection
                                // path as an async one — `Promise.resolve(call())` would let it escape
                                // the containment into the caller.
                            ];
                        answer = Promise.resolve().then(function () { return _this.ctx.waterfall((0, dsh_scope_1.scopeTarget)(_this, req.agent), 'approval/request', req, function () { return Promise.resolve('unavailable'); }); }).then(
                        // Normalize a rogue (non-vocabulary) answerer return to the fail-closed
                        // outcome instead of leaking it into callers' closed-union switches.
                        function (outcome) { return OUTCOMES.includes(outcome) ? outcome : 'unavailable'; }, 
                        // A throwing answerer must fail the QUESTION closed, not the caller's
                        // tool call open — the seam contains its callbacks.
                        function () { return 'unavailable'; });
                        if (signal === undefined)
                            return [2 /*return*/, answer];
                        return [4 /*yield*/, new Promise(function (resolve) {
                                var onAbort = function () {
                                    signal.removeEventListener('abort', onAbort);
                                    resolve('cancelled');
                                };
                                signal.addEventListener('abort', onAbort, { once: true });
                                void answer.then(function (outcome) {
                                    signal.removeEventListener('abort', onAbort);
                                    // After an abort won the race this resolve is a settled-promise no-op:
                                    // the late answer is discarded by construction.
                                    resolve(outcome);
                                });
                            })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    ApprovalService.Config = schemastery_1.default.object({
        policy: schemastery_1.default.union(['ask', 'never']).default('ask'),
    });
    return ApprovalService;
}(cordis_1.Service));
exports.ApprovalService = ApprovalService;
exports.default = ApprovalService;
