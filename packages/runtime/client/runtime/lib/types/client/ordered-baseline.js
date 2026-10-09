"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeOrderedBaseline = mergeOrderedBaseline;
/**
 * Merge an authoritative baseline without moving identities already visible to
 * the client. Baseline-only identities are inserted relative to the nearest
 * following known identity; identities absent from the baseline are removed.
 *
 * @param current - the established client order.
 * @param baseline - the latest authoritative rows.
 * @param keyOf - stable identity selector.
 * @returns baseline-valued rows with the established relative order retained.
 */
function mergeOrderedBaseline(current, baseline, keyOf) {
    var baselineByKey = new Map();
    for (var _i = 0, baseline_1 = baseline; _i < baseline_1.length; _i++) {
        var value = baseline_1[_i];
        baselineByKey.set(keyOf(value), value);
    }
    var merged = current
        .map(function (value) { return baselineByKey.get(keyOf(value)); })
        .filter(function (value) { return value !== undefined; });
    var mergedKeys = new Set(merged.map(keyOf));
    for (var index = 0; index < baseline.length; index++) {
        var value = baseline[index];
        /* v8 ignore next -- dense-array guard: index is bounded by baseline.length. */
        if (value === undefined || mergedKeys.has(keyOf(value)))
            continue;
        var insertion = merged.length;
        var _loop_1 = function (following) {
            var candidate = baseline[following];
            /* v8 ignore next -- dense-array guard: following is bounded by baseline.length. */
            if (candidate === undefined)
                return "continue";
            var known = merged.findIndex(function (item) { return keyOf(item) === keyOf(candidate); });
            if (known !== -1) {
                insertion = known;
                return "break";
            }
        };
        for (var following = index + 1; following < baseline.length; following++) {
            var state_1 = _loop_1(following);
            if (state_1 === "break")
                break;
        }
        merged.splice(insertion, 0, value);
        mergedKeys.add(keyOf(value));
    }
    return merged;
}
