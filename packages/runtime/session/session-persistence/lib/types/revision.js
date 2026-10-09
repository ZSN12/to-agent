"use strict";
/** Opaque revision identity for lightweight persistence observations. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionPersistenceRevision = SessionPersistenceRevision;
/**
 * Brand a backend revision for the provider-neutral persistence contract.
 * @param value - backend-owned opaque revision representation.
 * @returns the same runtime string with persistence-revision identity.
 */
function SessionPersistenceRevision(value) {
    return value;
}
