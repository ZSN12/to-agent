"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryId = RetryId;
/**
 * Brand an implementation-minted retry-chain identity.
 * @param id - opaque retry identity.
 * @returns the same string, branded; no validation is performed.
 */
function RetryId(id) {
    return id;
}
