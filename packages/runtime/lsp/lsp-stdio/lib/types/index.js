"use strict";
/**
 * Generic stdio language-server backend for `ctx.lsp`. One plugin instance configures a named table
 * of server commands and registers one isolated provider for each entry. Every provider lazily
 * single-flights one server process per canonical workspace target, serves transient-open queries
 * through it, and replaces a selected transport that fails before or during the next read-only
 * query. Providers read sources through `ctx.fs` and launch servers through
 * `ctx.subprocess`, so both local and remote implementations share one host.
 *
 * Namespace plugin (named exports, no default export). Lifecycle is effect-scoped: disposal
 * unregisters from `ctx.lsp` and tears down every live server.
 * @module @z/dsh-lsp-stdio
 */
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
exports.Config = exports.inject = exports.name = exports.LspConnection = exports.LspInstance = exports.supportsTransientOpen = exports.supportsOperation = exports.requestMethod = exports.normalizeLocations = exports.normalizeHover = exports.negotiatePositionEncoding = exports.MessageDecoder = exports.encodeMessage = exports.readHostSource = exports.canonicalizeWorkspace = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_lsp_1 = require("@z/dsh-lsp");
var dsh_timeout_1 = require("@z/dsh-timeout");
var abort_ts_1 = require("./abort.ts");
var host_ts_1 = require("./host.ts");
var instance_ts_1 = require("./instance.ts");
var host_ts_2 = require("./host.ts");
Object.defineProperty(exports, "canonicalizeWorkspace", { enumerable: true, get: function () { return host_ts_2.canonicalizeWorkspace; } });
Object.defineProperty(exports, "readHostSource", { enumerable: true, get: function () { return host_ts_2.readHostSource; } });
var framing_ts_1 = require("./framing.ts");
Object.defineProperty(exports, "encodeMessage", { enumerable: true, get: function () { return framing_ts_1.encodeMessage; } });
Object.defineProperty(exports, "MessageDecoder", { enumerable: true, get: function () { return framing_ts_1.MessageDecoder; } });
var translate_ts_1 = require("./translate.ts");
Object.defineProperty(exports, "negotiatePositionEncoding", { enumerable: true, get: function () { return translate_ts_1.negotiatePositionEncoding; } });
Object.defineProperty(exports, "normalizeHover", { enumerable: true, get: function () { return translate_ts_1.normalizeHover; } });
Object.defineProperty(exports, "normalizeLocations", { enumerable: true, get: function () { return translate_ts_1.normalizeLocations; } });
Object.defineProperty(exports, "requestMethod", { enumerable: true, get: function () { return translate_ts_1.requestMethod; } });
Object.defineProperty(exports, "supportsOperation", { enumerable: true, get: function () { return translate_ts_1.supportsOperation; } });
Object.defineProperty(exports, "supportsTransientOpen", { enumerable: true, get: function () { return translate_ts_1.supportsTransientOpen; } });
var instance_ts_2 = require("./instance.ts");
Object.defineProperty(exports, "LspInstance", { enumerable: true, get: function () { return instance_ts_2.LspInstance; } });
var connection_ts_1 = require("./connection.ts");
Object.defineProperty(exports, "LspConnection", { enumerable: true, get: function () { return connection_ts_1.LspConnection; } });
/** Cordis plugin name for loader diagnostics. */
exports.name = 'lsp-stdio';
/** Services required by this plugin. */
exports.inject = ['fs', 'lsp', 'subprocess'];
var DEFAULT_MAX_MESSAGE_BYTES = 16000000;
var DEFAULT_MAX_STDERR_BYTES = 1000000;
var DEFAULT_MAX_DOCUMENT_BYTES = 4000000;
var DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;
var DEFAULT_KILL_GRACE_MS = 2000;
var LspLocalServerConfig = schemastery_1.default.object({
    command: schemastery_1.default.string().required(),
    args: schemastery_1.default.array(String).default([]),
    env: schemastery_1.default.dict(String).default({}),
    extensionToLanguage: schemastery_1.default.dict(String).required(),
    initializationOptions: schemastery_1.default.any().default(null),
    configuration: schemastery_1.default.any().default(null),
    maxMessageBytes: schemastery_1.default.number().default(DEFAULT_MAX_MESSAGE_BYTES),
    maxStderrBytes: schemastery_1.default.number().default(DEFAULT_MAX_STDERR_BYTES),
    maxDocumentBytes: schemastery_1.default.number().default(DEFAULT_MAX_DOCUMENT_BYTES),
    shutdownTimeoutMs: schemastery_1.default.number().max(dsh_timeout_1.MAX_TIMER_DELAY_MS).default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
    killGraceMs: schemastery_1.default.number().max(dsh_timeout_1.MAX_TIMER_DELAY_MS).default(DEFAULT_KILL_GRACE_MS),
});
exports.Config = schemastery_1.default.object({
    servers: schemastery_1.default.dict(LspLocalServerConfig).required(),
});
/** Propagate teardown failures only after every sibling has settled. */
function throwTeardownFailures(results, message) {
    var failures = [];
    for (var _i = 0, results_1 = results; _i < results_1.length; _i++) {
        var result = results_1[_i];
        if (result.status === 'rejected')
            failures.push(result.reason);
    }
    if (failures.length === 1)
        throw failures[0];
    if (failures.length > 1)
        throw new AggregateError(failures, message);
}
/**
 * Register the configured stdio LSP providers. Resolves every executable at load (after credential
 * scrubbing) before publishing any provider; each process launches lazily on its first matching
 * query.
 * @param ctx - the plugin context carrying `fs`, `lsp`, and `subprocess`.
 * @param config - the resolved plugin configuration (schemastery has filled every default).
 */
function apply(ctx, config) {
    return __awaiter(this, void 0, void 0, function () {
        var entries, setupAbort, stopSetupCancellation, providers;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    entries = Object.entries(config.servers);
                    if (entries.length === 0)
                        throw new Error('lsp-stdio: servers must contain at least one server');
                    setupAbort = new AbortController();
                    stopSetupCancellation = ctx.on('internal/plugin', function (fiber) {
                        // An async plugin callback must observe its own disposal before Cordis can
                        // run effect cleanup, because unload otherwise waits for this callback.
                        if (fiber === ctx.fiber && fiber.uid === null) {
                            setupAbort.abort(new Error('lsp-stdio setup disposed'));
                        }
                    });
                    return [4 /*yield*/, (function () { return __awaiter(_this, void 0, void 0, function () {
                            var lookups, error_1;
                            var _this = this;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        lookups = entries.map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                            var resolved, executable;
                                            var providerId = _b[0], rawConfig = _b[1];
                                            return __generator(this, function (_c) {
                                                switch (_c.label) {
                                                    case 0:
                                                        if (providerId.trim() === '')
                                                            throw new Error('lsp-stdio: server ids must be non-empty strings');
                                                        resolved = rawConfig;
                                                        validateServerConfig(providerId, resolved);
                                                        return [4 /*yield*/, ctx.subprocess.resolveExecutable(resolved.command, resolved.env, setupAbort.signal)];
                                                    case 1:
                                                        executable = _c.sent();
                                                        setupAbort.signal.throwIfAborted();
                                                        return [2 /*return*/, new LocalLspProvider(providerId, ctx.fs, resolved, executable, function (spec) { return ctx.subprocess.spawn(spec); })];
                                                }
                                            });
                                        }); });
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, 5, 6]);
                                        return [4 /*yield*/, Promise.all(lookups)];
                                    case 2: return [2 /*return*/, _a.sent()];
                                    case 3:
                                        error_1 = _a.sent();
                                        setupAbort.abort(error_1);
                                        return [4 /*yield*/, Promise.allSettled(lookups)];
                                    case 4:
                                        _a.sent();
                                        throw error_1;
                                    case 5:
                                        stopSetupCancellation();
                                        return [7 /*endfinally*/];
                                    case 6: return [2 /*return*/];
                                }
                            });
                        }); })()];
                case 1:
                    providers = _a.sent();
                    ctx.effect(function () {
                        var disposers = [];
                        try {
                            for (var _i = 0, providers_1 = providers; _i < providers_1.length; _i++) {
                                var provider = providers_1[_i];
                                disposers.push(ctx.lsp.registerProvider(provider));
                            }
                        }
                        catch (error) {
                            for (var _a = 0, _b = disposers.reverse(); _a < _b.length; _a++) {
                                var dispose = _b[_a];
                                dispose();
                            }
                            throw error;
                        }
                        return function () { return __awaiter(_this, void 0, void 0, function () {
                            var _i, _a, dispose, results;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        // Remove every route before process teardown so no new query can enter a draining provider.
                                        for (_i = 0, _a = disposers.reverse(); _i < _a.length; _i++) {
                                            dispose = _a[_i];
                                            dispose();
                                        }
                                        return [4 /*yield*/, Promise.allSettled(providers.map(function (provider) { return provider.disposeAll(); }))];
                                    case 1:
                                        results = _b.sent();
                                        throwTeardownFailures(results, 'lsp-stdio provider teardown failed');
                                        return [2 /*return*/];
                                }
                            });
                        }); };
                    }, 'lsp-stdio.registerProviders');
                    return [2 /*return*/];
            }
        });
    });
}
/** Validate one resolved server entry before any provider in the table is registered. */
function validateServerConfig(providerId, resolved) {
    // Teardown budgets feed `deadline()`, whose `<= 0` is the internal no-timeout sentinel; a
    // nonpositive value would let a server that ignores shutdown hang disposal forever. Fail at load.
    assertTimer(providerId, 'shutdownTimeoutMs', resolved.shutdownTimeoutMs);
    assertTimer(providerId, 'killGraceMs', resolved.killGraceMs);
    // Byte caps must be positive: a nonpositive stderr cap defeats the retained-tail bound
    // (`slice(-0)` keeps everything), `maxMessageBytes: 0` makes every response fatal, and a bad
    // document cap fails later in the read path instead of at load.
    assertPositiveInteger(providerId, 'maxStderrBytes', resolved.maxStderrBytes);
    assertPositiveInteger(providerId, 'maxMessageBytes', resolved.maxMessageBytes);
    assertPositiveInteger(providerId, 'maxDocumentBytes', resolved.maxDocumentBytes);
}
/** Reject a timer value Node would clamp instead of scheduling as configured. */
function assertTimer(providerId, name, value) {
    if (!Number.isInteger(value) || value < 1 || value > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        throw new Error("lsp-stdio: servers.".concat(providerId, ".").concat(name, " must be a positive integer no greater than ").concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
}
/** Reject a nonpositive or non-integer config value at load, so misconfiguration fails loud. */
function assertPositiveInteger(providerId, name, value) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error("lsp-stdio: servers.".concat(providerId, ".").concat(name, " must be a positive integer"));
    }
}
/** A pooled generic provider: one server process per canonical workspace, created on demand. */
var LocalLspProvider = /** @class */ (function () {
    function LocalLspProvider(providerId, fs, config, executable, spawner) {
        this.fs = fs;
        this.config = config;
        this.executable = executable;
        this.spawner = spawner;
        /** One live instance per stable canonical workspace identity. */
        this.instances = new Map();
        /** One complete source-read→open→query→close serialization tail per canonical workspace. */
        this.queues = new Map();
        /** Workspace canonicalizations that have not entered a provider-owned queue yet. */
        this.workspaceLookups = new Set();
        this.lifetime = new AbortController();
        this.disposed = false;
        this.id = (0, dsh_lsp_1.LspProviderId)(providerId);
        this.extensionToLanguage = config.extensionToLanguage;
    }
    /** Read the disposed flag through a method so a `query()` await cannot narrow it to a literal. */
    LocalLspProvider.prototype.isDisposed = function () {
        return this.disposed;
    };
    /** Reject work that cannot publish or use a provider-owned instance. */
    LocalLspProvider.prototype.assertActive = function (signal) {
        /* v8 ignore next -- the seam unregisters this provider before disposal; direct in-flight calls
           exercise the post-await check instead. */
        if (this.isDisposed())
            throw new dsh_lsp_1.LspError('lsp-stdio provider is disposed', 'LSP_DISPOSED');
        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
            throw (0, abort_ts_1.abortError)(signal);
    };
    /** Fuse caller cancellation with provider disposal for every filesystem and protocol await. */
    LocalLspProvider.prototype.querySignal = function (signal) {
        return signal === undefined
            ? this.lifetime.signal
            : AbortSignal.any([signal, this.lifetime.signal]);
    };
    LocalLspProvider.prototype.query = function (request, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var querySignal, workspaceResult, workspaceLookup, workspace, workspaceKey;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // Honor an already-aborted signal before provider I/O so a canceled request never starts a server.
                        this.assertActive(signal);
                        querySignal = this.querySignal(signal);
                        workspaceResult = (0, host_ts_1.canonicalizeWorkspace)(this.fs, request.workspaceRoot, querySignal);
                        workspaceLookup = workspaceResult.then(function () { return undefined; }, function () { return undefined; });
                        this.workspaceLookups.add(workspaceLookup);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 3, 4]);
                        return [4 /*yield*/, workspaceResult];
                    case 2:
                        workspace = _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        this.workspaceLookups.delete(workspaceLookup);
                        return [7 /*endfinally*/];
                    case 4:
                        this.assertActive(querySignal);
                        workspaceKey = workspace.target.targetKey;
                        return [2 /*return*/, this.enqueue(workspaceKey, querySignal, function () { return __awaiter(_this, void 0, void 0, function () {
                                var source, instance, error_2;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            this.assertActive(querySignal);
                                            return [4 /*yield*/, (0, host_ts_1.readHostSource)(this.fs, request.filePath, workspace, this.config.maxDocumentBytes, querySignal)
                                                // Disposal may have snapshotted the instance map while host I/O was pending. Re-check before a
                                                // synchronous get-or-create so every spawned process remains owned by teardown.
                                            ];
                                        case 1:
                                            source = _a.sent();
                                            // Disposal may have snapshotted the instance map while host I/O was pending. Re-check before a
                                            // synchronous get-or-create so every spawned process remains owned by teardown.
                                            this.assertActive(querySignal);
                                            instance = this.instanceFor(workspaceKey, workspace);
                                            _a.label = 2;
                                        case 2:
                                            _a.trys.push([2, 4, 7, 10]);
                                            return [4 /*yield*/, instance.query(request, source, querySignal)];
                                        case 3: return [2 /*return*/, _a.sent()];
                                        case 4:
                                            error_2 = _a.sent();
                                            // A selected child can have died while idle or fail during the next write. Queries are
                                            // read-only, so replace that transport once and retry transparently.
                                            if (!instance.isTransportFailure(error_2))
                                                throw error_2;
                                            return [4 /*yield*/, instance.dispose()];
                                        case 5:
                                            _a.sent();
                                            this.evictIfCurrent(workspaceKey, instance);
                                            this.assertActive(querySignal);
                                            instance = this.instanceFor(workspaceKey, workspace);
                                            return [4 /*yield*/, instance.query(request, source, querySignal)];
                                        case 6: return [2 /*return*/, _a.sent()];
                                        case 7:
                                            if (!instance.dead) return [3 /*break*/, 9];
                                            return [4 /*yield*/, instance.dispose()];
                                        case 8:
                                            _a.sent();
                                            this.evictIfCurrent(workspaceKey, instance);
                                            _a.label = 9;
                                        case 9: return [7 /*endfinally*/];
                                        case 10: return [2 /*return*/];
                                    }
                                });
                            }); })];
                }
            });
        });
    };
    /** Serialize one complete query lifecycle for a canonical workspace. */
    LocalLspProvider.prototype.enqueue = function (workspace, signal, run) {
        var _this = this;
        var _a;
        var previous = (_a = this.queues.get(workspace)) !== null && _a !== void 0 ? _a : Promise.resolve();
        var result = (0, abort_ts_1.abortable)(previous, signal).then(run);
        // The tail follows the actual prior work even when this caller aborts its wait. It never rejects,
        // so later callers serialize without inheriting an earlier query's outcome.
        var tail = previous.then(function () { return result; }).then(function () { return undefined; }, function () { return undefined; });
        this.queues.set(workspace, tail);
        void tail.then(function () {
            if (_this.queues.get(workspace) === tail)
                _this.queues.delete(workspace);
        });
        return result;
    };
    /** Return or synchronously publish the one instance for a canonical workspace. */
    LocalLspProvider.prototype.instanceFor = function (workspaceKey, workspace) {
        this.assertActive();
        var existing = this.instances.get(workspaceKey);
        if (existing !== undefined)
            return existing;
        var created = this.createInstance(workspace);
        this.instances.set(workspaceKey, created);
        return created;
    };
    /** Drop the slot iff it still contains this instance. */
    LocalLspProvider.prototype.evictIfCurrent = function (workspace, instance) {
        /* v8 ignore next -- mismatch requires another query to replace the slot before this finally runs. */
        if (this.instances.get(workspace) === instance)
            this.instances.delete(workspace);
    };
    LocalLspProvider.prototype.createInstance = function (workspace) {
        var spec = {
            command: this.executable,
            args: this.config.args,
            cwd: workspace.canonicalPath,
            workspaceUri: workspace.fileUrl,
            env: this.config.env,
            configuration: this.config.configuration,
            initializationOptions: this.config.initializationOptions,
            maxMessageBytes: this.config.maxMessageBytes,
            maxStderrBytes: this.config.maxStderrBytes,
            shutdownTimeoutMs: this.config.shutdownTimeoutMs,
            killGraceMs: this.config.killGraceMs,
        };
        return new instance_ts_1.LspInstance(spec, this.spawner);
    };
    /** Dispose every live instance and block further queries. */
    LocalLspProvider.prototype.disposeAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            var live, draining, resolving, results;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.disposed = true;
                        this.lifetime.abort(new dsh_lsp_1.LspError('lsp-stdio provider is disposed', 'LSP_DISPOSED'));
                        live = __spreadArray([], this.instances.values(), true);
                        draining = __spreadArray([], this.queues.values(), true);
                        resolving = __spreadArray([], this.workspaceLookups, true);
                        this.instances.clear();
                        return [4 /*yield*/, Promise.allSettled(__spreadArray(__spreadArray(__spreadArray([], live.map(function (instance) { return instance.dispose(); }), true), draining, true), resolving, true))];
                    case 1:
                        results = _a.sent();
                        this.queues.clear();
                        this.workspaceLookups.clear();
                        throwTeardownFailures(results, 'lsp-stdio instance teardown failed');
                        return [2 /*return*/];
                }
            });
        });
    };
    return LocalLspProvider;
}());
