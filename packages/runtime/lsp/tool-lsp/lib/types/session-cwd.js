"use strict";
/**
 * Derive the workspace root an `lsp` call resolves against: the calling agent's per-session
 * workspace (`exec.agent.session.header.cwd`), mirroring how the filesystem tools resolve paths.
 * Unlike those tools, LSP has NO provider fallback — a missing cwd fails the call as
 * `LSP_WORKSPACE_REQUIRED`, because the local provider must canonicalize a real workspace before it
 * can start a server.
 * @module @z/dsh-tool-lsp/session-cwd
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionCwd = sessionCwd;
/**
 * The session workspace cwd for this call, or `undefined` when none applies.
 * @param exec - the tool-execution context; only its optional `agent` is read.
 * @returns the calling agent's session cwd, or undefined for a non-agent caller.
 */
function sessionCwd(exec) {
    var _a;
    return (_a = exec.agent) === null || _a === void 0 ? void 0 : _a.session.header.cwd;
}
