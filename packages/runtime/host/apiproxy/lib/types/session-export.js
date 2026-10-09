"use strict";
/**
 * Host-side session-log download: streams one ZIP archive whose files are the
 * sessions' stored artifact text verbatim plus every referenced media object.
 * The root artifact sits under its original base name (`session.jsonl`); each
 * subagent descendant under `subagents/<id>/<filename>`; each image referenced
 * by any included log under `media/<attachmentId>.<ext>` (content-addressed,
 * so one archive never duplicates a shared image). No manifest is written —
 * every file is byte-identical to the backend's durable artifact or attachment
 * store and self-describing through its own header line or media type. Before
 * each live session's artifact read, the SessionStore flush barrier makes the
 * current in-memory log durable; cold sessions need no barrier. Request abort
 * and response-consumer cancellation share one producer signal and terminate
 * the active compressor.
 * Compression runs on the host with fflate's streaming Zip API, so the archive
 * bytes are produced incrementally and the host never holds the whole archive
 * in one buffer; production waits for consumer pull whenever the response queue
 * reaches its byte high-water mark, so a slow consumer bounds accumulation to
 * the fixed 64 KiB response queue plus one synchronous fflate push.
 * @module
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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
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
exports.DEFAULT_SESSION_LOG_COMPRESSION_LEVEL = void 0;
exports.sessionLogExportDeps = sessionLogExportDeps;
exports.flushLiveSessionLog = flushLiveSessionLog;
exports.sessionLogZipFilename = sessionLogZipFilename;
exports.sessionLogZipEntries = sessionLogZipEntries;
exports.streamSessionLogZip = streamSessionLogZip;
var fflate_1 = require("fflate");
/** Balanced default used when a direct createApiProxy caller omits deployment config. */
exports.DEFAULT_SESSION_LOG_COMPRESSION_LEVEL = 6;
/**
 * Resolve the persistence, session-query, and attachment services a log export needs.
 * @param ctx - the composed host context.
 * @returns the export services (absent when the deployment does not mount them).
 */
function sessionLogExportDeps(ctx) {
    return {
        sessionQuery: ctx.get('sessionQuery'),
        sessionPersistence: ctx.get('sessionPersistence'),
        attachments: ctx.get('attachments'),
        sessions: ctx.get('sessions'),
    };
}
/**
 * Flush one currently live session through the store's authoritative durability
 * barrier immediately before its raw artifact is read. A cold or absent id has
 * no in-memory work to flush.
 * @param deps - export services, including the optional live-session store.
 * @param id - the session whose artifact is about to be read.
 * @param signal - optional cancellation observed around the flush barrier.
 */
function flushLiveSessionLog(deps, id, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var sessions, session;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    sessions = deps.sessions;
                    if (sessions === undefined)
                        return [2 /*return*/];
                    session = sessions.get(id);
                    if (session === undefined)
                        return [2 /*return*/];
                    return [4 /*yield*/, sessions.flush(session)];
                case 1:
                    _a.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [2 /*return*/];
            }
        });
    });
}
/** Zip extension for each accepted raster media type. */
var MEDIA_TYPE_EXTENSIONS = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
};
/**
 * The zip path for one media object: content-addressed by the opaque
 * attachment id so shared images land once and the id in the log maps back to
 * the archive entry without a manifest.
 * @param ref - the durable reference from a session log.
 * @returns the archive path.
 */
function mediaEntryPath(ref) {
    return "media/".concat(String(ref.attachmentId), ".").concat(MEDIA_TYPE_EXTENSIONS[ref.mediaType]);
}
/**
 * Collect every image reference inside one content array, descending into
 * nested tool results the way the live attachment route does.
 * @param content - an event content array (or nested tool-result content).
 * @param refs - the dedupe map being filled (keyed by attachment id).
 */
function collectImageRefs(content, refs) {
    if (!Array.isArray(content))
        return;
    var pending = [];
    for (var _i = 0, content_1 = content; _i < content_1.length; _i++) {
        var item = content_1[_i];
        pending.push(item);
    }
    while (pending.length > 0) {
        var value = pending.pop();
        if (typeof value !== 'object' || value === null || Array.isArray(value))
            continue;
        var block = value;
        if (block.type === 'image' && typeof block.attachment === 'object' && block.attachment !== null) {
            var ref = block.attachment;
            refs.set(String(ref.attachmentId), ref);
        }
        if (Array.isArray(block.content)) {
            for (var _a = 0, _b = block.content; _a < _b.length; _a++) {
                var item = _b[_a];
                pending.push(item);
            }
        }
    }
}
/**
 * Collect every image reference one session event carries, across the same
 * carriers the live attachment route scans (direct content, message content,
 * inserted messages, and completed assistant chunk blocks).
 * @param event - one parsed JSONL event object.
 * @param refs - the dedupe map being filled (keyed by attachment id).
 */
function collectEventImageRefs(event, refs) {
    var _a;
    var data = event.data;
    if (typeof data !== 'object' || data === null)
        return;
    var carrier = data;
    collectImageRefs(carrier.content, refs);
    if (carrier.message !== undefined)
        collectImageRefs(carrier.message.content, refs);
    if (carrier.inserted !== undefined) {
        for (var _i = 0, _b = carrier.inserted; _i < _b.length; _i++) {
            var message = _b[_i];
            collectImageRefs(message.content, refs);
        }
    }
    if (((_a = carrier.chunk) === null || _a === void 0 ? void 0 : _a.type) === 'block-end')
        collectImageRefs([carrier.chunk.block], refs);
}
/**
 * Collect the distinct media references one stored artifact text names.
 * Lines that fail to parse cannot reference media and are skipped (the
 * artifact text itself is exported verbatim regardless).
 * @param content - the stored artifact text.
 * @returns the dedupe map keyed by attachment id.
 */
function imageRefsInArtifact(content) {
    var refs = new Map();
    for (var _i = 0, _a = content.split('\n'); _i < _a.length; _i++) {
        var line = _a[_i];
        if (line === '')
            continue;
        var event_1 = void 0;
        try {
            event_1 = JSON.parse(line);
        }
        catch (_b) {
            continue;
        }
        collectEventImageRefs(event_1, refs);
    }
    return refs;
}
/**
 * One safe zip path segment from an untrusted session id. Session ids are
 * host-controlled, but the brand allows any non-empty string, so `../`, dot
 * segments, and separator characters are neutralized before they can shape
 * archive entries. Distinct ids may collapse onto one segment (id collision
 * is impossible for the host-minted UUIDs, so no uniqueness suffix is kept).
 * @param id - the raw session id.
 * @returns a filesystem-safe single path segment.
 */
function safeSessionIdSegment(id) {
    return id.replace(/[^A-Za-z0-9_-]/g, '_');
}
/**
 * The export archive filename for one root session.
 * @param sessionId - the root session id (sanitized to one safe path segment).
 * @returns the attachment filename for the session's export archive.
 */
function sessionLogZipFilename(sessionId) {
    return "dsh-session-".concat(safeSessionIdSegment(sessionId), ".zip");
}
/**
 * Yield the export entries in zip order: the preloaded root artifact first,
 * then every subagent descendant in lineage order (each flushed when live,
 * read from the persistence backend right before it is yielded, and dropped
 * after the consumer moves on), then every distinct media object referenced by any of
 * the included logs (read and verified from the attachment store, one archive
 * entry per attachment id). The host holds at most one descendant's artifact
 * text and one media object at a time beyond the root.
 * @param deps - the mounted export services (the caller answered 500 before this runs).
 * @param root - the already-read root artifact (read by the caller so the
 * missing-session path can answer cleanly before streaming starts).
 * @param sessionId - the root session id.
 * @param includeDescendants - whether to include every subagent descendant.
 * @param signal - optional cancellation forwarded to lineage, persistence, and attachment reads.
 * @returns the export entries in zip order.
 */
function sessionLogZipEntries(deps, root, sessionId, includeDescendants, signal) {
    return __asyncGenerator(this, arguments, function sessionLogZipEntries_1() {
        var media, rememberMedia, seen_1, collect_1, lineage, _i, _a, ref, stored;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    media = new Map();
                    rememberMedia = function (content) {
                        for (var _i = 0, _a = imageRefsInArtifact(content); _i < _a.length; _i++) {
                            var _b = _a[_i], id = _b[0], ref = _b[1];
                            media.set(id, ref);
                        }
                    };
                    rememberMedia(root.content);
                    return [4 /*yield*/, __await({ path: root.filename, content: root.content })];
                case 1: return [4 /*yield*/, _b.sent()];
                case 2:
                    _b.sent();
                    if (!includeDescendants) return [3 /*break*/, 6];
                    seen_1 = new Set([sessionId]);
                    collect_1 = function (nodes) {
                        return __asyncGenerator(this, arguments, function () {
                            var _i, nodes_1, node, id, raw;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _i = 0, nodes_1 = nodes;
                                        _a.label = 1;
                                    case 1:
                                        if (!(_i < nodes_1.length)) return [3 /*break*/, 9];
                                        node = nodes_1[_i];
                                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                                        id = node.session.header.id;
                                        if (seen_1.has(id))
                                            return [3 /*break*/, 8];
                                        seen_1.add(id);
                                        return [4 /*yield*/, __await(flushLiveSessionLog(deps, id, signal))];
                                    case 2:
                                        _a.sent();
                                        return [4 /*yield*/, __await(deps.sessionPersistence.readRaw(id, signal))];
                                    case 3:
                                        raw = _a.sent();
                                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                                        if (raw === undefined) {
                                            throw new Error("subagent \"".concat(id, "\" has no stored log artifact"));
                                        }
                                        rememberMedia(raw.content);
                                        return [4 /*yield*/, __await({
                                                path: "subagents/".concat(safeSessionIdSegment(id), "/").concat(raw.filename),
                                                content: raw.content,
                                            })];
                                    case 4: return [4 /*yield*/, _a.sent()];
                                    case 5:
                                        _a.sent();
                                        return [5 /*yield**/, __values(__asyncDelegator(__asyncValues(collect_1(node.descendants))))];
                                    case 6: return [4 /*yield*/, __await.apply(void 0, [_a.sent()])];
                                    case 7:
                                        _a.sent();
                                        _a.label = 8;
                                    case 8:
                                        _i++;
                                        return [3 /*break*/, 1];
                                    case 9: return [2 /*return*/];
                                }
                            });
                        });
                    };
                    return [4 /*yield*/, __await(deps.sessionQuery.traceSession(sessionId, signal))];
                case 3:
                    lineage = _b.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [5 /*yield**/, __values(__asyncDelegator(__asyncValues(collect_1(lineage.descendants))))];
                case 4: return [4 /*yield*/, __await.apply(void 0, [_b.sent()])];
                case 5:
                    _b.sent();
                    _b.label = 6;
                case 6:
                    _i = 0, _a = media.values();
                    _b.label = 7;
                case 7:
                    if (!(_i < _a.length)) return [3 /*break*/, 12];
                    ref = _a[_i];
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [4 /*yield*/, __await(deps.attachments.readImage(ref, signal))];
                case 8:
                    stored = _b.sent();
                    signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    return [4 /*yield*/, __await({ path: mediaEntryPath(ref), data: stored.data })];
                case 9: return [4 /*yield*/, _b.sent()];
                case 10:
                    _b.sent();
                    _b.label = 11;
                case 11:
                    _i++;
                    return [3 /*break*/, 7];
                case 12: return [2 /*return*/];
            }
        });
    });
}
/** How many code units of artifact text one zip push carries (bounded encode memory). */
var PUSH_CHUNK_CODE_UNITS = 1 << 16;
/** How many bytes of media one zip push carries (bounded memory; images are already size-capped). */
var PUSH_CHUNK_BYTES = 1 << 16;
/** Byte capacity retained by the response stream before ZIP production waits for pull. */
var RESPONSE_HIGH_WATER_MARK_BYTES = 1 << 16;
/** One producer waiter released only when ReadableStream pull restores capacity. */
var ResponseCapacityGate = /** @class */ (function () {
    function ResponseCapacityGate() {
    }
    /**
     * Wait until the response queue has positive byte capacity or cancellation wins.
     * @param controller - response controller whose desired size owns capacity.
     * @param signal - combined request/consumer cancellation.
     */
    ResponseCapacityGate.prototype.wait = function (controller, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        signal.throwIfAborted();
                        if (controller.desiredSize === null || controller.desiredSize > 0)
                            return [2 /*return*/];
                        return [4 /*yield*/, new Promise(function (resolve) {
                                var release = function () {
                                    _this.releasePending = undefined;
                                    signal.removeEventListener('abort', release);
                                    resolve();
                                };
                                _this.releasePending = release;
                                signal.addEventListener('abort', release, { once: true });
                            })];
                    case 1:
                        _a.sent();
                        signal.throwIfAborted();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** Release the current producer waiter after a consumer pull. */
    ResponseCapacityGate.prototype.pulled = function () {
        var _a;
        (_a = this.releasePending) === null || _a === void 0 ? void 0 : _a.call(this);
    };
    return ResponseCapacityGate;
}());
/**
 * Push one media object's bytes into a deflate stream in bounded chunks,
 * waiting for consumer capacity between chunks like the artifact path does.
 * @param deflate - the zip entry's deflate stream.
 * @param data - the stored image bytes.
 * @param controller - response queue controller.
 * @param capacity - pull-driven response-capacity gate.
 * @param signal - cancellation; throws when aborted.
 */
function pushBinaryChunks(deflate, data, controller, capacity, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var offset, end, finalChunk;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    offset = 0;
                    _a.label = 1;
                case 1:
                    signal.throwIfAborted();
                    end = Math.min(offset + PUSH_CHUNK_BYTES, data.byteLength);
                    finalChunk = end >= data.byteLength;
                    deflate.push(data.subarray(offset, end), finalChunk);
                    offset = end;
                    return [4 /*yield*/, capacity.wait(controller, signal)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    if (offset < data.byteLength) return [3 /*break*/, 1];
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Push one artifact's text into a deflate stream in bounded chunks, never
 * splitting a surrogate pair across a chunk boundary (a lone high surrogate
 * re-encodes as U+FFFD and would silently corrupt the exported artifact).
 * @param deflate - the zip entry's deflate stream.
 * @param content - the artifact text verbatim.
 * @param controller - response queue controller.
 * @param capacity - pull-driven response-capacity gate.
 * @param signal - cancellation; throws when aborted.
 */
function pushArtifactChunks(deflate, content, controller, capacity, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var encoder, offset, finalChunk, end, last;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    encoder = new TextEncoder();
                    offset = 0;
                    _a.label = 1;
                case 1:
                    signal.throwIfAborted();
                    end = Math.min(offset + PUSH_CHUNK_CODE_UNITS, content.length);
                    if (end < content.length && end - offset > 1) {
                        last = content.charCodeAt(end - 1);
                        if (last >= 0xd800 && last <= 0xdbff)
                            end -= 1;
                    }
                    finalChunk = end >= content.length;
                    deflate.push(encoder.encode(content.slice(offset, end)), finalChunk);
                    offset = end;
                    return [4 /*yield*/, capacity.wait(controller, signal)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    if (!finalChunk) return [3 /*break*/, 1];
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Stream one session-log ZIP as a WHATWG ReadableStream. The root artifact is
 * read and validated by the caller before this is called (missing root or
 * missing services answer cleanly before any byte is produced); each entry is
 * then encoded and deflated in bounded chunks as it is produced, so the
 * archive bytes arrive incrementally. A descendant that fails to read errors
 * the stream (fail-loud, never silent under-export).
 * @param deps - the mounted export services (the caller answered 500 before this runs).
 * @param root - the already-read root artifact (first zip entry).
 * @param sessionId - the root session id.
 * @param includeDescendants - whether to include every subagent descendant.
 * @param compressionLevel - validated fflate DEFLATE level for every ZIP entry.
 * @param signal - request cancellation combined with response-consumer cancellation.
 * @returns the zip byte stream.
 */
function streamSessionLogZip(deps, root, sessionId, includeDescendants, compressionLevel, signal) {
    var consumerAbort = new AbortController();
    var producerSignal = AbortSignal.any([signal, consumerAbort.signal]);
    var zip;
    var zipTerminated = false;
    var capacity = new ResponseCapacityGate();
    var terminateZip = function () {
        if (zip === undefined || zipTerminated)
            return;
        zipTerminated = true;
        zip.terminate();
    };
    return new ReadableStream({
        start: function (controller) {
            var _this = this;
            // fflate invokes the callback synchronously per compressed chunk, so a
            // single push can enqueue ahead of a slow consumer; the capacity gate
            // waits for pull between pushes once the byte queue is full, bounding
            // accumulation to the queue high-water mark plus one synchronous push.
            var archive = new fflate_1.Zip(function (error, data, final) {
                /* v8 ignore next 3 -- fflate reports only internal zip failures, unreachable for valid inputs */
                if (error) {
                    controller.error(error);
                    return;
                }
                /* v8 ignore next -- fflate may emit empty chunks; not controllable from tests */
                if (data.byteLength > 0)
                    controller.enqueue(data);
                if (final)
                    controller.close();
            });
            zip = archive;
            void (function () { return __awaiter(_this, void 0, void 0, function () {
                var _a, _b, _c, entry, deflate, e_1_1, error_1;
                var _d, e_1, _e, _f;
                return __generator(this, function (_g) {
                    switch (_g.label) {
                        case 0:
                            _g.trys.push([0, 16, , 17]);
                            _g.label = 1;
                        case 1:
                            _g.trys.push([1, 9, 10, 15]);
                            _a = true, _b = __asyncValues(sessionLogZipEntries(deps, root, sessionId, includeDescendants, producerSignal));
                            _g.label = 2;
                        case 2: return [4 /*yield*/, _b.next()];
                        case 3:
                            if (!(_c = _g.sent(), _d = _c.done, !_d)) return [3 /*break*/, 8];
                            _f = _c.value;
                            _a = false;
                            entry = _f;
                            deflate = new fflate_1.ZipDeflate(entry.path, { level: compressionLevel });
                            archive.add(deflate);
                            if (!('content' in entry)) return [3 /*break*/, 5];
                            return [4 /*yield*/, pushArtifactChunks(deflate, entry.content, controller, capacity, producerSignal)];
                        case 4:
                            _g.sent();
                            return [3 /*break*/, 7];
                        case 5: return [4 /*yield*/, pushBinaryChunks(deflate, entry.data, controller, capacity, producerSignal)];
                        case 6:
                            _g.sent();
                            _g.label = 7;
                        case 7:
                            _a = true;
                            return [3 /*break*/, 2];
                        case 8: return [3 /*break*/, 15];
                        case 9:
                            e_1_1 = _g.sent();
                            e_1 = { error: e_1_1 };
                            return [3 /*break*/, 15];
                        case 10:
                            _g.trys.push([10, , 13, 14]);
                            if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 12];
                            return [4 /*yield*/, _e.call(_b)];
                        case 11:
                            _g.sent();
                            _g.label = 12;
                        case 12: return [3 /*break*/, 14];
                        case 13:
                            if (e_1) throw e_1.error;
                            return [7 /*endfinally*/];
                        case 14: return [7 /*endfinally*/];
                        case 15:
                            archive.end();
                            return [3 /*break*/, 17];
                        case 16:
                            error_1 = _g.sent();
                            // A mid-stream failure (missing descendant, cancellation, read
                            // error) must fail the download rather than ship a truncated archive.
                            /* v8 ignore next -- typed backends reject with Error, and DOMException is one in Node */
                            terminateZip();
                            controller.error(error_1 instanceof Error ? error_1 : new Error(String(error_1)));
                            return [3 /*break*/, 17];
                        case 17: return [2 /*return*/];
                    }
                });
            }); })();
        },
        pull: function () {
            capacity.pulled();
        },
        cancel: function (reason) {
            consumerAbort.abort(reason instanceof Error ? reason : new Error('session log export stream cancelled'));
            terminateZip();
        },
    }, {
        highWaterMark: RESPONSE_HIGH_WATER_MARK_BYTES,
        size: function (chunk) { return chunk.byteLength; },
    });
}
