/**
 * Transport factory: creates the appropriate MCP transport based on the
 * plugin's resolved config. Stdio spawns a child process (with credential
 * scrubbing); Streamable HTTP connects to a URL.
 *
 * @module
 */
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { scrubbedParentEnv } from '@taskweaver/dsh-subprocess';
const HOST_ENV_VAR_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
function resolveBoundProcessEnv(bindings) {
    if (!bindings)
        return {};
    const resolved = {};
    for (const [childKey, hostVar] of Object.entries(bindings)) {
        if (!HOST_ENV_VAR_PATTERN.test(hostVar)) {
            throw new Error(`mcp-client: invalid host environment variable name ${JSON.stringify(hostVar)}`);
        }
        const value = process.env[hostVar];
        if (value !== undefined)
            resolved[childKey] = value;
    }
    return resolved;
}
export function resolveStreamableHttpHeaders(config) {
    const headers = { ...config.headers };
    const envVar = config.bearerTokenEnvVar?.trim();
    if (envVar) {
        if (!HOST_ENV_VAR_PATTERN.test(envVar)) {
            throw new Error(`mcp-client: invalid bearerTokenEnvVar ${JSON.stringify(envVar)}`);
        }
        const token = process.env[envVar];
        if (token)
            headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}
/**
 * The subprocess seam's scrubbed parent env (credential-shaped and stale
 * `TASKWEAVER_*` names dropped), plus the spec's explicit env. The MCP SDK owns the
 * actual spawn, so this transport shares the scrub definition rather than the
 * spawn path.
 */
function buildChildEnv(extra) {
    return { ...scrubbedParentEnv(), ...extra };
}
/**
 * Create an MCP transport from the resolved plugin config.
 *
 * @param config - Resolved plugin config discriminated on `transport`.
 * @returns A connected-ready MCP Transport (stdio or Streamable HTTP).
 */
export function createTransport(config, resolvedHttpHeaders) {
    switch (config.transport) {
        case 'stdio':
            return new StdioClientTransport({
                command: config.command,
                args: config.args,
                env: buildChildEnv({ ...resolveBoundProcessEnv(config.processEnv), ...config.env }),
                cwd: config.cwd || process.cwd(),
            });
        case 'streamable-http':
            // The MCP SDK's StreamableHTTPClientTransport has optional callback
            // properties typed without `| undefined` (exactOptionalPropertyTypes
            // mismatch with the Transport interface); the SDK constructed the
            // object, so the cast records only that widening.
            return new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: resolvedHttpHeaders ?? resolveStreamableHttpHeaders(config) } });
    }
}
//# sourceMappingURL=transport.js.map