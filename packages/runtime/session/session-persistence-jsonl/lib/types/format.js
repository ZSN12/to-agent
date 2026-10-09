"use strict";
/**
 * On-disk format helpers for the JSONL session-persistence backend: path
 * sanitization (a {@link SessionId} is an unvalidated branded string, so it
 * MUST be encoded before use in a path — no traversal, no collision), the
 * per-project/session directory layout, header-line (de)serialization, and the
 * truncation-repair offset computation.
 *
 * @module dsh-session-persistence-jsonl/format
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionLogScanner = void 0;
exports.logSuffix = logSuffix;
exports.toHeaderLine = toHeaderLine;
exports.fromHeaderLine = fromHeaderLine;
exports.encodeSegment = encodeSegment;
exports.projectKey = projectKey;
exports.projectDir = projectDir;
exports.sessionDir = sessionDir;
exports.logPath = logPath;
exports.eventLines = eventLines;
exports.scanLog = scanLog;
exports.parseHeaderMeta = parseHeaderMeta;
var node_path_1 = require("node:path");
var dsh_session_1 = require("@z/dsh-session");
var dsh_session_persistence_1 = require("@z/dsh-session-persistence");
/**
 * Return the artifact suffix for one physical encoding.
 * @param compression - configured JSONL artifact encoding.
 * @returns `.jsonl.zstd` for Zstandard or `.jsonl` for plaintext.
 */
function logSuffix(compression) {
    return compression === 'zstd' ? '.jsonl.zstd' : '.jsonl';
}
/**
 * Build the header line object from a {@link SessionHeader}.
 * @param header - the immutable session metadata to serialize.
 * @returns the `type: 'session'`-tagged line object, absent optional fields omitted (never null).
 */
function toHeaderLine(header) {
    var _a;
    return __assign(__assign(__assign(__assign(__assign(__assign({ type: 'session', version: header.version, id: header.id, createdAt: header.createdAt }, header.cwd !== undefined ? { cwd: header.cwd } : {}), header.parentSession !== undefined ? { parentSession: header.parentSession } : {}), header.seedLength !== undefined ? { seedLength: header.seedLength } : {}), header.origin !== undefined ? { origin: header.origin } : {}), { delegationDepth: (_a = header.delegationDepth) !== null && _a !== void 0 ? _a : 0 }), header.agentPreset !== undefined ? { agentPreset: header.agentPreset } : {});
}
/**
 * Parse a header line back into a {@link SessionHeader}.
 * @param line - the shape-checked first line of a log (see the `isHeaderLine` guard).
 * @returns the header, absent optional fields omitted.
 */
function fromHeaderLine(line) {
    if (Object.hasOwn(line, 'sandboxMode') || Object.hasOwn(line, 'approvalPolicy')) {
        throw new Error('session header uses retired policy baseline fields');
    }
    return __assign(__assign(__assign(__assign(__assign(__assign({ version: line.version, id: line.id, createdAt: line.createdAt }, line.cwd !== undefined ? { cwd: line.cwd } : {}), line.parentSession !== undefined ? { parentSession: line.parentSession } : {}), line.seedLength !== undefined ? { seedLength: line.seedLength } : {}), line.origin !== undefined ? { origin: line.origin } : {}), { delegationDepth: line.delegationDepth }), line.agentPreset !== undefined ? { agentPreset: line.agentPreset } : {});
}
/** Type guard: a parsed first line is a well-formed session header. */
function isHeaderLine(value) {
    return (typeof value === 'object' && value !== null
        && value.type === 'session'
        && typeof value.version === 'number'
        && typeof value.id === 'string'
        && typeof value.createdAt === 'number'
        && Number.isSafeInteger(value.createdAt)
        && value.createdAt >= 0
        && !Object.is(value.createdAt, -0)
        && typeof value.delegationDepth === 'number'
        && Number.isSafeInteger(value.delegationDepth)
        && value.delegationDepth >= 0
        && !Object.is(value.delegationDepth, -0)
        && (value.origin === undefined
            || value.origin === 'subagent')
        && (value.agentPreset === undefined
            || typeof value.agentPreset === 'string'));
}
/**
 * Encode an arbitrary string as a single safe path segment, injectively over ALL JS (UTF-16)
 * strings — including lone surrogates. A {@link SessionId} is an unvalidated branded string,
 * so this neutralizes `../`, absolute paths, NUL, and separators before any filesystem use.
 * Safe code units remain literal; every other unit, including `~`, becomes
 * `~XXXX`. Operating on code units preserves lone surrogates, while special-
 * casing `.` and `..` prevents traversal by an otherwise safe whole segment.
 *
 * @param raw - the string to encode; must be non-empty (throws on `''`).
 * @returns the escaped single path segment, decodable back to `raw`.
 */
function encodeSegment(raw) {
    if (raw.length === 0)
        throw new Error('cannot encode an empty path segment');
    if (raw === '.')
        return '~002E';
    if (raw === '..')
        return '~002E~002E';
    var out = '';
    for (var i = 0; i < raw.length; i++) {
        var code = raw.charCodeAt(i);
        var ch = String.fromCharCode(code);
        if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
            out += ch;
        }
        else {
            out += '~' + code.toString(16).toUpperCase().padStart(4, '0');
        }
    }
    return out;
}
/**
 * Build the readable directory key for a project path.
 * Filesystem separators and drive separators become `-`; unsafe code units use
 * the same `~XXXX` escape as session ids. The key is bounded for filesystem
 * component limits. Separator replacement and truncation are intentionally
 * lossy, following the common human-navigable project-directory convention.
 * @param cwd - the session's project directory.
 * @returns a single filesystem-safe project directory name.
 */
function projectKey(cwd) {
    if (cwd.length === 0)
        throw new Error('cannot encode an empty project path');
    var readable = '';
    var separatorRun = false;
    for (var i = 0; i < cwd.length; i++) {
        var code = cwd.charCodeAt(i);
        var ch = String.fromCharCode(code);
        if (ch === '/' || ch === '\\' || ch === ':') {
            if (!separatorRun)
                readable += '-';
            separatorRun = true;
        }
        else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
            readable += ch;
            separatorRun = false;
        }
        else {
            readable += '~' + code.toString(16).toUpperCase().padStart(4, '0');
            separatorRun = false;
        }
    }
    var slug = readable.replace(/^-+/, '') || 'root';
    return "--".concat(slug.slice(0, 251), "--");
}
/**
 * The configured root's human-navigable project directory. A configured root
 * may be local or shared; this grouping does not prescribe its deployment.
 * @param root - the backend's session root directory.
 * @param cwd - the session's project directory; `undefined` selects `_no-cwd`.
 * @returns the project directory path under `root`.
 */
function projectDir(root, cwd) {
    if (cwd === undefined)
        return (0, node_path_1.join)(root, '_no-cwd');
    return (0, node_path_1.join)(root, projectKey(cwd));
}
/**
 * The directory owned by one session and available for future session-local
 * artifacts.
 * @param root - the backend's session root directory.
 * @param cwd - the session's project directory.
 * @param id - the session id, encoded to one safe path segment.
 * @returns the session directory beneath its project directory.
 */
function sessionDir(root, cwd, id) {
    return (0, node_path_1.join)(projectDir(root, cwd), encodeSegment(id));
}
/**
 * The append-only event-log file path for a session.
 * @param root - the backend's session root directory.
 * @param cwd - the session's project directory (`undefined` → `_no-cwd`).
 * @param id - the session id, path-encoded via {@link encodeSegment} before filesystem use.
 * @param compression - physical artifact encoding and filename suffix.
 * @returns the session's configured JSONL artifact path.
 */
function logPath(root, cwd, id, compression) {
    return (0, node_path_1.join)(sessionDir(root, cwd, id), "session".concat(logSuffix(compression)));
}
/**
 * Serialize an event batch as JSONL lines (no trailing newline). With
 * `packChunks` on, delta-chunk runs pack into `text-chunks` /
 * `reasoning-chunks` / `tool-call-chunks` storage rows; off writes one event
 * per line, byte-identical to the pre-packing layout. Reading is layout-blind
 * either way ({@link scanLog} always decodes rows), so the switch changes only
 * newly written bytes.
 * @param events - the batch to serialize, in log order.
 * @param packChunks - whether to pack delta runs into storage rows.
 * @returns the batch's JSONL text; the writer adds the final newline.
 */
function eventLines(events, packChunks) {
    var records = packChunks ? (0, dsh_session_1.packChunkRuns)(events) : events;
    return records.map(function (record) { return JSON.stringify(encodeProvenanceForStorage(record)); }).join('\n');
}
/**
 * Losslessly shrink a record's `sourceEventSeqs` for the log: consecutive
 * runs of at least three seqs become `[start, end]` pairs, and any other list
 * stays verbatim.
 * @param record - one stored record (event or packed row).
 * @returns the record with its provenance in storage form (widened from the
 *   in-memory `number[]`; {@link expandProvenanceFromStorage} restores it).
 */
function encodeProvenanceForStorage(record) {
    if (!('sourceEventSeqs' in record))
        return record;
    return __assign(__assign({}, record), { sourceEventSeqs: (0, dsh_session_1.encodeSeqRanges)(record.sourceEventSeqs) });
}
/**
 * Expand a parsed line's storage-form provenance back to `number[]`.
 * @param parsed - the JSON-parsed value of one stored line.
 * @returns the value with provenance expanded.
 * @throws when the record or its storage-form provenance is malformed.
 */
function expandProvenanceFromStorage(parsed) {
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new TypeError('stored session records must be objects');
    }
    var record = parsed;
    if (record.sourceEventSeqs === undefined)
        return parsed;
    if (!Number.isSafeInteger(record.seq) || record.seq < 0) {
        throw new TypeError('stored session event seq must be a non-negative safe integer');
    }
    return __assign(__assign({}, record), { sourceEventSeqs: (0, dsh_session_1.decodeSeqRanges)(record.sourceEventSeqs, record.seq) });
}
/** Parse one complete header record supplied independently from event rows. */
/**
 * Refuse a header carrying a format version this build does not read BEFORE
 * validating the current header shape or decoding any event row: a future
 * format need not satisfy today's structural checks at all, and its user must
 * see "upgrade the harness", never "corrupt session log".
 * @param parsed - the JSON-parsed first line of a session artifact.
 */
function refuseForeignFormatVersion(parsed) {
    if (typeof parsed !== 'object' || parsed === null)
        return;
    var _a = parsed, version = _a.version, id = _a.id;
    if (typeof version !== 'number' || version === dsh_session_1.SESSION_FORMAT_VERSION)
        return;
    throw new dsh_session_persistence_1.SessionFormatUnsupportedError((0, dsh_session_persistence_1.sessionFormatVersionRefusal)(typeof id === 'string' ? id : String(id), version));
}
function parseHeaderRecord(record) {
    if (record.length === 0 || record.at(-1) !== 0x0A || record.indexOf(0x0A) !== record.length - 1) {
        throw new Error('empty or header-less session log');
    }
    var parsed;
    try {
        parsed = JSON.parse(record.subarray(0, -1).toString('utf8'));
    }
    catch (_a) {
        throw new Error('corrupt session log: header line is not valid JSON');
    }
    refuseForeignFormatVersion(parsed);
    if (!isHeaderLine(parsed)) {
        throw new Error('corrupt session log: first line is not a session header');
    }
    return fromHeaderLine(parsed);
}
/**
 * Incrementally scan complete JSONL event records after an independently
 * supplied header record. Newline search and byte offsets stay on raw buffers;
 * only complete records are decoded to UTF-8. A fragment crossing writes is
 * copied because a decoder may reuse its output buffer after `write()` returns.
 */
var SessionLogScanner = /** @class */ (function () {
    /**
     * Create an event scanner from exactly one newline-terminated header record.
     * @param headerRecord - the complete first JSONL record, including its newline.
     */
    function SessionLogScanner(headerRecord) {
        this.events = [];
        this.fragments = [];
        this.fragmentBytes = 0;
        this.eventLine = 0;
        this.finished = false;
        this.meta = parseHeaderRecord(headerRecord);
        this.inputBytes = headerRecord.length;
        this.committedBytes = headerRecord.length;
    }
    /**
     * Consume the next raw plaintext chunk, retaining only an incomplete final record.
     * @param chunk - bytes immediately following all previously supplied bytes.
     */
    SessionLogScanner.prototype.write = function (chunk) {
        if (this.finished)
            throw new Error('cannot write to a finished session log scanner');
        var chunkStart = this.inputBytes;
        this.inputBytes += chunk.length;
        var lineStart = 0;
        for (var newline = chunk.indexOf(0x0A); newline !== -1; newline = chunk.indexOf(0x0A, lineStart)) {
            var fragment = chunk.subarray(lineStart, newline);
            var line = fragment;
            if (this.fragments.length > 0) {
                if (fragment.length > 0)
                    this.fragments.push(fragment);
                line = Buffer.concat(this.fragments, this.fragmentBytes + fragment.length);
                this.fragments = [];
                this.fragmentBytes = 0;
            }
            this.consumeEventLine(line, chunkStart + newline + 1);
            lineStart = newline + 1;
        }
        if (lineStart < chunk.length) {
            var fragment = Buffer.from(chunk.subarray(lineStart));
            this.fragments.push(fragment);
            this.fragmentBytes += fragment.length;
        }
    };
    /**
     * Snapshot progress before appending a recoverable torn-frame prefix.
     * @returns byte, committed-prefix, and expanded-event cursors.
     */
    SessionLogScanner.prototype.checkpoint = function () {
        return {
            inputBytes: this.inputBytes,
            committedBytes: this.committedBytes,
            eventCount: this.events.length,
        };
    };
    /**
     * Finish scanning, ignoring a final record without a newline as a torn tail.
     * @returns the header, contiguous event prefix, and safe truncation offset.
     */
    SessionLogScanner.prototype.finish = function () {
        this.finished = true;
        return { meta: this.meta, events: this.events, committedBytes: this.committedBytes };
    };
    /** Decode one complete event row and update the contiguous prefix. */
    SessionLogScanner.prototype.consumeEventLine = function (line, endByte) {
        var _a;
        this.eventLine += 1;
        var decoded;
        try {
            decoded = (0, dsh_session_1.decodeStorageRecord)(expandProvenanceFromStorage(JSON.parse(line.toString('utf8'))));
        }
        catch (_b) {
            (_a = this.issue) !== null && _a !== void 0 ? _a : (this.issue = new Error("corrupt session log: unparsable committed event at line ".concat(this.eventLine)));
            return;
        }
        if (this.issue !== undefined) {
            if (decoded.some(function (event) { return event.type === 'turn/end'; }))
                throw this.issue;
            return;
        }
        var rowStart = this.events.length;
        for (var _i = 0, decoded_1 = decoded; _i < decoded_1.length; _i++) {
            var event_1 = decoded_1[_i];
            if (event_1.seq !== this.events.length) {
                var expected = this.events.length;
                this.events.length = rowStart;
                this.issue = new Error("corrupt session log: seq gap in committed region at line ".concat(this.eventLine, " ")
                    + "(expected ".concat(expected, ", got ").concat(event_1.seq, ")"));
                if (decoded.some(function (candidate) { return candidate.type === 'turn/end'; }))
                    throw this.issue;
                return;
            }
            this.events.push(event_1);
        }
        this.committedBytes = endByte;
    };
    return SessionLogScanner;
}());
exports.SessionLogScanner = SessionLogScanner;
/**
 * Parse a complete or torn JSONL buffer into its preserved event prefix. This
 * compatibility wrapper supplies the first record separately, then delegates
 * event rows to {@link SessionLogScanner}.
 *
 * @param buffer - the raw bytes of the log file (header line first).
 * @returns the header, preserved event prefix, and byte offset safe to append at.
 */
function scanLog(buffer) {
    var headerEnd = buffer.indexOf(0x0A);
    if (headerEnd === -1)
        throw new Error('empty or header-less session log');
    var scanner = new SessionLogScanner(buffer.subarray(0, headerEnd + 1));
    scanner.write(buffer.subarray(headerEnd + 1));
    return scanner.finish();
}
/**
 * Parse just the header line of a log into a {@link SessionHeader}, or
 * `undefined` if it is missing/not a header. Used by `list()` to read session
 * metadata WITHOUT parsing the whole log: a session picker scales with the
 * number of sessions, not the total size of every conversation.
 * @param firstLine - the first line of a log file (without its trailing newline).
 * @returns the parsed header, or `undefined` when the line is not a well-formed session header.
 */
function parseHeaderMeta(firstLine) {
    var parsed;
    try {
        parsed = JSON.parse(firstLine);
    }
    catch (_a) {
        return undefined;
    }
    if (!isHeaderLine(parsed))
        return undefined;
    return fromHeaderLine(parsed);
}
