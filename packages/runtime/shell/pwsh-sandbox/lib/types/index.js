"use strict";
/**
 * Sandbox-consuming PowerShell executor — the pwsh twin of
 * `@z/dsh-bash-sandbox`. It wraps the exact local pwsh argv through
 * `ctx.sandbox` (which on Windows resolves to the ACL restricted-token runner
 * chain), inherits local process mechanics, and reports the selected mode,
 * enforcement, and denial facts. Positive runner-launch evidence means the
 * command never ran: foreground calls throw `SANDBOX_UNAVAILABLE`, while
 * background processes carry `runnerFailed`; other spawn rejections retain
 * local-executor semantics. The tool layer owns the escalation approval flow
 * through `ctx.approval`; this executor reports the sandbox facts the tool
 * renders.
 * @module @z/dsh-pwsh-sandbox
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
exports.SandboxPwshExecutor = void 0;
var dsh_sandbox_1 = require("@z/dsh-sandbox");
var dsh_pwsh_local_1 = require("@z/dsh-pwsh-local");
var helpers_ts_1 = require("./helpers.ts");
/**
 * Registers as `ctx.shell` in place of the local pwsh executor and requires a
 * `ctx.sandbox` provider plus `ctx.sandboxPolicy`; the tool layer carries the
 * sandbox denial rendering and escalation surface (see the
 * pwsh-tool-and-executor Agent Note). Tool calls pass the calling session's
 * resolved policy; direct calls fall back to deployment policy.
 * `result.sandbox` reports the mode, enforcement, and denial facts the tool
 * renders.
 */
/* jscpd:ignore-start -- deliberate call-for-call mirror of bash-sandbox's executor (pwsh-tool-and-executor Agent Note) */
var SandboxPwshExecutor = /** @class */ (function (_super) {
    __extends(SandboxPwshExecutor, _super);
    function SandboxPwshExecutor(ctx, config) {
        var _this = _super.call(this, ctx, config) || this;
        /**
         * Per-process confinement facts retained until settlement. Providers may
         * vary enforcement and diagnostic dialect between overlapping calls, so a
         * shared latest-wrap value would classify a process against the wrong facts.
         * Unconfined processes have no entry.
         */
        _this.processFacts = new Map();
        // The default mode is the capability fact used for schema advertisement;
        // actual tool executions carry their resolved per-call policy.
        _this.mode = ctx.sandboxPolicy.defaultMode;
        return _this;
    }
    Object.defineProperty(SandboxPwshExecutor.prototype, "sandboxMode", {
        /** The configured default mode — the capability fact the tool layer reads. */
        get: function () {
            return this.mode;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Stamp a complete per-call policy onto the spec. Tool calls supply the
     * calling session's resolved mode and root; lower-level callers fall back to
     * the deployment policy.
     */
    SandboxPwshExecutor.prototype.resolve = function (request) {
        var _a;
        return __assign(__assign({}, _super.prototype.resolve.call(this, request)), { sandboxPolicy: (_a = request.sandboxPolicy) !== null && _a !== void 0 ? _a : this.ctx.sandboxPolicy.resolve() });
    };
    SandboxPwshExecutor.prototype.run = function (spec) {
        return __awaiter(this, void 0, void 0, function () {
            var policy, mode, result_1, confined, result, error_1, runnerFailure;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        policy = spec.sandboxPolicy;
                        mode = policy.mode;
                        if (!(mode === 'danger-full-access')) return [3 /*break*/, 2];
                        return [4 /*yield*/, _super.prototype.run.call(this, spec)];
                    case 1:
                        result_1 = _b.sent();
                        return [2 /*return*/, __assign(__assign({}, result_1), { sandbox: { mode: mode, denied: false } })];
                    case 2:
                        confined = this.confine(spec, __assign(__assign({}, policy), { mode: mode }));
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, this.runArgv(spec, confined.argv)];
                    case 4:
                        result = _b.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        error_1 = _b.sent();
                        // An upstream abort remains cancellation even when it prevents spawn.
                        if (((_a = spec.signal) === null || _a === void 0 ? void 0 : _a.aborted) === true)
                            spec.signal.throwIfAborted();
                        if ((0, helpers_ts_1.isRunnerSpawnFailure)(error_1, confined.argv[0], spec.workdir)) {
                            throw new dsh_sandbox_1.SandboxUnavailableError(mode, String(error_1));
                        }
                        throw error_1;
                    case 6:
                        runnerFailure = (0, helpers_ts_1.classifyRunnerFailure)(result.exitCode, result.stderr.text, confined.runnerFailureRules);
                        if (runnerFailure !== undefined) {
                            throw new dsh_sandbox_1.SandboxUnavailableError(mode, runnerFailure.detail);
                        }
                        return [2 /*return*/, __assign(__assign({}, result), { sandbox: { mode: mode, denied: (0, helpers_ts_1.classifyDenial)(result, confined.denialSignatures), enforcement: confined.enforcement } })];
                }
            });
        });
    };
    SandboxPwshExecutor.prototype.start = function (spec) {
        var policy = spec.sandboxPolicy;
        var mode = policy.mode;
        if (mode === 'danger-full-access')
            return _super.prototype.start.call(this, spec);
        // Once startArgv returns, install facts synchronously; promise settlement
        // cannot run before start() returns.
        var confined = this.confine(spec, __assign(__assign({}, policy), { mode: mode }));
        var proc;
        try {
            proc = this.startArgv(spec, confined.argv);
        }
        catch (error) {
            if ((0, helpers_ts_1.isRunnerSpawnFailure)(error, confined.argv[0], spec.workdir)) {
                throw new dsh_sandbox_1.SandboxUnavailableError(mode, String(error));
            }
            throw error;
        }
        var enforcement = confined.enforcement, denialSignatures = confined.denialSignatures, runnerFailureRules = confined.runnerFailureRules;
        this.processFacts.set(proc, {
            mode: mode,
            enforcement: enforcement,
            denialSignatures: denialSignatures,
            runnerFailureRules: runnerFailureRules,
            runnerProgram: confined.argv[0],
            workdir: spec.workdir,
        });
        return proc;
    };
    /**
     * Stamp per-process sandbox facts before `done` settles. Full-access
     * processes have no facts; signal deaths are not denials.
     */
    SandboxPwshExecutor.prototype.onProcessDone = function (proc, stderr, spawnFailed, spawnError) {
        var facts = this.processFacts.get(proc);
        if (facts !== undefined) {
            this.processFacts.delete(proc);
            // A rejected spawn never started the confined launch. Otherwise runner
            // failure outranks denial because its diagnostics may contain denial terms.
            var runnerFailed = spawnFailed
                ? (0, helpers_ts_1.isRunnerSpawnFailure)(spawnError, facts.runnerProgram, facts.workdir)
                : (0, helpers_ts_1.classifyRunnerFailure)(proc.exitCode, stderr, facts.runnerFailureRules) !== undefined;
            proc.sandbox = __assign({ mode: facts.mode, denied: !runnerFailed && (0, helpers_ts_1.matchesSignature)(proc.exitCode, stderr, facts.denialSignatures), enforcement: facts.enforcement }, (runnerFailed ? { runnerFailed: runnerFailed } : {}));
        }
        _super.prototype.onProcessDone.call(this, proc, stderr, spawnFailed, spawnError);
    };
    /**
     * Wrap one pwsh invocation via the `ctx.sandbox` provider. Provider errors
     * propagate unchanged; the returned argv is handed directly to the local
     * executor's subprocess path.
     * @param spec - resolved execution spec whose pwsh argv is confined.
     * @param policy - resolved confined execution policy.
     * @returns the provider's exact argv and settlement-classification facts.
     */
    SandboxPwshExecutor.prototype.confine = function (spec, policy) {
        return this.ctx.sandbox.confine(this.argv(spec), policy);
    };
    SandboxPwshExecutor.inject = ['subprocess', 'sandbox', 'sandboxPolicy'];
    return SandboxPwshExecutor;
}(dsh_pwsh_local_1.PwshLocalExecutor));
exports.SandboxPwshExecutor = SandboxPwshExecutor;
/* jscpd:ignore-end */
exports.default = SandboxPwshExecutor;
