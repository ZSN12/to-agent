"use strict";
// Central contract re-export point: every contract import inside
// web-runtime goes through this single file.
// Types and runtime protocol helpers/bounds come from the apiproxy api/ layer
// (zero Node deps, browser-safe); AbstractApiClient is the client boundary.
// NEVER import the package root: it drags bootHost/cordis into the browser bundle.
// The ./api and ./client subpath exports are the browser-safe channels.
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbstractApiClient = exports.transportError = exports.SESSION_SEARCH_RESULT_LIMIT = exports.RpcId = void 0;
exports.resultOf = resultOf;
// transportError lives in the apiproxy api layer (beside RpcResult, its
// subject); re-exported here so connection consumers keep one contract
// entry point.
var api_1 = require("@z/dsh-host-apiproxy/api");
Object.defineProperty(exports, "RpcId", { enumerable: true, get: function () { return api_1.RpcId; } });
Object.defineProperty(exports, "SESSION_SEARCH_RESULT_LIMIT", { enumerable: true, get: function () { return api_1.SESSION_SEARCH_RESULT_LIMIT; } });
Object.defineProperty(exports, "transportError", { enumerable: true, get: function () { return api_1.transportError; } });
var client_1 = require("@z/dsh-host-apiproxy/client");
Object.defineProperty(exports, "AbstractApiClient", { enumerable: true, get: function () { return client_1.AbstractApiClient; } });
/**
 * Unwrap a unary response: RpcResponse<T> -> RpcResult<T> (business code only
 * cares about the result slot).
 * @param response - the unary response.
 * @returns its result slot.
 */
function resultOf(response) {
    return response.result;
}
