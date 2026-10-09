"use strict";
/**
 * Keyless snapshot-test LLM replay. It derives one model-call script per
 * recorded session from `assistant/chunk` events and explicitly marked local
 * compaction calls, then binds fresh live sessions to parent/child scripts by
 * first-call order. Throw and hang cases require an explicit override because
 * a session log cannot reconstruct them alone.
 * @module @z/dsh-llm-replay
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
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
exports.inject = exports.name = void 0;
exports.parseSessionLog = parseSessionLog;
exports.parseSessionHeader = parseSessionHeader;
exports.deriveReplayScript = deriveReplayScript;
exports.resolveScriptedEntry = resolveScriptedEntry;
exports.loadReplayScript = loadReplayScript;
exports.loadSessionScripts = loadSessionScripts;
exports.installLlmReplay = installLlmReplay;
exports.apply = apply;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var dsh_session_1 = require("@z/dsh-session");
var dsh_llm_1 = require("@z/dsh-llm");
var PACKED_CHUNK_ROW_TYPES = new Set(['text-chunks', 'reasoning-chunks', 'tool-call-chunks']);
/**
 * Parse a session `.jsonl` buffer into its event list. Line 0 is the session
 * header (a `{type:'session',…}` record), every subsequent non-empty line is a
 * {@link SessionEvent} or a packed chunk row (expanded back into its events, so
 * a fixture recorded with `packChunks` on derives the same script). The header
 * is skipped; malformed lines fail loud.
 * @param text - the raw `.jsonl` file contents.
 * @returns every event after the header, in log order.
 */
function parseSessionLog(text) {
    var events = [];
    var nextSeq = 0;
    var headerSkipped = false;
    // The JSONL backend guarantees line 0 is the session header. Projected
    // fixtures omit event envelopes; synthesize them while decoding so callers
    // still receive complete SessionEvent values.
    for (var _i = 0, _a = text.split(/\r?\n/).entries(); _i < _a.length; _i++) {
        var _b = _a[_i], index = _b[0], line = _b[1];
        if (line.trim().length === 0)
            continue;
        if (!headerSkipped) {
            headerSkipped = true;
            continue;
        }
        var value = void 0;
        try {
            value = JSON.parse(line);
        }
        catch (error) {
            throw new Error("session snapshot line ".concat(index + 1, " contains invalid JSON"), { cause: error });
        }
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error("session snapshot line ".concat(index + 1, " must be a JSON object"));
        }
        var record = value;
        var packed = PACKED_CHUNK_ROW_TYPES.has(record.type);
        var seqKey = packed ? 'seq0' : 'seq';
        var timeKey = packed ? 'time0' : 'time';
        if (!Object.hasOwn(record, seqKey))
            record[seqKey] = nextSeq;
        if (!Object.hasOwn(record, timeKey))
            record[timeKey] = 0;
        var decoded = void 0;
        try {
            decoded = (0, dsh_session_1.decodeStorageRecord)(record);
        }
        catch (error) {
            /* v8 ignore next -- decodeStorageRecord only throws Error instances; the String arm satisfies unknown narrowing. */
            var detail = error instanceof Error ? error.message : String(error);
            throw new Error("session snapshot line ".concat(index + 1, ": ").concat(detail), { cause: error });
        }
        events.push.apply(events, decoded);
        nextSeq += decoded.length;
    }
    return events;
}
/**
 * Read replay identity, ordering, and fork-seed facts from the JSONL header.
 *
 * @param text - the raw `.jsonl` file contents (only the header line is read).
 * @returns the header's `id`, `createdAt`, and `seedLength`, defaulted when absent.
 */
function parseSessionHeader(text) {
    var _a;
    var firstLine = (_a = text.split('\n').find(function (line) { return line.trim().length > 0; })) !== null && _a !== void 0 ? _a : '{}';
    var parsed = JSON.parse(firstLine);
    return {
        id: typeof parsed.id === 'string' ? parsed.id : '',
        createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : 0,
        seedLength: typeof parsed.seedLength === 'number' ? parsed.seedLength : 0,
    };
}
/**
 * Reconstruct the per-`stream()` replay script from a recorded session log.
 *
 * Splits `assistant/chunk` events at every `finish`, using turn and step changes
 * to detect an unterminated prior call. A `compaction/summary` explicitly marked
 * as one local LLM-stream call becomes a canonical successful stream from its
 * complete `rawOutput` at the summary's log position. A
 * missing assistant terminator means the live stream threw, so derivation
 * rejects and the scenario must provide an explicit override. Multiple calls
 * may share one turn and step when the loop retries.
 * @param events - the recorded session's events.
 * @returns one `chunks` entry per recorded model call, in call order.
 */
function deriveReplayScript(events) {
    var script = [];
    var currentKey;
    var current = [];
    var close = function (key, chunks) {
        var _a;
        if (chunks.length === 0)
            return;
        if (((_a = chunks[chunks.length - 1]) === null || _a === void 0 ? void 0 : _a.type) !== 'finish') {
            throw new Error("llm-replay: model call ".concat(key, " ended without a finish chunk (a thrown stream); ")
                + 'this scenario needs a replay.override.json sidecar');
        }
        script.push({ kind: 'chunks', chunks: chunks });
    };
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        if (event_1.type === 'compaction/summary') {
            close(currentKey, current);
            currentKey = undefined;
            current = [];
            // JSONL decoding crosses an untyped durable boundary, so retain its wider
            // shape even though current in-process producers enforce this correlation.
            var persisted = event_1.data;
            if (persisted.llmStreamCall === true) {
                if (persisted.rawOutput === undefined) {
                    throw new Error('llm-replay: compaction/summary marks an LLM stream call without rawOutput');
                }
                var chunks = [];
                for (var _a = 0, _b = persisted.rawOutput.entries(); _a < _b.length; _a++) {
                    var _c = _b[_a], index = _c[0], block = _c[1];
                    chunks.push({ type: 'block-start', index: index, blockType: block.type });
                    chunks.push({ type: 'block-end', index: index, block: block });
                }
                if (persisted.usage !== undefined)
                    chunks.push({ type: 'usage', usage: persisted.usage });
                chunks.push({ type: 'finish', reason: { kind: 'stop' } });
                script.push({ kind: 'chunks', chunks: chunks });
            }
            continue;
        }
        if (event_1.type !== 'assistant/chunk')
            continue;
        var _d = event_1.data, turn = _d.turn, step = _d.step, chunk = _d.chunk;
        var key = "".concat(turn, "/").concat(step);
        if (current.length > 0 && key !== currentKey) {
            close(currentKey, current);
        }
        if (current.length === 0)
            currentKey = key;
        current.push(chunk);
        if (chunk.type === 'finish') {
            close(currentKey, current);
            currentKey = undefined;
            current = [];
        }
    }
    close(currentKey, current);
    return script;
}
var REPLAY_CHUNK_TYPES = new Set([
    'block-start',
    'text-delta',
    'reasoning-delta',
    'tool-call-delta',
    'block-end',
    'usage',
    'finish',
]);
var FROM_REQUEST_OPEN = '{{fromRequest:';
var FROM_REQUEST_CLOSE = '}}';
/** Collect every string leaf of one JSON-compatible value, in traversal order. */
function collectStrings(value, out) {
    if (typeof value === 'string') {
        out.push(value);
        return;
    }
    if (Array.isArray(value)) {
        for (var _i = 0, value_1 = value; _i < value_1.length; _i++) {
            var item = value_1[_i];
            collectStrings(item, out);
        }
        return;
    }
    if (value !== null && typeof value === 'object') {
        for (var _a = 0, _b = Object.values(value); _a < _b.length; _a++) {
            var item = _b[_a];
            collectStrings(item, out);
        }
    }
}
/** Resolve one placeholder pattern against the request corpus; the LAST match wins. */
function resolveFromRequest(pattern, corpus) {
    var _a;
    var regex;
    try {
        regex = new RegExp(pattern, 'g');
    }
    catch (error) {
        // RegExp construction only throws SyntaxError; String() carries its message.
        throw new Error("llm-replay: fromRequest has an invalid pattern ".concat(JSON.stringify(pattern), ": ").concat(String(error)));
    }
    var last;
    for (var _i = 0, _b = corpus.matchAll(regex); _i < _b.length; _i++) {
        var match = _b[_i];
        last = match;
    }
    if (last === undefined) {
        throw new Error("llm-replay: fromRequest pattern ".concat(JSON.stringify(pattern), " matched nothing in the request"));
    }
    return (_a = last[1]) !== null && _a !== void 0 ? _a : last[0];
}
/** Replace every `{{fromRequest:<pattern>}}` occurrence in one scripted string. */
function substituteString(text, corpus) {
    var result = '';
    var cursor = 0;
    while (true) {
        var open_1 = text.indexOf(FROM_REQUEST_OPEN, cursor);
        if (open_1 === -1)
            return result + text.slice(cursor);
        var close_1 = text.indexOf(FROM_REQUEST_CLOSE, open_1 + FROM_REQUEST_OPEN.length);
        if (close_1 === -1) {
            throw new Error("llm-replay: fromRequest placeholder is unterminated in ".concat(JSON.stringify(text)));
        }
        // The last two braces of a consecutive `}` run terminate the placeholder,
        // so a pattern may end with a brace quantifier like `[0-9a-f]{4}`.
        while (text[close_1 + FROM_REQUEST_CLOSE.length] === '}')
            close_1 += 1;
        var pattern = text.slice(open_1 + FROM_REQUEST_OPEN.length, close_1);
        result += text.slice(cursor, open_1) + resolveFromRequest(pattern, corpus);
        cursor = close_1 + FROM_REQUEST_CLOSE.length;
    }
}
/** Deep-copy one JSON-compatible value with scripted placeholders resolved. */
function substituteValue(value, corpus) {
    if (typeof value === 'string') {
        return value.includes(FROM_REQUEST_OPEN) ? substituteString(value, corpus) : value;
    }
    if (Array.isArray(value))
        return value.map(function (item) { return substituteValue(item, corpus); });
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(function (_a) {
            var key = _a[0], item = _a[1];
            return [key, substituteValue(item, corpus)];
        }));
    }
    return value;
}
/**
 * Resolve every `{{fromRequest:<regex>}}` placeholder in one scripted entry
 * against the live request. The corpus is every string leaf of the request
 * messages joined by newlines; the pattern's LAST corpus match wins and its
 * first capture group (or, without one, the whole match) substitutes in place.
 * Scenario sidecars use this to script arguments no static file can know,
 * such as a randomly minted goal id the model must echo back. A pattern that
 * matches nothing, an invalid pattern, and an unterminated placeholder each
 * fail loud. The last two braces of a consecutive `}` run terminate the
 * placeholder, so a pattern may end with a brace quantifier but cannot
 * contain `}}` followed by further pattern content. Derived entries pass
 * through the same resolution as sidecar entries.
 * @param entry - the scripted entry about to replay.
 * @param messages - the live request messages searched by the placeholders.
 * @returns the entry itself when no placeholder appears, else a resolved deep copy.
 */
function resolveScriptedEntry(entry, messages) {
    if (!JSON.stringify(entry).includes(FROM_REQUEST_OPEN))
        return entry;
    var leaves = [];
    collectStrings(messages, leaves);
    return substituteValue(entry, leaves.join('\n'));
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasExactKeys(value, keys) {
    return Object.keys(value).length === keys.length && keys.every(function (key) { return Object.hasOwn(value, key); });
}
function invalidOverride(file, location, detail) {
    throw new Error("llm-replay: invalid override ".concat(file, ": ").concat(location, " ").concat(detail));
}
function readChunks(value, file, location) {
    if (!Array.isArray(value))
        invalidOverride(file, location, 'chunks must be an array');
    for (var _i = 0, _a = value.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], index = _b[0], chunk = _b[1];
        if (!isRecord(chunk)
            || typeof chunk['type'] !== 'string'
            || !REPLAY_CHUNK_TYPES.has(chunk['type'])) {
            invalidOverride(file, "".concat(location, ".chunks[").concat(index, "]"), 'must have a known StreamChunk type');
        }
    }
    return value;
}
function readReplayEntry(value, file, location) {
    if (!isRecord(value))
        invalidOverride(file, location, 'must be an object');
    switch (value['kind']) {
        case 'chunks': {
            if (!hasExactKeys(value, ['kind', 'chunks']))
                invalidOverride(file, location, 'has invalid chunks-entry fields');
            return { kind: 'chunks', chunks: readChunks(value['chunks'], file, location) };
        }
        case 'throw': {
            if (!hasExactKeys(value, ['kind', 'chunks', 'message', 'code'])) {
                invalidOverride(file, location, 'has invalid throw-entry fields');
            }
            if (typeof value['message'] !== 'string' || value['message'].length === 0) {
                invalidOverride(file, location, 'message must be a non-empty string');
            }
            if (typeof value['code'] !== 'string' || value['code'].length === 0) {
                invalidOverride(file, location, 'code must be a non-empty string');
            }
            return {
                kind: 'throw',
                chunks: readChunks(value['chunks'], file, location),
                message: value['message'],
                code: value['code'],
            };
        }
        case 'hang': {
            var readyFile = value['readyFile'];
            var keys = readyFile === undefined ? ['kind'] : ['kind', 'readyFile'];
            if (!hasExactKeys(value, keys))
                invalidOverride(file, location, 'has invalid hang-entry fields');
            if (readyFile !== undefined && (typeof readyFile !== 'string' || readyFile.length === 0)) {
                invalidOverride(file, location, 'readyFile must be a non-empty string');
            }
            return __assign({ kind: 'hang' }, (readyFile === undefined ? {} : { readyFile: readyFile }));
        }
        default:
            return invalidOverride(file, location, "has unknown kind ".concat(JSON.stringify(value['kind'])));
    }
}
function readOverrideDoc(value, file) {
    if (Array.isArray(value))
        return value.map(function (entry, index) { return readReplayEntry(entry, file, "entry ".concat(index)); });
    if (!isRecord(value) || !hasExactKeys(value, ['patches']) || !Array.isArray(value['patches'])) {
        return invalidOverride(file, 'document', 'must be a ReplayEntry[] or { patches: [...] }');
    }
    return {
        patches: value['patches'].map(function (value, index) {
            var location = "patch ".concat(index);
            if (!isRecord(value) || !hasExactKeys(value, ['at', 'entry'])) {
                return invalidOverride(file, location, 'must contain exactly at and entry');
            }
            var at = value['at'];
            if (typeof at !== 'number' || !Number.isSafeInteger(at) || at < 0) {
                return invalidOverride(file, location, 'at must be a non-negative safe integer');
            }
            return { at: at, entry: readReplayEntry(value['entry'], file, "".concat(location, ".entry")) };
        }),
    };
}
/**
 * Load the PRIMARY session's replay script: the sidecar override when present
 * (whole-script replacement or `{ patches }` augmentation over the derived
 * script), else the script derived from the session JSONL (fail-loud when the
 * fixture is missing).
 * @param config - the fixture paths; only `file` and `overrideFile` are consulted.
 * @returns the resolved primary-session script.
 */
function loadReplayScript(config) {
    if (config.overrideFile !== undefined && (0, node_fs_1.existsSync)(config.overrideFile)) {
        var doc = readOverrideDoc(JSON.parse((0, node_fs_1.readFileSync)(config.overrideFile, 'utf8')), config.overrideFile);
        if (Array.isArray(doc))
            return doc;
        var script = deriveScriptFromFile(config.file);
        var derivedLength = script.length;
        var seenIndexes = new Set();
        for (var _i = 0, _a = doc.patches; _i < _a.length; _i++) {
            var patch = _a[_i];
            if (patch.at > derivedLength) {
                throw new Error("llm-replay: override patch index ".concat(String(patch.at), " out of range ")
                    + "(derived script has ".concat(derivedLength, " call(s); == length appends): ").concat(config.overrideFile));
            }
            if (seenIndexes.has(patch.at)) {
                throw new Error("llm-replay: duplicate override patch index ".concat(patch.at, ": ").concat(config.overrideFile));
            }
            seenIndexes.add(patch.at);
            script[patch.at] = patch.entry;
        }
        return script;
    }
    return deriveScriptFromFile(config.file);
}
/** Derive the primary script from the session JSONL, failing loud on a missing fixture. */
function deriveScriptFromFile(file) {
    if (!(0, node_fs_1.existsSync)(file)) {
        throw new Error("llm-replay: fixture not found: ".concat(file, " \u2014 run `pnpm run test:snapshot:record` first"));
    }
    return deriveReplayScript(parseSessionLog((0, node_fs_1.readFileSync)(file, 'utf8')));
}
/**
 * Load the primary and child scripts in bind order. Child derivation begins at
 * `seedLength` so inherited parent chunks are never replayed as child calls.
 *
 * @param config - the fixture paths: the primary log plus any recorded child logs.
 * @returns the primary script first, then the child scripts in bind order.
 */
function loadSessionScripts(config) {
    var _a;
    var primaryEntries = loadReplayScript(config);
    // The override path replaces the derived script but carries no header; read
    // the header off the JSONL when it exists, else use a stable default so an
    // override-only fixture (header-less) still orders first as the primary.
    var primaryHeader = (0, node_fs_1.existsSync)(config.file)
        ? parseSessionHeader((0, node_fs_1.readFileSync)(config.file, 'utf8'))
        : { id: '', createdAt: 0 };
    var primary = {
        recordedId: primaryHeader.id, createdAt: primaryHeader.createdAt, entries: primaryEntries, primary: true,
    };
    var children = [];
    for (var _i = 0, _b = (_a = config.childFiles) !== null && _a !== void 0 ? _a : []; _i < _b.length; _i++) {
        var childFile = _b[_i];
        if (!(0, node_fs_1.existsSync)(childFile)) {
            throw new Error("llm-replay: child fixture not found: ".concat(childFile, " \u2014 re-record the scenario"));
        }
        var text = (0, node_fs_1.readFileSync)(childFile, 'utf8');
        var header = parseSessionHeader(text);
        // Derive the child's script from its own events only — events AT OR after the seed
        // boundary.
        var ownEvents = parseSessionLog(text).slice(header.seedLength);
        children.push({
            recordedId: header.id,
            createdAt: header.createdAt,
            entries: deriveReplayScript(ownEvents),
            primary: false,
        });
    }
    // Synchronous children start in creation order; the id only stabilizes timestamp ties.
    // XXX(concurrent-subagents): concurrent children need an explicit first-call ordinal.
    children.sort(function (a, b) { return a.createdAt - b.createdAt || a.recordedId.localeCompare(b.recordedId); });
    return __spreadArray([primary], children, true);
}
/** Replay adapter that makes a configured provider catalog discoverable without provider I/O. */
var ReplayAdapter = /** @class */ (function (_super) {
    __extends(ReplayAdapter, _super);
    function ReplayAdapter(providers, replay) {
        var _this = _super.call(this) || this;
        _this.replay = replay;
        _this.providers = new Map(providers.map(function (provider) { return [provider.id, provider]; }));
        return _this;
    }
    ReplayAdapter.prototype.providerInfo = function (provider) {
        var _a;
        var configured = this.providers.get(provider);
        /* v8 ignore next -- LlmRuntime only asks about routes registered from this same map. */
        if (configured === undefined)
            return _super.prototype.providerInfo.call(this, provider);
        return { id: provider, name: (_a = configured.name) !== null && _a !== void 0 ? _a : provider };
    };
    ReplayAdapter.prototype.providerRetryPolicy = function (provider) {
        var configured = this.providers.get(provider);
        /* v8 ignore next -- LlmRuntime only asks about routes registered from this same map. */
        if (configured === undefined)
            return _super.prototype.providerRetryPolicy.call(this, provider);
        return configured.retryPolicy === undefined
            ? undefined
            : (0, dsh_llm_1.resolveRetryPolicy)(configured.retryPolicy, "llm-replay: provider \"".concat(provider, "\" retryPolicy"));
    };
    ReplayAdapter.prototype.listModels = function (provider) {
        var _a;
        var configured = this.providers.get(provider);
        /* v8 ignore next -- LlmRuntime only asks about routes registered from this same map. */
        if (configured === undefined)
            return Promise.resolve([]);
        return Promise.resolve(((_a = configured.models) !== null && _a !== void 0 ? _a : []).map(function (model) {
            var _a;
            return (__assign(__assign({ provider: provider, id: model.id, name: (_a = model.name) !== null && _a !== void 0 ? _a : model.id }, model.description === undefined ? {} : { description: model.description }), model.inputModalities === undefined ? {} : { inputModalities: __spreadArray([], model.inputModalities, true) }));
        }));
    };
    ReplayAdapter.prototype.resolveModel = function (provider, model) {
        var _a, _b;
        var configured = this.providers.get(provider);
        /* v8 ignore next -- LlmRuntime only asks about routes registered from this same map. */
        if (configured === undefined)
            return Promise.resolve({ provider: provider, id: model, name: model });
        var configuredModel = (_a = configured.models) === null || _a === void 0 ? void 0 : _a.find(function (candidate) { return candidate.id === model; });
        return Promise.resolve(__assign(__assign(__assign(__assign(__assign({ provider: provider, id: model, name: (_b = configuredModel === null || configuredModel === void 0 ? void 0 : configuredModel.name) !== null && _b !== void 0 ? _b : model }, (configuredModel === null || configuredModel === void 0 ? void 0 : configuredModel.description) === undefined ? {} : { description: configuredModel.description }), (configuredModel === null || configuredModel === void 0 ? void 0 : configuredModel.inputModalities) === undefined
            ? {}
            : { inputModalities: __spreadArray([], configuredModel.inputModalities, true) }), (configuredModel === null || configuredModel === void 0 ? void 0 : configuredModel.contextWindow) === undefined
            ? {}
            : { context: { contextWindow: configuredModel.contextWindow } }), (configuredModel === null || configuredModel === void 0 ? void 0 : configuredModel.defaultMaxTokens) === undefined
            ? {}
            : { defaultMaxTokens: configuredModel.defaultMaxTokens }), (configuredModel === null || configuredModel === void 0 ? void 0 : configuredModel.reasoningEfforts) === undefined
            ? {}
            : {
                reasoning: __assign({ efforts: configuredModel.reasoningEfforts.map(function (id) { return ({ id: (0, dsh_llm_1.ReasoningEffortId)(id), name: id }); }) }, configuredModel.defaultReasoningEffort === undefined
                    ? {}
                    : { defaultEffort: (0, dsh_llm_1.ReasoningEffortId)(configuredModel.defaultReasoningEffort) }),
            }));
    };
    ReplayAdapter.prototype.stream = function (options) {
        return this.replay(options);
    };
    return ReplayAdapter;
}(dsh_llm_1.LlmAdapter));
/**
 * Wait `paceMs` between chunk yields, aborting the wait (and the stream) the
 * moment the signal fires — a paced replay must cancel as promptly as a burst
 * one.
 */
function paceDelay(paceMs, signal) {
    return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
            signal === null || signal === void 0 ? void 0 : signal.removeEventListener('abort', onAbort);
            resolve();
        }, paceMs);
        var onAbort = function () {
            clearTimeout(timer);
            reject(new Error('aborted'));
        };
        signal === null || signal === void 0 ? void 0 : signal.addEventListener('abort', onAbort, { once: true });
    });
}
/** Yield a recorded stream back, honoring abort like a real adapter. */
function replayEntry(entry, signal, paceMs) {
    return __asyncGenerator(this, arguments, function replayEntry_1() {
        var _a, _i, _b, chunk, _c, _d, chunk;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _a = entry.kind;
                    switch (_a) {
                        case 'chunks': return [3 /*break*/, 1];
                        case 'throw': return [3 /*break*/, 10];
                        case 'hang': return [3 /*break*/, 18];
                    }
                    return [3 /*break*/, 25];
                case 1:
                    _i = 0, _b = entry.chunks;
                    _e.label = 2;
                case 2:
                    if (!(_i < _b.length)) return [3 /*break*/, 8];
                    chunk = _b[_i];
                    if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                        throw new Error('aborted');
                    if (!(paceMs > 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, __await(paceDelay(paceMs, signal))];
                case 3:
                    _e.sent();
                    _e.label = 4;
                case 4: return [4 /*yield*/, __await(chunk)];
                case 5: return [4 /*yield*/, _e.sent()];
                case 6:
                    _e.sent();
                    _e.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 2];
                case 8: return [4 /*yield*/, __await(void 0)];
                case 9: return [2 /*return*/, _e.sent()];
                case 10:
                    _c = 0, _d = entry.chunks;
                    _e.label = 11;
                case 11:
                    if (!(_c < _d.length)) return [3 /*break*/, 17];
                    chunk = _d[_c];
                    if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                        throw new Error('aborted');
                    if (!(paceMs > 0)) return [3 /*break*/, 13];
                    return [4 /*yield*/, __await(paceDelay(paceMs, signal))];
                case 12:
                    _e.sent();
                    _e.label = 13;
                case 13: return [4 /*yield*/, __await(chunk)];
                case 14: return [4 /*yield*/, _e.sent()];
                case 15:
                    _e.sent();
                    _e.label = 16;
                case 16:
                    _c++;
                    return [3 /*break*/, 11];
                case 17: throw new dsh_llm_1.LlmError(entry.message, entry.code);
                case 18: return [4 /*yield*/, __await({ type: 'block-start', index: 0, blockType: 'text' })];
                case 19: 
                // Replay a stream that stalls until cancelled (mirrors MockAdapter): one
                // chunk, then wait for abort and surface it as the consumer expects.
                return [4 /*yield*/, _e.sent()];
                case 20:
                    // Replay a stream that stalls until cancelled (mirrors MockAdapter): one
                    // chunk, then wait for abort and surface it as the consumer expects.
                    _e.sent();
                    return [4 /*yield*/, __await({ type: 'text-delta', index: 0, text: 'partial' })];
                case 21: return [4 /*yield*/, _e.sent()];
                case 22:
                    _e.sent();
                    if (entry.readyFile !== undefined)
                        (0, node_fs_1.writeFileSync)(entry.readyFile, '');
                    return [4 /*yield*/, __await(new Promise(function (_resolve, reject) {
                            if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                                reject(new Error('aborted'));
                                return;
                            }
                            signal === null || signal === void 0 ? void 0 : signal.addEventListener('abort', function () { reject(new Error('aborted')); }, { once: true });
                        })
                        /* v8 ignore next -- unreachable: the hang promise only ever rejects (on abort), never resolves; control never reaches here */
                        )];
                case 23:
                    _e.sent();
                    return [4 /*yield*/, __await(void 0)];
                case 24: 
                /* v8 ignore next -- unreachable: the hang promise only ever rejects (on abort), never resolves; control never reaches here */
                return [2 /*return*/, _e.sent()];
                case 25: return [4 /*yield*/, __await((0, dsh_llm_1.assertNever)(entry, 'llm-replay replay entry'))];
                case 26: return [2 /*return*/, _e.sent()];
            }
        });
    });
}
/**
 * Install per-session positional replay. A newly seen live session takes the
 * next ordered recorded script, then advances its own cursor synchronously at
 * invocation time; calls without `sessionId` share one anonymous session. A
 * non-empty provider catalog registers a routed replay adapter; otherwise a
 * catch-all waterfall intercepts requests.
 *
 * @param ctx - the context whose LLM service receives the replay route or waterfall.
 * @param config - the resolved fixture paths (env-var defaulting is `apply`'s job).
 * @returns the {@link ReplayHandle} carrying the disposer and the teardown consumption check.
 */
function installLlmReplay(ctx, config) {
    var _a, _b;
    var paceMs = (_a = config.paceMs) !== null && _a !== void 0 ? _a : 0;
    if (!Number.isInteger(paceMs) || paceMs < 0) {
        throw new Error("llm-replay: paceMs must be a non-negative integer, got ".concat(String(config.paceMs)));
    }
    var scripts = loadSessionScripts(config);
    // Live-session → its bound script + cursor. A new live session id claims the
    // next not-yet-bound script (scripts are in bind order); `nextScript` is the
    // index of the next unclaimed one.
    var bound = new Map();
    var nextScript = 0;
    var ANON = '\0anon\0'; // the key for a call that carries no sessionId
    var replay = function (options) {
        var _a;
        var key = (_a = options.sessionId) !== null && _a !== void 0 ? _a : ANON;
        var state = bound.get(key);
        var unrecorded = false;
        if (state === undefined) {
            var script = scripts[nextScript];
            if (script === undefined) {
                // More distinct live sessions made calls than the scenario recorded —
                // an unrecorded subagent appeared. Defer the throw into the returned
                // generator (the listener must return an AsyncIterable, not throw).
                unrecorded = true;
                state = { entries: [], cursor: 0 };
            }
            else {
                nextScript++;
                state = { entries: script.entries, cursor: 0 };
                bound.set(key, state);
            }
        }
        var boundState = state;
        var seenSessions = nextScript;
        var totalScripts = scripts.length;
        var index = boundState.cursor++;
        var entry = boundState.entries[index];
        return (function () {
            return __asyncGenerator(this, arguments, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (unrecorded) {
                                throw new Error("llm-replay: a model call arrived from an unrecorded session (#".concat(seenSessions + 1, "); ")
                                    + "the scenario recorded only ".concat(totalScripts, " session(s) \u2014 re-record it"));
                            }
                            if (entry === undefined) {
                                throw new Error("llm-replay: script exhausted \u2014 session requested model call #".concat(index + 1, " ")
                                    + "but its script has only ".concat(boundState.entries.length, "; re-record the scenario"));
                            }
                            return [5 /*yield**/, __values(__asyncDelegator(__asyncValues(replayEntry(resolveScriptedEntry(entry, options.messages), options.signal, paceMs))))];
                        case 1: return [4 /*yield*/, __await.apply(void 0, [_a.sent()])];
                        case 2:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        })();
    };
    var providers = (_b = config.providers) !== null && _b !== void 0 ? _b : [];
    var dispose = providers.length > 0
        ? ctx.llm.registerAdapter(providers.map(function (provider) { return provider.id; }), new ReplayAdapter(providers, replay))
        : ctx.on('llm/stream', function (options, _next) { return replay(options); });
    return {
        dispose: dispose,
        assertConsumed: function () {
            var problems = [];
            if (nextScript < scripts.length) {
                problems.push("".concat(scripts.length - nextScript, " recorded script(s) never bound to a live session"));
            }
            for (var _i = 0, bound_1 = bound; _i < bound_1.length; _i++) {
                var _a = bound_1[_i], key = _a[0], state = _a[1];
                if (state.cursor < state.entries.length) {
                    var who = key === ANON ? 'the anonymous session' : "session ".concat(key);
                    problems.push("".concat(who, " consumed ").concat(state.cursor, "/").concat(state.entries.length, " recorded call(s)"));
                }
            }
            if (problems.length > 0) {
                throw new Error("llm-replay: fixture not fully consumed \u2014 ".concat(problems.join('; '), "; the scenario drove fewer model calls than recorded"));
            }
        },
    };
}
exports.name = 'llm-replay';
exports.inject = ['llm'];
function validateConfiguredModalities(providers) {
    var _a;
    for (var _i = 0, _b = providers !== null && providers !== void 0 ? providers : []; _i < _b.length; _i++) {
        var provider = _b[_i];
        for (var _c = 0, _d = (_a = provider.models) !== null && _a !== void 0 ? _a : []; _c < _d.length; _c++) {
            var model = _d[_c];
            var modalities = model.inputModalities;
            if (modalities === undefined)
                continue;
            if (!Array.isArray(modalities)
                || !modalities.every(function (modality) { return modality === 'text' || modality === 'image'; })) {
                throw new Error("llm-replay: provider \"".concat(provider.id, "\" model \"").concat(model.id, "\" inputModalities ")
                    + 'must be an array containing only "text" and "image"');
            }
        }
    }
}
function apply(ctx, config) {
    var _a, _b, _c;
    if (config === void 0) { config = {}; }
    var file = (_a = config.file) !== null && _a !== void 0 ? _a : process.env.DSH_SNAPSHOT_FILE;
    if (file === undefined || file.length === 0) {
        throw new Error('llm-replay: a fixture path is required (Config.file or $DSH_SNAPSHOT_FILE)');
    }
    validateConfiguredModalities(config.providers);
    var overrideFile = (_b = config.overrideFile) !== null && _b !== void 0 ? _b : process.env.DSH_SNAPSHOT_OVERRIDE;
    var childEnv = process.env.DSH_SNAPSHOT_CHILD_FILES;
    var childFiles = (_c = config.childFiles) !== null && _c !== void 0 ? _c : (childEnv !== undefined && childEnv.length > 0 ? childEnv.split(node_path_1.delimiter) : []);
    installLlmReplay(ctx, __assign(__assign(__assign(__assign({ file: file }, overrideFile !== undefined && overrideFile.length > 0 ? { overrideFile: overrideFile } : {}), childFiles.length > 0 ? { childFiles: childFiles } : {}), config.providers !== undefined ? { providers: config.providers } : {}), config.paceMs !== undefined ? { paceMs: config.paceMs } : {}));
}
