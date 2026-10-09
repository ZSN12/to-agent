"use strict";
/**
 * Structural secret redaction for settings values. `role('secret')` fields are
 * removed from a value before it crosses a wire boundary; a sidecar records
 * each schema-declared secret position and whether it currently holds a value,
 * so a configuration surface can render a write-only input without ever
 * receiving the secret itself.
 * @module @z/dsh-settings/redact
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
exports.redactSecrets = redactSecrets;
/** Whether a value is a plain data object the walker may recurse into. */
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function walk(node, value, path, secrets) {
    var _a, _b;
    if (node === undefined)
        return value;
    if (((_a = node.meta) === null || _a === void 0 ? void 0 : _a.role) === 'secret') {
        secrets.push({ path: path, set: value !== undefined });
        return undefined;
    }
    switch (node.type) {
        case 'object': {
            var properties = (_b = node.dict) !== null && _b !== void 0 ? _b : {};
            var source = isRecord(value) ? value : undefined;
            var rebuilt = {};
            if (source !== undefined) {
                for (var _i = 0, _c = Object.entries(source); _i < _c.length; _i++) {
                    var _d = _c[_i], key = _d[0], entry = _d[1];
                    if (key in properties)
                        continue;
                    rebuilt[key] = entry;
                }
            }
            for (var _e = 0, _f = Object.entries(properties); _e < _f.length; _e++) {
                var _g = _f[_e], key = _g[0], child = _g[1];
                var stripped = walk(child, source === null || source === void 0 ? void 0 : source[key], __spreadArray(__spreadArray([], path, true), [key], false), secrets);
                if (stripped !== undefined)
                    rebuilt[key] = stripped;
            }
            return source === undefined && Object.keys(rebuilt).length === 0 ? value : rebuilt;
        }
        case 'dict': {
            if (!isRecord(value))
                return value;
            var rebuilt = {};
            for (var _h = 0, _j = Object.entries(value); _h < _j.length; _h++) {
                var _k = _j[_h], key = _k[0], entry = _k[1];
                var stripped = walk(node.inner, entry, __spreadArray(__spreadArray([], path, true), [key], false), secrets);
                if (stripped !== undefined)
                    rebuilt[key] = stripped;
            }
            return rebuilt;
        }
        case 'array': {
            if (!Array.isArray(value))
                return value;
            return value.map(function (entry, index) { return walk(node.inner, entry, __spreadArray(__spreadArray([], path, true), [String(index)], false), secrets); });
        }
        default:
            // TODO(settings-wire-redaction): Fail closed instead — a secret reachable
            // only through a union, intersection, or transform is returned verbatim
            // here, with nothing recording that it was missed.
            return value;
    }
}
/**
 * Remove every `role('secret')` field a schema declares from a value. The
 * walker follows `object`, `dict`, and `array` containers; a secret must be
 * declared directly on a field reachable through those containers (a secret
 * buried inside a union branch or transform is not reachable and must not be
 * modeled that way). The input is never mutated.
 * @param schema - live schemastery schema describing the value.
 * @param value - the value to strip; `undefined` yields an empty record with
 *   object-property secret slots still enumerated.
 * @returns the stripped detached value and the ordered secret positions.
 */
function redactSecrets(schema, value) {
    var secrets = [];
    var stripped = walk(schema, value, [], secrets);
    return { value: stripped, secrets: secrets };
}
