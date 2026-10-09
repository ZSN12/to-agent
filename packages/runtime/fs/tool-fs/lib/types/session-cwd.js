"use strict";
/**
 * Derive the working directory a filesystem tool resolves relative paths against: the calling
 * agent's per-session workspace (`exec.agent.session.header.cwd`), so each session's
 * `read`/`write`/`edit` act on ITS workspace, not the server's launch dir — mirroring how
 * `dsh-tool-bash` defaults a bash `workdir` to the session cwd.
 * Non-agent calls return `undefined`, leaving the fallback in the provider rather than reading
 * `process.cwd()` at the tool boundary.
 * @module @z/dsh-tool-fs/session-cwd
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionCwd = sessionCwd;
exports.sessionResolveOptions = sessionResolveOptions;
var dsh_sandbox_1 = require("@z/dsh-sandbox");
var PARENT_PATH_SEGMENT = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
/**
 * The session workspace cwd for this call, or `undefined` when none applies.
 * @param exec - the tool-execution context; only its optional `agent` is read.
 * @param requestedPath - the path the provider will resolve; parent traversal
 *   makes a symlinked cwd's filesystem identity observable.
 * @returns the calling agent's session cwd, or undefined for a non-agent caller (the backend then applies its own default).
 */
function sessionCwd(exec, requestedPath) {
    var _a;
    var cwd = (_a = exec.agent) === null || _a === void 0 ? void 0 : _a.session.header.cwd;
    if (cwd === undefined || (!PARENT_PATH_SEGMENT.test(cwd) && !PARENT_PATH_SEGMENT.test(requestedPath)))
        return cwd;
    return (0, dsh_sandbox_1.canonicalPath)(cwd);
}
/**
 * Resolution options shared by all model-facing filesystem tools.
 * @param exec - the tool-execution context supplying session cwd and cancellation.
 * @param requestedPath - the path the provider will resolve.
 * @param policyWorkspaceRoot - resolved per-call root, when a mutation carries sandbox policy.
 * @returns provider resolution options for the current tool call.
 */
function sessionResolveOptions(exec, requestedPath, policyWorkspaceRoot) {
    var cwd = policyWorkspaceRoot !== null && policyWorkspaceRoot !== void 0 ? policyWorkspaceRoot : sessionCwd(exec, requestedPath);
    return __assign(__assign({}, cwd !== undefined ? { cwd: cwd } : {}), { signal: exec.signal });
}
