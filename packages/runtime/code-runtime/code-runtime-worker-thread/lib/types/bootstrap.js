"use strict";
/**
 * Worker-side execution logic, written as plain functions over an injected port so the unit
 * suite can run every line IN-PROCESS against a fake port (a real worker thread is a separate
 * V8 isolate the coverage provider cannot observe).
 * @module @z/dsh-code-runtime-worker-thread/src/bootstrap
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
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
exports.LogBuffer = void 0;
exports.makeConsoleShim = makeConsoleShim;
exports.captureStreamWrites = captureStreamWrites;
exports.prepareCompletion = prepareCompletion;
exports.prepareException = prepareException;
exports.makeBindingErrorClasses = makeBindingErrorClasses;
exports.wireReplies = wireReplies;
exports.makeNamespaces = makeNamespaces;
exports.runWorkerMain = runWorkerMain;
var node_util_1 = require("node:util");
var output_json_ts_1 = require("./output-json.ts");
var worker_json_ts_1 = require("./worker-json.ts");
var CapturedError = Error;
var capturedObjectCreate = Object.create;
var capturedObjectDefineProperty = Object.defineProperty;
/** Define one public binding-error field without consulting mutable globals or descriptor prototypes. */
function defineBindingErrorField(error, key, value) {
    var attributes = capturedObjectCreate(null);
    attributes.enumerable = true;
    attributes.value = value;
    capturedObjectDefineProperty(error, key, attributes);
}
/**
 * Ordered text capture under the shared outer JSON-byte budget, delivered to
 * a sink as each item lands (the real sink streams text over the port eagerly,
 * so captured output survives a mid-run termination). It includes the log
 * array syntax and string escaping in its accounting. Once exhausted it emits
 * the fitting prefix and reports the limit once; the host turns that condition
 * into an explicit `output-limit` run failure.
 */
var LogBuffer = /** @class */ (function () {
    function LogBuffer(maxBytes, sink, onLimit) {
        if (onLimit === void 0) { onLimit = function () { }; }
        this.bytes = 2; // JSON serialization of the empty logs array: []
        this.entries = 0;
        this.truncated = false;
        this.maxBytes = maxBytes;
        this.sink = sink;
        this.onLimit = onLimit;
    }
    /**
     * Emit text to the sink, charging it against the budget (drops + marks once exhausted).
     * @param text - the captured text to deliver.
     */
    LogBuffer.prototype.push = function (text) {
        if (this.truncated)
            return;
        var separatorBytes = this.entries > 0 ? 1 : 0;
        var availableBytes = this.maxBytes - this.bytes - separatorBytes;
        var stringBytes = (0, output_json_ts_1.jsonStringBytesUpTo)(text, availableBytes);
        if (stringBytes === undefined) {
            this.truncated = true;
            var prefix = (0, output_json_ts_1.truncateJsonStringBytes)(text, availableBytes);
            if (prefix.length > 0) {
                var prefixBytes = (0, output_json_ts_1.jsonStringBytesUpTo)(prefix, availableBytes);
                /* v8 ignore next -- truncateJsonStringBytes guarantees the returned prefix fits. */
                if (prefixBytes === undefined)
                    throw new CapturedError('worker output ledger produced an oversized log prefix');
                this.bytes += prefixBytes + separatorBytes;
                this.entries += 1;
                this.sink(prefix);
            }
            this.onLimit();
            return;
        }
        this.bytes += stringBytes + separatorBytes;
        this.entries += 1;
        this.sink(text);
    };
    /** Remaining exact JSON-byte budget for the completion value or failure message. */
    LogBuffer.prototype.remainingOutputBytes = function () {
        return this.maxBytes - this.bytes;
    };
    return LogBuffer;
}());
exports.LogBuffer = LogBuffer;
/** The five console methods the shim captures, in the seam's level vocabulary. */
var CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug'];
/**
 * A `console` replacement whose five leveled methods render their arguments
 * `util.inspect`-style (matching real console formatting closely enough for
 * a model to recognize its own output) into the buffer. Only these five
 * exist — the program gets a deliberately small console, not Node's full
 * console API.
 * @param logs - the buffer every rendered line is pushed into.
 * @returns the five-method console object handed to the program.
 */
function makeConsoleShim(logs) {
    var render = function (args) {
        return args.map(function (arg) { return typeof arg === 'string' ? arg : (0, node_util_1.inspect)(arg, INSPECT_OPTIONS); }).join(' ');
    };
    var shim = Object.create(null);
    for (var _i = 0, CONSOLE_LEVELS_1 = CONSOLE_LEVELS; _i < CONSOLE_LEVELS_1.length; _i++) {
        var level = CONSOLE_LEVELS_1[_i];
        shim[level] = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            logs.push(render(args));
        };
    }
    return shim;
}
/**
 * Redirect a stream's `write` into the log buffer (the program-visible
 * `process.stdout`/`process.stderr` in the real worker), so raw writes land in emission order
 * alongside console output instead of racing down a pipe. It preserves Node's optional callback
 * contract: the callback runs asynchronously after admission, even when the log budget drops
 * the write.
 *
 * @param logs - the buffer captured writes are pushed into.
 * @param stream - the stream whose `write` slot is patched.
 * @returns the restore function (the in-process tests un-patch; the real
 *   worker never needs to).
 */
function captureStreamWrites(logs, stream) {
    // The slot's VALUE is stored for restore and reassigned — never invoked
    // detached, so the unbound-method concern does not apply.
    // oxlint-disable-next-line typescript/unbound-method
    var original = stream.write;
    stream.write = function (chunk) {
        var rest = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            rest[_i - 1] = arguments[_i];
        }
        logs.push(typeof chunk === 'string' ? chunk : String(chunk));
        // Node's optional-encoding shape: the callback is whichever of the next
        // two positions holds a function (a non-function there is the encoding).
        var callback = [rest[0], rest[1]].find(function (arg) { return typeof arg === 'function'; });
        if (callback)
            queueMicrotask(function () { callback(null); });
        return true;
    };
    return function () { stream.write = original; };
}
/** Bounded inspect options: deep enough to be useful, bounded so a pathological value cannot explode the rendering. */
var INSPECT_OPTIONS = { depth: 4, maxArrayLength: 100, maxStringLength: 10000 };
/**
 * Prepare the program's completion value for the done message. Only lossless
 * JSON crosses, and a value that does not fit the remaining combined outer
 * budget reports `output-limit`; the host revalidates hostile traffic and
 * remains authoritative for native pipe writes the worker cannot observe.
 *
 * @param value - the program's completion value.
 * @param remainingOutputBytes - exact bytes left after captured logs.
 * @param maxOutputBytes - the configured cap named in an overflow diagnostic.
 * @returns the done-message fragment: `{}` for `undefined`, else a flat wire `{ value }`.
 */
function prepareCompletion(value, remainingOutputBytes, maxOutputBytes) {
    if (maxOutputBytes === void 0) { maxOutputBytes = remainingOutputBytes; }
    if (value === undefined)
        return {};
    var snapshot;
    try {
        snapshot = (0, worker_json_ts_1.snapshotCodeJsonValue)(value);
    }
    catch (_a) {
        snapshot = undefined;
    }
    if (snapshot === undefined) {
        return prepareFailure('invalid-output', 'program completion must be lossless JSON', remainingOutputBytes, maxOutputBytes);
    }
    if ((0, output_json_ts_1.jsonValueBytesUpTo)(snapshot, remainingOutputBytes) === undefined) {
        return outputLimit(maxOutputBytes);
    }
    return { value: (0, worker_json_ts_1.encodeWorkerJson)(snapshot) };
}
/** Build the fixed overflow fragment without carrying rejected variable bytes. */
function outputLimit(maxOutputBytes) {
    return { error: { kind: 'output-limit', message: "outer output exceeded ".concat(maxOutputBytes, " bytes") } };
}
/** Admit one bounded failure message or replace it with the fixed overflow diagnostic. */
function prepareFailure(kind, message, remainingOutputBytes, maxOutputBytes) {
    if ((0, output_json_ts_1.jsonStringBytesUpTo)(message, remainingOutputBytes) === undefined)
        return outputLimit(maxOutputBytes);
    return { error: { kind: kind, message: message } };
}
/**
 * Prepare a thrown program value without sending an unbounded stack or
 * string across the worker port.
 * @param error - the value thrown by the program.
 * @param remainingOutputBytes - exact bytes left after captured logs.
 * @param maxOutputBytes - the configured cap named in an overflow diagnostic.
 * @returns a bounded exception or fixed output-limit fragment.
 */
function prepareException(error, remainingOutputBytes, maxOutputBytes) {
    var _a;
    if (maxOutputBytes === void 0) { maxOutputBytes = remainingOutputBytes; }
    var message;
    try {
        var detail = error instanceof CapturedError ? (_a = error.stack) !== null && _a !== void 0 ? _a : error.message : error;
        message = typeof detail === 'string' ? detail : String(detail);
    }
    catch (_b) {
        message = 'program threw an unrenderable value';
    }
    return prepareFailure('exception', message, remainingOutputBytes, maxOutputBytes);
}
/**
 * Materialize the real error constructor declared by one namespace.
 * @param descriptor - program-global class name and member-name property.
 * @returns the constructor injected into the program and used for rejections.
 */
function makeBindingErrorClass(descriptor) {
    return /** @class */ (function (_super) {
        __extends(BindingCallError, _super);
        function BindingCallError(memberName, message) {
            var _this = _super.call(this, message) || this;
            defineBindingErrorField(_this, 'name', descriptor.name);
            defineBindingErrorField(_this, descriptor.memberNameProperty, memberName);
            return _this;
        }
        return BindingCallError;
    }(CapturedError));
}
/** Create the namespace-specific rejection for one failed binding call. */
function bindingFailure(errorClass, memberName, message) {
    return errorClass ? new errorClass(memberName, message) : new CapturedError(message);
}
/**
 * Build each declared error class once so calls and `instanceof` share constructor identity.
 * @param data - binding namespace declarations from the boot payload.
 * @returns constructors keyed by their owning namespace global.
 */
function makeBindingErrorClasses(data) {
    var classes = new Map();
    for (var _i = 0, _a = data.namespaces; _i < _a.length; _i++) {
        var namespace = _a[_i];
        if (namespace.errorClass)
            classes.set(namespace.global, makeBindingErrorClass(namespace.errorClass));
    }
    return classes;
}
/**
 * Route host replies into the pending-call map: each reply settles its call
 * at most once, and a reply for an unknown id (stray, or a duplicate answer
 * to an id already settled) is ignored. Shared wiring between
 * {@link runWorkerMain} and the tests that exercise {@link makeNamespaces}
 * standalone.
 * @param port - the port whose `message` events carry the replies.
 * @param pending - the id-keyed map of unsettled binding calls.
 */
function wireReplies(port, pending) {
    port.on('message', function (message) {
        var entry = pending.get(message.id);
        if (!entry)
            return;
        pending.delete(message.id);
        if (message.ok) {
            var value = (0, worker_json_ts_1.decodeWorkerJson)(message.value);
            if (value === undefined)
                entry.reject(new CapturedError('binding resolution must be lossless JSON'));
            else
                entry.resolve(value);
        }
        else {
            entry.reject(new CapturedError(message.message));
        }
    });
}
/**
 * Build the binding namespace objects the program sees: one null-prototype global per
 * namespace, each declared name an own enumerable async function that bridges over the port
 * (`__proto__`/`constructor`/`toString` are ordinary keys, never prototype collisions).
 * Lossy arguments reject before posting; clone failures and host failure
 * replies reject only the corresponding call.
 *
 * @param data - the boot payload's namespace declarations (globals + names).
 * @param port - the port binding calls are posted to.
 * @param pending - the id-keyed map each posted call parks its handles in.
 * @param nextId - the shared mutable id counter (worker-issued correlation ids).
 * @param errorClasses - per-namespace constructors shared with program globals.
 * @returns one namespace object per declaration, in declaration order.
 */
function makeNamespaces(data, port, pending, nextId, errorClasses) {
    if (errorClasses === void 0) { errorClasses = makeBindingErrorClasses(data); }
    return data.namespaces.map(function (_a) {
        var global = _a.global, names = _a.names;
        var errorClass = errorClasses.get(global);
        var namespace = Object.create(null);
        var _loop_1 = function (name_1) {
            Object.defineProperty(namespace, name_1, {
                enumerable: true,
                value: function (args) {
                    var detached;
                    try {
                        detached = (0, worker_json_ts_1.snapshotCodeJsonValue)(args);
                    }
                    catch (_a) {
                        detached = undefined;
                    }
                    if (detached === undefined) {
                        return Promise.reject(bindingFailure(errorClass, name_1, 'binding arguments must be lossless JSON'));
                    }
                    return new Promise(function (resolve, reject) {
                        var id = nextId.value++;
                        pending.set(id, {
                            resolve: resolve,
                            reject: function (error) {
                                reject(bindingFailure(errorClass, name_1, error.message));
                            },
                        });
                        try {
                            port.postMessage({ type: 'call', id: id, global: global, name: name_1, args: (0, worker_json_ts_1.encodeWorkerJson)(detached) });
                        }
                        catch (error) {
                            pending.delete(id);
                            var message = "binding arguments must be structured-cloneable: ".concat(error instanceof CapturedError ? error.message : String(error));
                            reject(bindingFailure(errorClass, name_1, message));
                        }
                    });
                },
            });
        };
        for (var _i = 0, names_1 = names; _i < names_1.length; _i++) {
            var name_1 = names_1[_i];
            _loop_1(name_1);
        }
        return namespace;
    });
}
/**
 * Run one strict async-function body, allowing top-level `await` and `return`, and post exactly
 * one terminal {@link DoneMessage}; a thrown program error becomes its `error` field.
 * @param port - host message port or test double.
 * @param data - the boot payload the host sent.
 * @param streams - stdout/stderr objects captured as program logs.
 * @returns after posting the done message.
 */
function runWorkerMain(port, data, streams) {
    return __awaiter(this, void 0, void 0, function () {
        var logs, pending, nextId, errorClasses, namespaces, errorClassParameters, errorClassValues, _i, _a, namespace, errorClass, consoleShim, done, AsyncFunction, fn, value, error_1;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    logs = new LogBuffer(data.maxOutputBytes, function (text) { port.postMessage({ type: 'log', text: text }); }, function () { port.postMessage({ type: 'output-limit' }); });
                    captureStreamWrites(logs, streams.stdout);
                    captureStreamWrites(logs, streams.stderr);
                    pending = new Map();
                    wireReplies(port, pending);
                    nextId = { value: 1 };
                    errorClasses = makeBindingErrorClasses(data);
                    namespaces = makeNamespaces(data, port, pending, nextId, errorClasses);
                    errorClassParameters = [];
                    errorClassValues = [];
                    for (_i = 0, _a = data.namespaces; _i < _a.length; _i++) {
                        namespace = _a[_i];
                        if (!namespace.errorClass)
                            continue;
                        errorClassParameters.push(namespace.errorClass.name);
                        errorClass = errorClasses.get(namespace.global);
                        /* v8 ignore next -- makeBindingErrorClasses covers every declaration in the same data. */
                        if (!errorClass)
                            throw new CapturedError("missing binding error class for ".concat(namespace.global));
                        errorClassValues.push(errorClass);
                    }
                    consoleShim = makeConsoleShim(logs);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    AsyncFunction = (function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/];
                    }); }); }).constructor;
                    fn = new (AsyncFunction.bind.apply(AsyncFunction, __spreadArray(__spreadArray(__spreadArray([void 0], data.namespaces.map(function (namespace) { return namespace.global; }), false), errorClassParameters, false), ['console', "'use strict';\n".concat(data.code)], false)))();
                    return [4 /*yield*/, fn.apply(void 0, __spreadArray(__spreadArray(__spreadArray([], namespaces, false), errorClassValues, false), [consoleShim], false))];
                case 2:
                    value = _b.sent();
                    done = __assign({ type: 'done' }, prepareCompletion(value, logs.remainingOutputBytes(), data.maxOutputBytes));
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _b.sent();
                    done = __assign({ type: 'done' }, prepareException(error_1, logs.remainingOutputBytes(), data.maxOutputBytes));
                    return [3 /*break*/, 4];
                case 4:
                    port.postMessage(done);
                    return [2 /*return*/];
            }
        });
    });
}
