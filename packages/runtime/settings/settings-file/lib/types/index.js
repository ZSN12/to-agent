"use strict";
/**
 * File-backed settings provider. One YAML or JSON document under the user's
 * harness home carries every namespace section; external edits hot-publish
 * through the seam, and every write re-reads the document under a
 * cross-process writer lock before patching it as a comment-preserving
 * leaf-level diff.
 * @module @z/dsh-settings-file
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncDelegator = (this && this.__asyncDelegator) || function (o) {
    var i, p;
    return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
    function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v; } : f; }
};
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
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSettingsProvider = void 0;
exports.resolveSpec = resolveSpec;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var chokidar_1 = require("chokidar");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var yaml_1 = require("yaml");
var dsh_atomic_write_1 = require("@z/dsh-atomic-write");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var dsh_settings_1 = require("@z/dsh-settings");
var FORMATS = {
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.json': 'json',
};
/**
 * Resolve the runtime spec from plugin config: an explicit `path` wins,
 * otherwise the document lives at `<harness home>/settings.yaml`.
 * @param config - raw plugin config.
 * @returns the resolved file location, format, and watch behavior.
 */
function resolveSpec(config) {
    var _a, _b, _c;
    var filename = (0, node_path_1.resolve)((_a = config.path) !== null && _a !== void 0 ? _a : (0, node_path_1.join)((0, dsh_home_paths_1.resolveDshHome)(config.dshHome), 'settings.yaml'));
    var format = FORMATS[(0, node_path_1.extname)(filename)];
    if (format === undefined) {
        throw new Error("settings-file: extension \"".concat((0, node_path_1.extname)(filename), "\" is not supported (use .yaml, .yml, or .json)"));
    }
    return {
        filename: filename,
        format: format,
        watch: (_b = config.watch) !== null && _b !== void 0 ? _b : true,
        debounceMs: (_c = config.debounceMs) !== null && _c !== void 0 ? _c : 100,
    };
}
/** Whether a parsed YAML value is a map for diffing purposes. */
function isMapLike(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Apply the difference between one node's stored and next value as minimal
 * `setIn`/`deleteIn` edits, recursing through maps, so every untouched node —
 * and the key node of every changed pair — keeps its comments, anchors, and
 * formatting. Non-map values (arrays and scalars) replace wholesale when
 * unequal, taking any comments inside them along.
 */
function patchNode(document, path, current, next) {
    if (isMapLike(current) && isMapLike(next)) {
        for (var _i = 0, _a = Object.keys(current); _i < _a.length; _i++) {
            var key = _a[_i];
            if (!(key in next))
                document.deleteIn(__spreadArray(__spreadArray([], path, true), [key], false));
        }
        for (var _b = 0, _c = Object.entries(next); _b < _c.length; _b++) {
            var _d = _c[_b], key = _d[0], value = _d[1];
            patchNode(document, __spreadArray(__spreadArray([], path, true), [key], false), current[key], value);
        }
        return;
    }
    if (!(0, dsh_settings_1.deepEqualJson)(current, next))
        document.setIn(__spreadArray([], path, true), next);
}
/** Whether a filesystem error means absence; every non-ENOENT failure must surface. */
function isENOENT(error) {
    return (error === null || error === void 0 ? void 0 : error.code) === 'ENOENT';
}
/** Whether an exclusive file create found an existing document. */
function isEEXIST(error) {
    return (error === null || error === void 0 ? void 0 : error.code) === 'EEXIST';
}
/** File-backed settings provider (`settings.yaml`/`.json`). */
var FileSettingsProvider = /** @class */ (function (_super) {
    __extends(FileSettingsProvider, _super);
    function FileSettingsProvider(ctx, config) {
        var _this = _super.call(this, ctx) || this;
        _this.config = config;
        /**
         * Single exclusive operation chain: watcher reloads and document writes run
         * one at a time in queue order (settled tail), so a write can never render
         * from text a concurrent reload is busy replacing, and a reload can never
         * read a half-committed write.
         */
        _this.operations = Promise.resolve();
        /** Set at dispose: refuse new watcher events and let in-flight work no-op. */
        _this.closed = false;
        // Programmatic construction may bypass Schemastery normalization; resolve
        // the same defaults in one explicit step either way.
        _this.spec = resolveSpec(config);
        return _this;
    }
    /** Opaque read of {@link closed}: control flow cannot narrow it across awaits. */
    FileSettingsProvider.prototype.isClosed = function () {
        return this.closed;
    };
    Object.defineProperty(FileSettingsProvider.prototype, "writable", {
        /** The local document is always writable through {@link SettingsProvider.update}. */
        get: function () {
            return true;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(FileSettingsProvider.prototype, "documentPath", {
        /** The resolved YAML/JSON document path exposed to local configuration surfaces. */
        get: function () {
            return this.spec.filename;
        },
        enumerable: false,
        configurable: true
    });
    /** Materialize an absent owner-only document, then return its resolved path. */
    FileSettingsProvider.prototype.prepareDocument = function () {
        var _this = this;
        return this.enqueue(function () { return __awaiter(_this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, promises_1.mkdir)((0, node_path_1.dirname)(this.spec.filename), { recursive: true, mode: 448 })];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, (0, dsh_atomic_write_1.withFileLock)(this.spec.filename, function () { return __awaiter(_this, void 0, void 0, function () {
                                var error_1;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            _a.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, (0, promises_1.writeFile)(this.spec.filename, '', { flag: 'wx', mode: 384 })];
                                        case 1:
                                            _a.sent();
                                            return [3 /*break*/, 3];
                                        case 2:
                                            error_1 = _a.sent();
                                            if (isEEXIST(error_1))
                                                return [2 /*return*/];
                                            throw error_1;
                                        case 3:
                                            this.text = '';
                                            if (!this.isClosed())
                                                this.publish({});
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, this.spec.filename];
                }
            });
        }); });
    };
    FileSettingsProvider.prototype.load = function () {
        return __awaiter(this, void 0, void 0, function () {
            var text, error_2, doc;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, promises_1.readFile)(this.spec.filename, 'utf8')];
                    case 1:
                        text = _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_2 = _a.sent();
                        if (!isENOENT(error_2))
                            throw error_2;
                        this.text = undefined;
                        return [2 /*return*/, {}];
                    case 3:
                        doc = this.parse(text);
                        this.text = text;
                        return [2 /*return*/, doc];
                }
            });
        });
    };
    FileSettingsProvider.prototype.persist = function (ns, section) {
        var _this = this;
        // One document backs every namespace, so writes from different namespace
        // queues serialize with each other and with watcher reloads on the one
        // operation chain: each render must see the text the previous operation
        // committed, or a sibling section silently vanishes from disk.
        return this.enqueue(function () { return _this.persistSection(ns, section); });
    };
    /** Queue one exclusive document operation behind every earlier one. */
    FileSettingsProvider.prototype.enqueue = function (operation) {
        var task = this.operations.then(operation);
        this.operations = task.then(function () { return undefined; }, function () { return undefined; });
        return task;
    };
    /** Queue a reload; only an invariant violation escaping a commit can reject it. */
    FileSettingsProvider.prototype.queueRefresh = function () {
        var _this = this;
        void this.enqueue(function () { return _this.refresh(); }).catch(function (error) {
            // Only an invariant violation escaping the commit path can reject a
            // refresh; keep the operation queue alive and surface it as an error so
            // one poisoned commit cannot silently end hot reloading forever.
            _this.ctx.logger.error('settings-file: reload commit failed at %s', _this.spec.filename);
            _this.ctx.logger.error(error);
        });
    };
    FileSettingsProvider.prototype.persistSection = function (ns, section) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: 
                    // The writer lock's exclusive create needs the parent to exist before
                    // writeFileAtomic gets its own chance to create it.
                    // 0700: the harness home holds user-private documents.
                    return [4 /*yield*/, (0, promises_1.mkdir)((0, node_path_1.dirname)(this.spec.filename), { recursive: true, mode: 448 })];
                    case 1:
                        // The writer lock's exclusive create needs the parent to exist before
                        // writeFileAtomic gets its own chance to create it.
                        // 0700: the harness home holds user-private documents.
                        _a.sent();
                        return [4 /*yield*/, (0, dsh_atomic_write_1.withFileLock)(this.spec.filename, function () { return __awaiter(_this, void 0, void 0, function () {
                                var output;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: 
                                        // Read-modify-write: fold in any on-disk state this process has not
                                        // observed yet — an external edit still inside the watcher debounce
                                        // window, a change the watcher missed, or another process's write — so
                                        // the render below can never resurrect a stale document. An unparsable
                                        // on-disk document fails the write loud instead of silently overwriting
                                        // a user's manual edit.
                                        return [4 /*yield*/, this.reconcileFromDisk()];
                                        case 1:
                                            // Read-modify-write: fold in any on-disk state this process has not
                                            // observed yet — an external edit still inside the watcher debounce
                                            // window, a change the watcher missed, or another process's write — so
                                            // the render below can never resurrect a stale document. An unparsable
                                            // on-disk document fails the write loud instead of silently overwriting
                                            // a user's manual edit.
                                            _a.sent();
                                            output = this.spec.format === 'yaml'
                                                ? this.renderYaml(ns, section)
                                                : this.renderJson(ns, section);
                                            // 0600: a document that may hold personal values is never world-readable.
                                            return [4 /*yield*/, (0, dsh_atomic_write_1.writeFileAtomic)(this.spec.filename, output, { mode: 384, dirMode: 448 })];
                                        case 2:
                                            // 0600: a document that may hold personal values is never world-readable.
                                            _a.sent();
                                            this.text = output;
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    FileSettingsProvider.prototype[cordis_1.Service.init] = function () {
        return __asyncGenerator(this, arguments, function _a() {
            var watcher, _b, _c;
            var _this = this;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: 
                    // The base init loads and publishes; a parse failure there is a boot
                    // failure: an existing-but-invalid document must fail loud, never be
                    // silently ignored or overwritten.
                    return [5 /*yield**/, __values(__asyncDelegator(__asyncValues(_super.prototype[cordis_1.Service.init].call(this))))];
                    case 1: 
                    // The base init loads and publishes; a parse failure there is a boot
                    // failure: an existing-but-invalid document must fail loud, never be
                    // silently ignored or overwritten.
                    return [4 /*yield*/, __await.apply(void 0, [_d.sent()])];
                    case 2:
                        // The base init loads and publishes; a parse failure there is a boot
                        // failure: an existing-but-invalid document must fail loud, never be
                        // silently ignored or overwritten.
                        _d.sent();
                        if (!this.spec.watch) return [3 /*break*/, 4];
                        _c = chokidar_1.watch;
                        return [4 /*yield*/, __await((0, dsh_home_paths_1.canonicalizeWatchPath)(this.spec.filename))];
                    case 3:
                        _b = _c.apply(void 0, [_d.sent(), {
                                ignoreInitial: true,
                                awaitWriteFinish: {
                                    stabilityThreshold: this.spec.debounceMs,
                                    pollInterval: Math.max(1, Math.min(this.spec.debounceMs, 10)),
                                },
                            }]);
                        return [3 /*break*/, 5];
                    case 4:
                        _b = undefined;
                        _d.label = 5;
                    case 5:
                        watcher = _b;
                        if (watcher !== undefined) {
                            watcher.on('all', function () {
                                if (_this.closed)
                                    return;
                                _this.queueRefresh();
                            });
                            watcher.on('ready', function () {
                                // The base init's load raced the watcher's own setup: a change written
                                // between that read and the watcher becoming active never fires an
                                // event. One reconcile at ready closes the gap.
                                if (_this.closed)
                                    return;
                                _this.queueRefresh();
                            });
                            watcher.on('error', function (error) {
                                _this.ctx.logger.warn('settings-file: watcher error on %s', _this.spec.filename);
                                _this.ctx.logger.warn(error);
                            });
                        }
                        return [4 /*yield*/, __await(function () { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_b) {
                                    switch (_b.label) {
                                        case 0:
                                            // Quiesce every operation chain, even when no watcher is configured.
                                            this.closed = true;
                                            return [4 /*yield*/, (watcher === null || watcher === void 0 ? void 0 : watcher.close())];
                                        case 1:
                                            _b.sent();
                                            return [4 /*yield*/, this.operations];
                                        case 2:
                                            _b.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 6: return [4 /*yield*/, _d.sent()];
                    case 7:
                        _d.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Parse one document text into raw sections, failing on a non-map root. */
    FileSettingsProvider.prototype.parse = function (text) {
        var _a;
        var root;
        if (this.spec.format === 'yaml') {
            // `prettyErrors` is on only for `linePos`; `error.message` is never
            // used, because the parser quotes the offending source line and a
            // settings document can hold a `role('secret')` value.
            var document_1 = (0, yaml_1.parseDocument)(text, { prettyErrors: true });
            if (document_1.errors.length > 0) {
                throw new Error("settings-file: invalid document at ".concat(this.spec.filename, ": ").concat(document_1.errors.map(function (error) {
                    var _a;
                    var at = (_a = error.linePos) === null || _a === void 0 ? void 0 : _a[0];
                    /* v8 ignore next -- `prettyErrors` populates linePos on every error; the guard answers its optional type */
                    return "".concat(error.code).concat(at === undefined ? '' : " at line ".concat(String(at.line), ", column ").concat(String(at.col)));
                }).join('; ')));
            }
            root = (_a = document_1.toJS()) !== null && _a !== void 0 ? _a : {};
        }
        else {
            root = text.trim().length === 0 ? {} : JSON.parse(text);
        }
        if (typeof root !== 'object' || root === null || Array.isArray(root)) {
            throw new TypeError("settings-file: ".concat(this.spec.filename, " must be a map of namespace sections"));
        }
        return root;
    };
    /**
     * Re-read the document after a watcher event. Unchanged content (including
     * this provider's own writes) is a no-op; an unreadable or unparsable
     * document keeps the last good sections and warns — a live hot-reload must
     * never take the process down. An invariant violation escaping a commit is
     * not a reload failure and propagates to the queue's error surface.
     */
    FileSettingsProvider.prototype.refresh = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.closed)
                            return [2 /*return*/];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.reconcileFromDisk()];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_3 = _a.sent();
                        if ((error_3 === null || error_3 === void 0 ? void 0 : error_3.code) === 'INVARIANT')
                            throw error_3;
                        this.ctx.logger.warn('settings-file: reload failed at %s; keeping the last good document', this.spec.filename);
                        this.ctx.logger.warn(error_3);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Compare the on-disk text against the cache and publish any difference
     * into the seam. Absence publishes the empty document; an unreadable or
     * unparsable file throws, so each caller picks its policy — a reload warns
     * and keeps the last good document, a write fails loud.
     */
    FileSettingsProvider.prototype.reconcileFromDisk = function () {
        return __awaiter(this, void 0, void 0, function () {
            var text, error_4, doc;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, (0, promises_1.readFile)(this.spec.filename, 'utf8')];
                    case 1:
                        text = _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_4 = _a.sent();
                        if (!isENOENT(error_4))
                            throw error_4;
                        text = undefined;
                        return [3 /*break*/, 3];
                    case 3:
                        if (text === this.text || this.isClosed())
                            return [2 /*return*/];
                        if (text === undefined) {
                            this.text = undefined;
                            this.publish({});
                            return [2 /*return*/];
                        }
                        doc = this.parse(text);
                        this.text = text;
                        this.publish(doc);
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Render the next YAML text by patching one namespace in the
     * comment-preserving document. The next section lands as a leaf-level diff
     * against the stored one — only changed values set, only removed keys
     * delete — so comments inside the section survive edits to their siblings,
     * not just comments outside it.
     */
    FileSettingsProvider.prototype.renderYaml = function (ns, section) {
        var _a;
        if (this.text === undefined) {
            return new yaml_1.Document((_a = {}, _a[ns] = section, _a)).toString();
        }
        // this.text only ever caches content that parsed successfully, so this
        // re-parse (for the mutable comment-preserving tree) cannot fail, and
        // parse() already rejected any non-map root.
        var document = (0, yaml_1.parseDocument)(this.text);
        var root = document.toJS();
        patchNode(document, [ns], isMapLike(root) ? root[ns] : undefined, section);
        return document.toString();
    };
    /** Render the next JSON text by replacing one namespace key. */
    FileSettingsProvider.prototype.renderJson = function (ns, section) {
        var root = this.text === undefined
            ? {}
            : this.parse(this.text);
        root[ns] = section;
        return "".concat(JSON.stringify(root, null, 2), "\n");
    };
    FileSettingsProvider.Config = schemastery_1.default.object({
        path: schemastery_1.default.string(),
        dshHome: schemastery_1.default.string(),
        watch: schemastery_1.default.boolean().default(true),
        debounceMs: schemastery_1.default.number().min(0).default(100),
    });
    return FileSettingsProvider;
}(dsh_settings_1.SettingsProvider));
exports.FileSettingsProvider = FileSettingsProvider;
exports.default = FileSettingsProvider;
