"use strict";
/** Attachment identifier brand. @module @z/dsh-attachment/brand */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttachmentId = AttachmentId;
exports.ImageVariantId = ImageVariantId;
/**
 * Brand a validated storage identifier.
 * @param value - backend-produced opaque identifier.
 * @returns the branded identifier.
 */
function AttachmentId(value) {
    return value;
}
/**
 * Brand a validated request-image transformation identifier.
 * @param value - attachment-provider-produced opaque identifier.
 * @returns the branded identifier.
 */
function ImageVariantId(value) {
    return value;
}
