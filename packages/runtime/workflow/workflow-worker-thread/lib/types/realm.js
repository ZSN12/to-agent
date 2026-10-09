"use strict";
/**
 * Materializes values leaving the script vm into plain JSON before they cross the worker
 * boundary, and renders thrown script values without rejecting the run. The walk rejects
 * values that JSON cannot preserve but trusts model-written workflow scripts: getters and proxy traps may
 * run, and the vm is not a security boundary. The worker provides host-loop isolation and
 * forced termination, not hostile-value containment. See
 * .agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md for the isolation rationale.
 * @module @z/dsh-workflow-worker-thread/realm
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MaterializeError = void 0;
exports.renderThrown = renderThrown;
exports.materializeFromRealm = materializeFromRealm;
/** Thrown by {@link materializeFromRealm}; the caller wraps it into the right `WorkflowError` code. */
var MaterializeError = /** @class */ (function (_super) {
    __extends(MaterializeError, _super);
    function MaterializeError(path, reason) {
        var _this = _super.call(this, "".concat(path, ": ").concat(reason)) || this;
        _this.path = path;
        _this.reason = reason;
        _this.name = 'MaterializeError';
        return _this;
    }
    return MaterializeError;
}(Error));
exports.MaterializeError = MaterializeError;
/**
 * Render a thrown value to failure text without ever throwing: prefer the
 * `stack` (host or realm — a realm error's `stack` is a plain string read),
 * fall back to `message`, then `String()`. Reading those properties MAY run
 * script code (a getter, `toString`) — accepted under the module's trust
 * premise; if that code itself throws, a fixed label is returned instead.
 * @param error - any value thrown in the host or worker realm.
 * @returns human-readable text for the failure report; prefers the stack.
 */
function renderThrown(error) {
    try {
        var stack = error === null || error === void 0 ? void 0 : error.stack;
        if (typeof stack === 'string' && stack.length > 0)
            return stack;
        var message = error === null || error === void 0 ? void 0 : error.message;
        if (typeof message === 'string' && message.length > 0)
            return message;
        return String(error);
    }
    catch (_a) {
        // A throwing accessor/toString on the thrown value — rendering must be
        // total (drive()'s never-reject contract), so fall back to a fixed label.
        return '[unrenderable thrown value]';
    }
}
/**
 * Whether an object's prototype chain represents a plain data object: `null`, or a prototype
 * whose own prototype is `null` (the realm's `Object.prototype` — which we
 * cannot compare by identity across realms). A `Date`/`Map`/class instance
 * has a longer chain and is rejected.
 */
function hasPlainPrototype(value) {
    var proto = Object.getPrototypeOf(value);
    if (proto === null)
        return true;
    return Object.getPrototypeOf(proto) === null;
}
/**
 * Copy `value` (typically from the vm realm) into plain host JSON data. Root `undefined` is
 * returned unchanged; nested `undefined` and values JSON cannot represent losslessly fail
 * with the offending path. Property accessors run normally, and a throwing read is wrapped
 * with its rendered failure.
 *
 * @param value - the realm value to materialize.
 * @param root - the path label for the root value (error messages).
 * @returns the host-realm copy (plain objects/arrays/scalars only).
 * @throws {@link MaterializeError} for unsupported values, cycles, sparse arrays, exotic
 *   prototypes, or property reads that throw.
 */
function materializeFromRealm(value, root) {
    if (root === void 0) { root = 'value'; }
    if (value === undefined)
        return undefined;
    try {
        return materialize(value, root, new Set());
    }
    catch (error) {
        if (error instanceof MaterializeError)
            throw error;
        // A property read ran script code that threw; total-ize it so callers can
        // keep the narrow MaterializeError contract.
        throw new MaterializeError(root, "reading the value threw: ".concat(renderThrown(error)));
    }
}
function materialize(value, path, seen) {
    switch (typeof value) {
        case 'boolean':
        case 'string':
            return value;
        case 'number': {
            if (!Number.isFinite(value))
                throw new MaterializeError(path, 'non-finite numbers are not JSON data');
            return value;
        }
        case 'bigint':
            throw new MaterializeError(path, 'bigints are not JSON data');
        case 'function':
            throw new MaterializeError(path, 'functions are not plain JSON data');
        case 'symbol':
            throw new MaterializeError(path, 'symbols are not plain JSON data');
        case 'undefined':
            throw new MaterializeError(path, 'undefined is not JSON data');
        case 'object':
            break;
    }
    if (value === null)
        return null;
    var objectValue = value;
    if (seen.has(objectValue))
        throw new MaterializeError(path, 'circular references are not JSON data');
    seen.add(objectValue);
    try {
        if (Array.isArray(objectValue))
            return materializeArray(objectValue, path, seen);
        return materializeObject(objectValue, path, seen);
    }
    finally {
        seen.delete(objectValue);
    }
}
function materializeArray(value, path, seen) {
    var out = [];
    for (var index = 0; index < value.length; index++) {
        if (!(index in value))
            throw new MaterializeError("".concat(path, "[").concat(index, "]"), 'sparse arrays are not JSON data');
        out.push(materialize(value[index], "".concat(path, "[").concat(index, "]"), seen));
    }
    // Own enumerable props beyond the indices (e.g. `arr.total = 3`) would be
    // silently dropped by JSON — reject them instead.
    for (var _i = 0, _a = Object.keys(value); _i < _a.length; _i++) {
        var key = _a[_i];
        var index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= value.length) {
            throw new MaterializeError("".concat(path, ".").concat(key), 'arrays with non-index properties are not JSON data');
        }
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new MaterializeError(path, 'symbol-keyed properties are not plain JSON data');
    }
    return out;
}
function materializeObject(value, path, seen) {
    if (!hasPlainPrototype(value)) {
        throw new MaterializeError(path, 'only plain objects and arrays are JSON data (exotic prototype)');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new MaterializeError(path, 'symbol-keyed properties are not plain JSON data');
    }
    var out = {};
    // Object.keys = own enumerable string keys, matching JSON.stringify's
    // property selection exactly (non-enumerable props never reach JSON output).
    for (var _i = 0, _a = Object.keys(value); _i < _a.length; _i++) {
        var key = _a[_i];
        // defineProperty, never assignment: a "__proto__" key must become an OWN
        // data property of the copy, not a prototype mutation.
        Object.defineProperty(out, key, {
            value: materialize(value[key], "".concat(path, ".").concat(key), seen),
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    return out;
}
