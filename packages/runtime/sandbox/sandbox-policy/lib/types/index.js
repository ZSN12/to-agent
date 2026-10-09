"use strict";
/**
 * The sandbox POLICY home (`ctx.sandboxPolicy`): the single owner of the
 * deployment's sandbox fallbacks plus per-session resolution: the file-effect
 * {@link SandboxMode}, the `workspace-write` root, and the override kit (the
 * `sandbox/mode` event, its fold, and its write path, from `./session-mode.ts`).
 * Before each agent request, the owner also contributes the resolved policy to
 * the cache-safe runtime-context snapshot. The agent loop logs that snapshot as
 * model history, so replay reconstructs the same mode and root the enforcing
 * consumers resolve without rewriting the stable system prompt.
 *
 * Enforcing filesystem, one-shot bash, and terminal backends read the SAME
 * resolved policy here. The context describes that policy without inventorying
 * capabilities, while each backend retains its own enforcement dialect and each
 * tool owns its operation-specific denial and escalation guidance. The service
 * reads session state once at each operation boundary; executors and providers
 * remain session-free.
 *
 * @module @z/dsh-sandbox-policy
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxPolicyService = exports.setSandboxMode = exports.effectiveSandboxMode = exports.SANDBOX_MODES = void 0;
var node_path_1 = require("node:path");
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var dsh_sandbox_1 = require("@z/dsh-sandbox");
var session_mode_ts_1 = require("./session-mode.ts");
var session_mode_ts_2 = require("./session-mode.ts");
Object.defineProperty(exports, "SANDBOX_MODES", { enumerable: true, get: function () { return session_mode_ts_2.SANDBOX_MODES; } });
Object.defineProperty(exports, "effectiveSandboxMode", { enumerable: true, get: function () { return session_mode_ts_2.effectiveSandboxMode; } });
Object.defineProperty(exports, "setSandboxMode", { enumerable: true, get: function () { return session_mode_ts_2.setSandboxMode; } });
/** Resolve filesystem identity before lexical normalization can erase symlink-sensitive components. */
function resolveWorkspaceRoot(path) {
    return (0, node_path_1.resolve)((0, dsh_sandbox_1.canonicalPath)(path));
}
/** Render the policy without claiming which capabilities are mounted. */
function renderPolicyContext(policy) {
    switch (policy.mode) {
        case 'read-only':
            return 'Current Z file policy: read-only. Any available operation enforced by the Z file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.';
        case 'workspace-write':
            return "Current Z file policy: workspace-write. Any available operation enforced by the Z file sandbox may modify files under the session workspace: ".concat(JSON.stringify(policy.workspaceRoot), ". Some platform temporary areas may also be writable.");
        case 'danger-full-access':
            return 'Current Z file policy: danger-full-access. The Z file sandbox does not restrict file modifications by available operations.';
        /* v8 ignore next 4 -- SandboxMode is a typed same-process closed union; this branch is only the static exhaustiveness guard. */
        default: {
            var mode = policy.mode;
            throw new Error("unreachable sandbox mode: ".concat(String(mode)));
        }
    }
}
/**
 * The sandbox-policy service (`ctx.sandboxPolicy`). Owns the deployment
 * default mode, fallback workspace root, and current request-time policy
 * section. Tool layers call {@link resolve} for each execution so a session's
 * mode log and immutable cwd travel together to every enforcing capability.
 */
var SandboxPolicyService = /** @class */ (function (_super) {
    __extends(SandboxPolicyService, _super);
    function SandboxPolicyService(ctx, config) {
        var _a;
        var _this = _super.call(this, ctx, 'sandboxPolicy') || this;
        // schemastery (static Config) already filled `mode`; the cast records that
        // runtime fact. `workspaceRoot` has NO schema default, so its fallback to
        // the process cwd is real branching, resolved absolute either way.
        _this.defaultMode = config.mode;
        _this.workspaceRoot = resolveWorkspaceRoot((_a = config.workspaceRoot) !== null && _a !== void 0 ? _a : process.cwd());
        ctx.inject(['systemPrompt'], function (scope) {
            scope.systemPrompt.context({
                name: 'sandbox:policy',
                order: 110,
                text: function (context) {
                    var _a;
                    var session = (_a = context.agent) === null || _a === void 0 ? void 0 : _a.session;
                    return session === undefined
                        ? ''
                        : renderPolicyContext(_this.resolve({ session: session }));
                },
            });
        });
        return _this;
    }
    /**
     * Resolve the complete policy for one capability call. An approved explicit
     * mode outranks the session's last `sandbox/mode` event, which outranks the
     * deployment default. A session cwd is its workspace-write boundary; the
     * configured root is the fallback for agentless calls and sessions without a
     * cwd.
     * @param request - optional session and approved mode override.
     * @returns the fully resolved per-call mode and absolute workspace root.
     */
    SandboxPolicyService.prototype.resolve = function (request) {
        var _a, _b, _c;
        if (request === void 0) { request = {}; }
        var session = request.session;
        return __assign({ mode: (_b = (_a = request.mode) !== null && _a !== void 0 ? _a : (session === undefined ? undefined : this.overrideOf(session))) !== null && _b !== void 0 ? _b : this.defaultMode, workspaceRoot: resolveWorkspaceRoot((_c = session === null || session === void 0 ? void 0 : session.header.cwd) !== null && _c !== void 0 ? _c : this.workspaceRoot) }, session === undefined ? {} : { sessionId: session.id });
    };
    /**
     * Read the session override without applying the deployment default.
     * @param session - session whose log supplies the override.
     * @returns the last logged mode, or `undefined` without one.
     */
    SandboxPolicyService.prototype.overrideOf = function (session) {
        return (0, session_mode_ts_1.effectiveSandboxMode)(session.events);
    };
    // Inline schema call: the config catalog walks `static Config` statically.
    SandboxPolicyService.Config = schemastery_1.default.object({
        mode: schemastery_1.default.union(['read-only', 'workspace-write', 'danger-full-access']).default('read-only'),
        // No schema default: process.cwd() is resolved in the constructor so the
        // stored root is always absolute regardless of how it was supplied.
        workspaceRoot: schemastery_1.default.string(),
    });
    return SandboxPolicyService;
}(cordis_1.Service));
exports.SandboxPolicyService = SandboxPolicyService;
exports.default = SandboxPolicyService;
