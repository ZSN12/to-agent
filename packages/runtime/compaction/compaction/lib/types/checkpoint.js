"use strict";
/**
 * Compaction checkpoint provenance: the correlated source constructor and type
 * every backend uses for its replacement user message, plus the predicate that
 * recognizes persisted checkpoints.
 *
 * The seam itself lives in `@z/dsh-compaction`, which re-exports these
 * contracts; this module is a pure type/value/predicate outlet (no cordis
 * imports, no module augmentation) so client and wire programs can name the
 * checkpoint source without loading the host plugin's Context merges — the
 * `dsh-commands/brand` shape.
 *
 * @module @z/dsh-compaction/checkpoint
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compactCheckpointSource = compactCheckpointSource;
exports.isCompactCheckpointSource = isCompactCheckpointSource;
var COMPACT_CHECKPOINT_MARKER = Object.freeze({ kind: 'plugin', plugin: 'compact' });
/**
 * Create checkpoint provenance correlated with one compaction transaction.
 * @param compactionId - owning compaction identity.
 * @param sourceCommandId - initiating manual command, when present.
 * @returns immutable checkpoint source.
 */
function compactCheckpointSource(compactionId, sourceCommandId) {
    return Object.freeze(__assign(__assign(__assign({}, COMPACT_CHECKPOINT_MARKER), { compactionId: compactionId }), sourceCommandId === undefined ? {} : { sourceCommandId: sourceCommandId }));
}
/**
 * Test whether a persisted message source identifies a compaction checkpoint.
 * @param source - source restored from a surface user message.
 * @returns whether the source carries the backend-independent checkpoint marker.
 */
function isCompactCheckpointSource(source) {
    return source.kind === 'plugin' && source.plugin === COMPACT_CHECKPOINT_MARKER.plugin;
}
