"use strict";
/**
 * The O(1) surface-token fold shared by the token-meter projection units.
 *
 * A projection state must stay bounded — the persisted projection cache
 * checkpoints every unit's whole state, so carrying the priced surface
 * (one node per model-visible message) would grow a checkpoint without
 * bound over the session's life. Instead, replacements ride the compact
 * seam's shadow-price protocol: the metering event immediately before a
 * surface `replace` (`compaction/summary` or `compaction/prune`) states the
 * heuristic price of the exact replaced range, so the fold keeps a running
 * total plus at most one pending claim and never retains per-node prices.
 * The counts are exact by construction: producers derive them from the same
 * fixed estimator this module prices appends with. A replacement without an
 * armed claim folds with zero delta because bounded state cannot reconstruct
 * the replaced range; this preserves replay at the cost of possible drift.
 *
 * @module @z/dsh-token-meter/surface-projection
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.foldSurfaceProjection = foldSurfaceProjection;
var dsh_session_1 = require("@z/dsh-session");
var estimate_ts_1 = require("./estimate.ts");
/**
 * Fold one committed event onto a running surface-token total.
 *
 * A shadow-price event arms a claim; any other event expires it, and a
 * surface `replace` consumes the claim naming its exact range — the
 * producers append the metering event and the replacement synchronously
 * adjacent, so a surviving claim always prices the very next event.
 * A replace with no claim folds with zero delta because the bounded state
 * cannot reconstruct the replaced range. An armed claim for another range
 * still fails because the adjacent events contradict each other.
 * @param claim - the claim armed by the immediately preceding event, if any.
 * @param event - the next committed session event.
 * @returns the signed token delta and the claim state after this event.
 * @throws when a replacement arrives with an armed claim for a different
 *   range — the metering event was adjacent, so this is a live producer's
 *   shadow-price contract violation, not historical data, and must fail
 *   loud rather than let the total drift.
 */
function foldSurfaceProjection(claim, event) {
    if (event.type === 'compaction/summary' || event.type === 'compaction/prune') {
        var _a = event.data, shadowedRange = _a.shadowedRange, shadowedTokenCount = _a.shadowedTokenCount;
        return {
            deltaTokens: 0,
            claim: { start: shadowedRange.start, end: shadowedRange.end, tokens: shadowedTokenCount },
        };
    }
    if (!(0, dsh_session_1.isSurfaceEvent)(event))
        return { deltaTokens: 0, claim: undefined };
    var message = (0, dsh_session_1.deriveEventMessage)(event);
    var tokens = message === null ? 0 : (0, estimate_ts_1.estimateMessage)(message);
    var op = event.surfaceOp;
    if (op === 'append')
        return { deltaTokens: tokens, claim: undefined };
    // Sessions recorded before the shadow-price protocol log replacements with
    // no adjacent metering event; the bounded state cannot reconstruct the
    // replaced range's price, so fold those neutrally — historical replay
    // degrades to drift instead of failing.
    if (claim === undefined)
        return { deltaTokens: 0, claim: undefined };
    if (claim.start !== op.start || claim.end !== op.end) {
        throw new Error("token surface: replace at seq ".concat(event.seq, " over range ").concat(op.start, "-").concat(op.end, " has no adjacent shadow price")
            + " (armed claim covers ".concat(claim.start, "-").concat(claim.end, ")"));
    }
    return { deltaTokens: tokens - claim.tokens, claim: undefined };
}
