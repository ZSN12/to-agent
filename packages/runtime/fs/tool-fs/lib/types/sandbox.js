"use strict";
/**
 * The sandbox-escalation API shared by the `write` and `edit` tools: the
 * per-call policy resolution, the advertised escalation fields, and the denial-marker
 * mapping — all delegating the vocabulary and the fail-closed approval
 * sequence to `@z/dsh-sandbox` (the same pieces `@z/dsh-tool-bash`
 * uses), so bash and fs escalate identically. Built ONCE per plugin from
 * `ctx.fs.sandboxMode` (the capability fact — is a confining backend mounted?)
 * and shared by both mutating tools.
 *
 * @module @z/dsh-tool-fs/sandbox
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
exports.FsSandboxController = void 0;
var dsh_sandbox_1 = require("@z/dsh-sandbox");
var dsh_fs_1 = require("@z/dsh-fs");
/**
 * The filesystem escalation API: advertisement gating, per-call policy
 * resolution, the one-approved wider retry, and denial-marker mapping. A pure
 * product of `ctx` at plugin apply time.
 */
var FsSandboxController = /** @class */ (function () {
    function FsSandboxController(ctx) {
        this.ctx = ctx;
        var defaultMode = ctx.fs.sandboxMode;
        this.escalationModes = defaultMode === undefined ? [] : dsh_sandbox_1.ESCALATION_TARGETS;
        this.policy = defaultMode === undefined ? undefined : ctx.get('sandboxPolicy');
        if (defaultMode !== undefined && this.policy === undefined) {
            throw new Error('tool-fs: the mounted filesystem confines but ctx.sandboxPolicy is missing');
        }
    }
    /**
     * The escalation schema fields for a mutating tool's `parameters`. Call it
     * only under a confining backend (guard on {@link escalationModes}); the
     * enum pins the closed target vocabulary, the strict-wider check happens per
     * call at execution.
     * @returns the two escalation parameter specs.
     */
    FsSandboxController.prototype.schemaFields = function () {
        return {
            sandbox_permissions: {
                type: 'string',
                enum: __spreadArray([], this.escalationModes, true),
                description: 'The wider sandbox mode this file operation needs. Only valid as a one-shot retry '
                    + 'of an operation the sandbox just denied; requires justification and user approval.',
            },
            justification: {
                type: 'string',
                description: 'Required with sandbox_permissions: one sentence for the user explaining '
                    + 'why this exact file operation needs the wider access.',
            },
        };
    };
    /**
     * The policy to stamp onto this mutation: an approved escalation grant (a
     * strictly wider retry resolved through `ctx.approval` before anything
     * executes), else the session's standing mode. The calling session's cwd is
     * always carried as the workspace root. Validates the escalation argument
     * pairing first.
     * @param toolName - the mutating tool's name, for the approval audit trail.
     * @param args - the call's escalation arguments.
     * @param exec - the tool-execution context (agent, callId, signal).
     * @returns the policy to pass to the mutation, or undefined for an
     *   unsandboxed backend.
     */
    FsSandboxController.prototype.resolvePolicy = function (toolName, args, exec) {
        return __awaiter(this, void 0, void 0, function () {
            var standingPolicy, policy, approvedMode;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        (0, dsh_sandbox_1.validateEscalationArgs)(args.sandbox_permissions, args.justification);
                        standingPolicy = (_a = this.policy) === null || _a === void 0 ? void 0 : _a.resolve(__assign({}, exec.agent ? { session: exec.agent.session } : {}));
                        if (args.sandbox_permissions === undefined || args.justification === undefined) {
                            return [2 /*return*/, standingPolicy];
                        }
                        if (this.escalationModes.length === 0) {
                            throw new Error('sandbox_permissions is not available in this composition (no sandboxing filesystem to escalate)');
                        }
                        policy = standingPolicy;
                        return [4 /*yield*/, (0, dsh_sandbox_1.approveEscalation)({ requestedMode: args.sandbox_permissions, justification: args.justification, effectiveMode: policy.mode, subject: 'operation' }, {
                                approver: this.ctx.get('approval'),
                                agent: exec.agent,
                                callId: exec.callId,
                                toolName: toolName,
                                signal: exec.signal,
                            })];
                    case 1:
                        approvedMode = _b.sent();
                        return [2 /*return*/, __assign(__assign({}, policy), { mode: approvedMode })];
                }
            });
        });
    };
    /**
     * Map a thrown provider error for the model: a `FS_SANDBOX_DENIED` becomes a
     * `FsError` whose text is the shared `[sandbox: …]` denial marker plus the
     * same-turn escalation hint, so a policy denial reads identically to bash's
     * WHILE keeping the structured `FS_SANDBOX_DENIED` code — `ToolRuntime`
     * populates `result.error` only for `HarnessError` instances, so a plain
     * `Error` would strip the code retry/observers key off. Any other error
     * passes through unchanged. A `FS_SANDBOX_DENIED` only arises under a
     * confining backend, which always advertises the escalation fields, so the
     * hint always applies here.
     * @param error - the error thrown by the mutation.
     * @param policy - the policy stamped onto the call (names the mode in the marker).
     * @returns the error to throw — the marker `FsError` for a sandbox denial, else the original.
     */
    FsSandboxController.prototype.mapError = function (error, policy) {
        if (!(error instanceof dsh_fs_1.FsError) || error.code !== 'FS_SANDBOX_DENIED')
            return error;
        // A FS_SANDBOX_DENIED only arises under a confining backend, whose tool
        // path always resolves a policy before mutation.
        var mode = policy.mode;
        return new dsh_fs_1.FsError("".concat((0, dsh_sandbox_1.sandboxDenialMarker)(mode), "\n").concat((0, dsh_sandbox_1.escalationHintMarker)('operation')), 'FS_SANDBOX_DENIED', { cause: error });
    };
    return FsSandboxController;
}());
exports.FsSandboxController = FsSandboxController;
