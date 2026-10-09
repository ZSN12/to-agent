"use strict";
/**
 * JSONL durable session-persistence backend. It stores a header and contiguous
 * events in one append-only file per session, and delegates orchestration to
 * {@link PersistenceCoordinator}. Its side-effect-free locator returns the
 * absolute per-session log target before materialization.
 * @module @z/dsh-session-persistence-jsonl
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
exports.JsonlSessionPersistence = exports.JsonlCompressionSchema = void 0;
var schemastery_1 = require("@z/schemastery");
var node_fs_1 = require("node:fs");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var node_perf_hooks_1 = require("node:perf_hooks");
var promises_2 = require("node:timers/promises");
var node_crypto_1 = require("node:crypto");
var dsh_session_persistence_1 = require("@z/dsh-session-persistence");
var format_ts_1 = require("./format.ts");
var zstd_ts_1 = require("./zstd.ts");
var win32_ts_1 = require("./win32.ts");
var DEFAULT_PACK_CHUNKS = true;
var DEFAULT_COMPRESSION = 'zstd';
/**
 * Internal scheduling constant, not deployment configuration: balance
 * frame-boundary event-loop yields against `setImmediate` overhead. One frame
 * remains an indivisible synchronous decode.
 */
var ZSTD_DECODE_YIELD_INTERVAL_MS = 500;
/** Assert that the independently decodable first frame contains only the header record. */
function assertZstdHeaderFrame(plaintext) {
    if (plaintext.length === 0 || plaintext.indexOf(0x0A) !== plaintext.length - 1) {
        throw new Error('corrupt Zstandard session log: first frame is not exactly one header line');
    }
}
/** Loader schema for the JSONL artifact's physical encoding. */
exports.JsonlCompressionSchema = schemastery_1.default.union([
    schemastery_1.default.const('zstd'),
    schemastery_1.default.const('none'),
]).default(DEFAULT_COMPRESSION);
/** Build the source-qualified revision shared by full and lightweight reads. */
function fileRevision(identity) {
    return (0, dsh_session_persistence_1.SessionPersistenceRevision)([
        identity.dev,
        identity.ino,
        identity.size,
        identity.mtimeNs,
        identity.ctimeNs,
    ].join(':'));
}
/** Whether a filesystem error means absence; every non-ENOENT failure must surface. */
function isENOENT(error) {
    return (error === null || error === void 0 ? void 0 : error.code) === 'ENOENT';
}
/**
 * The JSONL persistence backend. Load as a plugin; it registers as
 * `ctx.sessionPersistence` and (via the coordinator) installs the write-path
 * listeners. Its torn-tail marker carries the byte offset and any events
 * recovered from an incomplete final Zstandard frame.
 */
var JsonlSessionPersistence = /** @class */ (function (_super) {
    __extends(JsonlSessionPersistence, _super);
    function JsonlSessionPersistence(ctx, config) {
        var _a, _b, _c, _d;
        var _this = _super.call(this, ctx) || this;
        _this.config = config;
        _this.supportsRawArtifacts = true;
        /**
         * Backend label for coordinator diagnostics and effects. It shadows
         * `Service.name` without changing the service key captured by the base
         * constructor.
         */
        _this.name = 'session-persistence-jsonl';
        // Resolve once so later process.cwd() changes cannot split one backend across roots.
        _this.root = (0, node_path_1.resolve)(config.root);
        // Programmatic wrappers may construct the backend without Schemastery normalization.
        var preparedSessionCacheSize = (_a = config.preparedSessionCacheSize) !== null && _a !== void 0 ? _a : dsh_session_persistence_1.DEFAULT_PREPARED_SESSION_CACHE_SIZE;
        var writeBatchMaxDelayMs = (_b = config.writeBatchMaxDelayMs) !== null && _b !== void 0 ? _b : dsh_session_persistence_1.DEFAULT_WRITE_BATCH_MAX_DELAY_MS;
        _this.packChunks = (_c = config.packChunks) !== null && _c !== void 0 ? _c : DEFAULT_PACK_CHUNKS;
        _this.compression = (_d = config.compression) !== null && _d !== void 0 ? _d : DEFAULT_COMPRESSION;
        _this.assertUsableRoot();
        _this.coordinator = new dsh_session_persistence_1.PersistenceCoordinator(_this.ctx, _this, {
            preparedSessionCacheSize: preparedSessionCacheSize,
            writeBatchMaxDelayMs: writeBatchMaxDelayMs,
        });
        return _this;
    }
    // Each backend keeps the typed service API beside its storage hooks;
    // extracting these trivial forwards would add an inheritance layer.
    /* jscpd:ignore-start */
    // --- SessionPersistence service API (delegated to the coordinator) ---
    /** Resolve the absolute target path without touching the filesystem. */
    JsonlSessionPersistence.prototype.locate = function (meta) {
        return { kind: 'jsonl', path: (0, format_ts_1.logPath)(this.root, meta.cwd, meta.id, this.compression) };
    };
    JsonlSessionPersistence.prototype.create = function (meta) {
        return this.coordinator.create(meta);
    };
    JsonlSessionPersistence.prototype.append = function (id, events) {
        return this.coordinator.append(id, events);
    };
    JsonlSessionPersistence.prototype.prepare = function (id, signal) {
        return this.coordinator.prepare(id, signal);
    };
    JsonlSessionPersistence.prototype.load = function (id) {
        return this.coordinator.load(id);
    };
    JsonlSessionPersistence.prototype.inspect = function (id, signal) {
        return this.coordinator.inspect(id, signal);
    };
    // JSONL is sequential media: no loadStoredFrom hook, so the coordinator
    // parses the stored prefix (both encodings) and skips forward to fromSeq.
    JsonlSessionPersistence.prototype.readFrom = function (id, fromSeq, signal) {
        return this.coordinator.readFrom(id, fromSeq, signal);
    };
    // One method serves both public `list` and the backend hook; delegating it to
    // the coordinator would call this hook recursively.
    /* jscpd:ignore-end */
    // --- PersistenceBackend hooks (the file-bytes storage primitives) ---
    /** Read a stored prefix by id across all project directories when cwd is unknown. */
    JsonlSessionPersistence.prototype.loadStored = function (id, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var path;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, this.ensureRootEncoding()];
                    case 1:
                        _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, this.findLog(id, signal)];
                    case 2:
                        path = _a.sent();
                        if (path === undefined)
                            return [2 /*return*/, undefined];
                        return [2 /*return*/, this.readPrefix(path, id, signal)];
                }
            });
        });
    };
    /**
     * Read one log's stat-derived revision without loading its event bytes.
     * Resolving an id with unknown cwd still scans the project directories.
     */
    JsonlSessionPersistence.prototype.readStoredRevision = function (id, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var path, identity, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, this.ensureRootEncoding()];
                    case 1:
                        _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, this.findLog(id, signal)];
                    case 2:
                        path = _a.sent();
                        if (path === undefined)
                            return [2 /*return*/, undefined];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, (0, promises_1.stat)(path, { bigint: true })];
                    case 4:
                        identity = _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, fileRevision(identity)];
                    case 5:
                        error_1 = _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (isENOENT(error_1))
                            return [2 /*return*/, undefined];
                        throw error_1;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Read a session's stored artifact text verbatim: the durable file bytes
     * decoded from this backend's physical encoding (complete zstd frames
     * concatenated, or UTF-8 plaintext). The content is the exact JSONL text the
     * backend wrote — never a reconstruction from parsed events — so packed-
     * chunk rows, key order, and line breaks survive byte-for-byte. A torn
     * final frame is omitted, matching the committed-prefix semantics of every
     * other read.
     * @param id - the persisted session to read.
     * @param signal - optional cancellation for the stat/read/decode work.
     * @returns the raw artifact text plus the header parsed from its own first
     * line, or `undefined` when the session has no stored artifact.
     */
    JsonlSessionPersistence.prototype.readRaw = function (id, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var path, buffer, content, frames_1, decoder, plaintexts, _i, _a, plaintext, meta;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, this.ensureRootEncoding()];
                    case 1:
                        _b.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, this.findLog(id, signal)];
                    case 2:
                        path = _b.sent();
                        if (path === undefined)
                            return [2 /*return*/, undefined];
                        return [4 /*yield*/, this.readStableFile(path, signal)];
                    case 3:
                        buffer = (_b.sent()).buffer;
                        if (this.compression === 'zstd') {
                            frames_1 = (0, zstd_ts_1.scanZstdFrames)(buffer).frames;
                            if (frames_1.length === 0)
                                throw new Error('empty or header-less Zstandard session log');
                            decoder = (0, zstd_ts_1.createZstdFrameDecoder)();
                            plaintexts = [];
                            // The decoder yields views into a reused buffer; copy each frame's
                            // plaintext immediately so a later concat cannot read overwritten memory.
                            for (_i = 0, _a = decoder.decode(buffer, frames_1); _i < _a.length; _i++) {
                                plaintext = _a[_i];
                                signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                                plaintexts.push(Buffer.from(plaintext));
                            }
                            content = Buffer.concat(plaintexts).toString('utf8');
                        }
                        else {
                            content = buffer.toString('utf8');
                        }
                        meta = (0, format_ts_1.parseHeaderMeta)(content.split('\n', 1)[0]);
                        if (meta === undefined || meta.id !== id) {
                            throw new Error("corrupt session log: invalid header line in \"".concat(path, "\""));
                        }
                        // The logical artifact name is `session.jsonl` regardless of the physical
                        // encoding suffix (`.jsonl.zstd` marks compression only).
                        return [2 /*return*/, { meta: meta, filename: 'session.jsonl', content: content }];
                }
            });
        });
    };
    /**
     * Read a file's bytes under a revision-stable loop: a writer appending
     * between stat and readFile would yield a torn physical file, so retry
     * while the stat revision changes.
     * @param path - the artifact file to read.
     * @param signal - optional cancellation for the stat/read work.
     * @returns the stable bytes and the revision that matched both stats.
     */
    JsonlSessionPersistence.prototype.readStableFile = function (path, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var before, _a, buffer, after, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        _a = fileRevision;
                        return [4 /*yield*/, (0, promises_1.stat)(path, { bigint: true })];
                    case 1:
                        before = _a.apply(void 0, [_c.sent()]);
                        return [4 /*yield*/, (0, promises_1.readFile)(path, { signal: signal })];
                    case 2:
                        buffer = _c.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        _b = fileRevision;
                        return [4 /*yield*/, (0, promises_1.stat)(path, { bigint: true })];
                    case 3:
                        after = _b.apply(void 0, [_c.sent()]);
                        if (before === after)
                            return [2 /*return*/, { buffer: buffer, revision: after }];
                        _c.label = 4;
                    case 4: return [3 /*break*/, 0];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Read a stored prefix and convert torn-tail state to the opaque marker the
     * coordinator can round-trip without knowing the physical encoding.
     */
    JsonlSessionPersistence.prototype.readPrefix = function (path, expectedId, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, buffer, revision, prefix, _b, meta, events, committedBytes, error_2;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.readStableFile(path, signal)];
                    case 1:
                        _a = _c.sent(), buffer = _a.buffer, revision = _a.revision;
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 6, , 7]);
                        if (!(this.compression === 'zstd')) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.readZstdPrefix(buffer, signal)];
                    case 3:
                        prefix = _c.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        _b = (0, format_ts_1.scanLog)(buffer), meta = _b.meta, events = _b.events, committedBytes = _b.committedBytes;
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        prefix = __assign({ meta: meta, events: events }, committedBytes < buffer.byteLength
                            ? { tornMarker: { truncateTo: committedBytes, recoveredEvents: [] } }
                            : {});
                        _c.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_2 = _c.sent();
                        // A parse-time format refusal predates any SessionHeader, so the
                        // coordinator's locate-based enrichment cannot run; attach the artifact
                        // this read actually refused.
                        if (error_2 instanceof dsh_session_persistence_1.SessionFormatUnsupportedError && error_2.location === undefined) {
                            throw new dsh_session_persistence_1.SessionFormatUnsupportedError("".concat(error_2.message, " (raw log: ").concat(path, ")"), { kind: 'jsonl', path: path });
                        }
                        throw error_2;
                    case 7:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, this.assertStoredIdentity(path, prefix.meta, expectedId, signal)];
                    case 8:
                        _c.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, __assign(__assign({}, prefix), { revision: revision })];
                }
            });
        });
    };
    /** Decode complete frames and retain complete JSONL records from a torn final frame. */
    JsonlSessionPersistence.prototype.readZstdPrefix = function (buffer, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, frames, tornStart, decoder, yieldDeadline, decodedFrames, headerFrame, scanner, remainingFrames, _i, decodedFrames_1, plaintext, complete, prefix, recoveredPlaintext, _b, recoveredPrefix, error_3;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        _a = (0, zstd_ts_1.scanZstdFrames)(buffer), frames = _a.frames, tornStart = _a.tornStart;
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (frames.length === 0)
                            throw new Error('empty or header-less Zstandard session log');
                        decoder = (0, zstd_ts_1.createZstdFrameDecoder)();
                        yieldDeadline = node_perf_hooks_1.performance.now() + ZSTD_DECODE_YIELD_INTERVAL_MS;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 10, 11, 12]);
                        decodedFrames = decoder.decode(buffer, frames);
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        headerFrame = decodedFrames.next();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        /* v8 ignore next -- a non-empty structural frame list makes the decoder yield its first frame or throw. */
                        if (headerFrame.done)
                            throw new Error('empty or header-less Zstandard session log');
                        assertZstdHeaderFrame(headerFrame.value);
                        scanner = new format_ts_1.SessionLogScanner(headerFrame.value);
                        remainingFrames = frames.length - 1;
                        _i = 0, decodedFrames_1 = decodedFrames;
                        _c.label = 2;
                    case 2:
                        if (!(_i < decodedFrames_1.length)) return [3 /*break*/, 5];
                        plaintext = decodedFrames_1[_i];
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        scanner.write(plaintext);
                        remainingFrames -= 1;
                        if (!(remainingFrames > 0 && node_perf_hooks_1.performance.now() >= yieldDeadline)) return [3 /*break*/, 4];
                        return [4 /*yield*/, promises_2.scheduler.yield()];
                    case 3:
                        _c.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        yieldDeadline = node_perf_hooks_1.performance.now() + ZSTD_DECODE_YIELD_INTERVAL_MS;
                        _c.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        complete = scanner.checkpoint();
                        if (complete.committedBytes !== complete.inputBytes) {
                            throw new Error('corrupt Zstandard session log: complete frame contains a torn JSONL record');
                        }
                        if (tornStart === undefined) {
                            prefix = scanner.finish();
                            return [2 /*return*/, { meta: prefix.meta, events: prefix.events }];
                        }
                        recoveredPlaintext = Buffer.alloc(0);
                        _c.label = 6;
                    case 6:
                        _c.trys.push([6, 8, , 9]);
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, (0, zstd_ts_1.decompressZstdPrefix)(buffer.subarray(tornStart))];
                    case 7:
                        recoveredPlaintext = _c.sent();
                        return [3 /*break*/, 9];
                    case 8:
                        _b = _c.sent();
                        /* v8 ignore next -- decoder failure plus concurrent abort is timing-dependent */
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            signal.throwIfAborted();
                        return [3 /*break*/, 9];
                    case 9:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        scanner.write(recoveredPlaintext);
                        recoveredPrefix = scanner.finish();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, {
                                meta: recoveredPrefix.meta,
                                events: recoveredPrefix.events,
                                tornMarker: {
                                    truncateTo: tornStart,
                                    recoveredEvents: recoveredPrefix.events.slice(complete.eventCount),
                                },
                            }];
                    case 10:
                        error_3 = _c.sent();
                        /* v8 ignore next -- decoder failure plus concurrent abort is timing-dependent */
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            signal.throwIfAborted();
                        throw error_3;
                    case 11:
                        decoder.close();
                        return [7 /*endfinally*/];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    /** Durably append a batch, lazily materializing the file when not yet present. */
    JsonlSessionPersistence.prototype.appendBatch = function (meta, events, isMaterialized) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.ensureRootEncoding()];
                    case 1:
                        _a.sent();
                        if (!isMaterialized) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.appendLines(meta, events)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, this.materialize(meta, events)];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Make a crash repair durable: truncate a torn tail, restore complete events
     * decoded from it, then append synthetic closers. Two fsync'd steps — the seam
     * does not require this to be atomic.
     */
    JsonlSessionPersistence.prototype.commitRepair = function (meta, tornMarker, closers) {
        return __awaiter(this, void 0, void 0, function () {
            var repairedEvents;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!(tornMarker !== undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.repair(meta, tornMarker.truncateTo)];
                    case 1:
                        _b.sent();
                        _b.label = 2;
                    case 2:
                        repairedEvents = __spreadArray(__spreadArray([], ((_a = tornMarker === null || tornMarker === void 0 ? void 0 : tornMarker.recoveredEvents) !== null && _a !== void 0 ? _a : []), true), closers, true);
                        if (!(repairedEvents.length > 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.appendLines(meta, repairedEvents)];
                    case 3:
                        _b.sent();
                        _b.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /** List valid unique stored sessions' metadata (header line only — no full-log parse). */
    JsonlSessionPersistence.prototype.list = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.listArtifacts(signal)];
                    case 1: return [2 /*return*/, (_a.sent()).map(function (artifact) { return artifact.header; })];
                }
            });
        });
    };
    /** List metadata plus a stat-derived identity for each append-only log. */
    JsonlSessionPersistence.prototype.listSnapshots = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var snapshots, _i, _a, artifact, identity, error_4;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        snapshots = [];
                        _i = 0;
                        return [4 /*yield*/, this.listArtifacts(signal)];
                    case 1:
                        _a = _b.sent();
                        _b.label = 2;
                    case 2:
                        if (!(_i < _a.length)) return [3 /*break*/, 7];
                        artifact = _a[_i];
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, (0, promises_1.stat)(artifact.path, { bigint: true })];
                    case 4:
                        identity = _b.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        snapshots.push({
                            header: artifact.header,
                            revision: fileRevision(identity),
                        });
                        return [3 /*break*/, 6];
                    case 5:
                        error_4 = _b.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (!isENOENT(error_4))
                            throw error_4;
                        return [3 /*break*/, 6];
                    case 6:
                        _i++;
                        return [3 /*break*/, 2];
                    case 7:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, snapshots];
                }
            });
        });
    };
    JsonlSessionPersistence.prototype.listArtifacts = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var artifacts, ids, _i, _a, project, _b, _c, dir, opposite, oppositeExists, path, pathExists, first, _d, meta;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, this.ensureRootEncoding()];
                    case 1:
                        _e.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        artifacts = [];
                        ids = new Set();
                        _i = 0;
                        return [4 /*yield*/, this.listProjectDirs(signal)];
                    case 2:
                        _a = _e.sent();
                        _e.label = 3;
                    case 3:
                        if (!(_i < _a.length)) return [3 /*break*/, 15];
                        project = _a[_i];
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        _b = 0;
                        return [4 /*yield*/, this.listSessionDirs(project, signal)];
                    case 4:
                        _c = _e.sent();
                        _e.label = 5;
                    case 5:
                        if (!(_b < _c.length)) return [3 /*break*/, 14];
                        dir = _c[_b];
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        opposite = (0, node_path_1.join)(dir, "session".concat((0, format_ts_1.logSuffix)(this.oppositeCompression())));
                        return [4 /*yield*/, this.exists(opposite)];
                    case 6:
                        oppositeExists = _e.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (oppositeExists)
                            throw this.encodingMismatch(opposite);
                        path = (0, node_path_1.join)(dir, "session".concat((0, format_ts_1.logSuffix)(this.compression)));
                        return [4 /*yield*/, this.exists(path)];
                    case 7:
                        pathExists = _e.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (!pathExists)
                            return [3 /*break*/, 13];
                        if (!(this.compression === 'zstd')) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.readFirstZstdLine(path, signal)];
                    case 8:
                        _d = _e.sent();
                        return [3 /*break*/, 11];
                    case 9: return [4 /*yield*/, this.readFirstLine(path, signal)];
                    case 10:
                        _d = _e.sent();
                        _e.label = 11;
                    case 11:
                        first = _d;
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (first === undefined)
                            return [3 /*break*/, 13]; // empty/half-written file
                        meta = (0, format_ts_1.parseHeaderMeta)(first);
                        if (meta === undefined)
                            return [3 /*break*/, 13]; // not a session header
                        return [4 /*yield*/, this.assertStoredIdentity(path, meta, undefined, signal)];
                    case 12:
                        _e.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (ids.has(meta.id)) {
                            throw new Error("duplicate JSONL session id \"".concat(meta.id, "\" appears in multiple project directories"));
                        }
                        ids.add(meta.id);
                        artifacts.push({ header: meta, path: path });
                        _e.label = 13;
                    case 13:
                        _b++;
                        return [3 /*break*/, 5];
                    case 14:
                        _i++;
                        return [3 /*break*/, 3];
                    case 15:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, artifacts];
                }
            });
        });
    };
    // --- materialization / append / repair (file mechanics) ---
    /** Atomically write the header line + first batch (temp-write, fsync, publish). */
    JsonlSessionPersistence.prototype.materialize = function (meta, events) {
        return __awaiter(this, void 0, void 0, function () {
            var project, dir, finalPath, content;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        project = (0, format_ts_1.projectDir)(this.root, meta.cwd);
                        dir = (0, format_ts_1.sessionDir)(this.root, meta.cwd, meta.id);
                        finalPath = (0, format_ts_1.logPath)(this.root, meta.cwd, meta.id, this.compression);
                        return [4 /*yield*/, this.rejectOppositeArtifact(meta.cwd, meta.id)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.encodeMaterialization(meta, events)
                            /* v8 ignore next -- native Windows coverage exercises this platform dispatch; Linux covers the POSIX peer */
                        ];
                    case 2:
                        content = _a.sent();
                        if (!(process.platform === 'win32')) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.materializeWin32(project, dir, finalPath, meta.id, content)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, this.materializePosix(project, dir, finalPath, meta.id, content)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /* v8 ignore start -- Windows uses the Win32 durable-publish path; POSIX coverage exercises this peer. */
    JsonlSessionPersistence.prototype.materializePosix = function (project, dir, finalPath, id, content) {
        return __awaiter(this, void 0, void 0, function () {
            var tmp, linked, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, (0, promises_1.mkdir)(this.root, { recursive: true, mode: 448 })];
                    case 1:
                        _b.sent();
                        return [4 /*yield*/, this.syncDirPosix((0, node_path_1.dirname)(this.root))];
                    case 2:
                        _b.sent();
                        return [4 /*yield*/, (0, promises_1.mkdir)(project, { recursive: true, mode: 448 })];
                    case 3:
                        _b.sent();
                        return [4 /*yield*/, this.syncDirPosix(this.root)];
                    case 4:
                        _b.sent();
                        return [4 /*yield*/, (0, promises_1.mkdir)(dir, { recursive: true, mode: 448 })];
                    case 5:
                        _b.sent();
                        return [4 /*yield*/, this.syncDirPosix(project)];
                    case 6:
                        _b.sent();
                        return [4 /*yield*/, this.rejectExistingLog(finalPath, id)];
                    case 7:
                        _b.sent();
                        return [4 /*yield*/, this.writeSyncedTempFile(finalPath, content)
                            // Publish via link()+unlink(), NOT rename(): link fails with EEXIST if the
                            // final path already exists, so two processes materializing the same id
                            // concurrently cannot clobber each other. rename() would silently overwrite.
                        ];
                    case 8:
                        tmp = _b.sent();
                        linked = false;
                        _b.label = 9;
                    case 9:
                        _b.trys.push([9, , 11, 14]);
                        return [4 /*yield*/, (0, promises_1.link)(tmp, finalPath)];
                    case 10:
                        _b.sent();
                        linked = true;
                        return [3 /*break*/, 14];
                    case 11:
                        if (!!linked) return [3 /*break*/, 13];
                        return [4 /*yield*/, (0, promises_1.rm)(tmp, { force: true })];
                    case 12:
                        _b.sent();
                        _b.label = 13;
                    case 13: return [7 /*endfinally*/];
                    case 14: 
                    // link() succeeded — the log is published. fsync the directory so the new
                    // entry survives a power loss: the new link is not crash-durable until the
                    // parent directory's metadata is synced.
                    return [4 /*yield*/, this.syncDirPosix(dir)
                        // Best-effort temp cleanup: the log is already published and durable, so a
                        // failure to remove the (now-redundant) temp hard link must NOT reject the
                        // append. Swallow only the rm failure; nothing else of consequence runs here.
                    ];
                    case 15:
                        // link() succeeded — the log is published. fsync the directory so the new
                        // entry survives a power loss: the new link is not crash-durable until the
                        // parent directory's metadata is synced.
                        _b.sent();
                        _b.label = 16;
                    case 16:
                        _b.trys.push([16, 18, , 19]);
                        return [4 /*yield*/, (0, promises_1.rm)(tmp, { force: true })];
                    case 17:
                        _b.sent();
                        return [3 /*break*/, 19];
                    case 18:
                        _a = _b.sent();
                        return [3 /*break*/, 19];
                    case 19: return [2 /*return*/];
                }
            });
        });
    };
    /* v8 ignore stop */
    /* v8 ignore start -- native Windows coverage exercises this integration path */
    JsonlSessionPersistence.prototype.materializeWin32 = function (project, dir, finalPath, id, content) {
        return __awaiter(this, void 0, void 0, function () {
            var tmp, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, win32_ts_1.ensureDurableDirectoryWin32)(this.root)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, (0, win32_ts_1.ensureDurableDirectoryWin32)(project)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, (0, win32_ts_1.ensureDurableDirectoryWin32)(dir)];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, this.rejectExistingLog(finalPath, id)];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, this.writeSyncedTempFile(finalPath, content)];
                    case 5:
                        tmp = _a.sent();
                        _a.label = 6;
                    case 6:
                        _a.trys.push([6, 8, , 10]);
                        return [4 /*yield*/, (0, win32_ts_1.publishNewFileWin32)(tmp, finalPath)];
                    case 7:
                        _a.sent();
                        return [3 /*break*/, 10];
                    case 8:
                        error_5 = _a.sent();
                        return [4 /*yield*/, (0, promises_1.rm)(tmp, { force: true })];
                    case 9:
                        _a.sent();
                        throw error_5;
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    /* v8 ignore stop */
    JsonlSessionPersistence.prototype.rejectExistingLog = function (finalPath, id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.exists(finalPath)];
                    case 1:
                        // Never publish over an existing committed log: materialize is the first
                        // write of a session the backend believes is new. A file here means a
                        // different session shares this id on disk — reject loudly. (createCore
                        // already guards the create path, so this is unreachable-in-practice TOCTOU
                        // defense.)
                        /* v8 ignore next 3 -- createCore guards collisions before materialize; this is a TOCTOU backstop */
                        if (_a.sent()) {
                            throw new Error("refusing to materialize \"".concat(id, "\": a log already exists on disk (load/resume it instead)"));
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    JsonlSessionPersistence.prototype.writeSyncedTempFile = function (finalPath, content) {
        return __awaiter(this, void 0, void 0, function () {
            var tmp, handle;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tmp = "".concat(finalPath, ".").concat((0, node_crypto_1.randomBytes)(6).toString('hex'), ".tmp");
                        return [4 /*yield*/, (0, promises_1.open)(tmp, 'wx', 384)];
                    case 1:
                        handle = _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 5, 7]);
                        return [4 /*yield*/, handle.writeFile(content)];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, handle.sync()];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, handle.close()];
                    case 6:
                        _a.sent();
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/, tmp];
                }
            });
        });
    };
    /** Encode the header and first batch without combining their frame boundaries. */
    JsonlSessionPersistence.prototype.encodeMaterialization = function (meta, events) {
        return __awaiter(this, void 0, void 0, function () {
            var header, body, headerFrame, eventFrame;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        header = JSON.stringify((0, format_ts_1.toHeaderLine)(meta)) + '\n';
                        body = (0, format_ts_1.eventLines)(events, this.packChunks) + '\n';
                        if (this.compression === 'none')
                            return [2 /*return*/, header + body];
                        return [4 /*yield*/, (0, zstd_ts_1.compressZstdFrame)(header)];
                    case 1:
                        headerFrame = _a.sent();
                        return [4 /*yield*/, (0, zstd_ts_1.compressZstdFrame)(body)];
                    case 2:
                        eventFrame = _a.sent();
                        return [2 /*return*/, Buffer.concat([headerFrame, eventFrame])];
                }
            });
        });
    };
    /** Encode one durable append batch in the configured physical representation. */
    JsonlSessionPersistence.prototype.encodeEventBatch = function (events) {
        return __awaiter(this, void 0, void 0, function () {
            var body;
            return __generator(this, function (_a) {
                body = (0, format_ts_1.eventLines)(events, this.packChunks) + '\n';
                return [2 /*return*/, this.compression === 'zstd' ? (0, zstd_ts_1.compressZstdFrame)(body) : body];
            });
        });
    };
    /** fsync a POSIX directory so a just-created/renamed entry is crash-durable. */
    /* v8 ignore start -- Windows uses write-through namespace operations; POSIX coverage exercises directory fsync. */
    JsonlSessionPersistence.prototype.syncDirPosix = function (dir) {
        return __awaiter(this, void 0, void 0, function () {
            var handle;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, promises_1.open)(dir, 'r')];
                    case 1:
                        handle = _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 4, 6]);
                        return [4 /*yield*/, handle.sync()];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, handle.close()];
                    case 5:
                        _a.sent();
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /* v8 ignore stop */
    /**
     * Append and fsync event lines. On a partial write or sync failure, restore the
     * previous size before rethrowing because the unchanged cursor will retry the
     * batch; leaving partial bytes would create duplicate sequence numbers.
     */
    JsonlSessionPersistence.prototype.appendLines = function (meta, events) {
        return __awaiter(this, void 0, void 0, function () {
            var content, path, handle, closed, closeAppendHandle, before, error_6, rollbackError_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.encodeEventBatch(events)];
                    case 1:
                        content = _a.sent();
                        path = (0, format_ts_1.logPath)(this.root, meta.cwd, meta.id, this.compression);
                        return [4 /*yield*/, (0, promises_1.open)(path, 'a')];
                    case 2:
                        handle = _a.sent();
                        closed = false;
                        closeAppendHandle = function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (closed)
                                            return [2 /*return*/];
                                        closed = true;
                                        return [4 /*yield*/, handle.close()];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); };
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, , 15, 17]);
                        return [4 /*yield*/, handle.stat()];
                    case 4:
                        before = (_a.sent()).size;
                        _a.label = 5;
                    case 5:
                        _a.trys.push([5, 8, , 14]);
                        return [4 /*yield*/, handle.writeFile(content)];
                    case 6:
                        _a.sent();
                        return [4 /*yield*/, handle.sync()];
                    case 7:
                        _a.sent();
                        return [3 /*break*/, 14];
                    case 8:
                        error_6 = _a.sent();
                        _a.label = 9;
                    case 9:
                        _a.trys.push([9, 12, , 13]);
                        return [4 /*yield*/, closeAppendHandle()];
                    case 10:
                        _a.sent();
                        return [4 /*yield*/, this.rollbackAppend(path, before)];
                    case 11:
                        _a.sent();
                        return [3 /*break*/, 13];
                    case 12:
                        rollbackError_1 = _a.sent();
                        throw new AggregateError([error_6, rollbackError_1], "failed to roll back append to \"".concat(path, "\""));
                    case 13: throw error_6;
                    case 14: return [3 /*break*/, 17];
                    case 15: return [4 /*yield*/, closeAppendHandle()];
                    case 16:
                        _a.sent();
                        return [7 /*endfinally*/];
                    case 17: return [2 /*return*/];
                }
            });
        });
    };
    JsonlSessionPersistence.prototype.rollbackAppend = function (path, size) {
        return __awaiter(this, void 0, void 0, function () {
            var handle;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, promises_1.open)(path, 'r+')];
                    case 1:
                        handle = _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 5, 7]);
                        return [4 /*yield*/, handle.truncate(size)];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, handle.sync()];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, handle.close()];
                    case 6:
                        _a.sent();
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /** Truncate the log file to `offset` bytes and fsync (discard the crash tail). */
    JsonlSessionPersistence.prototype.repair = function (meta, offset) {
        return __awaiter(this, void 0, void 0, function () {
            var path, handle;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        path = (0, format_ts_1.logPath)(this.root, meta.cwd, meta.id, this.compression);
                        return [4 /*yield*/, (0, promises_1.truncate)(path, offset)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, (0, promises_1.open)(path, 'r+')];
                    case 2:
                        handle = _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, , 5, 7]);
                        return [4 /*yield*/, handle.sync()];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 7];
                    case 5: return [4 /*yield*/, handle.close()];
                    case 6:
                        _a.sent();
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    // --- discovery helpers ---
    /**
     * Read the first newline-terminated line of a file without loading the whole
     * file. Returns undefined if the file is empty or has no complete first line.
     * Reads in bounded chunks so a huge log costs only the header read.
     */
    JsonlSessionPersistence.prototype.readFirstLine = function (path, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var handle, chunks, buf, bytesRead, slice, nl;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, (0, promises_1.open)(path, 'r')];
                    case 1:
                        handle = _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 7, 9]);
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        chunks = [];
                        buf = Buffer.alloc(8192);
                        _a.label = 3;
                    case 3:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, handle.read(buf, 0, buf.length, null)];
                    case 4:
                        bytesRead = (_a.sent()).bytesRead;
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (bytesRead === 0)
                            return [2 /*return*/, undefined]; // EOF with no newline → no complete line
                        slice = buf.subarray(0, bytesRead);
                        nl = slice.indexOf(0x0a);
                        if (nl !== -1) {
                            chunks.push(slice.subarray(0, nl));
                            signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                            return [2 /*return*/, Buffer.concat(chunks).toString('utf8')];
                        }
                        chunks.push(Buffer.from(slice));
                        _a.label = 5;
                    case 5: return [3 /*break*/, 3];
                    case 6: return [3 /*break*/, 9];
                    case 7: return [4 /*yield*/, handle.close()];
                    case 8:
                        _a.sent();
                        return [7 /*endfinally*/];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /** Read and validate only the independently compressed header frame. */
    JsonlSessionPersistence.prototype.readFirstZstdLine = function (path, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var handle, content, chunk, bytesRead, first, plaintext, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, (0, promises_1.open)(path, 'r')];
                    case 1:
                        handle = _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 11, 13]);
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        content = Buffer.alloc(0);
                        chunk = Buffer.alloc(8192);
                        _a.label = 3;
                    case 3:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, handle.read(chunk, 0, chunk.length, null)];
                    case 4:
                        bytesRead = (_a.sent()).bytesRead;
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (bytesRead === 0)
                            return [2 /*return*/, undefined];
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        content = Buffer.concat([content, chunk.subarray(0, bytesRead)]);
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        first = (0, zstd_ts_1.scanZstdFrames)(content, 1).frames[0];
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (first === undefined)
                            return [3 /*break*/, 9];
                        plaintext = void 0;
                        _a.label = 5;
                    case 5:
                        _a.trys.push([5, 7, , 8]);
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, (0, zstd_ts_1.decompressZstdFrame)(content.subarray(first.start, first.end))];
                    case 6:
                        plaintext = _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        error_7 = _a.sent();
                        /* v8 ignore next -- decoder failure plus concurrent abort is timing-dependent */
                        if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                            signal.throwIfAborted();
                        throw new Error('corrupt Zstandard session log: header frame failed validation', { cause: error_7 });
                    case 8:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        assertZstdHeaderFrame(plaintext);
                        return [2 /*return*/, plaintext.subarray(0, -1).toString('utf8')];
                    case 9: return [3 /*break*/, 3];
                    case 10: return [3 /*break*/, 13];
                    case 11: return [4 /*yield*/, handle.close()];
                    case 12:
                        _a.sent();
                        return [7 /*endfinally*/];
                    case 13: return [2 /*return*/];
                }
            });
        });
    };
    /** Find the unique physical log for an id across every project directory. */
    JsonlSessionPersistence.prototype.findLog = function (id, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var matches, _i, _a, project, dir, path, opposite, oppositeExists, pathExists;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        matches = [];
                        _i = 0;
                        return [4 /*yield*/, this.listProjectDirs(signal)];
                    case 1:
                        _a = _b.sent();
                        _b.label = 2;
                    case 2:
                        if (!(_i < _a.length)) return [3 /*break*/, 7];
                        project = _a[_i];
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, this.rejectLegacyFlatArtifact(project, id, signal)];
                    case 3:
                        _b.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        dir = (0, node_path_1.join)(project, (0, format_ts_1.encodeSegment)(id));
                        path = (0, node_path_1.join)(dir, "session".concat((0, format_ts_1.logSuffix)(this.compression)));
                        opposite = (0, node_path_1.join)(dir, "session".concat((0, format_ts_1.logSuffix)(this.oppositeCompression())));
                        return [4 /*yield*/, this.exists(opposite)];
                    case 4:
                        oppositeExists = _b.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (oppositeExists)
                            throw this.encodingMismatch(opposite);
                        return [4 /*yield*/, this.exists(path)];
                    case 5:
                        pathExists = _b.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (pathExists)
                            matches.push(path);
                        _b.label = 6;
                    case 6:
                        _i++;
                        return [3 /*break*/, 2];
                    case 7:
                        if (matches.length > 1) {
                            throw new Error("duplicate JSONL session id \"".concat(id, "\" appears in multiple project directories"));
                        }
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, matches[0]];
                }
            });
        });
    };
    /** Require an existing configured root to be a readable directory. */
    JsonlSessionPersistence.prototype.assertUsableRoot = function () {
        try {
            (0, node_fs_1.readdirSync)(this.root);
        }
        catch (error) {
            if (isENOENT(error))
                return;
            throw error;
        }
    };
    /** Reject metadata that does not identify the selected physical log. */
    JsonlSessionPersistence.prototype.assertStoredIdentity = function (path, meta, expectedId, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var expectedPath, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (expectedId !== undefined && meta.id !== expectedId) {
                            throw new Error("corrupt session log \"".concat(path, "\": requested id \"").concat(expectedId, "\" does not match header id \"").concat(meta.id, "\""));
                        }
                        try {
                            expectedPath = (0, format_ts_1.logPath)(this.root, meta.cwd, meta.id, this.compression);
                        }
                        catch (error) {
                            throw new Error("corrupt session log \"".concat(path, "\": header id cannot name a storage path"), { cause: error });
                        }
                        _a = path !== expectedPath;
                        if (!_a) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.sameFile(path, expectedPath, signal)];
                    case 1:
                        _a = !(_b.sent());
                        _b.label = 2;
                    case 2:
                        if (_a) {
                            throw new Error("corrupt session log \"".concat(path, "\": header id \"").concat(meta.id, "\" and cwd identify \"").concat(expectedPath, "\""));
                        }
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Whether two path spellings resolve to the same physical file. This admits
     * case aliases on case-insensitive filesystems without weakening identity
     * checks on case-sensitive stores.
     */
    JsonlSessionPersistence.prototype.sameFile = function (path, expectedPath, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, actual, expected, error_8;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, Promise.all([(0, promises_1.realpath)(path), (0, promises_1.realpath)(expectedPath)])];
                    case 2:
                        _a = _b.sent(), actual = _a[0], expected = _a[1];
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, actual === expected];
                    case 3:
                        error_8 = _b.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        /* v8 ignore else -- non-ENOENT realpath failures require an external permission or I/O fault */
                        if (isENOENT(error_8))
                            return [2 /*return*/, false
                                /* v8 ignore next -- non-ENOENT realpath failures are external I/O faults, propagated unchanged */
                            ];
                        /* v8 ignore next -- non-ENOENT realpath failures are external I/O faults, propagated unchanged */
                        throw error_8;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /** The human-readable project directories under the configured root. */
    JsonlSessionPersistence.prototype.listProjectDirs = function (signal) {
        return __awaiter(this, void 0, void 0, function () {
            var entries, error_9;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, (0, promises_1.readdir)(this.root, { withFileTypes: true })];
                    case 1:
                        entries = _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [2 /*return*/, entries.filter(function (e) { return e.isDirectory(); }).map(function (e) { return (0, node_path_1.join)(_this.root, e.name); })];
                    case 2:
                        error_9 = _a.sent();
                        // Only an absent root means no sessions; rethrow every other I/O failure.
                        if (isENOENT(error_9))
                            return [2 /*return*/, []];
                        throw error_9;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /** List session-owned directories and reject the obsolete flat-file layout. */
    JsonlSessionPersistence.prototype.listSessionDirs = function (project, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var entries, legacy;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        return [4 /*yield*/, (0, promises_1.readdir)(project, { withFileTypes: true })];
                    case 1:
                        entries = _a.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        legacy = entries.find(function (entry) {
                            return entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.jsonl.zstd'));
                        });
                        if (legacy !== undefined)
                            throw this.legacyLayout((0, node_path_1.join)(project, legacy.name));
                        return [2 /*return*/, entries.filter(function (entry) { return entry.isDirectory(); }).map(function (entry) { return (0, node_path_1.join)(project, entry.name); })];
                }
            });
        });
    };
    /** Reject a root that already belongs to the other physical encoding. */
    JsonlSessionPersistence.prototype.ensureRootEncoding = function () {
        var _a;
        (_a = this.rootEncodingCheck) !== null && _a !== void 0 ? _a : (this.rootEncodingCheck = this.checkRootEncoding());
        return this.rootEncodingCheck;
    };
    JsonlSessionPersistence.prototype.checkRootEncoding = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, project, _b, _c, dir, incompatible;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _i = 0;
                        return [4 /*yield*/, this.listProjectDirs()];
                    case 1:
                        _a = _d.sent();
                        _d.label = 2;
                    case 2:
                        if (!(_i < _a.length)) return [3 /*break*/, 8];
                        project = _a[_i];
                        _b = 0;
                        return [4 /*yield*/, this.listSessionDirs(project)];
                    case 3:
                        _c = _d.sent();
                        _d.label = 4;
                    case 4:
                        if (!(_b < _c.length)) return [3 /*break*/, 7];
                        dir = _c[_b];
                        incompatible = (0, node_path_1.join)(dir, "session".concat((0, format_ts_1.logSuffix)(this.oppositeCompression())));
                        return [4 /*yield*/, this.exists(incompatible)];
                    case 5:
                        if (_d.sent())
                            throw this.encodingMismatch(incompatible);
                        _d.label = 6;
                    case 6:
                        _b++;
                        return [3 /*break*/, 4];
                    case 7:
                        _i++;
                        return [3 /*break*/, 2];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    JsonlSessionPersistence.prototype.rejectLegacyFlatArtifact = function (project, id, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var encoded, _i, _a, compression, path, artifactExists;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        encoded = (0, format_ts_1.encodeSegment)(id);
                        _i = 0, _a = ['zstd', 'none'];
                        _b.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        compression = _a[_i];
                        path = (0, node_path_1.join)(project, encoded + (0, format_ts_1.logSuffix)(compression));
                        return [4 /*yield*/, this.exists(path)];
                    case 2:
                        artifactExists = _b.sent();
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                        if (artifactExists)
                            throw this.legacyLayout(path);
                        _b.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    JsonlSessionPersistence.prototype.rejectOppositeArtifact = function (cwd, id) {
        return __awaiter(this, void 0, void 0, function () {
            var path;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        path = (0, format_ts_1.logPath)(this.root, cwd, id, this.oppositeCompression());
                        return [4 /*yield*/, this.exists(path)];
                    case 1:
                        if (_a.sent())
                            throw this.encodingMismatch(path);
                        return [2 /*return*/];
                }
            });
        });
    };
    JsonlSessionPersistence.prototype.oppositeCompression = function () {
        return this.compression === 'zstd' ? 'none' : 'zstd';
    };
    JsonlSessionPersistence.prototype.encodingMismatch = function (path) {
        return new Error("session artifact ".concat(JSON.stringify(path), " uses ").concat((0, format_ts_1.logSuffix)(this.oppositeCompression()), ", ")
            + "but this backend is configured for compression ".concat(JSON.stringify(this.compression), "; ")
            + 'use a separate root or select the matching compression mode');
    };
    JsonlSessionPersistence.prototype.legacyLayout = function (path) {
        return new Error("session artifact ".concat(JSON.stringify(path), " uses the unsupported flat-file layout; ")
            + 'use a separate root or move it into a project/session directory before loading');
    };
    JsonlSessionPersistence.prototype.exists = function (path) {
        return __awaiter(this, void 0, void 0, function () {
            var handle, error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 6]);
                        return [4 /*yield*/, (0, promises_1.open)(path, 'r')];
                    case 1:
                        handle = _a.sent();
                        return [4 /*yield*/, handle.close()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 3:
                        error_10 = _a.sent();
                        if (!isENOENT(error_10)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.assertLogParentAllowsAbsence(path)];
                    case 4:
                        _a.sent();
                        return [2 /*return*/, false];
                    case 5: 
                    /* v8 ignore next -- Windows repairs ENOTDIR from ENOENT above; POSIX covers direct ENOTDIR. */
                    throw error_10;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /* v8 ignore start -- native Windows coverage exercises this repair; POSIX open reports ENOTDIR before this point. */
    JsonlSessionPersistence.prototype.assertLogParentAllowsAbsence = function (path) {
        return __awaiter(this, void 0, void 0, function () {
            var parent_1, info, error, error_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        parent_1 = (0, node_path_1.dirname)(path);
                        return [4 /*yield*/, (0, promises_1.stat)(parent_1)];
                    case 1:
                        info = _a.sent();
                        if (info.isDirectory())
                            return [2 /*return*/];
                        error = new Error("ENOTDIR: parent path exists but is not a directory: ".concat(parent_1));
                        error.code = 'ENOTDIR';
                        error.path = parent_1;
                        throw error;
                    case 2:
                        error_11 = _a.sent();
                        if (isENOENT(error_11))
                            return [2 /*return*/];
                        throw error_11;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    JsonlSessionPersistence.inject = ['sessions'];
    JsonlSessionPersistence.Config = schemastery_1.default.object({
        root: schemastery_1.default.string().required(),
        packChunks: schemastery_1.default.boolean().default(DEFAULT_PACK_CHUNKS),
        compression: exports.JsonlCompressionSchema,
        preparedSessionCacheSize: schemastery_1.default.number().step(1).min(1).default(dsh_session_persistence_1.DEFAULT_PREPARED_SESSION_CACHE_SIZE),
        writeBatchMaxDelayMs: schemastery_1.default.number().step(1).min(1).max(dsh_session_persistence_1.MAX_WRITE_BATCH_DELAY_MS)
            .default(dsh_session_persistence_1.DEFAULT_WRITE_BATCH_MAX_DELAY_MS),
    });
    return JsonlSessionPersistence;
}(dsh_session_persistence_1.SessionPersistence));
exports.JsonlSessionPersistence = JsonlSessionPersistence;
exports.default = JsonlSessionPersistence;
