"use strict";
/** Browser-safe UUID generation for client-side wire correlation. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomUuid = randomUuid;
/**
 * Generate an RFC 4122 version 4 UUID without requiring a secure context.
 * @returns a UUID backed by `crypto.getRandomValues()`, which browsers expose on insecure origins.
 */
function randomUuid() {
    var bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x40);
    view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80);
    var hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    return "".concat(hex.slice(0, 8), "-").concat(hex.slice(8, 12), "-").concat(hex.slice(12, 16), "-").concat(hex.slice(16, 20), "-").concat(hex.slice(20));
}
