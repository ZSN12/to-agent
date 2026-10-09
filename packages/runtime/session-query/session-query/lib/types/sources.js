"use strict";
/** Shared immutable-header checks for logical session source observers. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSessionHeadersCompatible = assertSessionHeadersCompatible;
var config_ts_1 = require("./config.ts");
/**
 * Reject incompatible observations of one logical session source.
 * @param a - first live, listed, or loaded header observation.
 * @param b - second header observation expected to identify the same source.
 */
function assertSessionHeadersCompatible(a, b) {
    var _a, _b;
    if (a.version !== b.version
        || a.id !== b.id
        || a.createdAt !== b.createdAt
        || a.cwd !== b.cwd
        || a.parentSession !== b.parentSession
        || a.seedLength !== b.seedLength
        || ((_a = a.delegationDepth) !== null && _a !== void 0 ? _a : 0) !== ((_b = b.delegationDepth) !== null && _b !== void 0 ? _b : 0)) {
        throw new config_ts_1.SessionQueryError("session source headers conflict for session \"".concat(a.id, "\""), 'SESSION_QUERY_SOURCE_CONFLICT');
    }
}
