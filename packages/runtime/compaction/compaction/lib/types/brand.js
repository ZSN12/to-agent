"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompactionId = CompactionId;
/**
 * Brand an implementation-minted compaction identity.
 * @param id - opaque transaction identity.
 * @returns the same string, branded; no validation is performed.
 */
function CompactionId(id) {
    return id;
}
