"use strict";
/**
 * Shared buffering, serialization, adoption, repair, and disposal orchestration
 * for first-party backends. Third-party backends may implement the public
 * persistence seam directly.
 * @module @z/dsh-session-persistence/coordinator
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
exports.PersistenceCoordinator = exports.SessionFormatUnsupportedError = exports.SessionPersistenceCorruptionError = exports.MAX_WRITE_BATCH_DELAY_MS = exports.DEFAULT_WRITE_BATCH_MAX_DELAY_MS = exports.DEFAULT_PREPARED_SESSION_CACHE_SIZE = void 0;
exports.sessionFormatVersionRefusal = sessionFormatVersionRefusal;
var dsh_session_1 = require("@z/dsh-session");
var dsh_timeout_1 = require("@z/dsh-timeout");
var preparations_ts_1 = require("./preparations.ts");
var write_behind_ts_1 = require("./write-behind.ts");
/** Default number of detached session preparations retained by a coordinator. */
exports.DEFAULT_PREPARED_SESSION_CACHE_SIZE = 5;
/** Default maximum intentional wait before a live session batch starts writing. */
exports.DEFAULT_WRITE_BATCH_MAX_DELAY_MS = 200;
/** Largest write batching delay accepted by Node's timer implementation. */
exports.MAX_WRITE_BATCH_DELAY_MS = dsh_timeout_1.MAX_TIMER_DELAY_MS;
/** Durable session contents failed validation after a successful backend read. */
var SessionPersistenceCorruptionError = /** @class */ (function (_super) {
    __extends(SessionPersistenceCorruptionError, _super);
    /**
     * @param message - stable corruption context.
     * @param options - original validation failure.
     */
    function SessionPersistenceCorruptionError(message, options) {
        var _this = _super.call(this, message, options) || this;
        _this.name = 'SessionPersistenceCorruptionError';
        return _this;
    }
    return SessionPersistenceCorruptionError;
}(Error));
exports.SessionPersistenceCorruptionError = SessionPersistenceCorruptionError;
/**
 * The stored log is intact but this runtime cannot faithfully interpret it:
 * the header carries an unsupported format version, or an event's type is
 * unknown to this build and the event is not marked ignorable. Distinct from
 * {@link SessionPersistenceCorruptionError} — nothing is damaged; the raw log
 * remains readable at {@link location} when the backend keeps one artifact
 * per session.
 */
var SessionFormatUnsupportedError = /** @class */ (function (_super) {
    __extends(SessionFormatUnsupportedError, _super);
    /**
     * @param message - stable reason the log cannot be interpreted, already
     *   including the raw-log path when one exists.
     * @param location - the backend's artifact location, when one exists.
     */
    function SessionFormatUnsupportedError(message, location) {
        var _this = _super.call(this, message) || this;
        _this.location = location;
        _this.name = 'SessionFormatUnsupportedError';
        return _this;
    }
    return SessionFormatUnsupportedError;
}(Error));
exports.SessionFormatUnsupportedError = SessionFormatUnsupportedError;
/**
 * Direction-aware refusal text for a stored session whose format version this
 * build does not read. Shared by the coordinator's load-time check and by
 * backends that must refuse BEFORE decoding version-dependent structure (a
 * future format may not satisfy today's structural checks at all, and the
 * user must see "upgrade the harness", never "corrupt").
 * @param id - the stored session id, for message context.
 * @param version - the stored format version.
 * @returns the stable refusal text, without a raw-log path suffix.
 */
function sessionFormatVersionRefusal(id, version) {
    return version > dsh_session_1.SESSION_FORMAT_VERSION
        ? "session \"".concat(id, "\" uses log format v").concat(version, ", but this harness reads only v").concat(dsh_session_1.SESSION_FORMAT_VERSION, ": the log was written by a newer harness \u2014 upgrade the harness to open it")
        : "session \"".concat(id, "\" uses log format v").concat(version, ", older than the supported v").concat(dsh_session_1.SESSION_FORMAT_VERSION, ", and this build ships no upgrade path for it");
}
/** Collect the rejection reasons from a set of promises (none-throwing). */
function settledErrors(promises) {
    return __awaiter(this, void 0, void 0, function () {
        var settled, errors, _i, settled_1, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.allSettled(__spreadArray([], promises, true))];
                case 1:
                    settled = _a.sent();
                    errors = [];
                    for (_i = 0, settled_1 = settled; _i < settled_1.length; _i++) {
                        result = settled_1[_i];
                        if (result.status === 'rejected')
                            errors.push(result.reason);
                    }
                    return [2 /*return*/, errors];
            }
        });
    });
}
/** Whether a live session seed reproduces a persisted prefix exactly. */
function seedCoversPrefix(seed, prefix) {
    return prefix.length <= seed.length
        && prefix.every(function (event, index) {
            var seedEvent = seed[index];
            return seedEvent !== undefined && JSON.stringify(seedEvent) === JSON.stringify(event);
        });
}
/** Reject events from an obsolete v0 vocabulary that this build cannot replay. */
function assertSupportedEvents(events, id) {
    var legacyType = 'request/header-delta';
    var legacy = events.find(function (event) { return event.type === legacyType; });
    if (legacy !== undefined) {
        throw new Error("session \"".concat(id, "\" contains unsupported legacy request/header-delta event at seq ").concat(legacy.seq));
    }
    var legacyModeType = 'mode/set';
    var legacyMode = events.find(function (event) { return event.type === legacyModeType; });
    if (legacyMode !== undefined) {
        throw new Error("session \"".concat(id, "\" contains unsupported legacy mode/set event at seq ").concat(legacyMode.seq));
    }
    var fallback = events.find(function (event) { return event.type === 'request/header'
        && event.data.reason === 'fallback'; });
    if (fallback !== undefined) {
        throw new Error("session \"".concat(id, "\" contains unsupported legacy request/header reason \"fallback\" at seq ").concat(fallback.seq));
    }
}
/** Return an object record without widening arrays into message payloads. */
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
/** Whether a record contains every required key and no key outside the optional extension set. */
function hasOnlyKeys(record, required, optional) {
    if (optional === void 0) { optional = []; }
    var allowed = __spreadArray(__spreadArray([], required, true), optional, true);
    return Object.keys(record).every(function (key) { return allowed.includes(key); })
        && required.every(function (key) { return Object.hasOwn(record, key); });
}
/** Mint the stable import identity for a message persisted before identities existed. */
function legacyMessageId(id, seq) {
    return "legacy-message:".concat(id, ":").concat(seq);
}
/** Read a replacement target while leaving malformed surface metadata to the session validator. */
function replacementStart(event) {
    var op = asRecord(event.surfaceOp);
    return (op === null || op === void 0 ? void 0 : op['op']) === 'replace' && typeof op['start'] === 'number'
        ? op['start']
        : undefined;
}
/** Whether one suffix event needs facts available only from the preceding stored prefix. */
function needsLegacyPrefix(event) {
    var data = asRecord(event.data);
    var legacySteeringType = 'steering/message';
    if (event.type === legacySteeringType)
        return true;
    if (data === undefined)
        return false;
    switch (event.type) {
        case 'user/message':
            return !Object.hasOwn(data, 'id') && Object.hasOwn(data, 'content');
        case 'assistant/message':
            return !Object.hasOwn(data, 'message') && Object.hasOwn(data, 'content');
        case 'tool/result':
            return !Object.hasOwn(data, 'message') && Object.hasOwn(data, 'callId');
        default:
            return false;
    }
}
/** Upgrade the removed steering surface event into its current user-message equivalent. */
function migrateLegacySteeringEvent(event, id) {
    var legacyType = 'steering/message';
    if (event.type !== legacyType)
        return event;
    var data = asRecord(event.data);
    if (data === undefined) {
        throw new Error("session \"".concat(id, "\" contains malformed pre-react-loop steering/message at seq ").concat(event.seq));
    }
    var wrapped = asRecord(data['message']);
    if (wrapped !== undefined && Number.isSafeInteger(data['turn'])
        && hasOnlyKeys(data, ['turn', 'message'])) {
        return __assign(__assign({}, event), { type: 'user/message', data: wrapped });
    }
    if (!Number.isSafeInteger(data['turn']) || !hasOnlyKeys(data, ['turn', 'content', 'source'])) {
        throw new Error("session \"".concat(id, "\" contains malformed pre-react-loop steering/message at seq ").concat(event.seq));
    }
    var _turn = data.turn, message = __rest(data, ["turn"]);
    return __assign(__assign({}, event), { type: 'user/message', data: __assign(__assign({}, message), { id: legacyMessageId(id, event.seq), role: 'user' }) });
}
/** Remove the obsolete trigger after verifying the complete old turn-start envelope. */
function migrateLegacyTurnStartEvent(event, id) {
    if (event.type !== 'turn/start')
        return event;
    var data = asRecord(event.data);
    if (data === undefined || !Object.hasOwn(data, 'trigger'))
        return event;
    var trigger = asRecord(data['trigger']);
    if (!Number.isSafeInteger(data['turn']) || data['turn'] < 1
        || !hasOnlyKeys(data, ['turn', 'trigger'])
        || trigger === undefined || typeof trigger['kind'] !== 'string' || trigger['kind'].length === 0) {
        throw new Error("session \"".concat(id, "\" contains malformed pre-react-loop turn/start at seq ").concat(event.seq));
    }
    return __assign(__assign({}, event), { data: { turn: data['turn'] } });
}
/** Upgrade an obsolete turn ending while preserving the latest-master envelope. */
function migrateLegacyTurnEndEvent(event, id) {
    if (event.type !== 'turn/end')
        return event;
    var data = asRecord(event.data);
    /* v8 ignore next -- a non-record current envelope cannot match a legacy shape. */
    if (data === undefined)
        return event;
    var malformed = function () {
        throw new Error("session \"".concat(id, "\" contains malformed pre-react-loop turn/end at seq ").concat(event.seq));
    };
    var reason = asRecord(data['reason']);
    if (!Number.isSafeInteger(data['turn']) || data['turn'] < 1
        || !hasOnlyKeys(data, ['turn', 'reason'])
        || reason === undefined || typeof reason['kind'] !== 'string')
        return malformed();
    var currentReason;
    switch (reason['kind']) {
        case 'completed':
        case 'blocked':
        case 'max-tokens':
        case 'interrupted':
            if (!hasOnlyKeys(reason, ['kind']))
                return malformed();
            return event;
        case 'aborted':
            if (Object.hasOwn(reason, 'reason'))
                return event;
            if (!hasOnlyKeys(reason, ['kind']))
                return malformed();
            currentReason = { kind: 'aborted', reason: { kind: 'legacy' } };
            break;
        case 'disposed':
            if (!hasOnlyKeys(reason, ['kind']))
                return malformed();
            currentReason = { kind: 'aborted', reason: { kind: 'disposed' } };
            break;
        case 'error': {
            if (Object.hasOwn(reason, 'error'))
                return event;
            if (!Number.isSafeInteger(reason['step']) || reason['step'] < 0)
                return malformed();
            var failure = asRecord(reason['failure']);
            if (failure !== undefined && hasOnlyKeys(reason, ['kind', 'step', 'failure'])
                && hasOnlyKeys(failure, ['message', 'code'], ['status', 'providerRetryAfterMs', 'requestId'])
                && typeof failure['message'] === 'string' && typeof failure['code'] === 'string'
                && (failure['status'] === undefined || typeof failure['status'] === 'number')
                && (failure['providerRetryAfterMs'] === undefined || typeof failure['providerRetryAfterMs'] === 'number')
                && (failure['requestId'] === undefined || typeof failure['requestId'] === 'string')) {
                currentReason = { kind: 'error', error: failure };
                break;
            }
            var messageKeys = reason['code'] === undefined
                ? ['kind', 'step', 'message']
                : ['kind', 'step', 'message', 'code'];
            if (!hasOnlyKeys(reason, messageKeys)
                || typeof reason['message'] !== 'string'
                || (reason['code'] !== undefined && typeof reason['code'] !== 'string'))
                return malformed();
            currentReason = {
                kind: 'error',
                error: {
                    message: reason['message'],
                    code: typeof reason['code'] === 'string' ? reason['code'] : 'UNKNOWN',
                },
            };
            break;
        }
        default:
            return event;
    }
    return __assign(__assign({}, event), { data: __assign(__assign({}, data), { reason: currentReason }) });
}
/**
 * Upgrade one pre-identity message event into the current wrapper shape.
 * Current-looking malformed events remain untouched so validation rejects them
 * instead of disguising corruption as legacy data.
 */
function migrateLegacyMessageEvent(event, id, messageIds) {
    var data = asRecord(event.data);
    if (data === undefined)
        return event;
    switch (event.type) {
        case 'user/message': {
            if (Object.hasOwn(data, 'id') || Object.hasOwn(data, 'role')
                || Object.hasOwn(data, 'message')
                || !Object.hasOwn(data, 'content') || !Object.hasOwn(data, 'source'))
                return event;
            return __assign(__assign({}, event), { data: __assign(__assign({}, data), { id: legacyMessageId(id, event.seq), role: 'user' }) });
        }
        case 'assistant/message': {
            if (Object.hasOwn(data, 'message')
                || !Object.hasOwn(data, 'content') || !Object.hasOwn(data, 'provenance'))
                return event;
            var content = data.content, provenance = data.provenance, eventData = __rest(data, ["content", "provenance"]);
            return __assign(__assign({}, event), { data: __assign(__assign({}, eventData), { message: {
                        id: legacyMessageId(id, event.seq),
                        role: 'assistant',
                        content: content,
                        source: __assign(__assign({}, asRecord(provenance)), { kind: 'model' }),
                    } }) });
        }
        case 'tool/result': {
            if (Object.hasOwn(data, 'message')
                || !Object.hasOwn(data, 'callId') || !Object.hasOwn(data, 'content')
                || !Object.hasOwn(data, 'isError'))
                return event;
            var callId = data.callId, content = data.content, isError = data.isError, eventData = __rest(data, ["callId", "content", "isError"]);
            var inheritedId = replacementStart(event);
            return __assign(__assign({}, event), { data: __assign(__assign({}, eventData), { message: {
                        id: inheritedId === undefined
                            ? legacyMessageId(id, event.seq)
                            : messageIds.get(inheritedId),
                        role: 'user',
                        content: [{
                                type: 'tool-result',
                                toolCallId: callId,
                                content: content,
                                isError: isError,
                            }],
                        source: {
                            kind: 'tool',
                            callId: callId,
                        },
                    } }) });
        }
        default:
            return event;
    }
}
/** Read the identified message carried by one validated current event. */
function eventMessageId(event) {
    var data = asRecord(event.data);
    var message = event.type === 'user/message' ? data : asRecord(data === null || data === void 0 ? void 0 : data['message']);
    return typeof (message === null || message === void 0 ? void 0 : message['id']) === 'string' ? message['id'] : undefined;
}
/** Materialize stored events as upgraded, validated snapshots with immutable messages. */
function snapshotStoredEvents(events, id) {
    assertSupportedEvents(events, id);
    var messageIds = new Map();
    return events.map(function (event) {
        var migratedStart = migrateLegacyTurnStartEvent(event, id);
        var migratedTurn = migrateLegacyTurnEndEvent(migratedStart, id);
        var migratedSteering = migrateLegacySteeringEvent(migratedTurn, id);
        var snapshot = (0, dsh_session_1.snapshotSessionEvent)(migrateLegacyMessageEvent(migratedSteering, id, messageIds));
        var messageId = eventMessageId(snapshot);
        if (messageId !== undefined)
            messageIds.set(snapshot.seq, messageId);
        return snapshot;
    });
}
/** Upgrade and validate an exclusively owned backend result without copying it. */
function adoptStoredEvents(events, id) {
    assertSupportedEvents(events, id);
    var messageIds = new Map();
    for (var _i = 0, _a = events.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], index = _b[0], event_1 = _b[1];
        var migratedStart = migrateLegacyTurnStartEvent(event_1, id);
        var migratedTurn = migrateLegacyTurnEndEvent(migratedStart, id);
        var migratedSteering = migrateLegacySteeringEvent(migratedTurn, id);
        var adopted = (0, dsh_session_1.adoptSessionEvent)(migrateLegacyMessageEvent(migratedSteering, id, messageIds));
        events[index] = adopted;
        var messageId = eventMessageId(adopted);
        if (messageId !== undefined)
            messageIds.set(adopted.seq, messageId);
    }
    return events;
}
/**
 * Owns the backend-agnostic session write-path orchestration. A backend
 * constructs one (`new PersistenceCoordinator(ctx, this)`), implements
 * {@link PersistenceBackend}, and delegates its write/read service methods to
 * the matching coordinator methods.
 *
 * All per-id operations are serialized (a per-id promise chain) so concurrent
 * flushes / a flush racing a load never interleave storage writes. The
 * constructor installs the write-path listeners, per-session retirement, and
 * the backend dispose effect.
 *
 * @typeParam TornMarker - the backend's opaque torn-tail repair token.
 */
var PersistenceCoordinator = /** @class */ (function () {
    function PersistenceCoordinator(ctx, backend, options) {
        if (options === void 0) { options = {
            preparedSessionCacheSize: exports.DEFAULT_PREPARED_SESSION_CACHE_SIZE,
            writeBatchMaxDelayMs: exports.DEFAULT_WRITE_BATCH_MAX_DELAY_MS,
        }; }
        this.ctx = ctx;
        this.backend = backend;
        /** Backend bookkeeping keyed by session id (NOT the live Session object). */
        this.states = new Map();
        /** Lifecycle and write-behind state keyed by the exact live Session. */
        this.live = new Map();
        /** Exact disposed lifecycles whose buffered tail is still draining. */
        this.retirements = new Map();
        /**
         * Per-session serialization: every operation chains onto the prior one for the
         * same id, so writes for one session never interleave. Keyed by session id.
         */
        this.chains = new Map();
        if (!Number.isSafeInteger(options.preparedSessionCacheSize)
            || options.preparedSessionCacheSize < 1) {
            throw new TypeError('preparedSessionCacheSize must be a positive safe integer');
        }
        if (!Number.isSafeInteger(options.writeBatchMaxDelayMs)
            || options.writeBatchMaxDelayMs < 1
            || options.writeBatchMaxDelayMs > exports.MAX_WRITE_BATCH_DELAY_MS) {
            throw new TypeError("writeBatchMaxDelayMs must be an integer between 1 and ".concat(exports.MAX_WRITE_BATCH_DELAY_MS));
        }
        this.writeBatchMaxDelayMs = options.writeBatchMaxDelayMs;
        this.preparations = new preparations_ts_1.SessionPreparations(options.preparedSessionCacheSize);
        this.installWritePath();
    }
    // --- Public API (the backend's service methods delegate here) ---
    /**
     * Register detached session metadata for lazy creation on the first append.
     * @param meta - header to snapshot; duplicate tracked or persisted ids reject.
     */
    PersistenceCoordinator.prototype.create = function (meta) {
        var _this = this;
        // Snapshot before queueing so caller mutation cannot diverge the key and header.
        var snapshot = (0, dsh_session_1.snapshotJsonValue)(meta);
        if (snapshot === undefined) {
            return Promise.reject(new TypeError('session metadata must be losslessly JSON-serializable'));
        }
        if (!Number.isSafeInteger(snapshot.createdAt) || snapshot.createdAt < 0) {
            return Promise.reject(new TypeError('session metadata createdAt must be a non-negative safe integer'));
        }
        return this.serialize(snapshot.id, function () { return _this.createCore(snapshot); });
    };
    PersistenceCoordinator.prototype.createCore = function (meta) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // Do NOT clobber an existing session: the SessionId IS the identity.
                        if (this.states.has(meta.id) || this.preparations.has(meta.id)) {
                            throw new Error("session \"".concat(meta.id, "\" already exists in this backend"));
                        }
                        return [4 /*yield*/, this.backend.loadStored(meta.id)];
                    case 1:
                        // A persisted artifact under this id (in ANY scope) blocks creation: load/
                        // resume identify a session by id alone, so a second artifact would make
                        // resume nondeterministic.
                        if ((_a.sent()) !== undefined) {
                            throw new Error("session \"".concat(meta.id, "\" already has a persisted log on disk; load/resume it instead of creating"));
                        }
                        // Pure lazy: record intent only. No artifact until the first append.
                        this.states.set(meta.id, { meta: meta, cursor: 0, materialized: false });
                        return [2 /*return*/];
                }
            });
        });
    };
    // `async` so synchronous materialization failures below reject (not throw) per
    // the Promise<void> contract — callers use `await expect(...).rejects`.
    /**
     * Durably persist a batch of events. Honors the append-only and contiguous-seq
     * contracts; rejects non-JSON-serializable `event.data`.
     * @param id - the session the batch belongs to.
     * @param events - the contiguous batch to persist, in seq order; materialized
     *   as a detached lossless-JSON snapshot at call time.
     */
    PersistenceCoordinator.prototype.append = function (id, events) {
        return __awaiter(this, void 0, void 0, function () {
            var batch;
            var _this = this;
            return __generator(this, function (_a) {
                batch = (0, dsh_session_1.snapshotJsonValue)(events);
                if (batch === undefined) {
                    throw new TypeError('session event batch is not losslessly JSON-serializable because it contains non-JSON-serializable data');
                }
                return [2 /*return*/, this.serialize(id, function () { return _this.appendCore(id, batch); })];
            });
        });
    };
    PersistenceCoordinator.prototype.appendCore = function (id, events) {
        return __awaiter(this, void 0, void 0, function () {
            var state, _i, _a, _b, i, event_2;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        // Every append route converges here: the public service, live write-behind
                        // drains, and HMR seed/suffix adoption. Legacy-shape rejection stays at
                        // this shared boundary so a stale JavaScript plugin cannot persist a
                        // retired shape this backend refuses to load. The unknown-type guard is
                        // deliberately read-side only: an append-time refusal would stall a live
                        // session's durability mid-flight, which costs more than a loud refusal at
                        // the log's next load (trade-off owned by the session-log-version-mechanism
                        // Agent Note).
                        assertSupportedEvents(events, id);
                        if (events.length === 0)
                            return [2 /*return*/];
                        this.preparations.assertWritable(id);
                        state = this.states.get(id);
                        if (!(state === undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.adopt(id)
                            // Contiguity contract: each event's seq must continue the stored log.
                        ];
                    case 1:
                        state = _c.sent();
                        _c.label = 2;
                    case 2:
                        // Contiguity contract: each event's seq must continue the stored log.
                        for (_i = 0, _a = events.entries(); _i < _a.length; _i++) {
                            _b = _a[_i], i = _b[0], event_2 = _b[1];
                            if (event_2.seq !== state.cursor + i) {
                                throw new Error("append seq mismatch for \"".concat(id, "\": expected ").concat(state.cursor + i, " at index ").concat(i, ", got ").concat(event_2.seq));
                            }
                        }
                        return [4 /*yield*/, this.backend.appendBatch(state.meta, events, state.materialized)
                            // The durable write is the transaction: mark materialized + advance the
                            // cursor as soon as it commits (uniform across backends).
                        ];
                    case 3:
                        _c.sent();
                        // The durable write is the transaction: mark materialized + advance the
                        // cursor as soon as it commits (uniform across backends).
                        state.materialized = true;
                        state.cursor += events.length;
                        this.preparations.invalidate(id);
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Prepare and reserve the exact unpublished Session used by resume.
     * Revision retries converge once the durable log remains unchanged for one
     * read/check round trip; continuous external writers may delay completion.
     * @param id - persisted session to prepare.
     * @param signal - optional cancellation for reading and repair.
     * @returns an owned preparation released after publication or rollback.
     */
    PersistenceCoordinator.prototype.prepare = function (id, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var _loop_1, this_1, state_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _loop_1 = function () {
                            var reservation;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0: return [4 /*yield*/, this_1.waitForRetirement(id, signal)];
                                    case 1:
                                        _b.sent();
                                        if (this_1.ctx.sessions.get(id) !== undefined) {
                                            throw new Error("cannot prepare session \"".concat(id, "\" while it is live"));
                                        }
                                        return [4 /*yield*/, this_1.preparations.reserve(id, function () { return _this.serialize(id, function () { return _this.prepareCore(id); }); }, function (source) { return _this.serialize(id, function () { return _this.commitPrepared(source); }, signal); }, signal)];
                                    case 2:
                                        reservation = _b.sent();
                                        if (reservation === undefined)
                                            return [2 /*return*/, "continue"];
                                        if (this_1.ctx.sessions.get(id) !== undefined) {
                                            this_1.preparations.release(reservation, false);
                                            throw new Error("cannot prepare session \"".concat(id, "\" while it is live"));
                                        }
                                        return [2 /*return*/, { value: dsh_session_1.SessionPreparation.create(reservation.source.session, {
                                                    release: function () {
                                                        _this.preparations.release(reservation, reservation.state.owner === undefined
                                                            && reservation.source.session.events.length === reservation.source.sessionLength);
                                                    },
                                                }) }];
                                }
                            });
                        };
                        this_1 = this;
                        _a.label = 1;
                    case 1: return [5 /*yield**/, _loop_1()];
                    case 2:
                        state_1 = _a.sent();
                        if (typeof state_1 === "object")
                            return [2 /*return*/, state_1.value];
                        _a.label = 3;
                    case 3: return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Commit recovery and return its immutable logical view without publication.
     * Revision retries converge once the durable log remains unchanged for one
     * read/check round trip; continuous external writers may delay completion.
     * @param id - persisted session to load.
     * @returns prepared header and balanced events.
     */
    PersistenceCoordinator.prototype.load = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var live, reservation, attached;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.waitForRetirement(id)];
                    case 1:
                        _a.sent();
                        live = this.ctx.sessions.get(id);
                        if (live !== undefined)
                            return [2 /*return*/, this.loadLiveSnapshot(live)];
                        return [4 /*yield*/, this.preparations.reserve(id, function () { return _this.serialize(id, function () { return _this.prepareCore(id); }); }, function (source) { return _this.serialize(id, function () { return _this.commitPrepared(source); }); })];
                    case 2:
                        reservation = _a.sent();
                        if (reservation === undefined)
                            return [3 /*break*/, 3];
                        attached = this.ctx.sessions.get(id);
                        if (attached !== undefined) {
                            this.preparations.discard(reservation);
                            return [2 /*return*/, this.loadLiveSnapshot(attached)];
                        }
                        this.preparations.discard(reservation);
                        return [2 /*return*/, reservation.source.inspection];
                    case 3: return [3 /*break*/, 0];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Inspect a logical session without publishing it or committing recovery.
     * A stale ready source is reloaded. A source already committing or reserved
     * for resume remains exclusive, and inspection may borrow its immutable view.
     * Revision retries converge once the log is stable for one read/check round
     * trip; continuous external writers may delay completion.
     * @param id - persisted session to inspect.
     * @param signal - optional cancellation for preparation work.
     * @returns immutable prepared metadata and events; a live view may have an open turn.
     */
    PersistenceCoordinator.prototype.inspect = function (id, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var _loop_2, this_2, state_2;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _loop_2 = function () {
                            var live, source_1, attached, current, published, error_1, attached;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                                        if (!this_2.retirements.has(id)) return [3 /*break*/, 2];
                                        return [4 /*yield*/, this_2.waitForRetirement(id, signal)];
                                    case 1:
                                        _b.sent();
                                        _b.label = 2;
                                    case 2:
                                        live = this_2.ctx.sessions.get(id);
                                        if (live !== undefined)
                                            return [2 /*return*/, { value: this_2.inspectLive(live) }];
                                        _b.label = 3;
                                    case 3:
                                        _b.trys.push([3, 6, , 7]);
                                        return [4 /*yield*/, this_2.preparations.inspect(id, function () { return _this.serialize(id, function () { return _this.prepareCore(id); }); }, signal)];
                                    case 4:
                                        source_1 = _b.sent();
                                        attached = this_2.ctx.sessions.get(id);
                                        if (attached !== undefined)
                                            return [2 /*return*/, { value: this_2.inspectLive(attached) }];
                                        return [4 /*yield*/, this_2.serialize(id, function () { return _this.isPreparedSourceCurrent(source_1, signal); }, signal)];
                                    case 5:
                                        current = _b.sent();
                                        published = this_2.ctx.sessions.get(id);
                                        if (published !== undefined)
                                            return [2 /*return*/, { value: this_2.inspectLive(published) }];
                                        if (current)
                                            return [2 /*return*/, { value: source_1.inspection }];
                                        if (this_2.preparations.discardReady(id, source_1) === 'retained') {
                                            return [2 /*return*/, { value: source_1.inspection }];
                                        }
                                        return [3 /*break*/, 7];
                                    case 6:
                                        error_1 = _b.sent();
                                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                                        attached = this_2.ctx.sessions.get(id);
                                        if (attached !== undefined)
                                            return [2 /*return*/, { value: this_2.inspectLive(attached) }];
                                        throw error_1;
                                    case 7: return [2 /*return*/];
                                }
                            });
                        };
                        this_2 = this;
                        _a.label = 1;
                    case 1: return [5 /*yield**/, _loop_2()];
                    case 2:
                        state_2 = _a.sent();
                        if (typeof state_2 === "object")
                            return [2 /*return*/, state_2.value];
                        _a.label = 3;
                    case 3: return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Read the stored events from `fromSeq` onward, detached and non-mutating
     * (the read-from-seq primitive behind the service's `readFrom`). Runs on
     * the same per-id chain as writes; a backend with the seek-capable
     * {@link PersistenceBackend.loadStoredFrom} hook reads only the suffix,
     * every other backend reads its stored prefix and skips forward here.
     * @param id - persisted session to read.
     * @param fromSeq - first event seq to include; a non-negative safe integer.
     * @param signal - optional cancellation for queued and backend read work.
     * @returns stored header and the valid stored events with `seq >= fromSeq`.
     */
    PersistenceCoordinator.prototype.readFrom = function (id, fromSeq, signal) {
        var _this = this;
        if (!Number.isSafeInteger(fromSeq) || fromSeq < 0) {
            return Promise.reject(new TypeError("readFrom fromSeq must be a non-negative safe integer, got ".concat(String(fromSeq))));
        }
        var retired = Promise.resolve(this.retirements.get(id));
        var waited = signal === undefined ? retired : (0, preparations_ts_1.observeQueuedAbort)(retired, signal, function () { return false; });
        return waited.then(function () { return _this.serialize(id, function () { return _this.readFromCore(id, fromSeq, signal); }, signal); });
    };
    PersistenceCoordinator.prototype.readFromCore = function (id, fromSeq, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var suffix, error_2, whole_1, events, whole;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (!(this.backend.loadStoredFrom !== undefined)) return [3 /*break*/, 7];
                        suffix = void 0;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.backend.loadStoredFrom(id, fromSeq, signal)];
                    case 2:
                        suffix = _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            signal.throwIfAborted();
                        throw error_2;
                    case 4:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (suffix === undefined)
                            throw new Error("session \"".concat(id, "\" not found"));
                        this.assertStoredId(id, suffix.meta);
                        this.assertVersion(suffix.meta);
                        if (!suffix.events.some(needsLegacyPrefix)) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.readStoredPrefix(id, signal)];
                    case 5:
                        whole_1 = _a.sent();
                        return [2 /*return*/, { meta: whole_1.meta, events: whole_1.events.filter(function (event) { return event.seq >= fromSeq; }) }];
                    case 6:
                        events = snapshotStoredEvents(suffix.events, id);
                        this.assertEventsSupported(suffix.meta, events);
                        return [2 /*return*/, { meta: structuredClone(suffix.meta), events: events }];
                    case 7: return [4 /*yield*/, this.readStoredPrefix(id, signal)
                        // Sequential fallback: contiguous seqs from 0 make the suffix an index slice.
                    ];
                    case 8:
                        whole = _a.sent();
                        // Sequential fallback: contiguous seqs from 0 make the suffix an index slice.
                        return [2 /*return*/, { meta: whole.meta, events: whole.events.slice(fromSeq) }];
                }
            });
        });
    };
    /** Read one detached physical prefix without logical recovery or caching. */
    PersistenceCoordinator.prototype.readStoredPrefix = function (id, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var stored, events;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, this.backend.loadStored(id, signal)];
                    case 1:
                        stored = _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (stored === undefined)
                            throw new Error("session \"".concat(id, "\" not found"));
                        this.assertStoredId(id, stored.meta);
                        this.assertVersion(stored.meta);
                        events = snapshotStoredEvents(stored.events, id);
                        this.assertEventsSupported(stored.meta, events);
                        return [2 /*return*/, {
                                meta: structuredClone(stored.meta),
                                events: events,
                            }];
                }
            });
        });
    };
    /** Read, repair in memory, validate, and freeze one cold source once. */
    PersistenceCoordinator.prototype.prepareCore = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var stored, meta, events, revision, tornMarker, storedEvents, closers, balanced, session, inspection;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.backend.loadStored(id)];
                    case 1:
                        stored = _a.sent();
                        if (stored === undefined)
                            throw new Error("session \"".concat(id, "\" not found"));
                        try {
                            meta = stored.meta, events = stored.events, revision = stored.revision, tornMarker = stored.tornMarker;
                            this.assertStoredId(id, meta);
                            this.assertVersion(meta);
                            storedEvents = adoptStoredEvents(events, id);
                            this.assertEventsSupported(meta, storedEvents);
                            closers = (0, dsh_session_1.interruptedTurnClosers)(storedEvents).map(dsh_session_1.adoptSessionEvent);
                            balanced = __spreadArray(__spreadArray([], storedEvents, true), closers, true);
                            session = this.ctx.sessions.prepare(id, {
                                seed: balanced,
                                meta: meta,
                                seedSource: 'persistence',
                            });
                            inspection = Object.freeze({
                                meta: session.header,
                                events: Object.freeze(balanced),
                            });
                            return [2 /*return*/, {
                                    inspection: inspection,
                                    session: session,
                                    revision: revision,
                                    sessionLength: session.events.length,
                                    tornMarker: tornMarker,
                                    closers: closers,
                                }];
                        }
                        catch (error) {
                            // An unsupported format is a refusal over an intact log, not damage —
                            // surface it unwrapped so callers can point at the raw artifact.
                            if (error instanceof SessionFormatUnsupportedError)
                                throw error;
                            throw new SessionPersistenceCorruptionError("stored session \"".concat(id, "\" failed validation: ").concat(String(error)), { cause: error });
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Commit one prepared repair and establish its ownerless durable cursor. */
    PersistenceCoordinator.prototype.commitPrepared = function (source) {
        return __awaiter(this, void 0, void 0, function () {
            var id, cursor, existing, state;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        id = source.inspection.meta.id;
                        cursor = source.inspection.events.length;
                        existing = this.states.get(id);
                        if ((existing === null || existing === void 0 ? void 0 : existing.owner) !== undefined) {
                            throw new Error("session \"".concat(id, "\" already has a live persistence owner"));
                        }
                        return [4 /*yield*/, this.isPreparedSourceCurrent(source)];
                    case 1:
                        if (!(_a.sent()))
                            return [2 /*return*/, undefined];
                        if (!(source.tornMarker !== undefined || source.closers.length > 0)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.backend.commitRepair(source.inspection.meta, source.tornMarker, source.closers)
                            // The repair changed the durable revision. Reload the exact committed
                            // graph instead of associating the old in-memory view with a newer revision.
                        ];
                    case 2:
                        _a.sent();
                        // The repair changed the durable revision. Reload the exact committed
                        // graph instead of associating the old in-memory view with a newer revision.
                        return [2 /*return*/, undefined];
                    case 3:
                        state = existing !== null && existing !== void 0 ? existing : {
                            meta: source.inspection.meta,
                            cursor: cursor,
                            materialized: true,
                        };
                        state.meta = source.inspection.meta;
                        state.cursor = cursor;
                        state.materialized = true;
                        this.states.set(id, state);
                        return [2 /*return*/, {
                                source: source,
                                state: state,
                            }];
                }
            });
        });
    };
    /** Whether one cached source still names the current durable log revision. */
    PersistenceCoordinator.prototype.isPreparedSourceCurrent = function (source, signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.backend.readStoredRevision(source.inspection.meta.id, signal)];
                    case 1: return [2 /*return*/, (_a.sent()) === source.revision];
                }
            });
        });
    };
    /** Return one durable immutable view of an already-live Session. */
    PersistenceCoordinator.prototype.loadLiveSnapshot = function (session) {
        return __awaiter(this, void 0, void 0, function () {
            var events, state;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        events = session.events;
                        return [4 /*yield*/, this.flush(session)];
                    case 1:
                        _a.sent();
                        state = this.states.get(session.id);
                        /* v8 ignore next -- successful flush always publishes this live session's durable state */
                        if (state === undefined)
                            throw new Error("session \"".concat(session.id, "\" lost persistence state during load"));
                        if (events.length === 0)
                            throw new Error("session \"".concat(session.id, "\" not found"));
                        if ((0, dsh_session_1.interruptedTurnClosers)(events).length > 0) {
                            throw new Error("cannot load session \"".concat(session.id, "\" while its live turn is open; use the live Session or wait for the turn to close"));
                        }
                        return [2 /*return*/, Object.freeze({ meta: state.meta, events: events })];
                }
            });
        });
    };
    /** Borrow one immutable view from an already-live Session. */
    PersistenceCoordinator.prototype.inspectLive = function (session) {
        return Object.freeze({ meta: session.header, events: session.events });
    };
    /** Await one retiring lifecycle with caller cancellation. */
    PersistenceCoordinator.prototype.waitForRetirement = function (id, signal) {
        var retired = Promise.resolve(this.retirements.get(id));
        return signal === undefined
            ? retired
            : (0, preparations_ts_1.observeQueuedAbort)(retired, signal, function () { return false; });
    };
    // Listing is a direct backend read and needs no coordinator state.
    // --- per-id serialization + adoption helpers ---
    /**
     * Run `op` after any in-flight operation for the same session id, so writes for
     * one session never interleave. Errors do not poison the chain. NOTE: serialized
     * public methods must NOT call each other (deadlock); they call the unserialized
     * `*Core` helpers instead.
     */
    PersistenceCoordinator.prototype.serialize = function (id, op, signal) {
        var _this = this;
        var _a;
        var prior = (_a = this.chains.get(id)) !== null && _a !== void 0 ? _a : Promise.resolve();
        var started = false;
        var run = function () {
            signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
            started = true;
            return op();
        };
        var next = prior.then(run, run);
        // Keep the chain alive but swallow this op's rejection for the NEXT waiter
        // (the caller still sees the real rejection via `next`).
        var tail = next.then(function () { return undefined; }, function () { return undefined; });
        this.chains.set(id, tail);
        // Settled tails carry no serialization value. Delete only the exact tail
        // installed above: a later operation may already have replaced it.
        void tail.then(function () {
            if (_this.chains.get(id) === tail)
                _this.chains.delete(id);
        });
        return signal === undefined ? next : (0, preparations_ts_1.observeQueuedAbort)(next, signal, function () { return started; });
    };
    /** Build a state for a session discovered in storage but not yet in memory. */
    PersistenceCoordinator.prototype.adopt = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var source, _a, committed;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!((_b = this.preparations.takeReady(id)) !== null && _b !== void 0)) return [3 /*break*/, 1];
                        _a = _b;
                        return [3 /*break*/, 3];
                    case 1: return [4 /*yield*/, this.prepareCore(id)];
                    case 2:
                        _a = _c.sent();
                        _c.label = 3;
                    case 3:
                        source = _a;
                        return [4 /*yield*/, this.commitPrepared(source)];
                    case 4:
                        committed = _c.sent();
                        if (committed !== undefined)
                            return [2 /*return*/, committed.state];
                        _c.label = 5;
                    case 5: return [3 /*break*/, 0];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    PersistenceCoordinator.prototype.assertVersion = function (meta) {
        if (meta.version === dsh_session_1.SESSION_FORMAT_VERSION)
            return;
        throw this.unsupported(meta, sessionFormatVersionRefusal(meta.id, meta.version));
    };
    /**
     * Refuse a log containing an event type this build does not know, unless the
     * writer marked the event ignorable: an unrecognized required event may
     * change how the rest of the log must be interpreted, so silently skipping
     * it would reconstruct a wrong session (the envelope contract on
     * `SessionEvent.ignorable`). Runs on NORMALIZED events — after
     * `snapshotStoredEvents`/`adoptStoredEvents` has upgraded the legacy shapes
     * this build still reads and rejected the ones it does not, so those keep
     * their specific diagnostics.
     */
    PersistenceCoordinator.prototype.assertEventsSupported = function (meta, events) {
        for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
            var event_3 = events_1[_i];
            if (dsh_session_1.KNOWN_SESSION_EVENT_TYPES.has(event_3.type) || event_3.ignorable === true)
                continue;
            throw this.unsupported(meta, "session \"".concat(meta.id, "\" contains event type \"").concat(event_3.type, "\" (seq ").concat(event_3.seq, ") unknown to this harness and not marked ignorable; refusing to interpret the log \u2014 it was likely written by a newer harness"));
        }
    };
    /** Build a format refusal that points at the raw artifact when the backend has one. */
    PersistenceCoordinator.prototype.unsupported = function (meta, reason) {
        var _a, _b;
        var location = (_b = (_a = this.backend).locate) === null || _b === void 0 ? void 0 : _b.call(_a, meta);
        return new SessionFormatUnsupportedError(location === undefined ? reason : "".concat(reason, " (raw log: ").concat(location.path, ")"), location);
    };
    /** Reject backend metadata that is not bound to the requested session id. */
    PersistenceCoordinator.prototype.assertStoredId = function (id, meta) {
        if (meta.id !== id) {
            throw new Error("stored session identity mismatch: requested \"".concat(id, "\", header contains \"").concat(meta.id, "\""));
        }
    };
    // --- write path (session/event → flush drain) ---
    PersistenceCoordinator.prototype.installWritePath = function () {
        var _this = this;
        var ctx = this.ctx;
        // Register the disposer BEFORE the listeners. Cordis tears effects down in
        // reverse registration order, so event admission closes before this final
        // drain reaches quiescence and closes the backend.
        ctx.effect(function () { return function () { return __awaiter(_this, void 0, void 0, function () {
            var disposeError, errors, error_3, closeError_1;
            var _this = this;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 5, 6, 10]);
                        return [4 /*yield*/, settledErrors(__spreadArray([], this.live.keys(), true).map(function (session) { return _this.flush(session); }))];
                    case 1:
                        errors = _c.sent();
                        _c.label = 2;
                    case 2:
                        if (!(this.chains.size > 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, Promise.allSettled(__spreadArray([], this.chains.values(), true))];
                    case 3:
                        _c.sent();
                        return [3 /*break*/, 2];
                    case 4:
                        if (errors.length > 0) {
                            throw new AggregateError(errors, "".concat(this.backend.name, " dispose failed"));
                        }
                        return [3 /*break*/, 10];
                    case 5:
                        error_3 = _c.sent();
                        disposeError = error_3;
                        throw error_3;
                    case 6:
                        _c.trys.push([6, 8, , 9]);
                        return [4 /*yield*/, ((_b = (_a = this.backend).close) === null || _b === void 0 ? void 0 : _b.call(_a))];
                    case 7:
                        _c.sent();
                        return [3 /*break*/, 9];
                    case 8:
                        closeError_1 = _c.sent();
                        // A close failure can only add teardown context; keep the already-
                        // captured drain AggregateError as the primary failure rather than
                        // masking it. Only surface the close error if the drain succeeded.
                        /* v8 ignore start -- close failure racing disposal is a defensive teardown edge */
                        if (disposeError === undefined)
                            throw closeError_1;
                        return [3 /*break*/, 9];
                    case 9: return [7 /*endfinally*/];
                    case 10: return [2 /*return*/];
                }
            });
        }); }; }, "".concat(this.backend.name, " write path"));
        // Capture the header on creation and persist a fork's seed once.
        ctx.on('session/created', function (session) {
            void _this.initFor(session);
        });
        // Keep a persistence-owned copy of each frozen event and start its bounded window.
        ctx.on('session/event', function (session, event) {
            var live = _this.initFor(session);
            live.writes.enqueue(event);
        });
        // Callers use flush as the immediate durability barrier for buffered writes.
        ctx.on('session/flush', function (session) { return _this.flush(session); });
        // Session disposal is observe-only, so retirement contains its own failure.
        ctx.on('session/disposed', function (session) { _this.retire(session); });
        // HMR: a hot reload does not replay session/created, so seed existing live
        // sessions (mirrors dsh-invariants).
        for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
            var session = _a[_i];
            void this.initFor(session);
        }
    };
    /** Start and observe one disposed session's final drain. */
    PersistenceCoordinator.prototype.retire = function (session) {
        var _this = this;
        if (!this.live.has(session))
            return;
        var retirement = this.retireCore(session);
        this.retirements.set(session.id, retirement);
        var forget = function () {
            if (_this.retirements.get(session.id) === retirement)
                _this.retirements.delete(session.id);
        };
        void retirement.then(forget, forget);
        void retirement.catch(function (error) {
            _this.ctx.logger.warn("".concat(_this.backend.name, ": session \"").concat(session.id, "\" retirement failed: ").concat(String(error)));
        });
    };
    /** Drain and release state owned by one exact disposed Session lifecycle. */
    PersistenceCoordinator.prototype.retireCore = function (session) {
        return __awaiter(this, void 0, void 0, function () {
            var id;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.flush(session)];
                    case 1:
                        _a.sent();
                        id = session.header.id;
                        return [4 /*yield*/, this.serialize(id, function () {
                                var _a;
                                _this.live.delete(session);
                                if (((_a = _this.states.get(id)) === null || _a === void 0 ? void 0 : _a.owner) === session)
                                    _this.states.delete(id);
                            })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Return the one lifecycle controller for a live session, creating it if needed. */
    PersistenceCoordinator.prototype.initFor = function (session) {
        var _this = this;
        var existing = this.live.get(session);
        if (existing)
            return existing;
        var reservation = this.preparations.reservationFor(session);
        if (reservation !== undefined) {
            var restored = this.attachPrepared(session, reservation);
            this.live.set(session, restored);
            return restored;
        }
        // Session owns this stable deep-frozen snapshot; backends only serialize it.
        var seed = session.events;
        var live = {
            init: Promise.resolve(),
            writes: this.createWriteBehind(session, function () { return live.init; }),
        };
        this.live.set(session, live);
        live.init = this.serialize(session.header.id, function () { return _this.onCreated(session, seed); });
        live.init.catch(function () { });
        return live;
    };
    /** Bind one exact prepared Session and persist only its unpublished suffix. */
    PersistenceCoordinator.prototype.attachPrepared = function (session, reservation) {
        var _this = this;
        var source = reservation.source, state = reservation.state;
        if (source.session !== session || state.owner !== undefined
            || state.cursor !== source.inspection.events.length
            || session.firstLiveSeq !== state.cursor) {
            throw new Error("session \"".concat(session.id, "\" preparation no longer matches its persistence state"));
        }
        var suffix = session.events.slice(state.cursor).map(function (event) { return structuredClone(event); });
        this.preparations.attach(reservation);
        state.owner = session;
        var live = {
            init: Promise.resolve(),
            writes: this.createWriteBehind(session, function () { return live.init; }),
        };
        if (suffix.length > 0) {
            live.init = this.serialize(session.id, function () { return _this.appendCore(session.id, suffix); });
            live.init.catch(function () { });
        }
        return live;
    };
    /**
     * Whether a live session's `seed` reproduces the first `cursor` persisted
     * events. A `cursor` of 0 (nothing persisted yet) trivially matches. Used when
     * a live session claims ownerless state left by a prior `load()`/`create()`.
     */
    PersistenceCoordinator.prototype.seedMatchesPersisted = function (id, seed, cursor) {
        return __awaiter(this, void 0, void 0, function () {
            var stored;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (cursor === 0)
                            return [2 /*return*/, true];
                        return [4 /*yield*/, this.backend.loadStored(id)
                            /* v8 ignore next -- a cursor > 0 means the session was materialized, so it exists */
                        ];
                    case 1:
                        stored = _a.sent();
                        /* v8 ignore next -- a cursor > 0 means the session was materialized, so it exists */
                        if (stored === undefined)
                            return [2 /*return*/, false];
                        this.assertStoredId(id, stored.meta);
                        return [2 /*return*/, seedCoversPrefix(seed, snapshotStoredEvents(stored.events, id).slice(0, cursor))];
                }
            });
        });
    };
    /**
     * On session/created: sync the backend's in-memory state to a live Session.
     *
     * Cases, by whether this backend tracks the id and whether an artifact exists:
     *   1. Already tracked → no-op (or claim ownerless state if the seed matches,
     *      or reclaim a truly-abandoned id, else reject as a collision).
     *   2. Not tracked, an artifact EXISTS at the same cwd and is a seq-aligned
     *      PREFIX of the live events → ADOPT it, persisting any live suffix.
     *   3. Not tracked, an artifact EXISTS at another cwd or is NOT a prefix →
     *      REJECT (collision).
     *   4. Not tracked and NO artifact → a genuinely new session: register meta
     *      (lazy) and persist its seed once.
     */
    PersistenceCoordinator.prototype.onCreated = function (session, seed) {
        return __awaiter(this, void 0, void 0, function () {
            var id, tracked, suffix, owner, live, meta, created;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        id = session.header.id;
                        tracked = this.states.get(id);
                        if (!(tracked !== undefined)) return [3 /*break*/, 5];
                        // case 1: already tracked.
                        /* v8 ignore next -- initFor dedupes per session object; same-object re-entry can't occur */
                        if (tracked.owner === session)
                            return [2 /*return*/];
                        if (!(tracked.owner === undefined)) return [3 /*break*/, 4];
                        // Ownerless state from the public create()/load() API. The FIRST live
                        // session claims it — but ONLY if BOTH the cwd scope and the seed match.
                        // A same-id ownerless artifact at a different cwd is a collision, not a
                        // claim: accepting it would append this live session's events through
                        // the stored header's cwd. The seed guard then ensures the live events
                        // reproduce the persisted prefix; otherwise a fresh session reusing the
                        // id could have its leading events filtered as already written.
                        if (tracked.meta.cwd !== session.header.cwd) {
                            throw new Error("session \"".concat(id, "\" is already persisted at a different cwd (persisted: ").concat(String(tracked.meta.cwd), ", live: ").concat(String(session.header.cwd), ") (id collision)"));
                        }
                        return [4 /*yield*/, this.seedMatchesPersisted(id, seed, tracked.cursor)];
                    case 1:
                        if (!(_a.sent())) {
                            throw new Error("session \"".concat(id, "\" is already persisted with ").concat(tracked.cursor, " event(s) that do not match this live session (id collision)"));
                        }
                        tracked.owner = session;
                        suffix = seed.slice(tracked.cursor);
                        if (!(suffix.length > 0)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.appendCore(id, suffix)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                    case 4:
                        owner = this.live.get(tracked.owner);
                        if (!tracked.materialized && !(owner === null || owner === void 0 ? void 0 : owner.writes.hasWork)) {
                            this.states.delete(id);
                        }
                        else {
                            throw new Error("session \"".concat(id, "\" is already bound to a different live session in this backend (id collision)"));
                        }
                        _a.label = 5;
                    case 5: return [4 /*yield*/, this.backend.loadStored(id)];
                    case 6:
                        live = _a.sent();
                        if (!(live !== undefined)) return [3 /*break*/, 8];
                        // Do NOT route through cold preparation: that crash-repairs open turns as
                        // interrupted, which is wrong for HMR while the live Session is still the
                        // authority and may append the real step/turn end later.
                        return [4 /*yield*/, this.adoptLivePrefix(session, seed, live)];
                    case 7:
                        // Do NOT route through cold preparation: that crash-repairs open turns as
                        // interrupted, which is wrong for HMR while the live Session is still the
                        // authority and may append the real step/turn end later.
                        _a.sent();
                        return [2 /*return*/];
                    case 8:
                        meta = __assign({}, session.header);
                        return [4 /*yield*/, this.createCore(meta)
                            // Bind this state to the live session so a later DIFFERENT session reusing
                            // the id is detected as a collision (case 1) rather than silently no-opped.
                        ];
                    case 9:
                        _a.sent();
                        created = this.states.get(id);
                        /* v8 ignore next -- create() always sets the state for the id */
                        if (created !== undefined)
                            created.owner = session;
                        if (!(seed.length > 0)) return [3 /*break*/, 11];
                        return [4 /*yield*/, this.appendCore(id, seed)];
                    case 10:
                        _a.sent();
                        _a.label = 11;
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Adopt a stored prefix as a live session's history (HMR/reload): verify the
     * seed covers the stored prefix, truncate any torn tail (NOT the open turn —
     * the live Session is still the authority), bind ownership, and persist the
     * live suffix that was ahead of the stored prefix.
     */
    PersistenceCoordinator.prototype.adoptLivePrefix = function (session, seed, stored) {
        return __awaiter(this, void 0, void 0, function () {
            var meta, events, tornMarker, storedEvents, suffix;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        meta = stored.meta, events = stored.events, tornMarker = stored.tornMarker;
                        this.assertStoredId(session.header.id, meta);
                        if (meta.cwd !== session.header.cwd) {
                            throw new Error("session \"".concat(session.header.id, "\" is already persisted at a different cwd (persisted: ").concat(String(meta.cwd), ", live: ").concat(String(session.header.cwd), ") (id collision)"));
                        }
                        this.assertVersion(meta);
                        storedEvents = snapshotStoredEvents(events, session.header.id);
                        this.assertEventsSupported(meta, storedEvents);
                        if (!seedCoversPrefix(seed, storedEvents)) {
                            throw new Error("session \"".concat(session.header.id, "\" already has a persisted log on disk that does not match this live session (id collision)"));
                        }
                        if (!(tornMarker !== undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.backend.commitRepair(meta, tornMarker, [])];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        this.states.set(session.header.id, {
                            meta: __assign({}, meta),
                            cursor: storedEvents.length,
                            materialized: true,
                            owner: session,
                        });
                        suffix = seed.slice(storedEvents.length);
                        if (!(suffix.length > 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.appendCore(session.header.id, suffix)];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    PersistenceCoordinator.prototype.flush = function (session) {
        return __awaiter(this, void 0, void 0, function () {
            var live, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        live = this.initFor(session);
                        live.writes.cancelAutomaticWait();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, live.init];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_4 = _a.sent();
                        // Admission is closed during retirement/teardown, but an ordinary flush
                        // may have raced one last enqueue while initialization was pending.
                        live.writes.cancelAutomaticWait();
                        throw error_4;
                    case 4: return [4 /*yield*/, live.writes.flush()];
                    case 5:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Build one package-private write controller around initialization and id serialization. */
    PersistenceCoordinator.prototype.createWriteBehind = function (session, ready) {
        var _this = this;
        return new write_behind_ts_1.SessionWriteBehind({
            maxDelayMs: this.writeBatchMaxDelayMs,
            write: function (batch) { return __awaiter(_this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, ready()];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, this.serialize(session.header.id, function () { return _this.appendLiveBatch(session.header.id, batch); })];
                        case 2:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); },
            reportBackgroundFailure: function (error) {
                _this.ctx.logger.warn("".concat(_this.backend.name, ": background write for session \"").concat(session.id, "\" failed (buffered events retained): ").concat(String(error)));
            },
        });
    };
    /** Append one controller-owned prefix after filtering events initialization already stored. */
    PersistenceCoordinator.prototype.appendLiveBatch = function (id, batch) {
        return __awaiter(this, void 0, void 0, function () {
            var state, cursor, fresh;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        state = this.states.get(id);
                        cursor = (_a = state === null || state === void 0 ? void 0 : state.cursor) !== null && _a !== void 0 ? _a : 0;
                        fresh = batch.filter(function (e) { return e.seq >= cursor; });
                        return [4 /*yield*/, this.appendCore(id, fresh)];
                    case 1:
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return PersistenceCoordinator;
}());
exports.PersistenceCoordinator = PersistenceCoordinator;
