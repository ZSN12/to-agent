"use strict";
/**
 * Browser-safe `@file` token grammar shared by terminal and web clients.
 *
 * @module @z/dsh-file-reference/grammar
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeAtToken = activeAtToken;
exports.formatFileMention = formatFileMention;
/**
 * Extract an `@path` or `@"path with spaces` token at the cursor. An `@`
 * inside another token, such as an email address, is not a completion trigger.
 * @param line - current editor line.
 * @param cursorCol - cursor column within that line.
 * @returns the active token, or `undefined` outside an `@` token.
 */
function activeAtToken(line, cursorCol) {
    var beforeCursor = line.slice(0, cursorCol);
    var quoted = /(?:^|\s)(@"([^"]*))$/u.exec(beforeCursor);
    if ((quoted === null || quoted === void 0 ? void 0 : quoted[1]) !== undefined && quoted[2] !== undefined) {
        return { prefix: quoted[1], query: quoted[2], quoted: true };
    }
    var plain = /(?:^|\s)(@([^\s]*))$/u.exec(beforeCursor);
    if ((plain === null || plain === void 0 ? void 0 : plain[1]) === undefined || plain[2] === undefined)
        return undefined;
    return { prefix: plain[1], query: plain[2], quoted: false };
}
/**
 * Format a selected path as prompt text. Whitespace uses the quoted
 * `@"path"` grammar; a quoted directory keeps that quote open after its
 * trailing slash so completion can descend another level.
 * @param candidate - selected file or directory.
 * @param preserveQuote - retain an explicitly opened quote even when unnecessary.
 * @returns the insertion value, or `undefined` for a path the editor grammar cannot represent safely.
 */
function formatFileMention(candidate, preserveQuote) {
    var path = candidate.kind === 'directory' ? "".concat(candidate.path, "/") : candidate.path;
    if (/[\u0000-\u001f\u007f-\u009f"]/u.test(path))
        return undefined;
    var quoted = preserveQuote || /\s/u.test(path);
    if (!quoted)
        return "@".concat(path);
    if (candidate.kind === 'directory')
        return "@\"".concat(path);
    return "@\"".concat(path, "\"");
}
