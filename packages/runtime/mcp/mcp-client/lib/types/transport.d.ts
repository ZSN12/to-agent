/**
 * Transport factory: creates the appropriate MCP transport based on the
 * plugin's resolved config. Stdio spawns a child process (with credential
 * scrubbing); Streamable HTTP connects to a URL.
 *
 * @module
 */
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Config } from './index.ts';
export declare function resolveStreamableHttpHeaders(config: Extract<Config, {
    transport: 'streamable-http';
}>): Record<string, string>;
/**
 * Create an MCP transport from the resolved plugin config.
 *
 * @param config - Resolved plugin config discriminated on `transport`.
 * @returns A connected-ready MCP Transport (stdio or Streamable HTTP).
 */
export declare function createTransport(config: Config, resolvedHttpHeaders?: Record<string, string>): Transport;
//# sourceMappingURL=transport.d.ts.map