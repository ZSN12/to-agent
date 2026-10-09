"use strict";
/**
 * Bounded sharing and exclusive reservation of unpublished Sessions.
 * @module @z/dsh-session-persistence/preparations
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionPreparations = void 0;
exports.observeQueuedAbort = observeQueuedAbort;
/** Per-coordinator cold-read sharing, exclusive reservation, and ready-entry LRU. */
var SessionPreparations = /** @class */ (function () {
    function SessionPreparations(capacity) {
        this.capacity = capacity;
        this.entries = new Map();
    }
    /**
     * Whether this pool currently knows about an unpublished identity.
     * @param id - session identity.
     * @returns whether an entry exists for the identity.
     */
    SessionPreparations.prototype.has = function (id) {
        return this.entries.has(id);
    };
    /**
     * Observe one prepared source, sharing an in-flight read for the same id.
     * @param id - session identity.
     * @param load - cold loader used when no entry exists.
     * @param signal - optional cancellation signal while waiting.
     * @returns the shared prepared source.
     */
    SessionPreparations.prototype.inspect = function (id, load, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var entry, loaded, _a, source;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        entry = this.entryFor(id, load);
                        if (!(signal === undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, entry.result];
                    case 1:
                        _a = _c.sent();
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, observeQueuedAbort(entry.result, signal)];
                    case 3:
                        _a = _c.sent();
                        _c.label = 4;
                    case 4:
                        loaded = _a;
                        source = (_b = entry.source) !== null && _b !== void 0 ? _b : loaded;
                        if (this.entries.get(id) === entry && entry.phase === 'ready')
                            this.touch(entry);
                        return [2 /*return*/, source];
                }
            });
        });
    };
    /**
     * Reserve one ready source after committing its pending durable repair.
     * @param id - session identity.
     * @param load - cold loader used when no entry exists.
     * @param commit - durable repair and cursor-state commit.
     * @param signal - optional cancellation signal while waiting.
     * @returns the exclusive reservation, or undefined if its entry was invalidated.
     */
    SessionPreparations.prototype.reserve = function (id, load, commit, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var entry, settled, source, reservationSettled, committed, error_1, reservation;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        entry = this.entryFor(id, load);
                        return [4 /*yield*/, (signal === undefined ? entry.result : observeQueuedAbort(entry.result, signal))];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        if (!(this.entries.get(id) === entry && entry.phase !== 'ready')) return [3 /*break*/, 7];
                        settled = entry.reservationSettled;
                        /* v8 ignore next -- committing/reserved transitions install this waiter synchronously. */
                        if (settled === undefined)
                            throw new Error("session \"".concat(id, "\" preparation lost its reservation waiter"));
                        if (!(signal === undefined)) return [3 /*break*/, 4];
                        return [4 /*yield*/, settled];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, observeQueuedAbort(settled, signal)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6: return [3 /*break*/, 2];
                    case 7:
                        if (this.entries.get(id) !== entry)
                            return [2 /*return*/, undefined];
                        source = entry.source;
                        reservationSettled = Promise.withResolvers();
                        entry.phase = 'committing';
                        entry.reservationSettled = reservationSettled.promise;
                        entry.settleReservation = reservationSettled.resolve;
                        _a.label = 8;
                    case 8:
                        _a.trys.push([8, 10, , 11]);
                        return [4 /*yield*/, commit(source)];
                    case 9:
                        committed = _a.sent();
                        return [3 /*break*/, 11];
                    case 10:
                        error_1 = _a.sent();
                        this.remove(entry);
                        throw error_1;
                    case 11:
                        if (committed === undefined) {
                            this.remove(entry);
                            return [2 /*return*/, undefined];
                        }
                        entry.source = committed.source;
                        try {
                            signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        }
                        catch (error) {
                            this.makeReady(entry);
                            throw error;
                        }
                        if (this.entries.get(id) !== entry)
                            return [2 /*return*/, undefined];
                        reservation = {
                            entry: entry,
                            source: committed.source,
                            state: committed.state,
                        };
                        entry.phase = 'reserved';
                        entry.reservation = reservation;
                        return [2 /*return*/, reservation];
                }
            });
        });
    };
    /**
     * Return the exact reservation for Session publication, rejecting aliases.
     * @param session - exact Session candidate for publication.
     * @returns its reservation, or undefined when no preparation exists.
     */
    SessionPreparations.prototype.reservationFor = function (session) {
        var _a;
        var entry = this.entries.get(session.id);
        if (entry === undefined)
            return undefined;
        if (entry.phase === 'reserved'
            && ((_a = entry.source) === null || _a === void 0 ? void 0 : _a.session) === session
            && entry.reservation !== undefined) {
            return entry.reservation;
        }
        throw new Error("cannot publish session \"".concat(session.id, "\": persisted state already owns this identity"));
    };
    /**
     * Consume a reservation after its exact Session has attached.
     * @param reservation - reservation to consume.
     */
    SessionPreparations.prototype.attach = function (reservation) {
        var entry = reservation.entry;
        if (this.entries.get(entry.id) !== entry || entry.reservation !== reservation) {
            throw new Error("session \"".concat(entry.id, "\" preparation is no longer reserved"));
        }
        this.remove(entry);
    };
    /**
     * Consume a reservation whose caller only needs the committed inspection.
     * @param reservation - reservation to consume.
     */
    SessionPreparations.prototype.discard = function (reservation) {
        var entry = reservation.entry;
        if (this.entries.get(entry.id) !== entry || entry.reservation !== reservation)
            return;
        this.remove(entry);
    };
    /**
     * Return a reusable unpublished reservation to the ready LRU.
     * @param reservation - reservation to release.
     * @param reusable - whether the source remains valid for reuse.
     */
    SessionPreparations.prototype.release = function (reservation, reusable) {
        var entry = reservation.entry;
        if (this.entries.get(entry.id) !== entry
            || entry.reservation !== reservation
            || entry.phase !== 'reserved')
            return;
        if (!reusable) {
            this.remove(entry);
            return;
        }
        delete entry.reservation;
        this.makeReady(entry);
    };
    /**
     * Discard a prepared view after the durable log changes.
     * @param id - changed session identity.
     */
    SessionPreparations.prototype.invalidate = function (id) {
        var entry = this.entries.get(id);
        if (entry !== undefined)
            this.remove(entry);
    };
    /**
     * Discard an exact stale ready source without disturbing an exclusive owner.
     * @param id - changed session identity.
     * @param expected - exact source observed before its revision check.
     * @returns whether the source was discarded, retained by a reservation, or is absent.
     */
    SessionPreparations.prototype.discardReady = function (id, expected) {
        var entry = this.entries.get(id);
        if (entry === undefined || entry.source !== expected)
            return 'missing';
        if (entry.phase !== 'ready')
            return 'retained';
        this.remove(entry);
        return 'discarded';
    };
    /**
     * Reject writes while an unpublished Session exclusively reserves the id.
     * @param id - session identity to check.
     */
    SessionPreparations.prototype.assertWritable = function (id) {
        var _a;
        var phase = (_a = this.entries.get(id)) === null || _a === void 0 ? void 0 : _a.phase;
        if (phase === 'committing' || phase === 'reserved') {
            throw new Error("cannot append session \"".concat(id, "\" while its persisted preparation is reserved"));
        }
    };
    /**
     * Remove a completed entry for an already-serialized append adoption.
     * @param id - adopted session identity.
     * @returns the prepared source, or undefined when no ready entry exists.
     */
    SessionPreparations.prototype.takeReady = function (id) {
        var entry = this.entries.get(id);
        if (entry === undefined || entry.phase !== 'ready' || entry.source === undefined)
            return undefined;
        this.remove(entry);
        return entry.source;
    };
    SessionPreparations.prototype.entryFor = function (id, load) {
        var _this = this;
        var existing = this.entries.get(id);
        if (existing !== undefined)
            return existing;
        var deferred = Promise.withResolvers();
        var entry = {
            id: id,
            result: deferred.promise,
            phase: 'loading',
        };
        this.entries.set(id, entry);
        var loading;
        try {
            // Start immediately so a same-tick serialized append queues behind this
            // read. The deferred result settles only after the entry becomes ready.
            loading = load();
        }
        catch (error) {
            this.remove(entry);
            deferred.reject(error);
            return entry;
        }
        void loading.then(function (source) {
            if (_this.entries.get(id) === entry) {
                entry.source = source;
                _this.makeReady(entry);
            }
            deferred.resolve(source);
        }, function (error) {
            _this.remove(entry);
            deferred.reject(error);
        });
        return entry;
    };
    SessionPreparations.prototype.makeReady = function (entry) {
        if (this.entries.get(entry.id) !== entry)
            return;
        entry.phase = 'ready';
        var settle = entry.settleReservation;
        delete entry.reservationSettled;
        delete entry.settleReservation;
        settle === null || settle === void 0 ? void 0 : settle();
        this.touch(entry);
    };
    SessionPreparations.prototype.remove = function (entry) {
        if (this.entries.get(entry.id) !== entry)
            return;
        this.entries.delete(entry.id);
        var settle = entry.settleReservation;
        delete entry.reservationSettled;
        delete entry.settleReservation;
        settle === null || settle === void 0 ? void 0 : settle();
    };
    SessionPreparations.prototype.touch = function (entry) {
        this.entries.delete(entry.id);
        this.entries.set(entry.id, entry);
        var readyCount = 0;
        for (var _i = 0, _a = this.entries.values(); _i < _a.length; _i++) {
            var candidate = _a[_i];
            if (candidate.phase === 'ready')
                readyCount += 1;
        }
        if (readyCount <= this.capacity)
            return;
        for (var _b = 0, _c = this.entries; _b < _c.length; _b++) {
            var _d = _c[_b], id = _d[0], candidate = _d[1];
            if (candidate.phase !== 'ready')
                continue;
            this.entries.delete(id);
            return;
        }
    };
    return SessionPreparations;
}());
exports.SessionPreparations = SessionPreparations;
/**
 * Give a queued observer a prompt cancellation view without cancelling shared work.
 * @param operation - shared operation whose settlement remains authoritative.
 * @param signal - observer-local cancellation signal.
 * @param started - whether the operation has crossed its cancellation cutoff.
 * @returns the operation result or the observer's prompt cancellation.
 */
function observeQueuedAbort(operation, signal, started) {
    if (started === void 0) { started = function () { return false; }; }
    return new Promise(function (resolve, reject) {
        var settled = false;
        var finish = function (callback) {
            if (settled)
                return;
            settled = true;
            signal.removeEventListener('abort', onAbort);
            callback();
        };
        var onAbort = function () {
            if (started())
                return;
            finish(function () {
                try {
                    signal.throwIfAborted();
                }
                catch (reason) {
                    rejectObservation(reject, reason);
                    return;
                }
                /* v8 ignore next -- a native AbortSignal emits abort only after becoming aborted. */
                reject(new Error('queued observation abort event lacked an aborted signal'));
            });
        };
        signal.addEventListener('abort', onAbort, { once: true });
        operation.then(function (value) { finish(function () { resolve(value); }); }, function (reason) {
            finish(function () { rejectObservation(reject, reason); });
        });
        if (signal.aborted)
            onAbort();
    });
}
/** Preserve an exact loader or AbortSignal reason, including legacy non-Error values. */
function rejectObservation(reject, reason) {
    reject(reason);
}
