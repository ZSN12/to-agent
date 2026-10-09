"use strict";
/**
 * Wire-safe approval identifiers and outcome vocabulary, free of
 * cordis/service imports so browser type chains (apiproxy api → client) can
 * consume them without loading this package's Context augmentation.
 * @module @z/dsh-user-approval/types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalRequestId = ApprovalRequestId;
/**
 * Brand a string as an {@link ApprovalRequestId}.
 * @param id - the raw id string to brand.
 * @returns the same string carrying the brand.
 */
function ApprovalRequestId(id) {
    return id;
}
