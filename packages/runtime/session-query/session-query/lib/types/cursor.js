"use strict";
/** Opaque cursor identity for session-search pagination. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionSearchCursor = SessionSearchCursor;
/**
 * Brand an encoded provider cursor for the public search contract.
 * @param value - opaque encoded cursor value.
 * @returns the same runtime string with session-search cursor identity.
 */
function SessionSearchCursor(value) {
    return value;
}
