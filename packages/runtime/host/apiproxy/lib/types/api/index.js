"use strict";
/**
 * apiproxy contract-layer barrel. api/ has zero Node dependencies and is
 * importable from the browser; the TS interfaces are the authoritative contract, while HTTP,
 * WebSocket, and in-process SSE are merely physical channels (four-quadrant message model).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS = exports.SESSION_SEARCH_RESULT_LIMIT = exports.serverResponseSchema = exports.serverRequestSchema = exports.clientRequestSchema = exports.transportError = exports.RpcId = void 0;
// ---- Errors and ids ----
var rpc_ts_1 = require("./rpc.ts");
Object.defineProperty(exports, "RpcId", { enumerable: true, get: function () { return rpc_ts_1.RpcId; } });
Object.defineProperty(exports, "transportError", { enumerable: true, get: function () { return rpc_ts_1.transportError; } });
var rpc_schema_ts_1 = require("./rpc.schema.ts");
Object.defineProperty(exports, "clientRequestSchema", { enumerable: true, get: function () { return rpc_schema_ts_1.clientRequestSchema; } });
Object.defineProperty(exports, "serverRequestSchema", { enumerable: true, get: function () { return rpc_schema_ts_1.serverRequestSchema; } });
Object.defineProperty(exports, "serverResponseSchema", { enumerable: true, get: function () { return rpc_schema_ts_1.serverResponseSchema; } });
// ---- Fixed session-search product bounds ----
var session_search_ts_1 = require("./session-search.ts");
Object.defineProperty(exports, "SESSION_SEARCH_RESULT_LIMIT", { enumerable: true, get: function () { return session_search_ts_1.SESSION_SEARCH_RESULT_LIMIT; } });
Object.defineProperty(exports, "SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS", { enumerable: true, get: function () { return session_search_ts_1.SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS; } });
