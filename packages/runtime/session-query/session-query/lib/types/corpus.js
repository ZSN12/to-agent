"use strict";
/** Live/persisted logical-corpus resolution for session-query. */
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
exports.SessionCorpus = void 0;
var config_ts_1 = require("./config.ts");
var sources_ts_1 = require("./sources.ts");
/** Resolves a live-preferred corpus against the persistence service mounted now. */
var SessionCorpus = /** @class */ (function () {
    function SessionCorpus(_ctx, _persistedInspectConcurrency) {
        var _this = this;
        this._ctx = _ctx;
        this._persistedInspectConcurrency = _persistedInspectConcurrency;
        this._optionalPersistenceFiber = _ctx.inject(['sessionPersistence'], function (childCtx) {
            var service = childCtx.sessionPersistence;
            _this._persistence = service;
            childCtx.effect(function () { return function () {
                /* v8 ignore next -- a stale optional-service disposer cannot clear a replacement */
                if (_this._persistence === service)
                    _this._persistence = undefined;
            }; }, 'sessionQuery.persistenceBinding');
        });
        _ctx.effect(function () {
            return function () { return _this._optionalPersistenceFiber.dispose(); };
        }, 'sessionQuery.optionalPersistence');
    }
    /**
     * List the complete logical corpus with live precedence and cloned headers.
     * @param signal - optional cancellation for persistence listing.
     * @returns records in deterministic newest-first order.
     */
    SessionCorpus.prototype.listSessions = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var persistence, persisted, _a, records, _i, persisted_1, header, _b, _c, session, durable;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        persistence = this._persistence;
                        if (!(persistence === undefined)) return [3 /*break*/, 1];
                        _a = [];
                        return [3 /*break*/, 3];
                    case 1: return [4 /*yield*/, listPersisted(persistence, signal)];
                    case 2:
                        _a = _d.sent();
                        _d.label = 3;
                    case 3:
                        persisted = _a;
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        records = new Map();
                        for (_i = 0, persisted_1 = persisted; _i < persisted_1.length; _i++) {
                            header = persisted_1[_i];
                            records.set(header.id, { header: structuredClone(header), live: false, persisted: true });
                        }
                        for (_b = 0, _c = this._ctx.sessions.list(); _b < _c.length; _b++) {
                            session = _c[_b];
                            durable = records.get(session.id);
                            if (durable !== undefined)
                                (0, sources_ts_1.assertSessionHeadersCompatible)(session.header, durable.header);
                            records.set(session.id, {
                                header: structuredClone(session.header),
                                live: true,
                                persisted: durable !== undefined,
                            });
                        }
                        return [2 /*return*/, __spreadArray([], records.values(), true).sort(compareSessions)];
                }
            });
        });
    };
    /**
     * Load one logical source, preferring a detached live snapshot.
     *
     * A known live target never consults persistence, so an optional backend's
     * failure cannot make current in-memory history unreadable.
     * @param sessionId - session to resolve.
     * @param signal - optional cancellation for persisted source resolution.
     * @returns detached live-preferred header and events.
     */
    SessionCorpus.prototype.load = function (sessionId, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var live, snapshot_1, persistence, listed, loaded, attached, snapshot_2, snapshot;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        live = this._ctx.sessions.get(sessionId);
                        if (live !== undefined) {
                            snapshot_1 = snapshotLive(live);
                            signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                            return [2 /*return*/, snapshot_1];
                        }
                        persistence = this._persistence;
                        if (persistence === undefined)
                            throw notFound(sessionId);
                        return [4 /*yield*/, listPersisted(persistence, signal)];
                    case 1:
                        listed = (_a.sent()).find(function (header) { return header.id === sessionId; });
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (listed === undefined)
                            throw notFound(sessionId);
                        return [4 /*yield*/, inspectPersisted(persistence, sessionId, signal)];
                    case 2:
                        loaded = _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        attached = this._ctx.sessions.get(sessionId);
                        if (attached !== undefined) {
                            snapshot_2 = snapshotLive(attached);
                            signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                            return [2 /*return*/, snapshot_2];
                        }
                        (0, sources_ts_1.assertSessionHeadersCompatible)(loaded.meta, listed);
                        snapshot = {
                            header: structuredClone(loaded.meta),
                            events: loaded.events.map(function (event) { return structuredClone(event); }),
                        };
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, snapshot];
                }
            });
        });
    };
    /**
     * Project unique logical sources immediately from one persistence listing.
     *
     * The synchronous projector runs before a persisted worker claims its next id.
     * Full logs are borrowed only for that call and never retained by the batch.
     * @param sessionIds - sessions to resolve in first-occurrence order.
     * @param project - synchronous fold that owns/clones every retained value.
     * @param signal - cancellation shared by listing and every persisted inspection.
     * @returns one fulfilled or rejected projected result per unique requested id.
     */
    SessionCorpus.prototype.projectMany = function (sessionIds, project, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var ids, resolved, unresolved, _i, ids_1, id, session, persistence, _a, unresolved_1, sessionId, persisted, error_1, _b, unresolved_2, sessionId, persistedById, resolvePersisted, cursor, worker, workerCount, settlements, _c, settlements_1, settlement, reason;
            var _this = this;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        ids = __spreadArray([], new Set(sessionIds), true);
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        resolved = new Map();
                        unresolved = [];
                        for (_i = 0, ids_1 = ids; _i < ids_1.length; _i++) {
                            id = ids_1[_i];
                            session = this._ctx.sessions.get(id);
                            if (session === undefined) {
                                unresolved.push(id);
                            }
                            else {
                                resolved.set(id, projectSource(id, sourceLive(session), project, signal));
                            }
                        }
                        if (unresolved.length === 0)
                            return [2 /*return*/, orderedResults(ids, resolved)];
                        persistence = this._persistence;
                        if (persistence === undefined) {
                            for (_a = 0, unresolved_1 = unresolved; _a < unresolved_1.length; _a++) {
                                sessionId = unresolved_1[_a];
                                resolved.set(sessionId, { sessionId: sessionId, status: 'rejected', reason: notFound(sessionId) });
                            }
                            return [2 /*return*/, orderedResults(ids, resolved)];
                        }
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, listPersisted(persistence, signal)];
                    case 2:
                        persisted = _d.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _d.sent();
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            signal.throwIfAborted();
                        for (_b = 0, unresolved_2 = unresolved; _b < unresolved_2.length; _b++) {
                            sessionId = unresolved_2[_b];
                            resolved.set(sessionId, { sessionId: sessionId, status: 'rejected', reason: error_1 });
                        }
                        return [2 /*return*/, orderedResults(ids, resolved)];
                    case 4:
                        persistedById = new Map(persisted.map(function (header) { return [header.id, header]; }));
                        resolvePersisted = function (sessionId) { return __awaiter(_this, void 0, void 0, function () {
                            var listed, attached, loaded, attached, error_2;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        listed = persistedById.get(sessionId);
                                        if (listed === undefined) {
                                            attached = this._ctx.sessions.get(sessionId);
                                            resolved.set(sessionId, attached === undefined
                                                ? { sessionId: sessionId, status: 'rejected', reason: notFound(sessionId) }
                                                : projectSource(sessionId, sourceLive(attached), project, signal));
                                            return [2 /*return*/];
                                        }
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 3, , 4]);
                                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                                        return [4 /*yield*/, inspectPersisted(persistence, sessionId, signal)];
                                    case 2:
                                        loaded = _a.sent();
                                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                                        attached = this._ctx.sessions.get(sessionId);
                                        if (attached !== undefined) {
                                            resolved.set(sessionId, projectSource(sessionId, sourceLive(attached), project, signal));
                                            return [2 /*return*/];
                                        }
                                        (0, sources_ts_1.assertSessionHeadersCompatible)(loaded.meta, listed);
                                        resolved.set(sessionId, projectSource(sessionId, {
                                            header: loaded.meta,
                                            events: loaded.events,
                                        }, project, signal));
                                        return [3 /*break*/, 4];
                                    case 3:
                                        error_2 = _a.sent();
                                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                                            signal.throwIfAborted();
                                        resolved.set(sessionId, { sessionId: sessionId, status: 'rejected', reason: error_2 });
                                        return [3 /*break*/, 4];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); };
                        cursor = 0;
                        worker = function () { return __awaiter(_this, void 0, void 0, function () {
                            var index;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                                        index = cursor;
                                        if (index >= unresolved.length)
                                            return [2 /*return*/];
                                        cursor += 1;
                                        return [4 /*yield*/, resolvePersisted(unresolved[index])];
                                    case 1:
                                        _a.sent();
                                        _a.label = 2;
                                    case 2: return [3 /*break*/, 0];
                                    case 3: return [2 /*return*/];
                                }
                            });
                        }); };
                        workerCount = Math.min(this._persistedInspectConcurrency, unresolved.length);
                        return [4 /*yield*/, Promise.allSettled(Array.from({ length: workerCount }, function () { return worker(); }))];
                    case 5:
                        settlements = _d.sent();
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            signal.throwIfAborted();
                        /* v8 ignore start -- per-id failures settle inside resolvePersisted; workers reject only on abort above */
                        for (_c = 0, settlements_1 = settlements; _c < settlements_1.length; _c++) {
                            settlement = settlements_1[_c];
                            if (settlement.status === 'rejected') {
                                reason = settlement.reason;
                                throw reason;
                            }
                        }
                        /* v8 ignore stop */
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, orderedResults(ids, resolved)];
                }
            });
        });
    };
    return SessionCorpus;
}());
exports.SessionCorpus = SessionCorpus;
function projectSource(sessionId, source, project, signal) {
    try {
        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
        var value = project(source);
        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
        return { sessionId: sessionId, status: 'fulfilled', value: value };
    }
    catch (reason) {
        /* v8 ignore next -- the synchronous projector has no external cancellation yield */
        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
            signal.throwIfAborted();
        return { sessionId: sessionId, status: 'rejected', reason: reason };
    }
}
function sourceLive(session) {
    return { header: session.header, events: session.events };
}
function orderedResults(ids, resolved) {
    return ids.map(function (sessionId) { return resolved.get(sessionId); });
}
function listPersisted(persistence, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, persistence.list(signal)];
                case 1: return [2 /*return*/, _a.sent()];
                case 2:
                    error_3 = _a.sent();
                    if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                        signal.throwIfAborted();
                    throw new config_ts_1.SessionQueryError("session persistence listing failed: ".concat(errorMessage(error_3)), 'SESSION_QUERY_PERSISTENCE_FAILED', { cause: error_3 });
                case 3: return [2 /*return*/];
            }
        });
    });
}
function inspectPersisted(persistence, sessionId, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, persistence.inspect(sessionId, signal)];
                case 1: return [2 /*return*/, _a.sent()];
                case 2:
                    error_4 = _a.sent();
                    if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                        signal.throwIfAborted();
                    if (error_4 instanceof Error && error_4.name === 'SessionPersistenceCorruptionError') {
                        throw new config_ts_1.SessionQueryError("stored session \"".concat(sessionId, "\" is corrupt: ").concat(errorMessage(error_4)), 'SESSION_QUERY_CORRUPT_SESSION', { cause: error_4 });
                    }
                    throw new config_ts_1.SessionQueryError("failed to inspect session \"".concat(sessionId, "\": ").concat(errorMessage(error_4)), 'SESSION_QUERY_PERSISTENCE_FAILED', { cause: error_4 });
                case 3: return [2 /*return*/];
            }
        });
    });
}
function snapshotLive(session) {
    return {
        header: structuredClone(session.header),
        events: session.events.map(function (event) { return structuredClone(event); }),
    };
}
function compareSessions(a, b) {
    return b.header.createdAt - a.header.createdAt || a.header.id.localeCompare(b.header.id);
}
function notFound(sessionId) {
    return new config_ts_1.SessionQueryError("session \"".concat(sessionId, "\" not found"), 'SESSION_QUERY_SESSION_NOT_FOUND');
}
function errorMessage(error) {
    return error instanceof Error ? error.message : 'unknown error';
}
