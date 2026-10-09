"use strict";
/** Tag-safe JSON serialization for the model-visible reference envelope. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringifyTagSafeJson = stringifyTagSafeJson;
/**
 * Serialize JSON while preventing source data from spelling an XML-like opening tag.
 * @param value - JSON-compatible reference data.
 * @returns JSON whose parse result is unchanged and whose data contains no literal `<`.
 */
function stringifyTagSafeJson(value) {
    var serialized = JSON.stringify(value);
    if (typeof serialized !== 'string')
        throw new TypeError('session-reference data is not JSON-serializable');
    return serialized.replaceAll('<', '\\u003c');
}
