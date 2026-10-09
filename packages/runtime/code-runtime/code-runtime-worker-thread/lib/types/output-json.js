"use strict";
/** JSON string-prefix accounting for the outer-output ledger. @module @z/dsh-code-runtime-worker-thread/output-json */
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
exports.jsonStringBytesUpTo = jsonStringBytesUpTo;
exports.jsonValueBytesUpTo = jsonValueBytesUpTo;
exports.truncateJsonStringBytes = truncateJsonStringBytes;
var intrinsicReflectApply = Reflect.apply;
var intrinsicArrayIsArray = Array.isArray;
var IntrinsicBuffer = Buffer;
var intrinsicBufferByteLength = Reflect.get(Buffer, 'byteLength');
var intrinsicObjectCreate = Object.create;
var intrinsicObjectDefineProperty = Object.defineProperty;
var intrinsicObjectKeys = Object.keys;
var intrinsicString = String;
var intrinsicStringCharCodeAt = Reflect.get(String.prototype, 'charCodeAt');
var intrinsicStringCodePointAt = Reflect.get(String.prototype, 'codePointAt');
var intrinsicStringSlice = Reflect.get(String.prototype, 'slice');
/** Build a data descriptor that cannot inherit model-defined accessor fields. */
function dataDescriptor(value) {
    var descriptor = intrinsicObjectCreate(null);
    descriptor.value = value;
    return descriptor;
}
/** Define an ordinary enumerable data slot without a prototype-bearing descriptor. */
function defineEnumerableDataProperty(target, key, value) {
    var descriptor = dataDescriptor(value);
    descriptor.enumerable = true;
    descriptor.configurable = true;
    descriptor.writable = true;
    intrinsicObjectDefineProperty(target, key, descriptor);
}
/** UTF-8 byte length through the module-captured Node intrinsic. */
function byteLength(text) {
    return intrinsicReflectApply(intrinsicBufferByteLength, IntrinsicBuffer, [text, 'utf8']);
}
/** Append without consulting a model-mutated `Array.prototype`. */
function append(target, value) {
    defineEnumerableDataProperty(target, target.length, value);
}
/** Pop without consulting a model-mutated `Array.prototype`. */
function takeLast(target) {
    if (target.length === 0)
        return undefined;
    var index = target.length - 1;
    var value = target[index];
    intrinsicObjectDefineProperty(target, 'length', dataDescriptor(index));
    return value;
}
/** One code-point-aligned character from a string. */
function characterAt(text, index) {
    var codePoint = intrinsicReflectApply(intrinsicStringCodePointAt, text, [index]);
    var width = codePoint > 0xffff ? 2 : 1;
    return intrinsicReflectApply(intrinsicStringSlice, text, [index, index + width]);
}
/** Serialized bytes contributed by one complete Unicode code point inside JSON quotes. */
function serializedCharacterBytes(character) {
    if (character.length === 2)
        return 4;
    if (character === '"' || character === '\\')
        return 2;
    var code = intrinsicReflectApply(intrinsicStringCharCodeAt, character, [0]);
    if (code >= 0xd800 && code <= 0xdfff)
        return 6;
    if (code < 0x20)
        return code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d ? 2 : 6;
    return byteLength(character);
}
/**
 * Measure one JSON string without materializing its complete escaped form.
 * @param text - the candidate string.
 * @param maxBytes - largest serialized size the caller can admit.
 * @returns Exact serialized bytes, or `undefined` as soon as the cap is crossed.
 */
function jsonStringBytesUpTo(text, maxBytes) {
    if (maxBytes < 2)
        return undefined;
    var bytes = 2;
    for (var index = 0; index < text.length;) {
        var character = characterAt(text, index);
        bytes += serializedCharacterBytes(character);
        if (bytes > maxBytes)
            return undefined;
        index += character.length;
    }
    return bytes;
}
/**
 * Measure one lossless JSON value without allocating its serialized form.
 * @param value - already validated lossless JSON.
 * @param maxBytes - largest serialized size the caller can admit.
 * @returns Exact serialized bytes, or `undefined` as soon as the cap is crossed.
 */
function jsonValueBytesUpTo(value, maxBytes) {
    var bytes = 0;
    var add = function (cost) {
        bytes += cost;
        return bytes <= maxBytes;
    };
    var tasks = [{ kind: 'value', value: value }];
    for (var task = takeLast(tasks); task !== undefined; task = takeLast(tasks)) {
        if (task.kind === 'value') {
            var current = task.value;
            if (current === null) {
                if (!add(4))
                    return undefined;
            }
            else if (typeof current === 'string') {
                var stringBytes = jsonStringBytesUpTo(current, maxBytes - bytes);
                if (stringBytes === undefined)
                    return undefined;
                bytes += stringBytes;
            }
            else if (typeof current === 'number') {
                if (!add(byteLength(intrinsicString(current))))
                    return undefined;
            }
            else if (typeof current === 'boolean') {
                if (!add(current ? 4 : 5))
                    return undefined;
            }
            else if (intrinsicArrayIsArray(current)) {
                if (!add(2))
                    return undefined;
                if (current.length > 0)
                    append(tasks, { kind: 'array', value: current, index: 0 });
            }
            else {
                if (!add(2))
                    return undefined;
                var keys = intrinsicObjectKeys(current);
                if (keys.length > 0)
                    append(tasks, { kind: 'object', value: current, keys: keys, index: 0 });
            }
            continue;
        }
        if (task.index > 0 && !add(1))
            return undefined;
        if (task.kind === 'array') {
            var item_1 = task.value[task.index];
            if (item_1 === undefined)
                return undefined;
            if (task.index + 1 < task.value.length)
                append(tasks, __assign(__assign({}, task), { index: task.index + 1 }));
            append(tasks, { kind: 'value', value: item_1 });
            continue;
        }
        var key = task.keys[task.index];
        /* v8 ignore next -- an object frame is created and advanced only for an existing Object.keys entry. */
        if (key === undefined)
            return undefined;
        var keyBytes = jsonStringBytesUpTo(key, maxBytes - bytes);
        if (keyBytes === undefined)
            return undefined;
        if (!add(keyBytes + 1))
            return undefined;
        var item = task.value[key];
        if (item === undefined)
            return undefined;
        if (task.index + 1 < task.keys.length)
            append(tasks, __assign(__assign({}, task), { index: task.index + 1 }));
        append(tasks, { kind: 'value', value: item });
    }
    return bytes;
}
/**
 * Return the longest code-point-aligned prefix whose JSON string encoding,
 * including its surrounding quotes, fits `maxBytes`.
 *
 * @param text - the candidate string.
 * @param maxBytes - serialized JSON-string bytes available.
 * @returns the fitting prefix, or an empty string when even useful content cannot fit.
 */
function truncateJsonStringBytes(text, maxBytes) {
    if (maxBytes < 2)
        return '';
    var bytes = 2;
    var end = 0;
    for (var index = 0; index < text.length;) {
        var character = characterAt(text, index);
        var cost = serializedCharacterBytes(character);
        if (bytes + cost > maxBytes)
            break;
        bytes += cost;
        end += character.length;
        index += character.length;
    }
    return end === text.length ? text : intrinsicReflectApply(intrinsicStringSlice, text, [0, end]);
}
