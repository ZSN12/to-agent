"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationContextKey = conversationContextKey;
/**
 * Build a stable collision-free key for one Definition-local business identity.
 * @param kind - Definition kind.
 * @param id - Definition-local business identity.
 * @returns engine-owned Context key.
 */
function conversationContextKey(kind, id) {
    return "".concat(kind.length, ":").concat(kind).concat(id);
}
