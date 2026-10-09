"use strict";
/**
 * Transport factory: creates the appropriate MCP transport based on the
 * plugin's resolved config. Stdio spawns a child process (with credential
 * scrubbing); Streamable HTTP connects to a URL.
 *
 * @module
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
exports.createTransport = createTransport;
var stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
var streamableHttp_js_1 = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
var dsh_subprocess_1 = require("@z/dsh-subprocess");
/**
 * The subprocess seam's scrubbed parent env (credential-shaped and stale
 * `DSH_*` names dropped), plus the spec's explicit env. The MCP SDK owns the
 * actual spawn, so this transport shares the scrub definition rather than the
 * spawn path.
 */
function buildChildEnv(extra) {
    return __assign(__assign({}, (0, dsh_subprocess_1.scrubbedParentEnv)()), extra);
}
/**
 * Create an MCP transport from the resolved plugin config.
 *
 * @param config - Resolved plugin config discriminated on `transport`.
 * @returns A connected-ready MCP Transport (stdio or Streamable HTTP).
 */
function createTransport(config) {
    switch (config.transport) {
        case 'stdio':
            return new stdio_js_1.StdioClientTransport({
                command: config.command,
                args: config.args,
                env: buildChildEnv(config.env),
                cwd: config.cwd,
            });
        case 'streamable-http':
            // The MCP SDK's StreamableHTTPClientTransport has optional callback
            // properties typed without `| undefined` (exactOptionalPropertyTypes
            // mismatch with the Transport interface); the SDK constructed the
            // object, so the cast records only that widening.
            return new streamableHttp_js_1.StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } });
    }
}
