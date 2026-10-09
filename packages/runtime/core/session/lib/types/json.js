"use strict";
/** Lossless-JSON validation and detached snapshots for durable session data. @module @z/dsh-session/json */
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
exports.snapshotJsonValue = snapshotJsonValue;
exports.isJsonValue = isJsonValue;
/** Whether a realm-owned intrinsic prototype is backed by its native constructor. */
function hasIntrinsicConstructor(prototype, name) {
    var descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    var constructor = descriptor === null || descriptor === void 0 ? void 0 : descriptor.value;
    if (typeof constructor !== 'function')
        return false;
    try {
        return constructor.name === name
            && constructor.prototype === prototype
            && Function.prototype.toString.call(constructor) === "function ".concat(name, "() { [native code] }");
    }
    catch (_a) {
        return false;
    }
}
/** Whether a candidate is one realm's intrinsic `Object.prototype`. */
function isIntrinsicObjectPrototype(value) {
    return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor(value, 'Object');
}
/** Whether an array uses one realm's intrinsic `Array.prototype`, not a subclass or forged prototype. */
function hasPlainArrayPrototype(value) {
    var prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, 'Array'))
        return false;
    var objectPrototype = Object.getPrototypeOf(prototype);
    return typeof objectPrototype === 'object'
        && objectPrototype !== null
        && isIntrinsicObjectPrototype(objectPrototype);
}
/** Whether an object is a plain or null-prototype record from any JavaScript realm. */
function hasPlainObjectPrototype(value) {
    var prototype = Object.getPrototypeOf(value);
    return prototype === null
        || typeof prototype === 'object' && isIntrinsicObjectPrototype(prototype);
}
/** Return every JSON-visible object key, or reject own data JSON would discard. */
function enumerableStringKeys(value) {
    var keys = Reflect.ownKeys(value);
    if (keys.some(function (key) { return typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(value, key); }))
        return undefined;
    return keys;
}
/** Validate lossless JSON iteratively, optionally materializing a detached snapshot. */
function walkJsonValue(value, detach) {
    var ancestors = new Set();
    var root;
    var assign = function (destination, item) {
        if (destination === undefined)
            return;
        if (destination.kind === 'root') {
            root = item;
        }
        else if (destination.kind === 'array') {
            destination.target[destination.index] = item;
        }
        else {
            Object.defineProperty(destination.target, destination.key, {
                value: item,
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
    };
    var tasks = [__assign({ kind: 'visit', value: value }, (detach ? { destination: { kind: 'root' } } : {}))];
    for (var task = tasks.pop(); task !== undefined; task = tasks.pop()) {
        if (task.kind === 'leave') {
            ancestors.delete(task.source);
            continue;
        }
        if (task.kind === 'array-item') {
            if (!Object.prototype.hasOwnProperty.call(task.source, task.index))
                return undefined;
            tasks.push(__assign({ kind: 'visit', value: task.source[task.index] }, (task.target === undefined ? {} : { destination: { kind: 'array', target: task.target, index: task.index } })));
            continue;
        }
        if (task.kind === 'object-property') {
            tasks.push(__assign({ kind: 'visit', value: task.source[task.key] }, (task.target === undefined ? {} : { destination: { kind: 'object', target: task.target, key: task.key } })));
            continue;
        }
        var current = task.value;
        if (current === null) {
            assign(task.destination, null);
            continue;
        }
        if (typeof current === 'boolean' || typeof current === 'string') {
            assign(task.destination, current);
            continue;
        }
        if (typeof current === 'number') {
            if (!Number.isFinite(current) || Object.is(current, -0))
                return undefined;
            assign(task.destination, current);
            continue;
        }
        if (typeof current !== 'object')
            return undefined;
        if (ancestors.has(current))
            return undefined;
        if (Array.isArray(current)) {
            if (!hasPlainArrayPrototype(current))
                return undefined;
            var length_1 = current.length;
            if (Reflect.ownKeys(current).length !== length_1 + 1)
                return undefined;
            var target_1 = detach ? [] : undefined;
            if (target_1 !== undefined)
                assign(task.destination, target_1);
            ancestors.add(current);
            tasks.push({ kind: 'leave', source: current });
            for (var index = length_1 - 1; index >= 0; index--) {
                tasks.push(__assign({ kind: 'array-item', source: current, index: index }, (target_1 === undefined ? {} : { target: target_1 })));
            }
            continue;
        }
        if (!hasPlainObjectPrototype(current))
            return undefined;
        var keys = enumerableStringKeys(current);
        if (keys === undefined)
            return undefined;
        var target = detach ? {} : undefined;
        if (target !== undefined)
            assign(task.destination, target);
        ancestors.add(current);
        tasks.push({ kind: 'leave', source: current });
        for (var index = keys.length - 1; index >= 0; index--) {
            var key = keys[index];
            /* v8 ignore next -- the loop is bounded by the captured key count. */
            if (key === undefined)
                return undefined;
            tasks.push(__assign({ kind: 'object-property', source: current, key: key }, (target === undefined ? {} : { target: target })));
        }
    }
    return detach ? root : true;
}
/**
 * Validate and detach lossless JSON in one read per property, so a stateful
 * getter cannot change between validation and copying. Traversal is iterative,
 * so valid nesting is bounded by available memory rather than the JavaScript
 * call stack. Accepts ordinary arrays, plain or null-prototype objects, and JSON
 * scalars; rejects sparse, cyclic, exotic, negative-zero, and non-finite values.
 * Getter throws propagate.
 *
 * @param value - the candidate value to validate and detach.
 * @returns the detached snapshot, or `undefined` when the value is not
 *   losslessly JSON-serializable.
 */
function snapshotJsonValue(value) {
    return walkJsonValue(value, true);
}
/**
 * Test the same lossless JSON boundary as {@link snapshotJsonValue} without
 * detaching it. Only own enumerable string properties participate; `toJSON`
 * is ignored and getters run, so persistence boundaries use the snapshotter.
 * @param value - the candidate event data to test.
 * @returns whether `value` survives JSON round-trip losslessly.
 */
function isJsonValue(value) {
    return walkJsonValue(value, false) === true;
}
