"use strict";
/**
 * The measurement service's positional surface fold: the per-node priced
 * surface `measure()` serves and compaction plans against. The projection
 * units deliberately do NOT share this fold — their state must stay O(1)
 * for the persisted checkpoint, so they ride `surface-projection.ts`'s
 * shadow-price protocol instead. Fully metered logs stay in agreement by
 * construction: both price through `estimate.ts`, and every logged shadow
 * price is derived from THIS fold's nodes by the replace producer. A
 * projection replacement without a claim deliberately folds with zero delta.
 *
 * @module @z/dsh-token-meter/surface-fold
 */
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.foldSurfaceTokens = foldSurfaceTokens;
var dsh_session_1 = require("@z/dsh-session");
var estimate_ts_1 = require("./estimate.ts");
/**
 * Fold one surface event onto a priced surface.
 *
 * Total and allocation-fresh: the caller assigns the result rather than
 * mutating in place, so a throw here leaves the caller's state untouched and
 * the same malformed event fails identically on every retry.
 * @param nodes - the priced surface preceding this event, in model-visible order.
 * @param event - the surface event to place.
 * @returns the event's price, the next surface, and the signed total delta.
 * @throws when a replacement names a range absent from `nodes` — committed
 *   logs are surface-validated at append time, so an unresolvable range is log
 *   corruption and must fail loud rather than skip the event.
 */
function foldSurfaceTokens(nodes, event) {
    var message = (0, dsh_session_1.deriveEventMessage)(event);
    var tokens = message === null ? 0 : (0, estimate_ts_1.estimateMessage)(message);
    var op = event.surfaceOp;
    if (op === 'append') {
        return { tokens: tokens, nodes: __spreadArray(__spreadArray([], nodes, true), [{ seq: event.seq, tokens: tokens }], false), deltaTokens: tokens };
    }
    var startIdx = nodes.findIndex(function (node) { return node.seq === op.start; });
    var endIdx = nodes.findIndex(function (node) { return node.seq === op.end; });
    if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
        throw new Error("token surface: replace at seq ".concat(event.seq, " has invalid current range ").concat(op.start, "-").concat(op.end));
    }
    var removed = nodes
        .slice(startIdx, endIdx + 1)
        .reduce(function (total, node) { return total + node.tokens; }, 0);
    var next = __spreadArray([], nodes, true);
    next.splice(startIdx, endIdx - startIdx + 1, { seq: event.seq, tokens: tokens });
    return { tokens: tokens, nodes: next, deltaTokens: tokens - removed };
}
