"use strict";
/**
 * Service Definition for combined session-history reads, traces, filters, and full-text search.
 *
 * @module @z/dsh-session-query
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionQueryEngine = exports.assertSessionHeadersCompatible = exports.materializeSessionResultFilters = exports.materializeSessionEventResultFilters = exports.filterSessionResults = exports.filterSessionEventDocuments = exports.compileSessionTextFilter = exports.buildSessionEventSearchDocuments = exports.buildSessionEventRecords = exports.extractSessionEventText = exports.SessionQueryError = exports.SESSION_QUERY_READ_WINDOW_MAX = exports.SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY = exports.SessionSearchCursor = void 0;
var cordis_1 = require("@z/cordis");
var dsh_session_1 = require("@z/dsh-session");
var dsh_session_title_1 = require("@z/dsh-session-title");
var config_ts_1 = require("./config.ts");
var corpus_ts_1 = require("./corpus.ts");
var documents_ts_1 = require("./documents.ts");
var filters_ts_1 = require("./filters.ts");
var tracing = require("./tracing.ts");
var cursor_ts_1 = require("./cursor.ts");
Object.defineProperty(exports, "SessionSearchCursor", { enumerable: true, get: function () { return cursor_ts_1.SessionSearchCursor; } });
var config_ts_2 = require("./config.ts");
Object.defineProperty(exports, "SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY", { enumerable: true, get: function () { return config_ts_2.SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY; } });
Object.defineProperty(exports, "SESSION_QUERY_READ_WINDOW_MAX", { enumerable: true, get: function () { return config_ts_2.SESSION_QUERY_READ_WINDOW_MAX; } });
Object.defineProperty(exports, "SessionQueryError", { enumerable: true, get: function () { return config_ts_2.SessionQueryError; } });
var extraction_ts_1 = require("./extraction.ts");
Object.defineProperty(exports, "extractSessionEventText", { enumerable: true, get: function () { return extraction_ts_1.extractSessionEventText; } });
var documents_ts_2 = require("./documents.ts");
Object.defineProperty(exports, "buildSessionEventRecords", { enumerable: true, get: function () { return documents_ts_2.buildSessionEventRecords; } });
Object.defineProperty(exports, "buildSessionEventSearchDocuments", { enumerable: true, get: function () { return documents_ts_2.buildSessionEventSearchDocuments; } });
var filters_ts_2 = require("./filters.ts");
Object.defineProperty(exports, "compileSessionTextFilter", { enumerable: true, get: function () { return filters_ts_2.compileSessionTextFilter; } });
Object.defineProperty(exports, "filterSessionEventDocuments", { enumerable: true, get: function () { return filters_ts_2.filterSessionEventDocuments; } });
Object.defineProperty(exports, "filterSessionResults", { enumerable: true, get: function () { return filters_ts_2.filterSessionResults; } });
Object.defineProperty(exports, "materializeSessionEventResultFilters", { enumerable: true, get: function () { return filters_ts_2.materializeSessionEventResultFilters; } });
Object.defineProperty(exports, "materializeSessionResultFilters", { enumerable: true, get: function () { return filters_ts_2.materializeSessionResultFilters; } });
var sources_ts_1 = require("./sources.ts");
Object.defineProperty(exports, "assertSessionHeadersCompatible", { enumerable: true, get: function () { return sources_ts_1.assertSessionHeadersCompatible; } });
/**
 * Unified live-preferred session query service.
 *
 * Exact reads, filters, and traces are backend-independent concrete behavior.
 * A backend implements full-text observation, reconciliation, ranking, cursor
 * generations, and query execution on the same `ctx.sessionQuery` service.
 */
var SessionQueryEngine = /** @class */ (function (_super) {
    __extends(SessionQueryEngine, _super);
    function SessionQueryEngine(ctx, config) {
        if (config === void 0) { config = {}; }
        var _a, _b;
        var _this = _super.call(this, ctx, 'sessionQuery') || this;
        _this._readWindowMax = (_a = config.readWindowMax) !== null && _a !== void 0 ? _a : config_ts_1.SESSION_QUERY_READ_WINDOW_MAX;
        if (!Number.isInteger(_this._readWindowMax) || _this._readWindowMax < 0) {
            throw new config_ts_1.SessionQueryError('session-query: readWindowMax must be a non-negative integer', 'SESSION_QUERY_INVALID_CONFIG');
        }
        var persistedInspectConcurrency = (_b = config.persistedInspectConcurrency) !== null && _b !== void 0 ? _b : config_ts_1.SESSION_QUERY_DEFAULT_PERSISTED_INSPECT_CONCURRENCY;
        if (!Number.isSafeInteger(persistedInspectConcurrency) || persistedInspectConcurrency < 1) {
            throw new config_ts_1.SessionQueryError('session-query: persistedInspectConcurrency must be a positive safe integer', 'SESSION_QUERY_INVALID_CONFIG');
        }
        _this._corpus = new corpus_ts_1.SessionCorpus(ctx, persistedInspectConcurrency);
        return _this;
    }
    /**
     * List the complete logical corpus using live-preferred records.
     * @param signal - optional cancellation for persistence listing.
     * @returns deterministic newest-first cloned session records.
     */
    SessionQueryEngine.prototype.listSessions = function (signal) {
        return this._corpus.listSessions(signal);
    };
    /**
     * Read and replay-validate one complete logical session log without making it live.
     * @param sessionId - live or persisted session id to read.
     * @returns cloned header and complete raw event log from one observation.
     * @throws when persistence, header compatibility, or replay validation fails.
     */
    SessionQueryEngine.prototype.readSession = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var loaded;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._corpus.load(sessionId)];
                    case 1:
                        loaded = _a.sent();
                        dsh_session_1.Session.create(sessionId, loaded.events, loaded.header);
                        return [2 /*return*/, {
                                session: structuredClone(loaded.header),
                                events: loaded.events.map(dsh_session_1.snapshotSessionEvent),
                            }];
                }
            });
        });
    };
    /**
     * Filter the complete logical corpus with provider-independent predicates.
     * @param filters - ANDed session metadata and availability clauses.
     * @param signal - optional cancellation for persistence listing.
     * @returns matching cloned records in deterministic newest-first order.
     */
    SessionQueryEngine.prototype.filterSessions = function (filters, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var ownedFilters;
            return __generator(this, function (_a) {
                ownedFilters = (0, filters_ts_1.materializeSessionResultFilters)(filters);
                return [2 /*return*/, this._filterSessions(ownedFilters, signal)];
            });
        });
    };
    /**
     * Fold the latest log-backed title from one live-preferred logical session.
     * @param sessionId - live or persisted session id to read.
     * @param signal - optional cancellation for source resolution and title folding.
     * @returns latest title snapshot, or `undefined` when the log has no title event.
     */
    SessionQueryEngine.prototype.readTitle = function (sessionId, signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.readTitleSnapshot(sessionId, signal)];
                    case 1: return [2 /*return*/, (_a.sent()).title];
                }
            });
        });
    };
    /**
     * Fold the latest title and return its source header from one corpus observation.
     * @param sessionId - live or persisted session id to read.
     * @param signal - optional cancellation for source resolution and title folding.
     * @returns cloned source header and optional latest title snapshot.
     */
    SessionQueryEngine.prototype.readTitleSnapshot = function (sessionId, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.readTitleSnapshots([sessionId], signal)];
                    case 1:
                        result = (_a.sent())[0];
                        if (result.status === 'rejected')
                            throw result.reason;
                        return [2 /*return*/, result.value];
                }
            });
        });
    };
    /**
     * Fold titles for unique sessions from one cancellable corpus observation.
     *
     * Results preserve first-occurrence input order. Operational failures stay
     * isolated per session, while cancellation rejects the complete operation.
     * @param sessionIds - live or persisted session ids to observe.
     * @param signal - optional cancellation shared by all source reads.
     * @returns one fulfilled or rejected result per unique requested id.
     */
    SessionQueryEngine.prototype.readTitleSnapshots = function (sessionIds, signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this._corpus.projectMany(sessionIds, function (source) {
                        var title = (0, dsh_session_title_1.foldSessionTitle)(source.events);
                        return __assign({ session: structuredClone(source.header) }, title === undefined ? {} : { title: title });
                    }, signal)];
            });
        });
    };
    /**
     * List lightweight raw-log event records for one logical session.
     * @param sessionId - live-preferred session id to read.
     * @returns event records in ascending seq order.
     */
    SessionQueryEngine.prototype.listEvents = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var loaded;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._corpus.load(sessionId)];
                    case 1:
                        loaded = _a.sent();
                        return [2 /*return*/, tracing.eventRecords(sessionId, loaded.events)];
                }
            });
        });
    };
    /**
     * Scan first-party semantic event documents with provider-independent filters.
     * @param sessionId - live-preferred session id to scan.
     * @param filters - ANDed metadata and literal-text predicates.
     * @returns matching semantic documents in ascending seq order.
     */
    SessionQueryEngine.prototype.filterEvents = function (sessionId, filters) {
        return __awaiter(this, void 0, void 0, function () {
            var ownedFilters;
            return __generator(this, function (_a) {
                ownedFilters = (0, filters_ts_1.materializeSessionEventResultFilters)(filters);
                return [2 /*return*/, this._filterEvents(sessionId, ownedFilters)];
            });
        });
    };
    SessionQueryEngine.prototype._filterSessions = function (filters, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = filters_ts_1.filterSessionResults;
                        return [4 /*yield*/, this._corpus.listSessions(signal)];
                    case 1: return [2 /*return*/, _a.apply(void 0, [_b.sent(), filters])];
                }
            });
        });
    };
    SessionQueryEngine.prototype._filterEvents = function (sessionId, filters) {
        return __awaiter(this, void 0, void 0, function () {
            var loaded, documents;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._corpus.load(sessionId)];
                    case 1:
                        loaded = _a.sent();
                        documents = (0, documents_ts_1.buildSessionEventSearchDocuments)(sessionId, loaded.events);
                        return [2 /*return*/, (0, filters_ts_1.filterSessionEventDocuments)(documents, filters)];
                }
            });
        });
    };
    /**
     * Read one session's complete current model surface from one corpus observation.
     * @param sessionId - live-preferred session id to read.
     * @returns cloned header, current surface, and the last sequence number included in the raw-log capture.
     * @throws when source resolution fails or the session surface is invalid.
     */
    SessionQueryEngine.prototype.readSurface = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var loaded;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this._corpus.load(sessionId)];
                    case 1:
                        loaded = _c.sent();
                        return [2 /*return*/, {
                                session: structuredClone(loaded.header),
                                capturedThroughSeq: (_b = (_a = loaded.events.at(-1)) === null || _a === void 0 ? void 0 : _a.seq) !== null && _b !== void 0 ? _b : null,
                                events: tracing.currentSurfaceEvents(sessionId, loaded.events),
                            }];
                }
            });
        });
    };
    /**
     * Trace known ancestry and descendants from one corpus observation.
     * @param sessionId - logical session id to trace.
     * @param signal - optional cancellation for persistence listing.
     * @returns a complete lineage or the first parent that could not be resolved.
     * @throws when corpus resolution fails, the target is absent, or its known ancestry cycles.
     */
    SessionQueryEngine.prototype.traceSession = function (sessionId, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var records;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._corpus.listSessions(signal)];
                    case 1:
                        records = _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, tracing.traceSession(records, sessionId)];
                }
            });
        });
    };
    /**
     * Trace one event's direct positional replacements and cited source events.
     * @param request - target session id and event seq.
     * @param signal - optional cancellation for persisted source resolution.
     * @returns source header, direct links, and the target's positional replacement chain.
     * @throws when source resolution fails, the target is absent, or surface/source-event validation fails.
     */
    SessionQueryEngine.prototype.traceEvent = function (request, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var loaded;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._corpus.load(request.sessionId, signal)];
                    case 1:
                        loaded = _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, __assign({ session: loaded.header }, tracing.traceEvent(request.sessionId, loaded.events, request.seq))];
                }
            });
        });
    };
    /**
     * Read one full event plus a bounded raw-log context window.
     * @param request - target session/seq and context sizes.
     * @param signal - optional cancellation for persisted source resolution.
     * @returns cloned target and neighboring events.
     */
    SessionQueryEngine.prototype.readEvent = function (request, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var before, after, sessionId, seq;
            return __generator(this, function (_a) {
                before = this._readWindow('before', request.before);
                after = this._readWindow('after', request.after);
                sessionId = request.sessionId;
                seq = request.seq;
                return [2 /*return*/, this._readEvent(sessionId, seq, before, after, signal)];
            });
        });
    };
    SessionQueryEngine.prototype._readEvent = function (sessionId, seq, before, after, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var loaded, target, startSeq, endSeq, targetSnapshot, events;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this._corpus.load(sessionId, signal)];
                    case 1:
                        loaded = _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        target = loaded.events[seq];
                        if (target === undefined || target.seq !== seq) {
                            throw new config_ts_1.SessionQueryError("session \"".concat(sessionId, "\" has no event at seq ").concat(seq), 'SESSION_QUERY_EVENT_NOT_FOUND');
                        }
                        startSeq = Math.max(0, seq - before);
                        endSeq = Math.min(loaded.events.length - 1, seq + after);
                        targetSnapshot = (0, dsh_session_1.snapshotSessionEvent)(target);
                        events = loaded.events.slice(startSeq, endSeq + 1)
                            .map(function (event) { return event === target
                            ? targetSnapshot
                            : (0, dsh_session_1.snapshotSessionEvent)(event); });
                        return [2 /*return*/, {
                                session: structuredClone(loaded.header),
                                target: targetSnapshot,
                                events: events,
                                startSeq: startSeq,
                                endSeq: endSeq,
                            }];
                }
            });
        });
    };
    SessionQueryEngine.prototype._readWindow = function (name, value) {
        if (value === undefined)
            return 0;
        if (!Number.isInteger(value) || value < 0 || value > this._readWindowMax) {
            throw new config_ts_1.SessionQueryError("".concat(name, " must be an integer between 0 and ").concat(this._readWindowMax), 'SESSION_QUERY_INVALID_WINDOW');
        }
        return value;
    };
    SessionQueryEngine.inject = ['sessions'];
    return SessionQueryEngine;
}(cordis_1.Service));
exports.SessionQueryEngine = SessionQueryEngine;
exports.default = SessionQueryEngine;
