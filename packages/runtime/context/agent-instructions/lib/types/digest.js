"use strict";
/**
 * Content identity for workspace instruction duplicate suppression.
 *
 * @module @z/dsh-agent-instructions/digest
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.instructionContentSha1 = instructionContentSha1;
exports.trimmedInstructionDigest = trimmedInstructionDigest;
var node_crypto_1 = require("node:crypto");
/**
 * Compute the content identity used across instruction loading and session state.
 * @param content - exact UTF-8 instruction text.
 * @returns lowercase SHA-1 digest in hexadecimal form.
 */
function instructionContentSha1(content) {
    return (0, node_crypto_1.createHash)('sha1').update(content).digest('hex');
}
/**
 * Compute the whitespace-insensitive identity used for per-directory duplicate
 * suppression. Leading and trailing whitespace is trimmed before hashing so a
 * symlinked or byte-copied sibling that differs only by surrounding whitespace
 * still collapses to a single rendered file.
 * @param content - exact UTF-8 instruction text.
 * @returns SHA-1 digest of the trimmed content.
 */
function trimmedInstructionDigest(content) {
    return instructionContentSha1(content.trim());
}
