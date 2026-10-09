"use strict";
/**
 * Result-time contextual diff presentation for write and edit. Storage returns before/after
 * text; this model-facing layer derives one three-line-context card per applied hunk.
 * @module @z/dsh-tool-fs/src/diff
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIFF_CONTEXT = void 0;
exports.computeHunkDiffs = computeHunkDiffs;
exports.diffsFromMeta = diffsFromMeta;
var diff_1 = require("diff");
/** Context lines shown on each side of an applied hunk. */
exports.DIFF_CONTEXT = 3;
/**
 * Compute one {@link FileDiff} per hunk between `before` and `after`, each carrying the
 * applied change plus {@link DIFF_CONTEXT} context lines. Pure insertions use `oldText: null`,
 * patch-only no-newline markers are omitted, and scattered replacements remain separate hunks.
 *
 * @param path - the path stamped on every produced diff (the model-facing `file_path`; the
 *   bridge relativizes it).
 * @param before - the file text before the change (the backend's LF-normalized diff basis).
 * @param after - the file text after the change, on the same basis.
 * @returns one diff per applied hunk, in file order; empty when the texts are identical.
 */
function computeHunkDiffs(path, before, after) {
    var patch = (0, diff_1.structuredPatch)('', '', before, after, undefined, undefined, { context: exports.DIFF_CONTEXT });
    var diffs = [];
    for (var _i = 0, _a = patch.hunks; _i < _a.length; _i++) {
        var hunk = _a[_i];
        var oldLines = [];
        var newLines = [];
        for (var _b = 0, _c = hunk.lines; _b < _c.length; _b++) {
            var line = _c[_b];
            // The unified-diff marker for a missing trailing newline annotates the
            // patch, not the content — skip it so it never leaks into a diff block.
            if (line.startsWith('\\'))
                continue;
            var text = line.slice(1);
            if (line.startsWith('-')) {
                oldLines.push(text);
            }
            else if (line.startsWith('+')) {
                newLines.push(text);
            }
            else {
                // A context (unchanged) line appears on both sides.
                oldLines.push(text);
                newLines.push(text);
            }
        }
        diffs.push({ path: path, oldText: oldLines.length > 0 ? oldLines.join('\n') : null, newText: newLines.join('\n') });
    }
    return diffs;
}
/** Whether `value` is a valid {@link FileDiff} (defensive narrowing from opaque `meta`). */
function isFileDiff(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    var _a = value, path = _a.path, oldText = _a.oldText, newText = _a.newText;
    return typeof path === 'string'
        && (oldText === null || typeof oldText === 'string')
        && typeof newText === 'string';
}
/**
 * Narrow opaque live or replayed result metadata to non-empty file diffs. Malformed metadata
 * returns `undefined` so presentation can fall back instead of throwing during replay.
 * @param meta - result metadata.
 * @returns validated hunks, or `undefined` for absent or malformed data.
 */
function diffsFromMeta(meta) {
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta))
        return undefined;
    var diffs = meta.diffs;
    if (!Array.isArray(diffs) || diffs.length === 0 || !diffs.every(isFileDiff))
        return undefined;
    return diffs;
}
