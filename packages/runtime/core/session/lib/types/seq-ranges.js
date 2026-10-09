"use strict";
/** Lossless range encoding for JSONL `sourceEventSeqs` arrays. */
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
exports.encodeSeqRanges = encodeSeqRanges;
exports.decodeSeqRanges = decodeSeqRanges;
function isStrictlyIncreasing(values) {
    return values.every(function (value, index) { return index === 0 || value > values[index - 1]; });
}
/**
 * Replace profitable consecutive runs with inclusive pairs.
 * @param values - validated in-memory source sequences.
 * @returns a lossless JSON storage form.
 */
function encodeSeqRanges(values) {
    if (!isStrictlyIncreasing(values))
        return __spreadArray([], values, true);
    var encoded = [];
    for (var start = 0; start < values.length;) {
        var end = start;
        while (end + 1 < values.length && values[end + 1] === values[end] + 1)
            end += 1;
        if (end - start >= 2)
            encoded.push([values[start], values[end]]);
        else
            for (var index = start; index <= end; index += 1)
                encoded.push(values[index]);
        start = end + 1;
    }
    return encoded;
}
/**
 * Expand a JSON storage-form source sequence array.
 * @param value - parsed storage value.
 * @param maxEntries - largest list permitted by the owning event.
 * @returns the in-memory source sequences.
 */
function decodeSeqRanges(value, maxEntries) {
    if (maxEntries === void 0) { maxEntries = Number.MAX_SAFE_INTEGER; }
    if (!Array.isArray(value))
        throw new TypeError('sourceEventSeqs must be an array');
    var decoded = [];
    var hasRange = false;
    for (var _i = 0, value_1 = value; _i < value_1.length; _i++) {
        var entry = value_1[_i];
        if (typeof entry === 'number') {
            assertSeq(entry);
            if (decoded.length >= maxEntries)
                throw new TypeError('sourceEventSeqs exceeds its event sequence');
            decoded.push(entry);
            continue;
        }
        if (!Array.isArray(entry) || entry.length !== 2) {
            throw new TypeError('sourceEventSeqs range entries must be [start, end] pairs');
        }
        var start = entry[0];
        var end = entry[1];
        assertSeq(start);
        assertSeq(end);
        if (end < start)
            throw new TypeError('sourceEventSeqs ranges require start <= end');
        var length_1 = end - start + 1;
        if (length_1 > maxEntries - decoded.length) {
            throw new TypeError('sourceEventSeqs range exceeds its event sequence');
        }
        for (var seq = start; seq <= end; seq += 1)
            decoded.push(seq);
        hasRange = true;
    }
    if (hasRange && !isStrictlyIncreasing(decoded)) {
        throw new TypeError('sourceEventSeqs ranges must be strictly increasing');
    }
    return decoded;
}
function assertSeq(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError('sourceEventSeqs must contain non-negative safe integers');
    }
}
