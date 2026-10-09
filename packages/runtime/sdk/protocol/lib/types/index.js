/**
 * Shared wire protocol for the DeepSeek Harness SDK runtime: the
 * newline-delimited JSON-RPC stdio transport plus the named request, result,
 * and notification types both wire ends speak. The runtime server plugin
 * (`@z/dsh-sdk-jsonrpc-server`) serves this protocol; SDK clients
 * (`@z/dsh-sdk-client`, the Python SDK) drive it.
 *
 * @module @z/dsh-sdk-protocol
 */
export { JsonRpcLineTransport, JsonRpcResponseError } from "./transport.js";
//# sourceMappingURL=index.js.map