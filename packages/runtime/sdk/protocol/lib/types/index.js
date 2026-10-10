/**
 * Shared wire protocol for the DeepSeek Harness SDK runtime: the
 * newline-delimited JSON-RPC stdio transport plus the named request, result,
 * and notification types both wire ends speak. The runtime server plugin
 * (`@taskweaver/dsh-sdk-jsonrpc-server`) serves this protocol; SDK clients
 * (`@taskweaver/dsh-sdk-client`, the Python SDK) drive it.
 *
 * @module @taskweaver/dsh-sdk-protocol
 */
export { JsonRpcLineTransport, JsonRpcResponseError } from "./transport.js";
//# sourceMappingURL=index.js.map