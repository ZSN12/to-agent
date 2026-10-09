"use strict";
/**
 * Service Definition for the user-settings capability seam (`ctx.settings`). Providers store one raw document of
 * per-namespace sections; plugins register a namespace schema and read the
 * resolved value, which layers schema defaults, the registrant's composition
 * `base`, and the user document section, in that order.
 * @module @z/dsh-settings
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
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
exports.SettingsProvider = exports.SettingsConflictError = exports.redactSecrets = void 0;
exports.settingsNamespace = settingsNamespace;
exports.deepEqualJson = deepEqualJson;
exports.installSettingsSection = installSettingsSection;
var cordis_1 = require("@z/cordis");
var redact_ts_1 = require("./redact.ts");
var redact_ts_2 = require("./redact.ts");
Object.defineProperty(exports, "redactSecrets", { enumerable: true, get: function () { return redact_ts_2.redactSecrets; } });
var NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
/**
 * Brand a raw string as a {@link SettingsNamespace}.
 * @param value - candidate namespace; lowercase kebab-case, as in plugin short names.
 * @returns the branded namespace.
 */
function settingsNamespace(value) {
    if (!NAMESPACE_PATTERN.test(value)) {
        throw new TypeError("settings namespace \"".concat(value, "\" must match ").concat(String(NAMESPACE_PATTERN)));
    }
    return value;
}
/**
 * Deep equality over JSON-compatible data (objects, arrays, primitives) — the
 * Service Definition's single change-detection predicate, exported so the invariant
 * companion checks exactly the implementation's relation.
 * @param a - one JSON-compatible value.
 * @param b - the other JSON-compatible value.
 * @returns whether the two values are structurally equal.
 */
function deepEqualJson(a, b) {
    if (a === b)
        return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
        return false;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
            return false;
        return a.every(function (entry, index) { return deepEqualJson(entry, b[index]); });
    }
    var left = a;
    var right = b;
    var keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length)
        return false;
    return keys.every(function (key) { return key in right && deepEqualJson(left[key], right[key]); });
}
/**
 * A write refused because the namespace moved since the caller read it. The
 * Service Definition's serialized write queue orders writes; it cannot tell a fresh writer
 * from one holding a stale snapshot, which is what this reports.
 */
var SettingsConflictError = /** @class */ (function (_super) {
    __extends(SettingsConflictError, _super);
    /**
     * @param ns - the namespace whose write was refused.
     * @param expected - the revision the caller sent.
     * @param actual - the revision now stored.
     */
    function SettingsConflictError(ns, expected, actual) {
        var _this = _super.call(this, "settings namespace \"".concat(ns, "\" changed since it was read (expected revision ").concat(String(expected), ", now ").concat(String(actual), ")")) || this;
        /** Stable machine code for wire layers mapping this to their own taxonomy. */
        _this.code = 'SETTINGS_CONFLICT';
        _this.name = 'SettingsConflictError';
        _this.expected = expected;
        _this.actual = actual;
        return _this;
    }
    return SettingsConflictError;
}(Error));
exports.SettingsConflictError = SettingsConflictError;
/** Whether a value is a plain data object (not an array, null, or class instance). */
function isPlainObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
/** Apply one path op to a detached section, returning the next section. */
function applyPathOp(section, op) {
    var _a, _b, _c;
    var _d = op.path, head = _d[0], rest = _d.slice(1);
    // The empty path addresses the section itself.
    if (head === undefined) {
        if (op.op === 'unset')
            return {};
        if (!isPlainObject(op.value)) {
            throw new TypeError('settings mutate: setting the section root requires a plain object');
        }
        return __assign({}, op.value);
    }
    if (rest.length === 0) {
        if (op.op === 'set')
            return __assign(__assign({}, section), (_a = {}, _a[head] = op.value, _a));
        var _e = section, _f = head, _removed = _e[_f], kept = __rest(_e, [typeof _f === "symbol" ? _f : _f + ""]);
        return kept;
    }
    var child = section[head];
    if (!isPlainObject(child)) {
        // Unsetting through an absent path is already satisfied; setting through
        // one creates the intermediate objects it needs.
        if (op.op === 'unset')
            return section;
        return __assign(__assign({}, section), (_b = {}, _b[head] = applyPathOp({}, __assign(__assign({}, op), { path: rest })), _b));
    }
    return __assign(__assign({}, section), (_c = {}, _c[head] = applyPathOp(child, __assign(__assign({}, op), { path: rest })), _c));
}
/** Human label for a value that lossless JSON cannot represent (numbers reject inline). */
function describeRejected(value) {
    var _a;
    if (value === undefined)
        return 'undefined';
    if (typeof value === 'object' && value !== null) {
        var proto = Object.getPrototypeOf(value);
        var name_1 = (_a = proto === null || proto === void 0 ? void 0 : proto.constructor) === null || _a === void 0 ? void 0 : _a.name;
        return name_1 === undefined || name_1 === 'Object' ? 'a non-plain object' : "a ".concat(name_1);
    }
    return "a ".concat(typeof value);
}
/**
 * Detach and validate one write input in a single walk before persistence:
 * only JSON data (plain objects, arrays, strings, finite numbers,
 * booleans, `null`) may reach a provider document. `structuredClone` alone
 * would admit Dates, Maps, BigInts, and cycles that YAML/JSON storage then
 * silently distorts on the reload round-trip. `undefined` entries in objects
 * are skipped — the same sparse-patch semantics as {@link mergeLayers} — while
 * an `undefined` array entry is rejected rather than coerced.
 * @param root - plain-object write input (caller-checked).
 * @param reject - builds the validation error from a value label and its `$`-rooted path.
 * @returns the detached JSON-compatible clone.
 */
function cloneJsonShaped(root, reject) {
    var visiting = new WeakSet();
    var clone = function (value, path) {
        if (value === null || typeof value === 'string' || typeof value === 'boolean')
            return value;
        if (typeof value === 'number') {
            if (!Number.isFinite(value))
                throw reject('a non-finite number', path);
            return value;
        }
        if (Array.isArray(value)) {
            if (visiting.has(value))
                throw reject('a circular reference', path);
            visiting.add(value);
            var entries = value.map(function (entry, index) { return clone(entry, "".concat(path, "[").concat(index, "]")); });
            // Un-mark on exit so one object referenced twice without a cycle passes.
            visiting.delete(value);
            return entries;
        }
        if (isPlainObject(value)) {
            if (visiting.has(value))
                throw reject('a circular reference', path);
            visiting.add(value);
            // TODO(settings-json-properties): Use property-safe construction here and
            // in mergeLayers so valid JSON keys such as "__proto__" remain own data.
            var out = {};
            for (var _i = 0, _a = Object.entries(value); _i < _a.length; _i++) {
                var _b = _a[_i], key = _b[0], entry = _b[1];
                if (entry === undefined)
                    continue;
                out[key] = clone(entry, "".concat(path, ".").concat(key));
            }
            visiting.delete(value);
            return out;
        }
        throw reject(describeRejected(value), path);
    };
    return clone(root, '$');
}
/**
 * Layer `over` onto `under`: plain objects merge recursively, every other
 * value (arrays included) replaces the lower layer wholesale. `over` never
 * carries `undefined` entries — sections come from parsed documents and write
 * snapshots pass {@link cloneJsonShaped}, which strips them so a sparse patch
 * cannot erase lower keys.
 */
function mergeLayers(under, over) {
    if (over === undefined)
        return under;
    if (!isPlainObject(under) || !isPlainObject(over))
        return over;
    var merged = __assign({}, under);
    for (var _i = 0, _a = Object.entries(over); _i < _a.length; _i++) {
        var _b = _a[_i], key = _b[0], value = _b[1];
        merged[key] = key in merged ? mergeLayers(merged[key], value) : value;
    }
    return merged;
}
/** Recursively freeze one resolved value so handed-out snapshots stay immutable. */
function deepFreeze(value) {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value))
        return value;
    for (var _i = 0, _a = Object.values(value); _i < _a.length; _i++) {
        var entry = _a[_i];
        deepFreeze(entry);
    }
    return Object.freeze(value);
}
/**
 * Abstract settings service. Providers implement raw-document storage
 * (`load`/`persist`) and push external changes through {@link Settings.publish};
 * the base class owns namespace registration, resolution, validation, change
 * detection, and the `settings/updated` commit event.
 */
var SettingsProvider = /** @class */ (function (_super) {
    __extends(SettingsProvider, _super);
    function SettingsProvider(ctx) {
        var _this = _super.call(this, ctx, 'settings') || this;
        _this.registrations = new Map();
        /** Latest published raw document; empty until the provider's first publish. */
        _this.document = {};
        /** Per-namespace write chains; settled tails, so a failure never poisons the queue. */
        _this.writeQueues = new Map();
        /** In-flight watcher invocation segments, drained by the dispose teardown. */
        _this.pendingTails = new Set();
        /** Set at service dispose: refuse new writes while queued ones drain. */
        _this.stopped = false;
        return _this;
    }
    /** Opaque read of {@link stopped}: control flow cannot narrow it across awaits. */
    SettingsProvider.prototype.isStopped = function () {
        return this.stopped;
    };
    /**
     * Load the provider's document once and publish it before the service
     * becomes injectable, and register the write-drain teardown. Providers with
     * their own init (watchers, connections) delegate here first via
     * `yield* super[Service.init]()`; their disposers then run before the drain.
     */
    SettingsProvider.prototype[cordis_1.Service.init] = function () {
        return __asyncGenerator(this, arguments, function _a() {
            var _b;
            var _this = this;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, __await(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        // Teardown: refuse new writes and new watcher starts, then wait until
                                        // every queued write chain and every started watcher invocation settles
                                        // so disposal completes only once storage and observers are quiescent.
                                        // Invocations queued but not yet started skip via the stopped check.
                                        this.stopped = true;
                                        return [4 /*yield*/, Promise.allSettled(__spreadArray(__spreadArray([], this.writeQueues.values(), true), this.pendingTails, true))];
                                    case 1:
                                        _b.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                    case 1: return [4 /*yield*/, _c.sent()];
                    case 2:
                        _c.sent();
                        _b = this.publish;
                        return [4 /*yield*/, __await(this.load())];
                    case 3:
                        _b.apply(this, [_c.sent()]);
                        return [2 /*return*/];
                }
            });
        });
    };
    Object.defineProperty(SettingsProvider.prototype, "documentPath", {
        /**
         * Absolute path of the provider's user-editable document, when its storage
         * is one local file. Configuration surfaces use this only as availability
         * metadata; the guarded open operation resolves the path again Host-side.
         * Non-file providers leave it undefined and expose no open-document affordance.
         * @returns the absolute local document path, or undefined for non-file storage.
         */
        get: function () {
            return undefined;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Prepare the provider's user-editable document for a native editor. File
     * providers may materialize an absent document before returning its path;
     * non-file providers return undefined.
     * @returns the absolute local document path, or undefined for non-file storage.
     */
    SettingsProvider.prototype.prepareDocument = function () {
        return Promise.resolve(this.documentPath);
    };
    /**
     * Register a namespace schema and receive its owner scope. The registration
     * is an effect on the calling plugin's fiber: disposing that fiber removes
     * the namespace and its observers. An invalid stored section fails the
     * registration itself — the earliest point where the schema can judge it.
     * @param ns - unique namespace; duplicate registration fails loud.
     * @param schema - schemastery schema resolving this namespace's value.
     * @param options - composition `base` layer and effect timing.
     * @returns the owner scope for reads, observation, and updates.
     */
    SettingsProvider.prototype.register = function (ns, schema, options) {
        var _this = this;
        var _a;
        if (this.registrations.has(ns)) {
            throw new Error("settings namespace \"".concat(ns, "\" is already registered"));
        }
        var registration = __assign(__assign({ ns: ns, schema: schema, base: options === null || options === void 0 ? void 0 : options.base, applies: (_a = options === null || options === void 0 ? void 0 : options.applies) !== null && _a !== void 0 ? _a : 'live' }, (options === null || options === void 0 ? void 0 : options.validate) === undefined
            ? {}
            : { validate: options.validate }), { resolved: deepFreeze(this.resolve(schema, options === null || options === void 0 ? void 0 : options.base, this.section(ns), options === null || options === void 0 ? void 0 : options.validate)), revision: 0, watchers: new Set() });
        this.ctx.effect(function () {
            _this.registrations.set(ns, registration);
            // TODO(settings-registration-quiescence): Deactivate every watcher and await
            // its tail on disposal so callbacks cannot outlive the registrant fiber.
            return function () { return _this.registrations.delete(ns); };
        }, "settings.register(".concat(JSON.stringify(String(ns)), ")"));
        return {
            get: function () { return registration.resolved; },
            watch: function (callback) {
                var watcher = { callback: callback, tail: Promise.resolve(), active: true };
                registration.watchers.add(watcher);
                return function () {
                    watcher.active = false;
                    registration.watchers.delete(watcher);
                };
            },
            update: function (patch) { return _this.update(ns, patch); },
            replace: function (section) { return _this.replace(ns, section); },
        };
    };
    /**
     * Describe every registered namespace for configuration surfaces, including
     * the composition `base` and raw user layers so a form can mark which fields
     * the user overrode (presence in `user`) and what a reset returns to.
     * @param options - redaction switch; wire surfaces must redact.
     * @returns one descriptor per registered namespace, in registration order.
     */
    SettingsProvider.prototype.describe = function (options) {
        var _this = this;
        return __spreadArray([], this.registrations.values(), true).map(function (registration) {
            var user;
            try {
                user = _this.section(registration.ns);
            }
            catch (_a) {
                // A malformed stored section already warned at publish and kept the
                // last good resolved value; only that malformed shape can throw here,
                // and describing it as "no user layer" keeps this read total.
                user = undefined;
            }
            var base = registration.base === undefined ? undefined : structuredClone(registration.base);
            var detachedUser = user === undefined ? undefined : structuredClone(user);
            var descriptor = __assign(__assign(__assign({ ns: registration.ns, schema: registration.schema.toJSON(), value: registration.resolved, revision: registration.revision }, base === undefined ? {} : { base: base }), detachedUser === undefined ? {} : { user: detachedUser }), { applies: registration.applies });
            if ((options === null || options === void 0 ? void 0 : options.redactSecrets) !== true)
                return descriptor;
            var schema = registration.schema;
            var redacted = (0, redact_ts_1.redactSecrets)(schema, registration.resolved);
            return __assign(__assign(__assign(__assign(__assign({}, descriptor), { value: redacted.value }), base === undefined ? {} : { base: (0, redact_ts_1.redactSecrets)(schema, base).value }), detachedUser === undefined ? {} : { user: (0, redact_ts_1.redactSecrets)(schema, detachedUser).value }), { secrets: redacted.secrets });
        });
    };
    /**
     * Read one registered namespace's resolved value.
     * @param ns - the namespace to read.
     * @returns the resolved value, or `undefined` while unregistered.
     */
    SettingsProvider.prototype.get = function (ns) {
        var _a;
        return (_a = this.registrations.get(ns)) === null || _a === void 0 ? void 0 : _a.resolved;
    };
    /**
     * Merge a patch into one registered namespace's user layer, validate the
     * resolved candidate, persist through the provider, then commit and emit.
     * A validation failure rejects before anything is persisted. Writes to one
     * namespace are serialized: concurrent updates apply in call order, each
     * merging over the previous write's committed section.
     * @param ns - the registered namespace to update.
     * @param patch - plain-object patch over the user section.
     * @param expectedRevision - the descriptor `revision` the caller read; a
     *   namespace that moved past it rejects with {@link SettingsConflictError}.
     */
    SettingsProvider.prototype.update = function (ns, patch, expectedRevision) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.write(ns, patch, 'merge', expectedRevision)];
            });
        });
    };
    /**
     * Replace one registered namespace's user section wholesale, validate,
     * persist, then commit and emit. Keys absent from `section` fall back to the
     * composition `base` and schema defaults — this is the removal/reset path a
     * merge-only patch cannot express (`replace({})` re-inherits everything).
     * @param ns - the registered namespace to replace.
     * @param section - the complete next user section.
     * @param expectedRevision - the descriptor `revision` the caller read; a
     *   namespace that moved past it rejects with {@link SettingsConflictError}.
     */
    SettingsProvider.prototype.replace = function (ns, section, expectedRevision) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.write(ns, section, 'replace', expectedRevision)];
            });
        });
    };
    /**
     * Apply path-addressed edits to one registered namespace's user section,
     * validate, persist, then commit and emit. The ops are applied to the
     * section as it stands when the write reaches the front of the queue, so a
     * caller never has to restate fields it did not touch — and, crucially,
     * cannot delete fields it never saw. This is the write path for any caller
     * holding a redacted view; `replace` remains the wholesale reset.
     * @param ns - the registered namespace to edit.
     * @param ops - ordered path edits; later ops observe earlier ones.
     * @param expectedRevision - the descriptor `revision` the caller read; a
     *   namespace that moved past it rejects with {@link SettingsConflictError}.
     */
    SettingsProvider.prototype.mutate = function (ns, ops, expectedRevision) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, ops_1, op;
            return __generator(this, function (_a) {
                if (!Array.isArray(ops))
                    throw new TypeError("settings mutate for \"".concat(ns, "\" must be an array of path ops"));
                for (_i = 0, ops_1 = ops; _i < ops_1.length; _i++) {
                    op = ops_1[_i];
                    if (!isPlainObject(op) || (op['op'] !== 'set' && op['op'] !== 'unset')) {
                        throw new TypeError("settings mutate for \"".concat(ns, "\" ops must be {op:'set'|'unset', path}"));
                    }
                    if (!Array.isArray(op['path']) || op['path'].some(function (part) { return typeof part !== 'string'; })) {
                        throw new TypeError("settings mutate for \"".concat(ns, "\" op paths must be arrays of strings"));
                    }
                }
                return [2 /*return*/, this.write(ns, ops, 'mutate', expectedRevision)];
            });
        });
    };
    /** Validate a write, then queue it on the namespace's serialized write chain. */
    SettingsProvider.prototype.write = function (ns, input, mode, expectedRevision) {
        var _this = this;
        var _a;
        var verb = mode === 'merge' ? 'update' : mode === 'replace' ? 'replace' : 'mutate';
        var registration = this.registrations.get(ns);
        if (registration === undefined) {
            throw new Error("settings namespace \"".concat(ns, "\" is not registered"));
        }
        if (this.isStopped()) {
            throw new Error("settings service is disposed: \"".concat(ns, "\" cannot be written"));
        }
        if (!this.writable) {
            throw new Error("settings provider is read-only: \"".concat(ns, "\" cannot be updated in-process"));
        }
        // A mutate's ops array is wrapped so one JSON-shape walk covers both
        // shapes; merge/replace carry the section itself.
        var payload;
        if (mode === 'mutate') {
            payload = { ops: input };
        }
        else {
            if (!isPlainObject(input))
                throw new TypeError("settings ".concat(verb, " for \"").concat(ns, "\" must be a plain object"));
            payload = input;
        }
        // Snapshot at call time: the queue must never read a caller-owned object
        // the caller may keep mutating while the write waits its turn. The same
        // walk rejects values that JSON cannot preserve (see cloneJsonShaped).
        var snapshot = cloneJsonShaped(payload, function (label, path) {
            return new TypeError("settings ".concat(verb, " for \"").concat(ns, "\" must contain only JSON-compatible data (found ").concat(label, " at ").concat(path, ")"));
        });
        var previous = (_a = this.writeQueues.get(ns)) !== null && _a !== void 0 ? _a : Promise.resolve();
        // Chain past a failed predecessor: one rejected write must not poison the
        // namespace queue for every later caller.
        var run = previous.catch(function () { return undefined; }).then(function () { return __awaiter(_this, void 0, void 0, function () {
            var current, section, next;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (this.isStopped()) {
                            throw new Error("settings service was disposed before the queued \"".concat(ns, "\" ").concat(verb, " ran"));
                        }
                        if (this.registrations.get(ns) !== registration) {
                            throw new Error("settings namespace \"".concat(ns, "\" registration was disposed before the queued ").concat(verb, " ran"));
                        }
                        current = (_a = this.section(ns)) !== null && _a !== void 0 ? _a : {};
                        // The revision check belongs HERE, not at call time: the queue orders
                        // writes but cannot tell a fresh writer from one holding a snapshot
                        // that a predecessor already superseded.
                        if (expectedRevision !== undefined && expectedRevision !== registration.revision) {
                            throw new SettingsConflictError(ns, expectedRevision, registration.revision);
                        }
                        section = mode === 'merge'
                            ? mergeLayers(current, snapshot)
                            : mode === 'replace'
                                ? snapshot
                                : snapshot['ops'].reduce(applyPathOp, current);
                        next = deepFreeze(this.resolve(registration.schema, registration.base, section, registration.validate));
                        return [4 /*yield*/, this.persist(ns, section)
                            // The write reached storage either way; the cache must say so. Commit
                            // only when this registration is still the namespace owner — a fiber
                            // disposed (or replaced) mid-persist must not receive the notification.
                        ];
                    case 1:
                        _b.sent();
                        // The write reached storage either way; the cache must say so. Commit
                        // only when this registration is still the namespace owner — a fiber
                        // disposed (or replaced) mid-persist must not receive the notification.
                        this.document[ns] = section;
                        // TODO(settings-replacement-resync): Re-resolve any replacement registration
                        // from this persisted section so an old in-flight write cannot leave it stale.
                        if (this.registrations.get(ns) === registration && !this.isStopped()) {
                            this.bumpRevision(registration, current, section);
                            this.commit(registration, next, 'update');
                        }
                        return [2 /*return*/];
                }
            });
        }); });
        this.writeQueues.set(ns, run);
        return run;
    };
    /**
     * Provider hook: commit a complete raw document observed in storage. Each
     * registered namespace re-resolves; an invalid section keeps that
     * namespace's last good value and warns, other namespaces still commit.
     * @param doc - the detached raw document (unregistered sections preserved).
     * @param source - change origin; defaults to `provider`.
     */
    SettingsProvider.prototype.publish = function (doc, source) {
        if (source === void 0) { source = 'provider'; }
        // Read every raw section BEFORE swapping the document, so the revision
        // bump below compares what was stored with what now is — an external edit
        // moves the revision exactly like an in-process write.
        var before = new Map();
        for (var _i = 0, _a = this.registrations.values(); _i < _a.length; _i++) {
            var registration = _a[_i];
            try {
                before.set(registration.ns, this.section(registration.ns));
            }
            catch (_b) {
                // A malformed stored section is not a readable "before"; treating it
                // as absent still bumps against any well-formed replacement.
                before.set(registration.ns, undefined);
            }
        }
        this.document = doc;
        for (var _c = 0, _d = this.registrations.values(); _c < _d.length; _c++) {
            var registration = _d[_c];
            var next = void 0;
            try {
                next = deepFreeze(this.resolve(registration.schema, registration.base, this.section(registration.ns), registration.validate));
            }
            catch (error) {
                this.ctx.logger.warn('settings: keeping last good "%s" after invalid stored section', registration.ns);
                this.ctx.logger.warn(error);
                continue;
            }
            this.bumpRevision(registration, before.get(registration.ns), this.section(registration.ns));
            this.commit(registration, next, source);
        }
    };
    /** Read one namespace's raw user section, rejecting non-object sections. */
    SettingsProvider.prototype.section = function (ns) {
        var section = this.document[ns];
        if (section === undefined)
            return undefined;
        if (!isPlainObject(section)) {
            throw new TypeError("settings section \"".concat(ns, "\" must be an object of keys"));
        }
        return section;
    };
    /** Resolve one namespace value: schema defaults, then `base`, then the user layer. */
    SettingsProvider.prototype.resolve = function (schema, base, section, validate) {
        // The merged candidate is untyped by construction; the schema call is the
        // runtime validation that admits it into T.
        var value = schema(mergeLayers(base, section));
        // The owner's own check runs on the admitted value, so it sees defaults
        // and the composition base exactly as the owner will.
        validate === null || validate === void 0 ? void 0 : validate(value);
        return value;
    };
    /**
     * Advance a namespace's revision when its RAW section changed, and announce
     * it. Deliberately independent of {@link commit}'s resolved-value equality:
     * storing an override equal to the composition base leaves the resolved
     * value alone but changes what the document says, which is exactly what a
     * configuration surface must re-read.
     */
    SettingsProvider.prototype.bumpRevision = function (registration, before, after) {
        if (deepEqualJson(before, after))
            return;
        registration.revision += 1;
        this.emitDocumentUpdated(registration.ns, registration.revision);
    };
    /** Contained fan-out of `settings/document-updated`, mirroring {@link commit}'s. */
    SettingsProvider.prototype.emitDocumentUpdated = function (ns, revision) {
        var _this = this;
        var invariantFailure;
        var args = ['settings/document-updated', ns, revision];
        for (var _i = 0, _a = this.ctx.events.dispatch('emit', args); _i < _a.length; _i++) {
            var listener = _a[_i];
            try {
                var returned = listener(ns, revision);
                if (returned != null && typeof returned.then === 'function') {
                    void Promise.resolve(returned).then(undefined, function (error) {
                        _this.warnListenerFailure(ns, error);
                    });
                }
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 'INVARIANT') {
                    invariantFailure !== null && invariantFailure !== void 0 ? invariantFailure : (invariantFailure = error);
                    continue;
                }
                this.warnListenerFailure(ns, error);
            }
        }
        if (invariantFailure !== undefined)
            throw invariantFailure;
    };
    /** Commit a resolved value when changed: swap, notify watchers, emit the event. */
    SettingsProvider.prototype.commit = function (registration, next, source) {
        var _this = this;
        var prev = registration.resolved;
        if (deepEqualJson(next, prev))
            return;
        registration.resolved = next;
        var _loop_1 = function (watcher) {
            // Serialize per watcher: invocations of one callback run one at a time
            // in commit order, so a slow stale invocation can never apply after a
            // newer one. Sync throws and async rejections land in the same handler.
            // The activity check runs when the queued invocation would start, so a
            // disposer (or service stop) that ran while it waited prevents the
            // start entirely; started invocations drain at service dispose.
            var segment = watcher.tail
                .then(function () {
                if (!watcher.active || _this.isStopped())
                    return;
                return watcher.callback(next, prev);
            })
                .then(function () { return undefined; }, function (error) {
                _this.warnWatcherFailure(registration.ns, error);
            });
            watcher.tail = segment;
            this_1.pendingTails.add(segment);
            void segment.then(function () { return _this.pendingTails.delete(segment); });
        };
        var this_1 = this;
        for (var _i = 0, _a = __spreadArray([], registration.watchers, true); _i < _a.length; _i++) {
            var watcher = _a[_i];
            _loop_1(watcher);
        }
        // Fan the event out one listener at a time (the plain emit stops at the
        // first throwing listener, starving the rest). Invariant violations are
        // harness-fatal by design and rethrow after every listener ran; any other
        // failure is contained so one broken observer cannot wedge the commit
        // path (and, through it, a provider's reload loop).
        var invariantFailure;
        var args = ['settings/updated', registration.ns, next, prev, source];
        for (var _b = 0, _c = this.ctx.events.dispatch('emit', args); _b < _c.length; _b++) {
            var listener = _c[_b];
            try {
                var returned = listener(registration.ns, next, prev, source);
                if (returned != null && typeof returned.then === 'function') {
                    // An emit listener may still be an async function; its rejection
                    // cannot reach the synchronous INVARIANT rethrow below, so it is
                    // contained here instead of becoming an unhandled rejection.
                    void Promise.resolve(returned).then(undefined, function (error) {
                        _this.warnListenerFailure(registration.ns, error);
                    });
                }
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 'INVARIANT') {
                    invariantFailure !== null && invariantFailure !== void 0 ? invariantFailure : (invariantFailure = error);
                    continue;
                }
                this.warnListenerFailure(registration.ns, error);
            }
        }
        if (invariantFailure !== undefined)
            throw invariantFailure;
    };
    /** Contained-watcher diagnostic shared by the sync and async failure paths. */
    SettingsProvider.prototype.warnWatcherFailure = function (ns, error) {
        this.ctx.logger.warn('settings: watcher for "%s" failed', ns);
        this.ctx.logger.warn(error);
    };
    /** Contained-listener diagnostic shared by the sync and async failure paths. */
    SettingsProvider.prototype.warnListenerFailure = function (ns, error) {
        this.ctx.logger.warn('settings: a settings/updated listener for "%s" failed', ns);
        this.ctx.logger.warn(error);
    };
    return SettingsProvider;
}(cordis_1.Service));
exports.SettingsProvider = SettingsProvider;
/**
 * Value mirror of the `FiberState` members {@link isUnloading} compares
 * against: a const enum has no runtime object to import, and the value is
 * needed at runtime (same rationale as the CLI boot driver's mirror).
 */
var FIBER_DISPOSED = 4;
var FIBER_UNLOADING = 5;
/** Whether the consumer's own fiber is tearing down (not just losing the settings service). */
function isUnloading(ctx) {
    var state = ctx.fiber.state;
    return state === FIBER_UNLOADING || state === FIBER_DISPOSED;
}
/**
 * Install the canonical optional-settings consumer wiring: while a settings
 * service exists, register `ns` with the consumer's composition entry as the
 * `base` layer and point the source thunk at the resolved scope; when the
 * service goes away (disposal, provider reload), fall back to the entry so
 * the consumer keeps working exactly as composed. The registration rides the
 * scoped fiber, so no settings service ever mounted means none of this runs.
 * @param ctx - consumer plugin context owning the wiring.
 * @param ns - the consumer-owned settings namespace.
 * @param schema - schema resolving the namespace (typically the plugin Config).
 * @param entry - the consumer's composition entry config, used as `base`.
 * @param hooks - source sink and change notification.
 */
function installSettingsSection(ctx, ns, schema, entry, hooks) {
    ctx.inject(['settings'], function (sctx) {
        var scope = sctx.settings.register(ns, schema, __assign({ base: entry }, hooks.validate === undefined ? {} : { validate: hooks.validate }));
        hooks.setSource(function () { return scope.get(); });
        sctx.effect(function () { return function () {
            // This disposer runs for two different reasons. A settings provider
            // detaching leaves the consumer running, so it must fall back to its
            // composition entry and re-judge what it derived. The consumer's own
            // unload runs it too — and there `onChange` would re-register routes
            // and touch resources the teardown is releasing, so the fallback is
            // pointless and the notification actively harmful.
            if (isUnloading(ctx))
                return;
            hooks.setSource(function () { return entry; });
            hooks.onChange();
        }; });
        hooks.onChange();
        scope.watch(function () {
            // A stored change landing while the consumer unloads reaches the watcher
            // before the registration is released, and `onChange` is exactly as
            // harmful here as in the disposer above: it re-registers routes against
            // a fiber whose resources are being let go.
            if (isUnloading(ctx))
                return;
            hooks.onChange();
        });
    });
}
exports.default = SettingsProvider;
