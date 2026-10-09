"use strict";
/**
 * Durable session-persistence Service Definition (`ctx.sessionPersistence`). Backends store
 * {@link SessionEvent}s as the event-sourced log and carry non-replayable
 * {@link SessionHeader} metadata separately.
 * @module @z/dsh-session-persistence
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionPersistence = exports.sessionFormatVersionRefusal = exports.SessionPersistenceCorruptionError = exports.SessionFormatUnsupportedError = exports.PersistenceCoordinator = exports.MAX_WRITE_BATCH_DELAY_MS = exports.DEFAULT_WRITE_BATCH_MAX_DELAY_MS = exports.DEFAULT_PREPARED_SESSION_CACHE_SIZE = exports.SessionPersistenceRevision = void 0;
var cordis_1 = require("@z/cordis");
var dsh_session_1 = require("@z/dsh-session");
var revision_ts_1 = require("./revision.ts");
Object.defineProperty(exports, "SessionPersistenceRevision", { enumerable: true, get: function () { return revision_ts_1.SessionPersistenceRevision; } });
// The backend-agnostic write-path orchestration first-party backends compose.
var coordinator_ts_1 = require("./coordinator.ts");
Object.defineProperty(exports, "DEFAULT_PREPARED_SESSION_CACHE_SIZE", { enumerable: true, get: function () { return coordinator_ts_1.DEFAULT_PREPARED_SESSION_CACHE_SIZE; } });
Object.defineProperty(exports, "DEFAULT_WRITE_BATCH_MAX_DELAY_MS", { enumerable: true, get: function () { return coordinator_ts_1.DEFAULT_WRITE_BATCH_MAX_DELAY_MS; } });
Object.defineProperty(exports, "MAX_WRITE_BATCH_DELAY_MS", { enumerable: true, get: function () { return coordinator_ts_1.MAX_WRITE_BATCH_DELAY_MS; } });
Object.defineProperty(exports, "PersistenceCoordinator", { enumerable: true, get: function () { return coordinator_ts_1.PersistenceCoordinator; } });
Object.defineProperty(exports, "SessionFormatUnsupportedError", { enumerable: true, get: function () { return coordinator_ts_1.SessionFormatUnsupportedError; } });
Object.defineProperty(exports, "SessionPersistenceCorruptionError", { enumerable: true, get: function () { return coordinator_ts_1.SessionPersistenceCorruptionError; } });
Object.defineProperty(exports, "sessionFormatVersionRefusal", { enumerable: true, get: function () { return coordinator_ts_1.sessionFormatVersionRefusal; } });
/**
 * Durable append-only session storage. Implementations preserve contiguous,
 * losslessly JSON-serializable events; {@link append} resolves only after
 * durability, and {@link load} balances a complete interrupted tail without
 * rewriting committed events.
 */
var SessionPersistence = /** @class */ (function (_super) {
    __extends(SessionPersistence, _super);
    function SessionPersistence(ctx) {
        return _super.call(this, ctx, 'sessionPersistence') || this;
    }
    /**
     * Read a session's backend-owned artifact text verbatim — the exact durable
     * bytes the backend wrote (decoded from its physical encoding, e.g. a
     * decompressed JSONL). The returned `content` is the raw text, not a
     * reconstruction from parsed events, so it preserves backend-specific
     * serialization (chunk packing, key order, line breaks). Callers first test
     * {@link supportsRawArtifacts}; `undefined` then means only that the requested
     * session has no materialized artifact.
     * @param _id - the persisted session to read (unused by the default: no
     * per-session artifact).
     * @param signal - optional cancellation for backend read work.
     * @returns the raw artifact plus its parsed header, or `undefined` when the
     * session is absent.
     * @throws when this backend does not expose per-session raw artifacts.
     */
    SessionPersistence.prototype.readRaw = function (_id, signal) {
        if ((signal === null || signal === void 0 ? void 0 : signal.aborted) === true) {
            return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
        }
        return Promise.reject(new Error('this session persistence backend does not expose raw artifacts'));
    };
    /**
     * Prepare the exact unpublished Session used by resume. Implementations may
     * reuse object graphs retained by an earlier {@link inspect} after confirming
     * their durable revision is still current; disposal releases an unpublished
     * reservation. Revision retries require the durable log to remain unchanged
     * for one read/check round trip; continuous external writers may delay completion.
     * @param id - persisted session to prepare.
     * @param signal - optional cancellation for preparation work.
     * @returns one owned unpublished Session preparation.
     */
    SessionPersistence.prototype.prepare = function (id, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var loaded, sessions;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, this.load(id)];
                    case 1:
                        loaded = _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        sessions = this.ctx.get('sessions');
                        if (sessions === undefined) {
                            throw new Error('cannot prepare a session: SessionStore is not configured');
                        }
                        return [2 /*return*/, dsh_session_1.SessionPreparation.create(sessions.prepare(id, {
                                seed: loaded.events.map(function (event) { return structuredClone(event); }),
                                meta: structuredClone(loaded.meta),
                                seedSource: 'persistence',
                            }))];
                }
            });
        });
    };
    return SessionPersistence;
}(cordis_1.Service));
exports.SessionPersistence = SessionPersistence;
exports.default = SessionPersistence;
