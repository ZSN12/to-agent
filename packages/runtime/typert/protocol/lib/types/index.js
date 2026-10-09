"use strict";
/**
 * Remote decorators and explicit Gateway bindings backed only by private
 * module state. Strict reflection remains a Typert compiler responsibility.
 * @module @z/dsh-typert-protocol
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
exports.TypertRemoteService = exports.TypertLookupFailure = void 0;
exports.isTypertRemoteSegment = isTypertRemoteSegment;
exports.bindTypertRemote = bindTypertRemote;
exports.Remote = Remote;
exports.RemoteScope = RemoteScope;
exports.remoteMethods = remoteMethods;
var cordis_1 = require("@z/cordis");
var TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/**
 * Test one generated Remote name against the Connection endpoint grammar.
 * @param value - namespace, method, lookup, or Context segment.
 * @returns whether the value can cross the shared RPC carrier unchanged.
 */
function isTypertRemoteSegment(value) {
    return value !== '.' && value !== '..' && TYPERT_REMOTE_SEGMENT_PATTERN.test(value);
}
/**
 * A lookup policy rejection whose typed payload belongs to the active boundary adapter.
 * Gateway adapters preserve this payload instead of collapsing it into an infrastructure failure.
 */
var TypertLookupFailure = /** @class */ (function (_super) {
    __extends(TypertLookupFailure, _super);
    /**
     * Wrap one adapter failure without exposing the rejected identity.
     * @param failure - typed failure owned by the active boundary adapter.
     */
    function TypertLookupFailure(failure) {
        var _this = _super.call(this, 'Typert lookup policy rejected the requested identity') || this;
        _this.name = 'TypertLookupFailure';
        _this.failure = failure;
        return _this;
    }
    return TypertLookupFailure;
}(Error));
exports.TypertLookupFailure = TypertLookupFailure;
var markers = new WeakMap();
/**
 * Bind one visible Service field to a Cordis key and Remote namespace.
 * @param service - owning Service instance, normally `this`.
 * @param serviceKey - exact Cordis service key.
 * @param options - optional distinct wire namespace.
 * @returns a frozen, inspectable binding with no compiler-injected metadata.
 */
function bindTypertRemote(service, serviceKey, options) {
    var _a;
    if (options === void 0) { options = {}; }
    validateName('service key', serviceKey);
    var namespace = (_a = options.namespace) !== null && _a !== void 0 ? _a : serviceKey;
    validateName('namespace', namespace);
    return Object.freeze({ service: service, serviceKey: serviceKey, namespace: namespace });
}
/** Cordis Service base that exposes its registered name through Typert Gateway. */
var TypertRemoteService = /** @class */ (function (_super) {
    __extends(TypertRemoteService, _super);
    /**
     * Register the Service and bind the same key to Typert Gateway.
     * @param ctx - owning Cordis Context.
     * @param serviceKey - exact Cordis service key and default wire namespace.
     * @param options - optional distinct wire namespace.
     */
    function TypertRemoteService(ctx, serviceKey, options) {
        if (options === void 0) { options = {}; }
        var _this = _super.call(this, ctx, serviceKey) || this;
        _this.typertRemote = bindTypertRemote(_this, _this.name, options);
        return _this;
    }
    return TypertRemoteService;
}(cordis_1.Service));
exports.TypertRemoteService = TypertRemoteService;
function Remote(methodOrExportName, context) {
    if (typeof methodOrExportName === 'string') {
        validateName('Remote export name', methodOrExportName);
        return function (_method, decoratorContext) {
            addMarkerInitializer(decoratorContext, { kind: 'direct' }, methodOrExportName);
        };
    }
    if (context === undefined)
        throw new TypeError('typert-protocol: Remote decorator context is missing');
    addMarkerInitializer(context, { kind: 'direct' });
}
/**
 * Create a decorator for a method resolved from one Remote Scope.
 * @param key - scope key declared through the Context map.
 * @param exportName - optional Remote export name; defaults to the method name.
 * @returns a standard method decorator that records only private module state.
 */
function RemoteScope(key, exportName) {
    validateName('Scope key', key);
    if (exportName !== undefined)
        validateName('Remote export name', exportName);
    return function (_method, context) {
        addMarkerInitializer(context, { kind: 'context', context: key }, exportName);
    };
}
/**
 * Read Remote markers attached to a live Service by decorator initializers.
 * The returned snapshot cannot mutate the private marker table.
 * @param service - live Service instance.
 * @returns markers in class declaration order.
 */
function remoteMethods(service) {
    var _a;
    var prototype = Object.getPrototypeOf(service);
    if (prototype === null)
        return [];
    return __spreadArray([], ((_a = markers.get(prototype)) !== null && _a !== void 0 ? _a : []), true).map(function (_a) {
        var method = _a[0], marker = _a[1];
        return (__assign({ method: method }, marker));
    });
}
function addMarkerInitializer(context, invocation, exportName) {
    if (context.private || context.static || typeof context.name !== 'string') {
        throw new TypeError('typert-protocol: Remote decorators require a public instance method with a string name');
    }
    var method = context.name;
    context.addInitializer(function () {
        var prototype = Object.getPrototypeOf(this);
        if (prototype === null) {
            throw new TypeError("typert-protocol: cannot mark Remote method \"".concat(method, "\" on an object without a prototype"));
        }
        mark(prototype, method, invocation, exportName);
    });
}
function mark(prototype, method, invocation, exportName) {
    var table = markers.get(prototype);
    if (table === undefined) {
        table = new Map();
        markers.set(prototype, table);
    }
    var marker = __assign(__assign({}, (exportName === undefined || exportName === method ? {} : { exportName: exportName })), { invocation: Object.freeze(invocation) });
    var current = table.get(method);
    if (current !== undefined) {
        if (current.exportName === marker.exportName && sameInvocation(current.invocation, invocation))
            return;
        throw new Error("typert-protocol: Remote method \"".concat(method, "\" has conflicting invocation markers"));
    }
    table.set(method, Object.freeze(marker));
}
function sameInvocation(left, right) {
    return left.kind === right.kind
        && (left.kind === 'direct' || (right.kind === 'context' && left.context === right.context));
}
function validateName(subject, value) {
    if (!isTypertRemoteSegment(value)) {
        throw new TypeError("typert-protocol: ".concat(subject, " must contain only RPC endpoint segment characters"));
    }
}
