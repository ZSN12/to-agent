"use strict";
/**
 * Concrete session-query service with SQLite FTS5 over the live-preferred corpus.
 *
 * @module @z/dsh-session-query-sqlite
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
exports.SqliteSessionQueryEngine = exports.SESSION_QUERY_SQLITE_SNIPPET_CHARS = exports.SESSION_QUERY_SQLITE_MAX_LIMIT = exports.SESSION_QUERY_SQLITE_DEFAULT_LIMIT = exports.SESSION_QUERY_SQLITE_PATH_KEY = exports.SESSION_QUERY_SQLITE_SCHEMA_VERSION = exports.SESSION_QUERY_SQLITE_APPLICATION_ID = void 0;
var node_crypto_1 = require("node:crypto");
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var dsh_session_query_1 = require("@z/dsh-session-query");
var schema_ts_1 = require("./schema.ts");
var query_ts_1 = require("./query.ts");
var schema_ts_2 = require("./schema.ts");
Object.defineProperty(exports, "SESSION_QUERY_SQLITE_APPLICATION_ID", { enumerable: true, get: function () { return schema_ts_2.SESSION_QUERY_SQLITE_APPLICATION_ID; } });
Object.defineProperty(exports, "SESSION_QUERY_SQLITE_SCHEMA_VERSION", { enumerable: true, get: function () { return schema_ts_2.SESSION_QUERY_SQLITE_SCHEMA_VERSION; } });
/** Boot-context slot for a launcher-owned absolute path to this process's derived query index. */
exports.SESSION_QUERY_SQLITE_PATH_KEY = 'launcherSessionQueryPath';
/** Default result page size. */
exports.SESSION_QUERY_SQLITE_DEFAULT_LIMIT = 20;
/** Maximum accepted result page size. */
exports.SESSION_QUERY_SQLITE_MAX_LIMIT = 100;
/** Default maximum snippet length in Unicode code points. */
exports.SESSION_QUERY_SQLITE_SNIPPET_CHARS = 240;
// One transient source change gets a retry; repeated churn fails rather than monopolizing the queue.
var STABLE_OBSERVATION_ATTEMPTS = 2;
/** Concrete SQLite owner of the combined `ctx.sessionQuery` service. */
var SqliteSessionQueryEngine = /** @class */ (function (_super) {
    __extends(SqliteSessionQueryEngine, _super);
    function SqliteSessionQueryEngine(ctx, config) {
        // The assignment expression resolves before the base constructor can
        // register `ctx.sessionQuery`; keep that same validated value afterward.
        var _this = _super.call(this, ctx, config = resolveConfig(config)) || this;
        _this._instance = (0, node_crypto_1.randomUUID)();
        _this._persistenceBinding = { identity: Symbol() };
        _this._persistenceEpoch = 0;
        _this._globalGeneration = 0;
        _this._localGeneration = 0;
        _this._tail = Promise.resolve();
        _this._closed = false;
        _this.config = config;
        _this._optionalPersistenceFiber = ctx.inject(['sessionPersistence'], function (childCtx) {
            var service = childCtx.sessionPersistence;
            var binding = { identity: Symbol(), service: service };
            _this._persistenceBinding = binding;
            childCtx.effect(function () { return function () {
                /* v8 ignore next -- a stale optional-service disposer cannot clear a replacement */
                if (_this._persistenceBinding !== binding)
                    return;
                _this._persistenceBinding = { identity: Symbol() };
            }; }, 'sessionQuerySqlite.persistenceBinding');
        });
        ctx.effect(function () {
            return function () { return _this._optionalPersistenceFiber.dispose(); };
        }, 'sessionQuerySqlite.optionalPersistence');
        ctx.effect(function () { return function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, this.close()];
        }); }); }; }, 'sessionQuerySqlite.close');
        return _this;
    }
    /** Open eagerly only when activation owns the configured readiness boundary. */
    SqliteSessionQueryEngine.prototype[cordis_1.Service.init] = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(this.config.openAt === 'startup')) return [3 /*break*/, 2];
                        return [4 /*yield*/, this._ensureReady(undefined)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    SqliteSessionQueryEngine.prototype.searchSessions = function (request, exec) {
        return __awaiter(this, void 0, void 0, function () {
            var normalized, signal;
            var _this = this;
            return __generator(this, function (_a) {
                this._assertSearchEnabled();
                normalized = (0, query_ts_1.normalizeSessionRequest)(request, this.config);
                signal = exec === null || exec === void 0 ? void 0 : exec.signal;
                return [2 /*return*/, this._serialized(signal, function () { return __awaiter(_this, void 0, void 0, function () {
                        var persistenceBinding, generation, fingerprint, offset, rows;
                        var _this = this;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, this._ensureReady(signal)];
                                case 1:
                                    _a.sent();
                                    return [4 /*yield*/, this._reconcile(signal)];
                                case 2:
                                    persistenceBinding = _a.sent();
                                    assertNotAborted(signal);
                                    generation = String(this._globalGeneration);
                                    fingerprint = (0, query_ts_1.requestFingerprint)(normalized);
                                    offset = normalized.cursor === undefined
                                        ? 0
                                        : decodeCursor(normalized.cursor, this._instance, 'sessions', fingerprint, generation);
                                    rows = this._querySessions(normalized, offset, persistenceBinding);
                                    return [2 /*return*/, page(rows, normalized.limit, function (row) { return _this._sessionHit(row); }, function (cursorOffset) { return encodeCursor({
                                            version: 1,
                                            instance: _this._instance,
                                            scope: 'sessions',
                                            fingerprint: fingerprint,
                                            generation: generation,
                                            offset: cursorOffset,
                                        }); }, offset)];
                            }
                        });
                    }); })];
            });
        });
    };
    SqliteSessionQueryEngine.prototype.searchEvents = function (request, exec) {
        return __awaiter(this, void 0, void 0, function () {
            var normalized, signal;
            var _this = this;
            return __generator(this, function (_a) {
                this._assertSearchEnabled();
                normalized = (0, query_ts_1.normalizeEventRequest)(request, this.config);
                signal = exec === null || exec === void 0 ? void 0 : exec.signal;
                return [2 /*return*/, this._serialized(signal, function () { return __awaiter(_this, void 0, void 0, function () {
                        var persistenceBinding, target, fingerprint, offset, rows;
                        var _this = this;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, this._ensureReady(signal)];
                                case 1:
                                    _a.sent();
                                    return [4 /*yield*/, this._reconcile(signal)];
                                case 2:
                                    persistenceBinding = _a.sent();
                                    assertNotAborted(signal);
                                    target = this._targetObservation(normalized.sessionId, persistenceBinding);
                                    fingerprint = (0, query_ts_1.requestFingerprint)(normalized);
                                    offset = normalized.cursor === undefined
                                        ? 0
                                        : decodeCursor(normalized.cursor, this._instance, 'events', fingerprint, target.generation);
                                    rows = this._queryEvents(normalized, offset, persistenceBinding);
                                    return [2 /*return*/, __assign({ session: target.header }, page(rows, normalized.limit, function (row) { return _this._eventHit(row); }, function (cursorOffset) { return encodeCursor({
                                            version: 1,
                                            instance: _this._instance,
                                            scope: 'events',
                                            fingerprint: fingerprint,
                                            generation: target.generation,
                                            offset: cursorOffset,
                                        }); }, offset))];
                            }
                        });
                    }); })];
            });
        });
    };
    /** Close the database after every accepted operation reaches quiescence. */
    SqliteSessionQueryEngine.prototype.close = function () {
        var _a;
        (_a = this._closePromise) !== null && _a !== void 0 ? _a : (this._closePromise = this._close());
        return this._closePromise;
    };
    /**
     * Refuse full-text calls under `openAt: 'never'` before any request
     * normalization or SQLite work, so a disabled deployment never imports
     * node:sqlite, opens the index, or observes sources.
     */
    SqliteSessionQueryEngine.prototype._assertSearchEnabled = function () {
        if (this.config.openAt !== 'never')
            return;
        throw new dsh_session_query_1.SessionQueryError('session search is disabled: this deployment configures the session-query index with openAt "never"', 'SESSION_QUERY_SEARCH_DISABLED');
    };
    SqliteSessionQueryEngine.prototype._close = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        this._closed = true;
                        return [4 /*yield*/, this._tail];
                    case 1:
                        _c.sent();
                        if (!(this._ready !== undefined)) return [3 /*break*/, 5];
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this._ready];
                    case 3:
                        _c.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _a = _c.sent();
                        return [3 /*break*/, 5];
                    case 5:
                        (_b = this._db) === null || _b === void 0 ? void 0 : _b.close();
                        this._db = undefined;
                        return [2 /*return*/];
                }
            });
        });
    };
    SqliteSessionQueryEngine.prototype._open = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, state;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this;
                        return [4 /*yield*/, (0, schema_ts_1.openSearchDatabase)(this.config.path, this.config.journalMode)];
                    case 1:
                        _a._db = _b.sent();
                        state = this._db.prepare('SELECT global_generation FROM search_state WHERE singleton = 1').get();
                        this._globalGeneration = state.global_generation;
                        this._localGeneration = state.global_generation;
                        return [2 /*return*/];
                }
            });
        });
    };
    SqliteSessionQueryEngine.prototype._ensureReady = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        (_a = this._ready) !== null && _a !== void 0 ? _a : (this._ready = this._open());
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, waitWithAbort(this._ready, signal)];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _b.sent();
                        if (isAbort(error_1))
                            throw error_1;
                        throw new dsh_session_query_1.SessionQueryError("session-search SQLite index failed to open: ".concat(errorMessage(error_1)), 'SESSION_QUERY_INDEX_FAILED', { cause: error_1 });
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    SqliteSessionQueryEngine.prototype._serialized = function (signal, operation) {
        return __awaiter(this, void 0, void 0, function () {
            var release, gate, prior, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this._isClosed())
                            throw indexClosed();
                        gate = new Promise(function (resolve) { release = resolve; });
                        prior = this._tail;
                        this._tail = prior.then(function () { return gate; });
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, waitWithAbort(prior, signal)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        release();
                        throw error_2;
                    case 4:
                        if (this._isClosed()) {
                            release();
                            throw indexClosed();
                        }
                        _a.label = 5;
                    case 5:
                        _a.trys.push([5, , 7, 8]);
                        assertNotAborted(signal);
                        return [4 /*yield*/, operation()];
                    case 6: return [2 /*return*/, _a.sent()];
                    case 7:
                        release();
                        return [7 /*endfinally*/];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    SqliteSessionQueryEngine.prototype._reconcile = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var db, persistedRows, liveRows, persistedById, liveById, observation, persistentChanges, persistentDeletes, liveChanges, liveDeletes, pointerChanged, hasWrites, nextMainGeneration, nextLocalGeneration, liveReplacements, began, _i, persistentDeletes_1, row, _a, persistentChanges_1, entry, _b, liveDeletes_1, row, _c, liveReplacements_1, _d, entry, generation, persisted;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        assertNotAborted(signal);
                        db = this._requireDb();
                        persistedRows = db.prepare('SELECT id, revision, generation FROM persisted_sessions').all();
                        liveRows = db.prepare('SELECT id, fingerprint, persisted, generation FROM temp.live_sessions').all();
                        persistedById = new Map(persistedRows.map(function (row) { return [row.id, row]; }));
                        liveById = new Map(liveRows.map(function (row) { return [row.id, row]; }));
                        return [4 /*yield*/, this._observeStable(persistedById, signal)];
                    case 1:
                        observation = _e.sent();
                        assertNotAborted(signal);
                        persistentChanges = observation.persistenceBinding.service === undefined
                            ? []
                            : __spreadArray([], observation.persisted.values(), true).filter(function (entry) { return entry.loaded !== undefined; });
                        persistentDeletes = observation.persistenceBinding.service === undefined
                            ? []
                            : persistedRows.filter(function (row) { return !observation.persisted.has(row.id); });
                        liveChanges = __spreadArray([], observation.live.values(), true).filter(function (entry) {
                            var indexed = liveById.get(entry.header.id);
                            var persisted = observation.persisted.has(entry.header.id) ? 1 : 0;
                            return (indexed === null || indexed === void 0 ? void 0 : indexed.fingerprint) !== entry.fingerprint || indexed.persisted !== persisted;
                        });
                        liveDeletes = liveRows.filter(function (row) { return !observation.live.has(row.id); });
                        pointerChanged = this._lastPersistenceIdentity !== undefined
                            && this._lastPersistenceIdentity !== observation.persistenceBinding.identity;
                        hasWrites = persistentChanges.length > 0
                            || persistentDeletes.length > 0
                            || liveChanges.length > 0
                            || liveDeletes.length > 0;
                        nextMainGeneration = this._mainGeneration();
                        nextLocalGeneration = this._localGeneration;
                        if (persistentChanges.length > 0 || persistentDeletes.length > 0)
                            nextMainGeneration += 1;
                        liveReplacements = liveChanges.map(function (entry) {
                            nextLocalGeneration = Math.max(nextLocalGeneration, nextMainGeneration) + 1;
                            return {
                                entry: entry,
                                generation: nextLocalGeneration,
                                persisted: observation.persisted.has(entry.header.id),
                            };
                        });
                        if (hasWrites) {
                            began = false;
                            try {
                                db.exec('BEGIN IMMEDIATE');
                                began = true;
                                for (_i = 0, persistentDeletes_1 = persistentDeletes; _i < persistentDeletes_1.length; _i++) {
                                    row = persistentDeletes_1[_i];
                                    this._deleteSession('persisted', row.id);
                                }
                                for (_a = 0, persistentChanges_1 = persistentChanges; _a < persistentChanges_1.length; _a++) {
                                    entry = persistentChanges_1[_a];
                                    /* v8 ignore next -- observation loads every entry whose revision differs */
                                    if (entry.loaded === undefined)
                                        throw new Error("missing loaded revision for session \"".concat(entry.header.id, "\""));
                                    this._replacePersistedSession(entry.loaded, entry.revision, nextMainGeneration);
                                }
                                if (persistentChanges.length > 0 || persistentDeletes.length > 0) {
                                    db.prepare('UPDATE search_state SET global_generation = ? WHERE singleton = 1').run(nextMainGeneration);
                                }
                                for (_b = 0, liveDeletes_1 = liveDeletes; _b < liveDeletes_1.length; _b++) {
                                    row = liveDeletes_1[_b];
                                    this._deleteSession('live', row.id);
                                }
                                for (_c = 0, liveReplacements_1 = liveReplacements; _c < liveReplacements_1.length; _c++) {
                                    _d = liveReplacements_1[_c], entry = _d.entry, generation = _d.generation, persisted = _d.persisted;
                                    this._replaceLiveSession(entry, generation, persisted);
                                }
                                db.exec('COMMIT');
                            }
                            catch (error) {
                                /* v8 ignore next -- a BEGIN failure has no transaction to roll back; the common wrapper still reports it. */
                                if (began) {
                                    /* v8 ignore next 5 -- ROLLBACK failure requires a SQLite double fault; the original failure remains actionable. */
                                    try {
                                        db.exec('ROLLBACK');
                                    }
                                    catch (_f) {
                                        // The original SQLite failure remains the actionable cause.
                                    }
                                }
                                throw new dsh_session_query_1.SessionQueryError("session-search reconciliation failed: ".concat(errorMessage(error)), 'SESSION_QUERY_INDEX_FAILED', { cause: error });
                            }
                        }
                        if (hasWrites || pointerChanged)
                            this._globalGeneration += 1;
                        if (pointerChanged)
                            this._persistenceEpoch += 1;
                        this._localGeneration = nextLocalGeneration;
                        this._lastPersistenceIdentity = observation.persistenceBinding.identity;
                        return [2 /*return*/, observation.persistenceBinding];
                }
            });
        });
    };
    SqliteSessionQueryEngine.prototype._observeStable = function (indexed, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var attempt, persistenceBinding, persistence, initiallyLive, persisted, canReuseIndexed, before, _i, _a, entry, loaded, afterSnapshots, after, error_3, live, _b, _c, session, observed, durable;
            var _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        attempt = 0;
                        _e.label = 1;
                    case 1:
                        if (!(attempt < STABLE_OBSERVATION_ATTEMPTS)) return [3 /*break*/, 12];
                        assertNotAborted(signal);
                        persistenceBinding = this._persistenceBinding;
                        persistence = persistenceBinding.service;
                        initiallyLive = new Set(this.ctx.sessions.list().map(function (session) { return session.id; }));
                        persisted = new Map();
                        if (!(persistence !== undefined)) return [3 /*break*/, 10];
                        _e.label = 2;
                    case 2:
                        _e.trys.push([2, 9, , 10]);
                        canReuseIndexed = this._lastPersistenceIdentity === undefined
                            || this._lastPersistenceIdentity === persistenceBinding.identity;
                        return [4 /*yield*/, persistence.listSnapshots(signal)];
                    case 3:
                        before = _e.sent();
                        assertNotAborted(signal);
                        persisted = materializePersistenceSnapshots(before);
                        _i = 0, _a = persisted.values();
                        _e.label = 4;
                    case 4:
                        if (!(_i < _a.length)) return [3 /*break*/, 7];
                        entry = _a[_i];
                        if (canReuseIndexed && ((_d = indexed.get(entry.header.id)) === null || _d === void 0 ? void 0 : _d.revision) === entry.revision)
                            return [3 /*break*/, 6];
                        // Skip work already shadowed by a live owner. `inspect()` is
                        // non-mutating, so an owner attaching after this check cannot cause
                        // crash-repair side effects; the live-membership retry below makes
                        // the returned observation live-preferred.
                        if (initiallyLive.has(entry.header.id) || this.ctx.sessions.get(entry.header.id) !== undefined)
                            return [3 /*break*/, 6];
                        assertNotAborted(signal);
                        return [4 /*yield*/, persistence.inspect(entry.header.id, signal)];
                    case 5:
                        loaded = _e.sent();
                        assertNotAborted(signal);
                        (0, dsh_session_query_1.assertSessionHeadersCompatible)(entry.header, loaded.meta);
                        entry.loaded = observeSession(loaded.meta, loaded.events);
                        _e.label = 6;
                    case 6:
                        _i++;
                        return [3 /*break*/, 4];
                    case 7:
                        assertNotAborted(signal);
                        return [4 /*yield*/, persistence.listSnapshots(signal)];
                    case 8:
                        afterSnapshots = _e.sent();
                        assertNotAborted(signal);
                        after = materializePersistenceSnapshots(afterSnapshots);
                        if (!samePersistenceSnapshots(persisted, after))
                            return [3 /*break*/, 11];
                        if (this._persistenceBinding !== persistenceBinding)
                            return [3 /*break*/, 11];
                        return [3 /*break*/, 10];
                    case 9:
                        error_3 = _e.sent();
                        if (isAbort(error_3) || (signal === null || signal === void 0 ? void 0 : signal.aborted)) {
                            throw new dsh_session_query_1.SessionQueryError('session-search aborted', 'SESSION_QUERY_ABORTED', {
                                cause: error_3,
                            });
                        }
                        if (this._persistenceBinding !== persistenceBinding)
                            return [3 /*break*/, 11];
                        if (error_3 instanceof dsh_session_query_1.SessionQueryError)
                            throw error_3;
                        throw new dsh_session_query_1.SessionQueryError("session-search persistence observation failed: ".concat(errorMessage(error_3)), 'SESSION_QUERY_PERSISTENCE_FAILED', { cause: error_3 });
                    case 10:
                        live = new Map();
                        for (_b = 0, _c = this.ctx.sessions.list(); _b < _c.length; _b++) {
                            session = _c[_b];
                            observed = observeLive(session);
                            durable = persisted.get(session.id);
                            if (durable !== undefined)
                                (0, dsh_session_query_1.assertSessionHeadersCompatible)(observed.header, durable.header);
                            live.set(session.id, observed);
                        }
                        if (!sameSessionIds(initiallyLive, live))
                            return [3 /*break*/, 11];
                        return [2 /*return*/, { persistenceBinding: persistenceBinding, persisted: persisted, live: live }];
                    case 11:
                        attempt += 1;
                        return [3 /*break*/, 1];
                    case 12: throw new dsh_session_query_1.SessionQueryError('session-search persistence observation did not stabilize after one retry', 'SESSION_QUERY_PERSISTENCE_FAILED');
                }
            });
        });
    };
    SqliteSessionQueryEngine.prototype._mainGeneration = function () {
        var row = this._requireDb().prepare('SELECT global_generation FROM search_state WHERE singleton = 1').get();
        return row.global_generation;
    };
    SqliteSessionQueryEngine.prototype._deleteSession = function (source, id) {
        var db = this._requireDb();
        if (source === 'persisted') {
            db.prepare('DELETE FROM persisted_docs WHERE session_id = ?').run(id);
            db.prepare('DELETE FROM persisted_sessions WHERE id = ?').run(id);
        }
        else {
            db.prepare('DELETE FROM temp.live_docs WHERE session_id = ?').run(id);
            db.prepare('DELETE FROM temp.live_sessions WHERE id = ?').run(id);
        }
    };
    SqliteSessionQueryEngine.prototype._replacePersistedSession = function (entry, revision, generation) {
        var _a;
        this._deleteSession('persisted', entry.header.id);
        var db = this._requireDb();
        (_a = db.prepare("\n      INSERT INTO persisted_sessions\n        (id, version, created_at, cwd, parent_session, seed_length, delegation_depth, agent_preset, revision, generation)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n    ")).run.apply(_a, __spreadArray(__spreadArray([], headerBindings(entry.header), false), [revision,
            generation], false));
        var insert = db.prepare("\n      INSERT INTO persisted_docs (text, session_id, seq, type, time, surface, codepoint_length)\n      VALUES (?, ?, ?, ?, ?, ?, ?)\n    ");
        for (var _i = 0, _b = entry.documents; _i < _b.length; _i++) {
            var document_1 = _b[_i];
            var text = (0, query_ts_1.sanitizeFtsText)(document_1.text);
            insert.run(text, document_1.sessionId, document_1.seq, document_1.type, document_1.time, document_1.surface, Array.from(text).length);
        }
    };
    SqliteSessionQueryEngine.prototype._replaceLiveSession = function (entry, generation, persisted) {
        var _a;
        this._deleteSession('live', entry.header.id);
        var db = this._requireDb();
        (_a = db.prepare("\n      INSERT INTO temp.live_sessions\n        (id, version, created_at, cwd, parent_session, seed_length, delegation_depth, agent_preset, fingerprint, persisted, generation)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n    ")).run.apply(_a, __spreadArray(__spreadArray([], headerBindings(entry.header), false), [entry.fingerprint,
            persisted ? 1 : 0,
            generation], false));
        var insert = db.prepare("\n      INSERT INTO temp.live_docs (text, session_id, seq, type, time, surface, codepoint_length)\n      VALUES (?, ?, ?, ?, ?, ?, ?)\n    ");
        for (var _i = 0, _b = entry.documents; _i < _b.length; _i++) {
            var document_2 = _b[_i];
            var text = (0, query_ts_1.sanitizeFtsText)(document_2.text);
            insert.run(text, document_2.sessionId, document_2.seq, document_2.type, document_2.time, document_2.surface, Array.from(text).length);
        }
    };
    SqliteSessionQueryEngine.prototype._querySessions = function (request, offset, persistenceBinding) {
        var _a;
        var useFts = queryCanUseTrigram(request.query);
        var selected = selectedDocumentsSql(useFts);
        var sessionWhere = (0, query_ts_1.buildSessionWhere)(request.sessionFilters);
        var eventWhere = (0, query_ts_1.buildEventWhere)(request.eventFilters);
        (0, query_ts_1.assertFts5OuterPredicateCount)(sessionWhere.predicateCount + eventWhere.predicateCount);
        var where = [sessionWhere.sql, eventWhere.sql].filter(Boolean).join(' AND ');
        var bindings = __spreadArray(__spreadArray(__spreadArray(__spreadArray([], selectedDocumentsParams(request.query, persistenceBinding.service !== undefined, useFts), true), sessionWhere.params, true), eventWhere.params, true), [
            request.limit + 1,
            offset,
        ], false);
        (0, query_ts_1.assertPortableBindingCount)(bindings.length);
        // The browser fixture mirrors these rank keys in
        // `packages/client/connection/src/client/fixture.ts`; update both together.
        return (_a = this._requireDb().prepare("\n      ".concat(selected.sql, ",\n      filtered AS (\n        SELECT * FROM matched ").concat(where.length === 0 ? '' : "WHERE ".concat(where), "\n      ),\n      ranked AS (\n        SELECT *, ROW_NUMBER() OVER (\n          PARTITION BY session_id\n          ORDER BY match_count DESC, document_length ASC, time DESC, seq DESC\n        ) AS event_rank\n        FROM filtered\n      )\n      SELECT * FROM ranked\n      WHERE event_rank = 1\n      ORDER BY match_count DESC, document_length ASC, time DESC, session_id ASC, seq DESC\n      LIMIT ? OFFSET ?\n    "))).all.apply(_a, bindings);
    };
    SqliteSessionQueryEngine.prototype._queryEvents = function (request, offset, persistenceBinding) {
        var _a;
        var useFts = queryCanUseTrigram(request.query);
        var selected = selectedDocumentsSql(useFts);
        var eventWhere = (0, query_ts_1.buildEventWhere)(request.filters);
        (0, query_ts_1.assertFts5OuterPredicateCount)(1 + eventWhere.predicateCount);
        var where = ['session_id = ?', eventWhere.sql].filter(Boolean).join(' AND ');
        var bindings = __spreadArray(__spreadArray(__spreadArray(__spreadArray([], selectedDocumentsParams(request.query, persistenceBinding.service !== undefined, useFts), true), [
            request.sessionId
        ], false), eventWhere.params, true), [
            request.limit + 1,
            offset,
        ], false);
        (0, query_ts_1.assertPortableBindingCount)(bindings.length);
        return (_a = this._requireDb().prepare("\n      ".concat(selected.sql, "\n      SELECT * FROM matched\n      WHERE ").concat(where, "\n      ORDER BY match_count DESC, document_length ASC, time DESC, seq DESC\n      LIMIT ? OFFSET ?\n    "))).all.apply(_a, bindings);
    };
    SqliteSessionQueryEngine.prototype._targetObservation = function (sessionId, persistenceBinding) {
        var db = this._requireDb();
        var live = db.prepare("SELECT\n        id AS session_id, version, created_at, cwd, parent_session, seed_length, delegation_depth, agent_preset, generation\n      FROM temp.live_sessions\n      WHERE id = ?").get(sessionId);
        if (live !== undefined) {
            return { header: rowHeader(live), generation: "live:".concat(live.generation) };
        }
        if (persistenceBinding.service !== undefined) {
            var persisted = db.prepare("SELECT\n          id AS session_id, version, created_at, cwd, parent_session, seed_length, delegation_depth, agent_preset, generation\n        FROM persisted_sessions\n        WHERE id = ?").get(sessionId);
            if (persisted !== undefined) {
                return {
                    header: rowHeader(persisted),
                    generation: "persisted:".concat(this._persistenceEpoch, ":").concat(persisted.generation),
                };
            }
        }
        throw new dsh_session_query_1.SessionQueryError("session \"".concat(sessionId, "\" not found"), 'SESSION_QUERY_SESSION_NOT_FOUND');
    };
    SqliteSessionQueryEngine.prototype._sessionHit = function (row) {
        return {
            header: rowHeader(row),
            live: row.live === 1,
            persisted: row.persisted === 1,
            bestMatch: this._eventHit(row),
        };
    };
    SqliteSessionQueryEngine.prototype._eventHit = function (row) {
        return {
            sessionId: row.session_id,
            seq: row.seq,
            type: row.type,
            time: row.time,
            surface: row.surface,
            snippet: (0, query_ts_1.makeSnippet)(row.marked_text, this.config.snippetChars),
        };
    };
    SqliteSessionQueryEngine.prototype._requireDb = function () {
        /* v8 ignore next -- callers await `_ready`; this guards lifecycle misuse */
        if (this._db === undefined)
            throw indexClosed();
        return this._db;
    };
    SqliteSessionQueryEngine.prototype._isClosed = function () {
        return this._closed;
    };
    SqliteSessionQueryEngine.inject = ['sessions'];
    SqliteSessionQueryEngine.Config = schemastery_1.default.object({
        path: schemastery_1.default.string().required(),
        openAt: schemastery_1.default.union(['startup', 'first-search', 'never']).default('startup'),
        journalMode: schemastery_1.default.union(['wal', 'delete', 'truncate', 'persist']).default('wal'),
        defaultLimit: schemastery_1.default.number().step(1).min(1).max(query_ts_1.SQLITE_MAX_PAGE_LIMIT).default(exports.SESSION_QUERY_SQLITE_DEFAULT_LIMIT),
        maxLimit: schemastery_1.default.number().step(1).min(1).max(query_ts_1.SQLITE_MAX_PAGE_LIMIT).default(exports.SESSION_QUERY_SQLITE_MAX_LIMIT),
        snippetChars: schemastery_1.default.number().step(1).min(1).default(exports.SESSION_QUERY_SQLITE_SNIPPET_CHARS),
        readWindowMax: schemastery_1.default.number().step(1).min(0).default(dsh_session_query_1.SESSION_QUERY_READ_WINDOW_MAX),
        persistedInspectConcurrency: schemastery_1.default.number()
            .step(1)
            .min(1)
            .max(Number.MAX_SAFE_INTEGER)
            .default(dsh_session_query_1.SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY),
    });
    return SqliteSessionQueryEngine;
}(dsh_session_query_1.default));
exports.SqliteSessionQueryEngine = SqliteSessionQueryEngine;
/**
 * The header columns both session upserts bind, in the order their INSERT
 * lists them. The two statements differ only in what they append after these.
 * @param header - the session header being written.
 * @returns one bound value per header column.
 */
function headerBindings(header) {
    var _a, _b, _c, _d, _e;
    return [
        header.id,
        header.version,
        header.createdAt,
        (_a = header.cwd) !== null && _a !== void 0 ? _a : null,
        (_b = header.parentSession) !== null && _b !== void 0 ? _b : null,
        (_c = header.seedLength) !== null && _c !== void 0 ? _c : null,
        (_d = header.delegationDepth) !== null && _d !== void 0 ? _d : null,
        (_e = header.agentPreset) !== null && _e !== void 0 ? _e : null,
    ];
}
function selectedDocumentsSql(useFts) {
    var persistedSearch = useFts
        ? 'persisted_docs MATCH ?'
        : "pd.text LIKE ? ESCAPE '\\'";
    var liveSearch = useFts
        ? 'live_docs MATCH ?'
        : "ld.text LIKE ? ESCAPE '\\'";
    return {
        sql: "WITH candidates AS (\n      SELECT\n        pd.session_id AS session_id,\n        ps.version AS version,\n        ps.created_at AS created_at,\n        ps.cwd AS cwd,\n        ps.parent_session AS parent_session,\n        ps.seed_length AS seed_length,\n        ps.delegation_depth AS delegation_depth,\n        ps.agent_preset AS agent_preset,\n        0 AS live,\n        1 AS persisted,\n        CAST(pd.seq AS INTEGER) AS seq,\n        pd.type AS type,\n        CAST(pd.time AS INTEGER) AS time,\n        pd.surface AS surface,\n        highlight(persisted_docs, 0, ?, ?) AS marked_text,\n        CAST(pd.codepoint_length AS INTEGER) AS document_length\n      FROM persisted_docs AS pd\n      JOIN persisted_sessions AS ps ON ps.id = pd.session_id\n      WHERE ".concat(persistedSearch, "\n        AND ? = 1\n        AND NOT EXISTS (SELECT 1 FROM temp.live_sessions AS ls WHERE ls.id = pd.session_id)\n      UNION ALL\n      SELECT\n        ld.session_id AS session_id,\n        ls.version AS version,\n        ls.created_at AS created_at,\n        ls.cwd AS cwd,\n        ls.parent_session AS parent_session,\n        ls.seed_length AS seed_length,\n        ls.delegation_depth AS delegation_depth,\n        ls.agent_preset AS agent_preset,\n        1 AS live,\n        CASE WHEN ? = 1 THEN ls.persisted ELSE 0 END AS persisted,\n        CAST(ld.seq AS INTEGER) AS seq,\n        ld.type AS type,\n        CAST(ld.time AS INTEGER) AS time,\n        ld.surface AS surface,\n        highlight(live_docs, 0, ?, ?) AS marked_text,\n        CAST(ld.codepoint_length AS INTEGER) AS document_length\n      FROM temp.live_docs AS ld\n      JOIN temp.live_sessions AS ls ON ls.id = ld.session_id\n      WHERE ").concat(liveSearch, "\n    ), matched AS (\n      SELECT *,\n        (\n          length(CAST(marked_text AS BLOB))\n          - length(CAST(replace(marked_text, ?, '') AS BLOB))\n        ) / ? AS match_count\n      FROM candidates\n    )"),
    };
}
function selectedDocumentsParams(query, persistenceVisible, useFts) {
    var expression = useFts ? (0, query_ts_1.quoteFtsData)(query) : likePattern(query);
    var visible = persistenceVisible ? 1 : 0;
    return [
        query_ts_1.FTS_HIGHLIGHT_START,
        query_ts_1.FTS_HIGHLIGHT_END,
        expression,
        visible,
        visible,
        query_ts_1.FTS_HIGHLIGHT_START,
        query_ts_1.FTS_HIGHLIGHT_END,
        expression,
        query_ts_1.FTS_HIGHLIGHT_START,
        Buffer.byteLength(query_ts_1.FTS_HIGHLIGHT_START, 'utf8'),
    ];
}
function queryCanUseTrigram(query) {
    return Array.from(query).length >= 3;
}
function likePattern(query) {
    return "%".concat(query.replace(/[\\%_]/gu, '\\$&'), "%");
}
function observeLive(session) {
    return observeSession(session.header, session.events);
}
function observeSession(header, events) {
    var detachedHeader = structuredClone(header);
    var detachedEvents = events.map(function (event) { return structuredClone(event); });
    return {
        header: detachedHeader,
        documents: (0, dsh_session_query_1.buildSessionEventSearchDocuments)(detachedHeader.id, detachedEvents),
        fingerprint: (0, node_crypto_1.createHash)('sha256')
            .update(JSON.stringify({ header: detachedHeader, events: detachedEvents }))
            .digest('base64url'),
    };
}
function materializePersistenceSnapshots(snapshots) {
    if (!isRuntimeArray(snapshots))
        throw new Error('persistence snapshots must be an array');
    var result = new Map();
    for (var _i = 0, snapshots_1 = snapshots; _i < snapshots_1.length; _i++) {
        var snapshot = snapshots_1[_i];
        if (typeof snapshot.revision !== 'string') {
            throw new Error('persistence snapshot revision must be a string');
        }
        var header = structuredClone(snapshot.header);
        if (result.has(header.id)) {
            throw new Error("persistence listed duplicate session \"".concat(header.id, "\""));
        }
        result.set(header.id, { header: header, revision: snapshot.revision });
    }
    return result;
}
function samePersistenceSnapshots(before, after) {
    if (before.size !== after.size)
        return false;
    for (var _i = 0, before_1 = before; _i < before_1.length; _i++) {
        var _a = before_1[_i], id = _a[0], first = _a[1];
        var second = after.get(id);
        if (second === undefined
            || first.revision !== second.revision
            || !sameHeader(first.header, second.header))
            return false;
    }
    return true;
}
function sameSessionIds(before, after) {
    if (before.size !== after.size)
        return false;
    for (var _i = 0, before_2 = before; _i < before_2.length; _i++) {
        var id = before_2[_i];
        if (!after.has(id))
            return false;
    }
    return true;
}
function sameHeader(a, b) {
    var _a, _b;
    return a.version === b.version
        && a.id === b.id
        && a.createdAt === b.createdAt
        && a.cwd === b.cwd
        && a.parentSession === b.parentSession
        && a.seedLength === b.seedLength
        && ((_a = a.delegationDepth) !== null && _a !== void 0 ? _a : 0) === ((_b = b.delegationDepth) !== null && _b !== void 0 ? _b : 0)
        && a.agentPreset === b.agentPreset;
}
function rowHeader(row) {
    return __assign(__assign(__assign(__assign(__assign({ version: row.version, id: row.session_id, createdAt: row.created_at }, row.cwd === null ? {} : { cwd: row.cwd }), row.parent_session === null ? {} : { parentSession: row.parent_session }), row.seed_length === null ? {} : { seedLength: row.seed_length }), row.delegation_depth === null ? {} : { delegationDepth: row.delegation_depth }), row.agent_preset === null ? {} : { agentPreset: row.agent_preset });
}
function page(rows, limit, convert, nextCursor, offset) {
    var hasMore = rows.length > limit;
    return __assign({ items: rows.slice(0, limit).map(convert) }, hasMore ? { nextCursor: nextCursor(offset + limit) } : {});
}
function encodeCursor(payload) {
    return (0, dsh_session_query_1.SessionSearchCursor)(Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url'));
}
function decodeCursor(cursor, instance, scope, fingerprint, generation) {
    var decoded;
    try {
        decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    }
    catch (error) {
        throw invalidCursor(error);
    }
    if (decoded.version !== 1
        || decoded.instance !== instance
        || decoded.scope !== scope
        || decoded.fingerprint !== fingerprint
        || !Number.isSafeInteger(decoded.offset)
        || decoded.offset === undefined
        || decoded.offset < 0) {
        throw invalidCursor(new Error('cursor does not belong to this normalized request'));
    }
    if (decoded.generation !== generation) {
        throw new dsh_session_query_1.SessionQueryError('session-search cursor is stale because its relevant corpus changed', 'SESSION_QUERY_STALE_CURSOR');
    }
    return decoded.offset;
}
function invalidCursor(cause) {
    return new dsh_session_query_1.SessionQueryError('session-search cursor is invalid', 'SESSION_QUERY_INVALID_CURSOR', { cause: cause });
}
function resolveConfig(config) {
    var _a, _b, _c, _d, _e, _f, _g;
    var resolved = {
        path: config.path,
        openAt: (_a = config.openAt) !== null && _a !== void 0 ? _a : 'startup',
        journalMode: (_b = config.journalMode) !== null && _b !== void 0 ? _b : 'wal',
        defaultLimit: (_c = config.defaultLimit) !== null && _c !== void 0 ? _c : exports.SESSION_QUERY_SQLITE_DEFAULT_LIMIT,
        maxLimit: (_d = config.maxLimit) !== null && _d !== void 0 ? _d : exports.SESSION_QUERY_SQLITE_MAX_LIMIT,
        snippetChars: (_e = config.snippetChars) !== null && _e !== void 0 ? _e : exports.SESSION_QUERY_SQLITE_SNIPPET_CHARS,
        readWindowMax: (_f = config.readWindowMax) !== null && _f !== void 0 ? _f : dsh_session_query_1.SESSION_QUERY_READ_WINDOW_MAX,
        persistedInspectConcurrency: (_g = config.persistedInspectConcurrency) !== null && _g !== void 0 ? _g : dsh_session_query_1.SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY,
    };
    if (typeof resolved.path !== 'string' || resolved.path.trim().length === 0) {
        throw invalidConfig('path must not be blank');
    }
    var openPhases = ['startup', 'first-search', 'never'];
    if (!openPhases.includes(resolved.openAt))
        throw invalidConfig('openAt is not supported');
    assertPageLimit('defaultLimit', resolved.defaultLimit);
    assertPageLimit('maxLimit', resolved.maxLimit);
    assertPositiveInteger('snippetChars', resolved.snippetChars);
    if (!Number.isInteger(resolved.readWindowMax) || resolved.readWindowMax < 0) {
        throw invalidConfig('readWindowMax must be a non-negative integer');
    }
    if (!Number.isSafeInteger(resolved.persistedInspectConcurrency)
        || resolved.persistedInspectConcurrency < 1) {
        throw invalidConfig('persistedInspectConcurrency must be a positive safe integer');
    }
    if (resolved.defaultLimit > resolved.maxLimit) {
        throw invalidConfig('defaultLimit must be less than or equal to maxLimit');
    }
    var journalModes = ['wal', 'delete', 'truncate', 'persist'];
    if (!journalModes.includes(resolved.journalMode))
        throw invalidConfig('journalMode is not supported');
    return resolved;
}
function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value < 1)
        throw invalidConfig("".concat(name, " must be a positive integer"));
}
function assertPageLimit(name, value) {
    if (!Number.isSafeInteger(value) || value < 1 || value > query_ts_1.SQLITE_MAX_PAGE_LIMIT) {
        throw invalidConfig("".concat(name, " must be an integer between 1 and ").concat(query_ts_1.SQLITE_MAX_PAGE_LIMIT));
    }
}
function invalidConfig(detail) {
    return new dsh_session_query_1.SessionQueryError("session-search SQLite config: ".concat(detail), 'SESSION_QUERY_INVALID_CONFIG');
}
function indexClosed() {
    return new dsh_session_query_1.SessionQueryError('session-search SQLite index is closed', 'SESSION_QUERY_INDEX_FAILED');
}
function assertNotAborted(signal) {
    if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
        throw new dsh_session_query_1.SessionQueryError('session-search aborted', 'SESSION_QUERY_ABORTED');
    }
}
function waitWithAbort(promise, signal) {
    if (signal === undefined)
        return promise;
    if (signal.aborted)
        return Promise.reject(new dsh_session_query_1.SessionQueryError('session-search aborted', 'SESSION_QUERY_ABORTED'));
    return new Promise(function (resolve, reject) {
        var onAbort = function () {
            reject(new dsh_session_query_1.SessionQueryError('session-search aborted', 'SESSION_QUERY_ABORTED'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(function (value) {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, function (error) {
            signal.removeEventListener('abort', onAbort);
            reject(asError(error));
        });
    });
}
function isAbort(error) {
    return error instanceof dsh_session_query_1.SessionQueryError && error.code === 'SESSION_QUERY_ABORTED';
}
function asError(error) {
    return error instanceof Error
        ? error
        : new Error('session-search dependency rejected with a non-Error value', { cause: error });
}
function errorMessage(error) {
    return error instanceof Error ? error.message : 'unknown error';
}
function isRuntimeArray(value) {
    return Array.isArray(value);
}
exports.default = SqliteSessionQueryEngine;
