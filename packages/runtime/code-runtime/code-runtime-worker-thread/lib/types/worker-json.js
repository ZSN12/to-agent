"use strict";
/**
 * Lossless-JSON snapshots for the dependency-free source worker closure.
 * @module @z/dsh-code-runtime-worker-thread/worker-json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotCodeJsonValue = snapshotCodeJsonValue;
exports.encodeWorkerJson = encodeWorkerJson;
exports.decodeWorkerJson = decodeWorkerJson;
var intrinsicFunctionToString = Reflect.get(Function.prototype, 'toString');
var intrinsicReflectApply = Reflect.get(Reflect, 'apply');
var IntrinsicError = Error;
var IntrinsicSet = Set;
var intrinsicArrayIsArray = Array.isArray;
var intrinsicArrayPrototype = Array.prototype;
var intrinsicNumberIsFinite = Number.isFinite;
var intrinsicNumberIsSafeInteger = Number.isSafeInteger;
var intrinsicObjectCreate = Object.create;
var intrinsicObjectDefineProperty = Object.defineProperty;
var intrinsicObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
var intrinsicObjectGetPrototypeOf = Object.getPrototypeOf;
var intrinsicObjectHasOwn = Object.hasOwn;
var intrinsicObjectIs = Object.is;
var intrinsicObjectKeys = Object.keys;
var intrinsicObjectPrototype = Object.prototype;
var intrinsicObjectPropertyIsEnumerable = Reflect.get(intrinsicObjectPrototype, 'propertyIsEnumerable');
var intrinsicReflectOwnKeys = Reflect.ownKeys;
var intrinsicSetAdd = Reflect.get(Set.prototype, 'add');
var intrinsicSetDelete = Reflect.get(Set.prototype, 'delete');
var intrinsicSetHas = Reflect.get(Set.prototype, 'has');
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
/** Whether one captured-intrinsic Set contains a value. */
function setHas(target, value) {
    return intrinsicReflectApply(intrinsicSetHas, target, [value]);
}
/** Add to one captured-intrinsic Set. */
function setAdd(target, value) {
    intrinsicReflectApply(intrinsicSetAdd, target, [value]);
}
/** Delete from one captured-intrinsic Set. */
function setDelete(target, value) {
    intrinsicReflectApply(intrinsicSetDelete, target, [value]);
}
/** Whether a realm-owned intrinsic prototype is backed by its native constructor. */
function hasIntrinsicConstructor(prototype, name) {
    var descriptor = intrinsicObjectGetOwnPropertyDescriptor(prototype, 'constructor');
    var constructor = descriptor === null || descriptor === void 0 ? void 0 : descriptor.value;
    if (typeof constructor !== 'function')
        return false;
    try {
        return constructor.name === name
            && constructor.prototype === prototype
            && intrinsicReflectApply(intrinsicFunctionToString, constructor, []) === "function ".concat(name, "() { [native code] }");
    }
    catch (_a) {
        return false;
    }
}
/** Whether a candidate is a foreign realm's intrinsic `Object.prototype`. */
function isForeignIntrinsicObjectPrototype(value) {
    return intrinsicObjectGetPrototypeOf(value) === null && hasIntrinsicConstructor(value, 'Object');
}
/** Whether an array uses one realm's intrinsic `Array.prototype`, not a subclass or forged prototype. */
function hasPlainArrayPrototype(value) {
    var prototype = intrinsicObjectGetPrototypeOf(value);
    if (prototype === intrinsicArrayPrototype)
        return true;
    if (!intrinsicArrayIsArray(prototype) || !hasIntrinsicConstructor(prototype, 'Array'))
        return false;
    var objectPrototype = intrinsicObjectGetPrototypeOf(prototype);
    return typeof objectPrototype === 'object'
        && objectPrototype !== null
        && isForeignIntrinsicObjectPrototype(objectPrototype);
}
/** Whether an object is a plain or null-prototype record from any JavaScript realm. */
function hasPlainObjectPrototype(value) {
    var prototype = intrinsicObjectGetPrototypeOf(value);
    return prototype === null
        || prototype === intrinsicObjectPrototype
        || typeof prototype === 'object' && isForeignIntrinsicObjectPrototype(prototype);
}
/** Return every JSON-visible object key, or reject own data JSON would discard. */
function enumerableStringKeys(value) {
    var keys = intrinsicReflectOwnKeys(value);
    for (var index = 0; index < keys.length; index++) {
        var key = keys[index];
        if (typeof key !== 'string' || !intrinsicReflectApply(intrinsicObjectPropertyIsEnumerable, value, [key]))
            return undefined;
    }
    return keys;
}
/**
 * Validate and detach one worker-boundary value without loading another
 * workspace package at runtime. This mirrors the session-owned canonical
 * JSON boundary while remaining safe to import from the unbuilt worker.
 * Its iterative traversal adds no JavaScript call-stack depth limit.
 *
 * @param value - the candidate completion value.
 * @returns a detached lossless-JSON snapshot, or `undefined` when invalid.
 */
function snapshotCodeJsonValue(value) {
    var active = new IntrinsicSet();
    var root;
    var assign = function (destination, item) {
        if (destination.kind === 'root') {
            root = item;
        }
        else if (destination.kind === 'array') {
            defineEnumerableDataProperty(destination.target, destination.index, item);
        }
        else {
            defineEnumerableDataProperty(destination.target, destination.key, item);
        }
    };
    var tasks = [{ kind: 'visit', value: value, destination: { kind: 'root' } }];
    for (var task = takeLast(tasks); task !== undefined; task = takeLast(tasks)) {
        if (task.kind === 'leave') {
            setDelete(active, task.source);
            continue;
        }
        if (task.kind === 'array-item') {
            if (!intrinsicObjectHasOwn(task.source, task.index))
                return undefined;
            append(tasks, {
                kind: 'visit',
                value: task.source[task.index],
                destination: { kind: 'array', target: task.target, index: task.index },
            });
            continue;
        }
        if (task.kind === 'object-property') {
            append(tasks, {
                kind: 'visit',
                value: task.source[task.key],
                destination: { kind: 'object', target: task.target, key: task.key },
            });
            continue;
        }
        var candidate = task.value;
        if (candidate === null) {
            assign(task.destination, null);
            continue;
        }
        if (typeof candidate === 'boolean' || typeof candidate === 'string') {
            assign(task.destination, candidate);
            continue;
        }
        if (typeof candidate === 'number') {
            if (!intrinsicNumberIsFinite(candidate) || intrinsicObjectIs(candidate, -0))
                return undefined;
            assign(task.destination, candidate);
            continue;
        }
        if (typeof candidate !== 'object')
            return undefined;
        if (setHas(active, candidate))
            return undefined;
        if (intrinsicArrayIsArray(candidate)) {
            if (!hasPlainArrayPrototype(candidate))
                return undefined;
            var length_1 = candidate.length;
            if (intrinsicReflectOwnKeys(candidate).length !== length_1 + 1)
                return undefined;
            var target_1 = [];
            assign(task.destination, target_1);
            setAdd(active, candidate);
            append(tasks, { kind: 'leave', source: candidate });
            for (var index = length_1 - 1; index >= 0; index--) {
                append(tasks, { kind: 'array-item', source: candidate, index: index, target: target_1 });
            }
            continue;
        }
        if (!hasPlainObjectPrototype(candidate))
            return undefined;
        var keys = enumerableStringKeys(candidate);
        if (keys === undefined)
            return undefined;
        var target = {};
        assign(task.destination, target);
        setAdd(active, candidate);
        append(tasks, { kind: 'leave', source: candidate });
        for (var index = keys.length - 1; index >= 0; index--) {
            var key = keys[index];
            /* v8 ignore next -- the loop is bounded by the captured key count. */
            if (key === undefined)
                return undefined;
            append(tasks, { kind: 'object-property', source: candidate, key: key, target: target });
        }
    }
    return root;
}
/**
 * Flatten one validated JSON value for the worker-thread message port.
 * @param value - the lossless JSON value to transport.
 * @returns a pre-order token stream whose own nesting is bounded.
 */
function encodeWorkerJson(value) {
    var wire = [];
    var pending = [value];
    for (var current = takeLast(pending); current !== undefined; current = takeLast(pending)) {
        if (current === null || typeof current === 'boolean' || typeof current === 'number' || typeof current === 'string') {
            append(wire, current);
            continue;
        }
        if (intrinsicArrayIsArray(current)) {
            append(wire, { kind: 'array', length: current.length });
            for (var index = current.length - 1; index >= 0; index--) {
                var item = current[index];
                if (item === undefined)
                    throw new IntrinsicError('cannot encode a sparse JSON array');
                append(pending, item);
            }
            continue;
        }
        var keys = intrinsicObjectKeys(current);
        append(wire, { kind: 'object', keys: keys });
        for (var index = keys.length - 1; index >= 0; index--) {
            var key = keys[index];
            /* v8 ignore next -- the loop is bounded by the captured key count. */
            if (key === undefined)
                throw new IntrinsicError('cannot encode a missing JSON object key');
            var item = current[key];
            if (item === undefined)
                throw new IntrinsicError('cannot encode an undefined JSON object property');
            append(pending, item);
        }
    }
    return wire;
}
/** Whether an array contains exactly its dense indexed slots and `length`. */
function isDenseArray(value) {
    if (!hasPlainArrayPrototype(value) || intrinsicReflectOwnKeys(value).length !== value.length + 1)
        return false;
    for (var index = 0; index < value.length; index++) {
        if (!intrinsicObjectHasOwn(value, index))
            return false;
    }
    return true;
}
/** Whether one exact string-key list contains a key, without consulting its prototype. */
function keysContain(keys, expected) {
    for (var index = 0; index < keys.length; index++) {
        if (keys[index] === expected)
            return true;
    }
    return false;
}
/** Return one exact container marker, or reject any extra/missing fields. */
function containerToken(value) {
    if (intrinsicArrayIsArray(value) || !hasPlainObjectPrototype(value))
        return undefined;
    var keys = enumerableStringKeys(value);
    if (keys === undefined)
        return undefined;
    var token = value;
    if (token.kind === 'array') {
        if (keys.length !== 2 || !keysContain(keys, 'kind') || !keysContain(keys, 'length'))
            return undefined;
        var length_2 = token.length;
        return typeof length_2 === 'number' && intrinsicNumberIsSafeInteger(length_2) && length_2 >= 0
            ? { kind: 'array', length: length_2 }
            : undefined;
    }
    if (token.kind === 'object') {
        if (keys.length !== 2 || !keysContain(keys, 'kind') || !keysContain(keys, 'keys'))
            return undefined;
        var objectKeys = token.keys;
        if (!intrinsicArrayIsArray(objectKeys) || !isDenseArray(objectKeys))
            return undefined;
        var unique = new IntrinsicSet();
        var normalizedKeys = [];
        var objectKeyValues = objectKeys;
        for (var index = 0; index < objectKeyValues.length; index++) {
            var key = objectKeyValues[index];
            if (typeof key !== 'string' || setHas(unique, key))
                return undefined;
            setAdd(unique, key);
            append(normalizedKeys, key);
        }
        return { kind: 'object', keys: normalizedKeys };
    }
    return undefined;
}
/**
 * Rebuild one lossless JSON value from the flat worker-thread wire format.
 * Malformed or incomplete traffic returns `undefined`; traversal is iterative
 * and therefore independent of the transported value's application depth.
 * @param input - untrusted message-port payload.
 * @returns the detached JSON value, or `undefined` when the wire is invalid.
 */
function decodeWorkerJson(input) {
    try {
        if (!intrinsicArrayIsArray(input) || !isDenseArray(input) || input.length === 0)
            return undefined;
        var wire = input;
        var frames_1 = [];
        var root_1;
        var rootAssigned_1 = false;
        var attach = function (value) {
            var parent = frames_1[frames_1.length - 1];
            if (!parent) {
                if (rootAssigned_1)
                    return false;
                root_1 = value;
                rootAssigned_1 = true;
                return true;
            }
            /* v8 ignore next -- completed frames are popped before another token can attach. */
            if (parent.index >= (parent.kind === 'array' ? parent.length : parent.keys.length))
                return false;
            if (parent.kind === 'array') {
                append(parent.target, value);
            }
            else {
                var key = parent.keys[parent.index];
                /* v8 ignore next -- object frames are built from validated keys and their exact length. */
                if (key === undefined)
                    return false;
                defineEnumerableDataProperty(parent.target, key, value);
            }
            parent.index += 1;
            return true;
        };
        for (var tokenIndex = 0; tokenIndex < wire.length; tokenIndex++) {
            var token = wire[tokenIndex];
            var value = void 0;
            var frame = void 0;
            if (token === null || typeof token === 'boolean' || typeof token === 'string') {
                value = token;
            }
            else if (typeof token === 'number') {
                if (!intrinsicNumberIsFinite(token) || intrinsicObjectIs(token, -0))
                    return undefined;
                value = token;
            }
            else {
                if (typeof token !== 'object')
                    return undefined;
                var marker = containerToken(token);
                if (!marker)
                    return undefined;
                var remainingTokens = wire.length - tokenIndex - 1;
                if (marker.kind === 'array') {
                    if (marker.length > remainingTokens)
                        return undefined;
                    var target = [];
                    value = target;
                    if (marker.length > 0)
                        frame = { kind: 'array', target: target, length: marker.length, index: 0 };
                }
                else {
                    if (marker.keys.length > remainingTokens)
                        return undefined;
                    var target = {};
                    value = target;
                    if (marker.keys.length > 0)
                        frame = { kind: 'object', target: target, keys: marker.keys, index: 0 };
                }
            }
            if (!attach(value))
                return undefined;
            if (frame)
                append(frames_1, frame);
            while (frames_1.length > 0) {
                var current = frames_1[frames_1.length - 1];
                /* v8 ignore next -- the loop condition guarantees a final frame. */
                if (current === undefined)
                    break;
                if (current.index < (current.kind === 'array' ? current.length : current.keys.length))
                    break;
                takeLast(frames_1);
            }
        }
        return frames_1.length === 0 ? root_1 : undefined;
    }
    catch (_a) {
        return undefined;
    }
}
/* jscpd:ignore-end */
