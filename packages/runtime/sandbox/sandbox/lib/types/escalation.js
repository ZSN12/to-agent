"use strict";
/**
 * The escalation vocabulary and choreography shared by every sandbox-enforcing
 * tool family (`@z/dsh-tool-bash`, `@z/dsh-tool-fs`): the
 * strictly-wider ladder, the argument-pairing validation, the model-facing
 * denial/hint markers, and {@link approveEscalation} — the ordered fail-closed
 * sequence that resolves a `sandbox_permissions` request through a
 * user-approval channel BEFORE anything executes. One home keeps the two
 * families' approval ordering and verbatim error texts from drifting apart.
 *
 * The channel is a minimal STRUCTURAL function shape ({@link EscalationAsk}),
 * not the approval service type: the tool layer — which owns the agent, the
 * call id, and the tool name — closes over `ctx.approval.request(...)` and
 * hands the closure down, so this package never depends on the approval or
 * agent packages.
 *
 * @module dsh-sandbox/escalation
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
exports.ESCALATION_TARGETS = exports.WIDER_MODES = void 0;
exports.validateEscalationArgs = validateEscalationArgs;
exports.sandboxDenialMarker = sandboxDenialMarker;
exports.escalationHintMarker = escalationHintMarker;
exports.approveEscalation = approveEscalation;
var dsh_llm_1 = require("@z/dsh-llm");
/**
 * The strictly-wider table: what a call whose effective mode is the key may
 * escalate TO. Checked at EXECUTION, never baked into a tool schema — the
 * schema's enum is {@link ESCALATION_TARGETS}, because schemas are
 * registry-global while the effective mode is per-call truth.
 */
exports.WIDER_MODES = {
    'read-only': ['workspace-write', 'danger-full-access'],
    'workspace-write': ['danger-full-access'],
};
/**
 * The closed escalation-target vocabulary — every mode a call could ever
 * escalate TO (`read-only` is the floor; nothing escalates to it). Advertised
 * whenever the mounted capability confines: cutting the enum down to the modes
 * wider than the composition's DEFAULT would strand a session whose effective
 * mode sits below it (a `danger-full-access` default would advertise nothing
 * while a narrower-switched session stays confined with no lever).
 */
exports.ESCALATION_TARGETS = ['workspace-write', 'danger-full-access'];
/**
 * Validate the escalation argument pairing a tool schema cannot express:
 * `sandbox_permissions` and `justification` travel together — an approval
 * prompt without a reason, or a reason driving nothing, is a malformed ask —
 * and the justification must be a non-empty sentence.
 * @param sandboxPermissions - the raw `sandbox_permissions` argument, if given.
 * @param justification - the raw `justification` argument, if given.
 */
function validateEscalationArgs(sandboxPermissions, justification) {
    if (sandboxPermissions !== undefined && justification === undefined) {
        throw new Error('invalid escalation: sandbox_permissions requires a justification');
    }
    if (justification !== undefined && sandboxPermissions === undefined) {
        throw new Error('invalid escalation: justification is only valid together with sandbox_permissions');
    }
    if (justification !== undefined && justification.trim().length === 0) {
        throw new Error('invalid justification: expected a non-empty sentence');
    }
}
/**
 * The model-facing denial marker — the one vocabulary both enforcing families
 * teach and report, so the model recognizes a policy denial identically
 * whether the kernel refused a bash file effect or the filesystem provider's
 * fence refused a mutation.
 * @param mode - the mode the denied call ran under.
 * @returns the marker line, exactly as the model sees it.
 */
function sandboxDenialMarker(mode) {
    return "[sandbox: file access denied under ".concat(mode, " mode]");
}
/**
 * The same-turn escalation hint that rides a denial when the composition
 * advertises the escalation fields — the nudge lives at the decision point so
 * the sanctioned retry does not depend on the model recalling the tool
 * description.
 * @param subject - the family's noun for the denied action (`command` for
 *   bash, `operation` for a filesystem mutation).
 * @returns the hint line, exactly as the model sees it.
 */
function escalationHintMarker(subject) {
    return "[sandbox: escalation available \u2014 retry this exact ".concat(subject, " once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]");
}
/**
 * Resolve a sandbox-escalation request BEFORE anything executes: check strict
 * widening against the call's effective mode, then resolve the approval
 * channel, then map every outcome — the ordered fail-closed sequence both
 * enforcing families share. Returns the granted mode to stamp onto exactly
 * this call; throws the distinct verbatim text for every other path (a
 * non-widening request, a missing approval service, an agent-less execution,
 * a rejection, a cancellation, an unanswerable ask) — the tool registry turns
 * the throw into the call's isError result, and nothing has run. A
 * non-widening request never prompts a human.
 * @param request - the escalation to judge (see {@link EscalationRequest}).
 * @param approval - the approval ingredients the tool holds (see {@link EscalationApproval}).
 * @returns the granted mode, consumed by the one call that asked.
 */
function approveEscalation(request, approval) {
    return __awaiter(this, void 0, void 0, function () {
        var mode, effectiveMode, justification, subject, outcome;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    mode = request.requestedMode, effectiveMode = request.effectiveMode, justification = request.justification, subject = request.subject;
                    // Strict widening is an EXECUTION check against the call's effective mode —
                    // deliberately not a schema constraint (the enum is the closed target
                    // vocabulary; the effective mode is per-call truth).
                    if (!((_a = exports.WIDER_MODES[effectiveMode]) !== null && _a !== void 0 ? _a : []).includes(mode)) {
                        throw new Error("sandbox escalation to \"".concat(mode, "\" is not strictly wider than this call's current \"").concat(effectiveMode, "\" mode"));
                    }
                    if (approval.approver === undefined) {
                        throw new Error("sandbox escalation to \"".concat(mode, "\" requires approval, but no approval service is composed"));
                    }
                    if (approval.agent === undefined) {
                        throw new Error("sandbox escalation to \"".concat(mode, "\" requires approval, but the call has no agent to route it through"));
                    }
                    return [4 /*yield*/, approval.approver.request(__assign({ agent: approval.agent, toolName: approval.toolName, callId: approval.callId, reason: "escalate sandbox to ".concat(mode, ": ").concat(justification) }, approval.signal ? { signal: approval.signal } : {}))];
                case 1:
                    outcome = _b.sent();
                    switch (outcome) {
                        // The schema enum already pinned `mode` to the closed target vocabulary;
                        // the check above proved it is strictly wider.
                        case 'allowed-once': return [2 /*return*/, mode];
                        case 'rejected': throw new Error("the user rejected escalating this ".concat(subject, " to \"").concat(mode, "\""));
                        case 'cancelled': throw new Error("approval for escalating to \"".concat(mode, "\" was cancelled"));
                        case 'unavailable': throw new Error("sandbox escalation to \"".concat(mode, "\" requires approval, but no approval channel is available"));
                        default: return [2 /*return*/, (0, dsh_llm_1.assertNever)(outcome, 'EscalationOutcome')];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
