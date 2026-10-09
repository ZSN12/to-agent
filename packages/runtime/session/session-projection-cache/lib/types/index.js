"use strict";
/**
 * Persisted projection cache (`ctx.sessionProjectionCache`): durable
 * checkpoints of every client-visible or explicitly persisted projection unit's state, one record per
 * session on the domain data form (`session_projcache` domain — the shipped
 * json backend lands it beside `workspace.json`). The cache is a fold
 * shortcut, never an authority: a row is possibly stale (its `seq`
 * says how stale) but never wrong, so every write path is fail-soft (a lost
 * write costs a longer tail replay on the next cold read) and a
 * `ver` mismatch discards the row instead of migrating it. Design
 * authority: the session-projection RFC
 * (.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md).
 * @module @z/dsh-session-projection-cache
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
exports.SessionProjectionCache = exports.Config = exports.projectionCacheDomainSpec = exports.checkpointRow = exports.checkpointRecord = exports.checkpointIdentity = void 0;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var dsh_session_1 = require("@z/dsh-session");
var spec_ts_1 = require("./spec.ts");
var spec_ts_2 = require("./spec.ts");
Object.defineProperty(exports, "checkpointIdentity", { enumerable: true, get: function () { return spec_ts_2.checkpointIdentity; } });
Object.defineProperty(exports, "checkpointRecord", { enumerable: true, get: function () { return spec_ts_2.checkpointRecord; } });
Object.defineProperty(exports, "checkpointRow", { enumerable: true, get: function () { return spec_ts_2.checkpointRow; } });
Object.defineProperty(exports, "projectionCacheDomainSpec", { enumerable: true, get: function () { return spec_ts_2.projectionCacheDomainSpec; } });
exports.Config = schemastery_1.default.object({
    writeEveryEvents: schemastery_1.default.natural().min(1).required(),
    writeIntervalMs: schemastery_1.default.natural().min(1).required(),
});
/**
 * The persisted projection cache service. Opens the `session_projcache`
 * domain at init, checkpoints live sessions on a throttled write-behind
 * (count/interval triggers from {@link Config}) plus two mandatory points —
 * `turn/end` and session disposal (the live-to-cold moment) — and serves the
 * cold-read ladder: cached row, persistence `readFrom` tail, registry
 * `restore`, durable write-back. Every durable write is fail-soft: failures
 * log a warning and the cache self-heals on the next write or cold read.
 */
var SessionProjectionCache = /** @class */ (function (_super) {
    __extends(SessionProjectionCache, _super);
    function SessionProjectionCache(ctx, config) {
        var _this = _super.call(this, ctx, 'sessionProjectionCache') || this;
        _this.config = config;
        _this.dirty = new Map();
        return _this;
    }
    /** Open the domain and install the write-behind listeners. */
    SessionProjectionCache.prototype[cordis_1.Service.init] = function () {
        return __awaiter(this, void 0, void 0, function () {
            var domain;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ctx.storageDomain.open(spec_ts_1.projectionCacheDomainSpec)];
                    case 1:
                        domain = _a.sent();
                        this.ctx.effect(function () { return function () { return domain.close(); }; }, 'sessionProjectionCache.domainClose');
                        this.table = domain.table('sessions');
                        this.installWritePath();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * The stored record for one session, accepted only when its bound log
     * identity matches `expected`. A session id names a slot, not a lifecycle:
     * a recreated id or a persistence store swapped under a surviving cache
     * must not let an old record seed state folded from an unrelated log.
     * Synchronous from the domain's in-memory state.
     * @param id - the session whose record is read.
     * @param expected - the log identity the caller holds (live or stored header).
     * @returns the identity-matching record, or `undefined` (absent or unrelated).
     */
    SessionProjectionCache.prototype.recordFor = function (id, expected) {
        var record = this.requireTable().get(id);
        if (record === undefined)
            return undefined;
        return identityMatches(record.identity, expected) ? record : undefined;
    };
    /**
     * The zero-I/O listing read: whole values viewed straight from the stored
     * rows (version-matching keys only), each cut carried with its watermark
     * so a client value store can seed under its higher-seq-wins rule — as
     * stale as the last durable checkpoint but never wrong, and never from an
     * unrelated log (the caller's header is the identity witness). Fresher
     * paths (the history tail baseline, {@link coldSnapshot}) supersede these
     * values whenever a session is actually opened.
     * @param meta - the listed session's header (identity witness; no log read).
     * @returns the cut (`asOfSeq` = lowest served-row watermark), or
     *   `undefined` when no usable row exists for this lifecycle.
     */
    SessionProjectionCache.prototype.cachedSnapshot = function (meta) {
        var record = this.recordFor(meta.id, identityOf(meta));
        if (record === undefined)
            return undefined;
        var values = this.ctx.sessionProjections.viewCheckpoint(record.rows);
        var keys = Object.keys(values);
        if (keys.length === 0)
            return undefined;
        // The block carries ONE cut: the lowest served watermark is the seq every
        // value is at least current as of (under-claiming is safe under
        // higher-seq-wins; over-claiming would let a stale value outrank pushes).
        var asOfSeq = Math.min.apply(Math, keys.map(function (key) { return record.rows[key].seq; }));
        return { asOfSeq: asOfSeq, values: values };
    };
    /**
     * Durably checkpoint one live session NOW (both mandatory points call
     * this; tests and carriers may too). The registry cut is snapshotted at
     * this boundary (states are live references), then the whole record is
     * replaced. NOT fail-soft — callers on the fail-soft paths contain it.
     * @param session - the live session to checkpoint.
     * @returns resolution after durability and event emission.
     */
    SessionProjectionCache.prototype.write = function (session) {
        return __awaiter(this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        rows = this.ctx.sessionProjections.checkpoint(session);
                        this.markClean(session);
                        if (!(this.ctx.sessions.get(session.id) === session)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.ctx.sessions.flush(session)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [4 /*yield*/, this.put(session.id, identityOf(session.header), rows)];
                    case 3:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Cold-read one persisted session's projections with zero full-log load:
     * cached rows + a persistence `readFrom` tail from the registry's restore
     * floor, refolded by the registry and written back (fail-soft) so the next
     * cold read starts closer. A cache row invalidated by a shrunk log
     * (crash-repair truncation) triggers one full re-read from seq 0 — the
     * ladder's slow rung, still no crash. Rejects when the session has no
     * persisted log (`not found` from the persistence seam).
     * @param id - the persisted session to read.
     * @param signal - optional cancellation for the persistence reads.
     * @returns the snapshot cut at the stored log end.
     */
    SessionProjectionCache.prototype.coldSnapshot = function (id, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var record, cached, floor, persistence, probe, restored, tail, related, _a, whole;
            var _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        record = this.requireTable().get(id);
                        cached = (_b = record === null || record === void 0 ? void 0 : record.rows) !== null && _b !== void 0 ? _b : {};
                        floor = this.ctx.sessionProjections.restoreFloor(cached);
                        persistence = this.ctx.sessionPersistence;
                        if (!(floor === undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, persistence.readFrom(id, 0, signal)];
                    case 1:
                        probe = _e.sent();
                        return [2 /*return*/, { asOfSeq: (_d = (_c = probe.events.at(-1)) === null || _c === void 0 ? void 0 : _c.seq) !== null && _d !== void 0 ? _d : -1, values: {} }];
                    case 2: return [4 /*yield*/, persistence.readFrom(id, floor, signal)
                        // The tail's stored header is the identity witness: a record bound to a
                        // different lifecycle (recreated id, swapped store) is discarded whole
                        // before any of its rows can seed a fold.
                    ];
                    case 3:
                        tail = _e.sent();
                        related = record === undefined || identityMatches(record.identity, identityOf(tail.meta));
                        _e.label = 4;
                    case 4:
                        _e.trys.push([4, 5, , 7]);
                        if (!related)
                            throw new Error('unrelated log identity');
                        restored = this.ctx.sessionProjections.restore(cached, tail.events, floor);
                        return [3 /*break*/, 7];
                    case 5:
                        _a = _e.sent();
                        return [4 /*yield*/, persistence.readFrom(id, 0, signal)];
                    case 6:
                        whole = _e.sent();
                        restored = this.ctx.sessionProjections.restore({}, whole.events, 0);
                        return [3 /*break*/, 7];
                    case 7: return [4 /*yield*/, this.putSoft(id, identityOf(tail.meta), restored.checkpoint, 'cold-read write-back')];
                    case 8:
                        _e.sent();
                        return [2 /*return*/, restored.snapshot];
                }
            });
        });
    };
    // --- write-behind (throttle + mandatory points) ---
    SessionProjectionCache.prototype.installWritePath = function () {
        var _this = this;
        // Every committed event advances the dirty counter; turn/end is a
        // mandatory point (the durable value most reads want is the turn-final
        // one), count/interval throttle the in-turn stream.
        this.ctx.on('session/event', function (session, event) {
            var _a, _b;
            if (event.type === 'turn/end') {
                void _this.flushSoft(session, 'turn/end');
                return;
            }
            var state = (_a = _this.dirty.get(session)) !== null && _a !== void 0 ? _a : { pending: 0, timer: undefined };
            _this.dirty.set(session, state);
            state.pending += 1;
            if (state.pending >= _this.config.writeEveryEvents) {
                void _this.flushSoft(session, 'count threshold');
                return;
            }
            (_b = state.timer) !== null && _b !== void 0 ? _b : (state.timer = setTimeout(function () {
                void _this.flushSoft(session, 'interval');
            }, _this.config.writeIntervalMs));
        });
        // Detach (the live-to-cold moment): the second mandatory point. After
        // this write the cold-read ladder serves the session from the cache.
        // flushSoft's synchronous prefix reads and resets the dirty state, so
        // dropping it (timer already cleared by markClean) right after is safe.
        this.ctx.on('session/disposed', function (session) {
            void _this.flushSoft(session, 'detach');
            _this.markClean(session);
            _this.dirty.delete(session);
        });
        // Clear pending timers with the plugin (their sessions outlive the cache).
        this.ctx.effect(function () { return function () {
            for (var _i = 0, _a = _this.dirty.values(); _i < _a.length; _i++) {
                var state = _a[_i];
                if (state.timer !== undefined)
                    clearTimeout(state.timer);
            }
            _this.dirty.clear();
        }; }, 'sessionProjectionCache.timers');
    };
    /**
     * One fail-soft durable checkpoint. Every caller has work by construction:
     * the throttle triggers only fire dirty (markClean clears the timer with
     * the counter) and the two mandatory points write unconditionally.
     */
    SessionProjectionCache.prototype.flushSoft = function (session, trigger) {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.write(session)];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        this.ctx.logger.warn("session projection cache: ".concat(trigger, " write for \"").concat(session.id, "\" failed (cache stays stale): ").concat(String(error_1)));
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /** Reset one session's dirty bookkeeping (its checkpoint is being written). */
    SessionProjectionCache.prototype.markClean = function (session) {
        var state = this.dirty.get(session);
        if (state === undefined)
            return;
        state.pending = 0;
        if (state.timer !== undefined) {
            clearTimeout(state.timer);
            state.timer = undefined;
        }
    };
    /** Replace one session's stored record with its log identity and a detached snapshot of `rows`. */
    SessionProjectionCache.prototype.put = function (id, identity, rows) {
        return __awaiter(this, void 0, void 0, function () {
            var detached;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        detached = (0, dsh_session_1.snapshotJsonValue)(rows);
                        if (detached === undefined) {
                            throw new TypeError('projection checkpoint is not losslessly JSON-serializable (a unit state violates the plain-JSON contract)');
                        }
                        return [4 /*yield*/, this.requireTable().put(id, { identity: identity, rows: detached })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Fail-soft {@link put}: cache writes must never fail their caller's read or event path. */
    SessionProjectionCache.prototype.putSoft = function (id, identity, rows, what) {
        return __awaiter(this, void 0, void 0, function () {
            var error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.put(id, identity, rows)];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_2 = _a.sent();
                        this.ctx.logger.warn("session projection cache: ".concat(what, " for \"").concat(id, "\" failed (cache stays stale): ").concat(String(error_2)));
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    SessionProjectionCache.prototype.requireTable = function () {
        /* v8 ignore next -- Service.init assigns the table before the service becomes injectable */
        if (this.table === undefined)
            throw new Error('session projection cache is not initialized');
        return this.table;
    };
    SessionProjectionCache.inject = ['storageDomain', 'sessionProjections', 'sessionPersistence', 'sessions'];
    SessionProjectionCache.Config = exports.Config;
    return SessionProjectionCache;
}(cordis_1.Service));
exports.SessionProjectionCache = SessionProjectionCache;
/** Project a header onto the identity fields a record is bound to. */
function identityOf(header) {
    return __assign({ createdAt: header.createdAt }, header.cwd === undefined ? {} : { cwd: header.cwd });
}
/** Whether a stored record's bound identity names the caller's lifecycle. */
function identityMatches(stored, expected) {
    return stored.createdAt === expected.createdAt && stored.cwd === expected.cwd;
}
exports.default = SessionProjectionCache;
