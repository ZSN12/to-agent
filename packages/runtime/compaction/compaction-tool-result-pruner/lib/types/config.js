"use strict";
/** Configuration resolution for deterministic tool-result pruning. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULTS = exports.PRUNE_MARKER = void 0;
exports.codePointLength = codePointLength;
exports.resolveConfig = resolveConfig;
var dsh_llm_1 = require("@z/dsh-llm");
/** Fixed marker substituted for every removed middle span. */
exports.PRUNE_MARKER = '\n\n[... tool result middle pruned ...]\n\n';
/** Low-friction defaults for coding-agent tool output. */
exports.DEFAULTS = (0, dsh_llm_1.deepFreeze)({
    thresholdChars: 8192,
    headChars: 4096,
    tailChars: 1024,
});
var CONFIG_KEYS = new Set([
    'thresholdChars',
    'headChars',
    'tailChars',
]);
/**
 * Count Unicode code points without splitting surrogate pairs.
 * @param text - text to measure.
 * @returns the Unicode code-point count.
 */
function codePointLength(text) {
    return Array.from(text).length;
}
/**
 * Resolve and validate pruning budgets.
 * @param config - raw plugin configuration.
 * @returns a detached deeply immutable configuration.
 */
function resolveConfig(config) {
    var _a, _b, _c;
    if (config === void 0) { config = {}; }
    for (var _i = 0, _d = Object.keys(config); _i < _d.length; _i++) {
        var key = _d[_i];
        if (!CONFIG_KEYS.has(key)) {
            throw new Error("ToolResultPruneConfig: unknown key \"".concat(key, "\" ")
                + '(allowed: thresholdChars, headChars, tailChars)');
        }
    }
    var resolved = {
        thresholdChars: (_a = config.thresholdChars) !== null && _a !== void 0 ? _a : exports.DEFAULTS.thresholdChars,
        headChars: (_b = config.headChars) !== null && _b !== void 0 ? _b : exports.DEFAULTS.headChars,
        tailChars: (_c = config.tailChars) !== null && _c !== void 0 ? _c : exports.DEFAULTS.tailChars,
    };
    assertPositiveInteger('thresholdChars', resolved.thresholdChars);
    assertNonNegativeInteger('headChars', resolved.headChars);
    assertNonNegativeInteger('tailChars', resolved.tailChars);
    var emittedChars = resolved.headChars
        + codePointLength(exports.PRUNE_MARKER)
        + resolved.tailChars;
    if (emittedChars > resolved.thresholdChars) {
        throw new Error("ToolResultPruneConfig: headChars + marker + tailChars (".concat(emittedChars, ") ")
            + "must be at most thresholdChars (".concat(resolved.thresholdChars, ")"));
    }
    return (0, dsh_llm_1.deepFreeze)(structuredClone(resolved));
}
function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error("ToolResultPruneConfig: ".concat(name, " (").concat(value, ") must be a positive integer"));
    }
}
function assertNonNegativeInteger(name, value) {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error("ToolResultPruneConfig: ".concat(name, " (").concat(value, ") must be a non-negative integer"));
    }
}
