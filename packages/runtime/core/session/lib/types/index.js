"use strict";
/**
 * Event-sourced session service: append-only session log, in-memory store, and
 * the derived LLM message history. Persistence is a plugin concern (subscribe
 * to `session/event`, drain on `session/flush`).
 *
 * @module @z/dsh-session
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
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
exports.encodeSeqRanges = exports.decodeSeqRanges = exports.SessionStore = exports.SessionForkError = exports.Session = exports.KNOWN_SESSION_EVENT_TYPES = exports.headerEquals = exports.foldRequestHeader = exports.canonicalHeader = exports.isSurfaceEligibleType = exports.isSurfaceEvent = exports.isReplacementSurfaceEvent = exports.isAppendSurfaceEvent = exports.foldSurface = exports.deriveEventMessage = exports.packChunkRuns = exports.decodeStorageRecord = exports.TOOL_OUTCOME_UNKNOWN = exports.TOOL_NOT_STARTED = exports.interruptedTurnClosers = exports.snapshotJsonValue = exports.isJsonValue = exports.SessionPreparation = void 0;
exports.adoptSessionEvent = adoptSessionEvent;
exports.snapshotSessionEvent = snapshotSessionEvent;
var cordis_1 = require("@z/cordis");
var node_path_1 = require("node:path");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_scope_1 = require("@z/dsh-scope");
var types_ts_1 = require("./types.ts");
var json_ts_1 = require("./json.ts");
var surface_ts_1 = require("./surface.ts");
var request_header_ts_1 = require("./request-header.ts");
__exportStar(require("./types.ts"), exports);
var preparation_ts_1 = require("./preparation.ts");
Object.defineProperty(exports, "SessionPreparation", { enumerable: true, get: function () { return preparation_ts_1.SessionPreparation; } });
var json_ts_2 = require("./json.ts");
Object.defineProperty(exports, "isJsonValue", { enumerable: true, get: function () { return json_ts_2.isJsonValue; } });
Object.defineProperty(exports, "snapshotJsonValue", { enumerable: true, get: function () { return json_ts_2.snapshotJsonValue; } });
var repair_ts_1 = require("./repair.ts");
Object.defineProperty(exports, "interruptedTurnClosers", { enumerable: true, get: function () { return repair_ts_1.interruptedTurnClosers; } });
Object.defineProperty(exports, "TOOL_NOT_STARTED", { enumerable: true, get: function () { return repair_ts_1.TOOL_NOT_STARTED; } });
Object.defineProperty(exports, "TOOL_OUTCOME_UNKNOWN", { enumerable: true, get: function () { return repair_ts_1.TOOL_OUTCOME_UNKNOWN; } });
var chunk_rows_ts_1 = require("./chunk-rows.ts");
Object.defineProperty(exports, "decodeStorageRecord", { enumerable: true, get: function () { return chunk_rows_ts_1.decodeStorageRecord; } });
Object.defineProperty(exports, "packChunkRuns", { enumerable: true, get: function () { return chunk_rows_ts_1.packChunkRuns; } });
var surface_ts_2 = require("./surface.ts");
Object.defineProperty(exports, "deriveEventMessage", { enumerable: true, get: function () { return surface_ts_2.deriveEventMessage; } });
Object.defineProperty(exports, "foldSurface", { enumerable: true, get: function () { return surface_ts_2.foldSurface; } });
Object.defineProperty(exports, "isAppendSurfaceEvent", { enumerable: true, get: function () { return surface_ts_2.isAppendSurfaceEvent; } });
Object.defineProperty(exports, "isReplacementSurfaceEvent", { enumerable: true, get: function () { return surface_ts_2.isReplacementSurfaceEvent; } });
Object.defineProperty(exports, "isSurfaceEvent", { enumerable: true, get: function () { return surface_ts_2.isSurfaceEvent; } });
Object.defineProperty(exports, "isSurfaceEligibleType", { enumerable: true, get: function () { return surface_ts_2.isSurfaceEligibleType; } });
var request_header_ts_2 = require("./request-header.ts");
Object.defineProperty(exports, "canonicalHeader", { enumerable: true, get: function () { return request_header_ts_2.canonicalHeader; } });
Object.defineProperty(exports, "foldRequestHeader", { enumerable: true, get: function () { return request_header_ts_2.foldRequestHeader; } });
Object.defineProperty(exports, "headerEquals", { enumerable: true, get: function () { return request_header_ts_2.headerEquals; } });
var known_event_types_ts_1 = require("./known-event-types.ts");
Object.defineProperty(exports, "KNOWN_SESSION_EVENT_TYPES", { enumerable: true, get: function () { return known_event_types_ts_1.KNOWN_SESSION_EVENT_TYPES; } });
/** Validate and freeze one detached creation header in place. */
function validateSessionHeader(id, input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('session header is not a plain JSON record');
    }
    var record = input;
    if (record.version !== types_ts_1.SESSION_FORMAT_VERSION) {
        throw new Error("session header version must be ".concat(types_ts_1.SESSION_FORMAT_VERSION, ", got ").concat(String(record.version)));
    }
    if (record.id !== id) {
        throw new Error("session header id \"".concat(String(record.id), "\" does not match session id \"").concat(id, "\""));
    }
    if (typeof record.createdAt !== 'number'
        || !Number.isSafeInteger(record.createdAt)
        || record.createdAt < 0) {
        throw new Error('session header createdAt must be a non-negative safe integer');
    }
    if (record.cwd !== undefined) {
        if (typeof record.cwd !== 'string')
            throw new Error('session header cwd must be a string');
        if (!(0, node_path_1.isAbsolute)(record.cwd)) {
            throw new Error("session header cwd must be an absolute path, got \"".concat(record.cwd, "\""));
        }
    }
    if (record.parentSession !== undefined && typeof record.parentSession !== 'string') {
        throw new Error('session header parentSession must be a string');
    }
    if (record.seedLength !== undefined
        && (typeof record.seedLength !== 'number' || !Number.isSafeInteger(record.seedLength) || record.seedLength < 0)) {
        throw new Error('session header seedLength must be a non-negative safe integer');
    }
    if (record.origin !== undefined && record.origin !== 'subagent') {
        throw new Error('session header origin must be "subagent"');
    }
    if (record.delegationDepth !== undefined
        && (typeof record.delegationDepth !== 'number' || !Number.isSafeInteger(record.delegationDepth) || record.delegationDepth < 0)) {
        throw new Error('session header delegationDepth must be a non-negative safe integer');
    }
    if (record.agentPreset !== undefined && typeof record.agentPreset !== 'string') {
        throw new Error('session header agentPreset must be a string');
    }
    return (0, dsh_llm_1.deepFreeze)(record);
}
/** Validate and freeze one exclusively owned persistence header in place. */
function validateRestoredSessionHeader(id, input) {
    if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
        var prototype = Reflect.getPrototypeOf(input);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new Error('session header is not a plain JSON record');
        }
    }
    return validateSessionHeader(id, input);
}
/** Detach, validate, and freeze the creation metadata published by a session. */
function snapshotSessionHeader(id, source) {
    var input = source === undefined
        ? { version: types_ts_1.SESSION_FORMAT_VERSION, id: id, createdAt: Date.now() }
        : source;
    var snapshot = (0, json_ts_1.snapshotJsonValue)(input);
    if (snapshot === undefined)
        throw new Error('session header is not losslessly JSON-serializable');
    return validateSessionHeader(id, snapshot);
}
/**
 * Validate an exclusively owned event and deeply freeze its identified message
 * without copying the event. The caller transfers an object graph that no
 * producer retains and that shares no mutable children with another event.
 * Use {@link snapshotSessionEvent} when exclusive ownership is not guaranteed.
 * @param event - exclusively owned event imported across a trusted boundary.
 * @returns the same event object with a validated, deeply frozen message.
 */
function adoptSessionEvent(event) {
    assertMessageEventShape(event, "session event at seq ".concat(event.seq));
    switch (event.type) {
        case 'user/message':
            (0, dsh_llm_1.deepFreeze)(event.data);
            break;
        case 'assistant/message':
        case 'tool/result':
            (0, dsh_llm_1.deepFreeze)(event.data.message);
            break;
        default:
            // SessionEventMap is merge-extensible; plugin-owned events carry no core message.
            break;
    }
    return event;
}
/**
 * Detach one event while preserving deep immutability for its identified message.
 * @param event - event imported across a query or persistence boundary.
 * @returns a detached event snapshot with a validated, deeply frozen message.
 */
function snapshotSessionEvent(event) {
    return adoptSessionEvent(structuredClone(event));
}
/** Deep-freeze one acyclic JSON tree without consuming the JavaScript call stack. */
function freezeRestoredObject(value) {
    var pending = [value];
    while (pending.length > 0) {
        // The non-empty check proves an object remains to visit.
        // oxlint-disable-next-line typescript/no-non-null-assertion
        var current = pending.pop();
        Object.freeze(current);
        for (var key in current) {
            var child = current[key];
            if (child !== null && typeof child === 'object')
                pending.push(child);
        }
    }
    return value;
}
/** Validate the fixed event envelope after one-pass JSON materialization. */
function assertSessionEventEnvelope(value, index) {
    var event = value;
    if (event['type'] === 'request/header-delta') {
        throw new Error("seed event at index ".concat(index, " uses unsupported legacy request/header-delta format"));
    }
    for (var key in event) {
        switch (key) {
            case 'type':
            case 'seq':
            case 'time':
            case 'data':
            case 'surfaceOp':
            case 'sourceEventSeqs':
            case 'ignorable':
                break;
            default:
                throw new Error("seed event at index ".concat(index, " has an invalid event envelope"));
        }
    }
    var type = event['type'];
    var seq = event['seq'];
    var time = event['time'];
    if (typeof type !== 'string'
        || typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0
        || typeof time !== 'number' || !Number.isSafeInteger(time)
        || event['data'] === undefined
        || (event['ignorable'] !== undefined && event['ignorable'] !== true)) {
        throw new Error("seed event at index ".concat(index, " has an invalid event envelope"));
    }
    switch (type) {
        case 'request/header':
        case 'user/message':
        case 'assistant/message':
        case 'tool/result':
            assertCurrentLlmShape(event, index);
            break;
    }
}
/** Reject obsolete request headers and malformed messages at the seed/load boundary. */
function assertCurrentLlmShape(event, index) {
    var data = event['data'];
    var record = typeof data === 'object' && data !== null
        ? data
        : undefined;
    if (event['type'] === 'request/header') {
        var header = record === null || record === void 0 ? void 0 : record['header'];
        var headerRecord = typeof header === 'object' && header !== null && !Array.isArray(header)
            ? header
            : undefined;
        var config = headerRecord === null || headerRecord === void 0 ? void 0 : headerRecord['config'];
        if (!hasProviderModel(config))
            throw new Error("seed request/header at index ".concat(index, " lacks provider/model"));
        var configRecord = config;
        var reasoningEffort = configRecord['reasoningEffort'];
        if (reasoningEffort !== undefined
            && (typeof reasoningEffort !== 'string' || reasoningEffort.length === 0)) {
            throw new Error("seed request/header at index ".concat(index, " has an invalid reasoningEffort"));
        }
        assertAdapterDefaults(headerRecord === null || headerRecord === void 0 ? void 0 : headerRecord['adapterDefaults'], configRecord, index);
    }
    var type = event['type'];
    if (type !== 'user/message' && type !== 'assistant/message'
        && type !== 'tool/result')
        return;
    assertMessageEventShape(event, "seed ".concat(type, " at index ").concat(index));
}
var allowedAdapterKeys = new Set(['reasoningEffort', 'maxTokens']);
/** Validate adapter-default markers imported from a durable request header. */
function assertAdapterDefaults(value, config, index) {
    if (value === undefined)
        return;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error("seed request/header at index ".concat(index, " has invalid adapterDefaults"));
    }
    var defaults = value;
    if (Object.keys(defaults).some(function (key) { return !allowedAdapterKeys.has(key); })
        || Object.values(defaults).some(function (marker) { return marker !== true; })
        || defaults['reasoningEffort'] === true && config['reasoningEffort'] === undefined
        || defaults['maxTokens'] === true && config['maxTokens'] === undefined) {
        throw new Error("seed request/header at index ".concat(index, " has invalid adapterDefaults"));
    }
}
/** Validate only the event-specific invariants needed to safely replay a message. */
function assertMessageEventShape(event, subject) {
    var type = event['type'];
    if (type !== 'user/message' && type !== 'assistant/message'
        && type !== 'tool/result')
        return;
    var data = event['data'];
    var record = typeof data === 'object' && data !== null
        ? data
        : undefined;
    var message = type === 'user/message' ? record : record === null || record === void 0 ? void 0 : record['message'];
    if (typeof message !== 'object' || message === null
        || typeof message['id'] !== 'string'
        || message['id'] === '') {
        throw new Error("".concat(subject, " lacks an identified message"));
    }
    var messageRecord = message;
    var expectedRole = type === 'assistant/message' ? 'assistant' : 'user';
    if (messageRecord['role'] !== expectedRole) {
        throw new Error("".concat(subject, " message must have role \"").concat(expectedRole, "\""));
    }
    var source = messageRecord['source'];
    if (typeof source !== 'object' || source === null
        || typeof source['kind'] !== 'string'
        || source['kind'] === '') {
        throw new Error("".concat(subject, " message has invalid source"));
    }
    if (!Array.isArray(messageRecord['content'])) {
        throw new Error("".concat(subject, " message has invalid content"));
    }
    var sourceRecord = source;
    if (type === 'assistant/message') {
        if (sourceRecord['kind'] !== 'model' || !hasProviderModel(sourceRecord)) {
            throw new Error("".concat(subject, " message must have model source"));
        }
        return;
    }
    if (type !== 'tool/result')
        return;
    if (sourceRecord['kind'] !== 'tool'
        || typeof sourceRecord['callId'] !== 'string'
        || sourceRecord['callId'] === '') {
        throw new Error("".concat(subject, " message must have tool source"));
    }
    var content = messageRecord['content'];
    var block = content[0];
    if (content.length !== 1 || typeof block !== 'object' || block === null
        || block['type'] !== 'tool-result'
        || !Array.isArray(block['content'])) {
        throw new Error("".concat(subject, " message must contain one tool-result block"));
    }
    if (block['toolCallId'] !== sourceRecord['callId']) {
        throw new Error("".concat(subject, " message has mismatched tool call ids"));
    }
}
/** Whether an unknown value carries the current provider/model pair. */
function hasProviderModel(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    var pair = value;
    return typeof pair['provider'] === 'string' && pair['provider'].length > 0
        && typeof pair['model'] === 'string' && pair['model'].length > 0;
}
/** Reject request-header vocabulary removed with the legacy delta codec. */
function assertSupportedRequestHeader(type, data, location) {
    if (type === 'request/header-delta') {
        throw new Error("".concat(location, " uses unsupported legacy request/header-delta format"));
    }
    if (type === 'request/header'
        && data !== null && typeof data === 'object' && !Array.isArray(data)
        && data['reason'] === 'fallback') {
        throw new Error("".concat(location, " uses unsupported legacy request/header reason \"fallback\""));
    }
}
/** Resolve one listener snapshot, including Cordis's internal dispatch checks. */
function collectSessionCallbacks(ctx, args) {
    return __spreadArray([], ctx.events.dispatch('emit', args), true);
}
/** Invoke one resolved observe-only listener snapshot with per-listener containment. */
function invokeContainedSessionObservers(ctx, name, id, args, callbacks) {
    for (var _i = 0, callbacks_1 = callbacks; _i < callbacks_1.length; _i++) {
        var callback = callbacks_1[_i];
        try {
            var returned = callback.apply(void 0, args);
            void Promise.resolve(returned).catch(function (error) {
                ctx.logger.warn("session \"".concat(id, "\": ").concat(name, " listener rejected: ").concat(String(error)));
            });
        }
        catch (error) {
            ctx.logger.warn("session \"".concat(id, "\": ").concat(name, " listener threw: ").concat(String(error)));
        }
    }
}
/** Store attachment for the append path; module-private to keep Session store-agnostic publicly. */
var attachments = new WeakMap();
/**
 * An event-sourced session: an append-only log of {@link SessionEvent}s.
 *
 * Plain class (not a Service) — create live instances via
 * `ctx.sessions.create()` and detached instances via {@link create}.
 * Seeding with an existing event log replays/forks a session.
 * @typert object
 */
var Session = /** @class */ (function () {
    function Session(id, seed, header, mode) {
        if (mode === void 0) { mode = 'snapshot'; }
        var _a;
        this.log = [];
        /** Single incremental owner of surface acceptance and projection state. */
        this.surfaceManager = new surface_ts_1.SurfaceManager(this.log);
        /** Log position (events consumed) the header fold has reached. */
        this.headerFoldSeq = 0;
        this.contextFoldSeq = 0;
        /** The derived-message cache: frozen projections, extended per unseen node. */
        this.derived = [];
        /** Surface position (nodes projected) the cache has reached. */
        this.derivedNodes = 0;
        /** {@link SurfaceManager.replaceGeneration} the cache was built under. */
        this.derivedGeneration = 0;
        var restoredHeader = mode === 'restore'
            ? validateRestoredSessionHeader(id, header)
            : undefined;
        if (seed !== undefined) {
            // Validate the seed to the SAME invariants `append` enforces, so a
            // replay/fork (`ctx.sessions.create(id, { seed })`) cannot construct a
            // live log that no persistence backend could store: each event's `data`
            // must be JSON-serializable, and `seq` must be contiguous from 0 (the
            // `seq = log.length` contract the whole system relies on). Without this,
            // a bad seed would surface only later as a backend rejection or a silent
            // divergence between the live log and disk.
            for (var _i = 0, _b = seed.entries(); _i < _b.length; _i++) {
                var _c = _b[_i], index = _c[0], source = _c[1];
                // The seed is a persistence/replay boundary: validate and detach the
                // complete event in one lossless-JSON pass.
                var snapshot = mode === 'restore' ? source : (0, json_ts_1.snapshotJsonValue)(source);
                if (snapshot === undefined) {
                    throw new Error("seed event at index ".concat(index, " is not losslessly JSON-serializable"));
                }
                assertSessionEventEnvelope(snapshot, index);
                assertSupportedRequestHeader(snapshot.type, snapshot.data, "seed event at index ".concat(index));
                if (snapshot.seq !== index) {
                    throw new Error("seed event at index ".concat(index, " has seq ").concat(snapshot.seq, " (expected ").concat(index, "); seed must be contiguous from 0"));
                }
                // A seed is accepted incrementally through the same transition as a
                // live append and a full-log fold. The candidate is planned before it
                // enters `log`, so a failure cannot partially mutate the surface.
                try {
                    this.surfaceManager.validateNext(snapshot);
                }
                catch (error) {
                    throw new Error("invalid seed event at index ".concat(index, ": ").concat(error instanceof Error ? error.message : 'invalid surface metadata'));
                }
                this.log.push(mode === 'restore' ? freezeRestoredObject(snapshot) : (0, dsh_llm_1.deepFreeze)(snapshot));
            }
        }
        this.firstLiveSeq = this.log.length;
        this.header = restoredHeader !== null && restoredHeader !== void 0 ? restoredHeader : snapshotSessionHeader(id, header);
        // Appended here so the marker is already in `events` when a backend
        // captures the creation seed: no load-time write. Re-marking is skipped
        // because a cold session is resumed on first touch, so repeatedly opening
        // one must not grow its log per open.
        if (seed !== undefined && ((_a = this.log.at(-1)) === null || _a === void 0 ? void 0 : _a.type) !== 'session/end-seed') {
            this.append('session/end-seed', {});
        }
    }
    Object.defineProperty(Session.prototype, "surface", {
        /** The ordered surface over this session's event log. */
        get: function () {
            return this.surfaceManager;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Session.prototype, "id", {
        /** The session identity, derived from its durable header's single copy. */
        get: function () {
            return this.header.id;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Create a detached session by validating and snapshotting borrowed seed
     * events and storage metadata.
     * @param id - session identity.
     * @param seed - optional borrowed replay or fork events.
     * @param header - optional borrowed storage metadata.
     * @returns a detached session.
     */
    Session.create = function (id, seed, header) {
        return new Session(id, seed, header);
    };
    /**
     * Restore a detached session by taking ownership of fresh persistence values.
     * The storage format, event envelopes, sequence continuity, surface transitions,
     * and header fields are validated before the restored objects are frozen.
     * @param id - restored session identity.
     * @param seed - fresh detached events whose ownership is transferred.
     * @param header - fresh detached metadata whose ownership is transferred.
     * @returns a restored detached session.
     */
    Session.fromRestore = function (id, seed, header) {
        return new Session(id, seed, header, 'restore');
    };
    Object.defineProperty(Session.prototype, "events", {
        /**
         * An immutable snapshot of the append-only event log. The snapshot is reused
         * until the next append; a previously returned array does not grow later.
         * Events and their nested data are deep-frozen at acceptance, so neither a
         * cast nor ordinary JavaScript can rewrite durable history.
         */
        get: function () {
            var _a;
            (_a = this.eventsSnapshot) !== null && _a !== void 0 ? _a : (this.eventsSnapshot = Object.freeze(__spreadArray([], this.log, true)));
            return this.eventsSnapshot;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Session.prototype, "seq", {
        /** The next event's sequence number — always the log length (the `seq = log.length` contiguity contract). */
        get: function () {
            return this.log.length;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Append one typed event to the log and synchronously notify observers via
     * the store-owned, module-private publication hooks. The hot path never blocks
     * on I/O — persistence plugins buffer asynchronously. Once the event enters
     * the log, the append is committed: observer failures are logged and
     * contained per listener, so they do not change the return value or prevent
     * later listeners from observing the same accepted event.
     *
     * @param type - The event type (key of {@link SessionEventMap}).
     * @param data - The event payload; must be JSON-serializable.
     * @param opts - Surface metadata: `surfaceOp` controls how the event enters
     *   the ordered surface; `sourceEventSeqs` lists the seq numbers of earlier
     *   events this one derives from. REQUIRED for
     *   {@link SurfaceEventType} events (every message-producing event must
     *   declare how it joins the surface, the sole source of derived model
     *   history) and
     *   rejected by the compiler for non-surface types like `turn/start` or
     *   `assistant/chunk`.
     * @returns the logged event — its assigned `seq`/`time` plus the SNAPSHOT of
     *   `data` that entered the log, so reading `event.data` back sees the logged
     *   value, never the caller's still-mutable input.
     * @throws if `data` or surface metadata is not losslessly JSON-serializable
     *   (BigInt, function, symbol, undefined, negative zero, non-finite number,
     *   circular reference, sparse array, or an exotic object such as
     *   Map/Set/Date/class instance), or when the candidate violates the
     *   canonical surface contract (marker shape and eligibility, unique
     *   earlier source-event references, positional replacement validity, and complete
     *   shadowed-node coverage). One recursive pass reads, validates, and
     *   copies each nested value once, so a stateful getter cannot supply one value
     *   to validation and another to storage. The event log is the durable source
     *   of truth, so a bad event fails at the append site rather than later during
     *   a backend flush. A synchronous internal dispatch validation failure or an
     *   append reentered while this acceptance/publication boundary is open also
     *   rejects before the log changes.
     */
    Session.prototype.append = function (type, data) {
        var opts = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            opts[_i - 2] = arguments[_i];
        }
        var surfaceOpts = opts[0];
        var surfaceMetadata = __assign(__assign({}, (surfaceOpts === null || surfaceOpts === void 0 ? void 0 : surfaceOpts.sourceEventSeqs) === undefined ? {} : { sourceEventSeqs: surfaceOpts.sourceEventSeqs }), (surfaceOpts === null || surfaceOpts === void 0 ? void 0 : surfaceOpts.surfaceOp) === undefined ? {} : { surfaceOp: surfaceOpts.surfaceOp });
        var dataSnapshot = (0, json_ts_1.snapshotJsonValue)(data);
        if (dataSnapshot === undefined) {
            throw new Error("session event \"".concat(type, "\" carries non-JSON-serializable data"));
        }
        assertSupportedRequestHeader(type, dataSnapshot, "session event \"".concat(type, "\""));
        var surfaceMetadataSnapshot = (0, json_ts_1.snapshotJsonValue)(surfaceMetadata);
        if (surfaceMetadataSnapshot === undefined) {
            throw new Error("session event \"".concat(type, "\" carries non-JSON-serializable surface metadata"));
        }
        var entry = attachments.get(this);
        if (entry === null || entry === void 0 ? void 0 : entry.appending) {
            throw new Error('session append cannot reenter while another append is being published');
        }
        var event = (0, dsh_llm_1.deepFreeze)(__assign({ type: type, seq: this.log.length, time: Date.now(), data: dataSnapshot }, surfaceMetadataSnapshot));
        this.surfaceManager.validateNext(event);
        if (entry !== undefined)
            entry.appending = true;
        try {
            var callbacks = void 0;
            var callbackArgs = [this, event];
            if (entry !== undefined) {
                callbacks = collectSessionCallbacks(entry.emitCtx, __spreadArray([entry.carrier, 'session/event'], callbackArgs, true));
            }
            this.log.push(event);
            this.eventsSnapshot = undefined;
            if (callbacks !== undefined && entry !== undefined) {
                invokeContainedSessionObservers(entry.emitCtx, 'session/event', entry.id, callbackArgs, callbacks);
            }
            return event;
        }
        finally {
            if (entry !== undefined) {
                entry.appending = false;
                if (entry.detachRequested && !entry.announcing)
                    entry.detach();
            }
        }
    };
    /**
     * The {@link EpochHeader} in force after the log's last header event — the
     * header the NEXT request will be compared against — or undefined before
     * the first `request/header` snapshot. The live, incrementally-maintained
     * form of `foldRequestHeader(session.events)`: each header event is folded
     * once, when first seen, so a per-step read costs O(new events).
     * @returns the folded header, or undefined when no header event exists yet.
     */
    Session.prototype.requestHeader = function () {
        if (this.headerFoldSeq < this.log.length) {
            // Frozen on update: the fold is session state exposed by reference — a
            // consumer mutating it in place (instead of building a replacement)
            // would desync every later comparison against the log, so mutation
            // throws instead.
            this.headerFold = (0, dsh_llm_1.deepFreeze)((0, request_header_ts_1.foldRequestHeader)(this.log.slice(this.headerFoldSeq), this.headerFold));
            this.headerFoldSeq = this.log.length;
        }
        return this.headerFold;
    };
    /**
     * Return the latest resolved route metadata, or `undefined` before the first
     * `request/context` event. Each event is folded once.
     * @returns the latest immutable route metadata.
     */
    Session.prototype.requestContext = function () {
        if (this.contextFoldSeq < this.log.length) {
            for (var _i = 0, _a = this.log.slice(this.contextFoldSeq); _i < _a.length; _i++) {
                var event_1 = _a[_i];
                if (event_1.type === 'request/context')
                    this.contextFold = (0, dsh_llm_1.deepFreeze)(__assign({}, event_1.data));
            }
            this.contextFoldSeq = this.log.length;
        }
        return this.contextFold;
    };
    /**
     * Derive the LLM message history by walking the ordered sequences of
     * message-producing events maintained by `surfaceOp` markers. The
     * surface is the single source of derived history: every message-producing
     * append records its `surfaceOp`, so a raw event with no marker (a chunk, a
     * turn boundary) is correctly absent, and a compaction `replace` deletes the
     * shadowed nodes from the derivation. The projection rules are
     * {@link deriveEventMessage}, folded per node.
     *
     * CACHED: each surface node is projected exactly once, when first seen — a
     * call costs O(new nodes), and a surface rewrite (a `replace`;
     * {@link SessionSurface.replaceGeneration}) rebuilds. The returned array is
     * a fresh snapshot per call (later appends never grow an array a caller
     * already holds); the `Message` objects in it are SHARED and **deep-frozen**.
     * Their content reuses the already frozen durable event data, so the cache
     * needs no second deep clone and consumers still cannot mutate the log.
     * @returns a fresh array of the shared, frozen derived history.
     */
    Session.prototype.deriveMessages = function () {
        var surface = this.surface;
        var nodes = surface.nodes;
        var generation = surface.replaceGeneration;
        if (generation !== this.derivedGeneration) {
            this.derived = [];
            this.derivedNodes = 0;
            this.derivedGeneration = generation;
        }
        for (var _i = 0, _a = nodes.slice(this.derivedNodes); _i < _a.length; _i++) {
            var seq = _a[_i];
            // Surface sequences are built from this.log — seq is always a valid
            // index by construction. The non-null assertion expresses that invariant.
            // oxlint-disable-next-line typescript/no-non-null-assertion
            var msg = this.deriveEventMessage(this.log[seq]);
            // A surface node is one of the five message-producing types, but an
            // empty-content assistant/message (a max-tokens step that hosts only
            // usage) derives to null and must not enter the transcript.
            if (msg)
                this.derived.push(msg);
        }
        this.derivedNodes = nodes.length;
        return __spreadArray([], this.derived, true);
    };
    /**
     * Instance face of the pure per-node `deriveEventMessage` export from
     * `surface.ts`.
     * @param event - the event to project.
     * @returns the derived message, or null when the event produces none.
     */
    Session.prototype.deriveEventMessage = function (event) {
        return (0, surface_ts_1.deriveEventMessage)(event);
    };
    return Session;
}());
exports.Session = Session;
/** Typed error for session fork rejections. */
var SessionForkError = /** @class */ (function (_super) {
    __extends(SessionForkError, _super);
    function SessionForkError(message, code) {
        var _this = _super.call(this, message) || this;
        _this.code = code;
        _this.name = 'SessionForkError';
        return _this;
    }
    return SessionForkError;
}(Error));
exports.SessionForkError = SessionForkError;
/**
 * In-memory session store (`ctx.sessions`).
 *
 * Persistence is intentionally not implemented here — persistence plugins
 * subscribe to `session/event` and flush on `session/flush` / dispose.
 */
var SessionStore = /** @class */ (function (_super) {
    __extends(SessionStore, _super);
    function SessionStore(ctx) {
        var _this = _super.call(this, ctx, 'sessions') || this;
        _this.store = new Map();
        _this.counter = 0;
        ctx.inject(['typert'], function (typeCtx) {
            typeCtx.typert.lookups.register('session', {
                parameter: 'session',
                wire: 'sessionId',
                hostTypeSymbol: '@z/dsh-session#Session',
                wireTypeSymbol: '@z/dsh-session/types#SessionId',
                resolve: function (sessionId) { return _this.get(sessionId); },
            });
        });
        return _this;
    }
    /**
     * Create a session owned by the calling fiber: disposing that fiber stops
     * event notification and removes the session from the store. `options.seed`
     * populates the session with a copy of those events (replay/fork);
     * `options.meta` attaches creation metadata (validated absolute `cwd`, seed
     * and parent lineage, and delegation depth) as the immutable
     * {@link SessionHeader} (the store fills `version`/`id`/`createdAt`).
     *
     * For an agent whose session must be torn down IN ORDER with its loop (so the
     * loop's final events are published before the store attachment ends), do NOT use this
     * — fold the session lifecycle into the agent's own effect via
     * {@link prepare} + {@link enter} + {@link announce} (see
     * `dsh-agent-loop`'s creation transaction).
     *
     * @param id - the session id; omitted, the store mints `session-<n>`.
     * @param options - seed events and/or creation metadata for the header.
     * @returns the live session, already entered and announced.
     * @throws if a session with `id` already exists, metadata is not a plain
     *   lossless-JSON record with valid scalar fields, or `meta.cwd` is a
     *   non-absolute path (storage backends key directories off it).
     */
    SessionStore.prototype.create = function (id, options) {
        var session = this.prepare(id, options);
        // Single effect owned by the calling fiber. Yield the detach BEFORE
        // announcing so a throwing `session/created` listener rolls the attach back
        // (the generator effect disposes already-yielded disposers on a throw)
        // instead of leaking the store entry and its publication hooks.
        this.ctx.effect(function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.enter(session)];
                    case 1:
                        _a.sent();
                        this.announce(session);
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'sessions.create()');
        return session;
    };
    /**
     * Build a session WITHOUT entering it into the store — validate the id/cwd and
     * construct the {@link Session} (with its immutable {@link SessionHeader}).
     * Pairs with {@link enter} + {@link announce}: a caller that owns a composite
     * `ctx.effect` (the agent factory) folds the session lifecycle into that ONE
     * effect so a fiber unload tears the session + agent down as a single ORDERED
     * chain rather than as racing sibling effects — which would remove the publication hooks
     * before the driver's closing events commit, dropping them.
     *
     * @param id - the session id; omitted, the store mints `session-<n>`.
     * @param options - seed events and/or creation metadata for the header. With
     *   `seedSource: 'persistence'`, metadata and events must be fresh detached
     *   graphs whose ownership transfers to this call: they are validated and
     *   frozen in place through {@link Session.fromRestore}, so the caller must
     *   retain no mutable aliases.
     * @returns the constructed session, NOT yet in the store.
     * @throws if a session with `id` already exists, metadata is not a plain
     *   lossless-JSON record with valid scalar fields, or `meta.cwd` is a
     *   non-absolute path.
     */
    SessionStore.prototype.prepare = function (id, options) {
        var _a;
        var sessionId;
        if (id === undefined) {
            do
                sessionId = (0, types_ts_1.SessionId)("session-".concat(++this.counter));
            while (this.store.has(sessionId));
        }
        else {
            sessionId = (0, types_ts_1.SessionId)(id);
        }
        if (this.store.has(sessionId))
            throw new Error("session \"".concat(sessionId, "\" already exists"));
        if ((options === null || options === void 0 ? void 0 : options.seedSource) === 'persistence') {
            return Session.fromRestore(sessionId, options.seed, options.meta);
        }
        var seed = options === null || options === void 0 ? void 0 : options.seed;
        var meta = options === null || options === void 0 ? void 0 : options.meta;
        var header = __assign(__assign(__assign(__assign(__assign(__assign({ version: types_ts_1.SESSION_FORMAT_VERSION, id: sessionId, createdAt: (_a = meta === null || meta === void 0 ? void 0 : meta.createdAt) !== null && _a !== void 0 ? _a : Date.now() }, (meta === null || meta === void 0 ? void 0 : meta.cwd) === undefined ? {} : { cwd: meta.cwd }), (meta === null || meta === void 0 ? void 0 : meta.parentSession) === undefined ? {} : { parentSession: meta.parentSession }), (meta === null || meta === void 0 ? void 0 : meta.seedLength) === undefined ? {} : { seedLength: meta.seedLength }), (meta === null || meta === void 0 ? void 0 : meta.origin) === undefined ? {} : { origin: meta.origin }), (meta === null || meta === void 0 ? void 0 : meta.delegationDepth) === undefined ? {} : { delegationDepth: meta.delegationDepth }), (meta === null || meta === void 0 ? void 0 : meta.agentPreset) === undefined ? {} : { agentPreset: meta.agentPreset });
        return Session.create(sessionId, seed, header);
    };
    /**
     * Enter a {@link prepare}d session into the store: install the module-private
     * append publication hooks and add it to the store. Returns the DETACH
     * disposer (hooks + store removal). Does NOT emit `session/created` —
     * the caller yields this disposer inside its effect and THEN calls
     * {@link announce}, so a throwing `session/created` listener rolls the attach
     * back instead of leaking it.
     *
     * Re-checks the id for a duplicate: `prepare` and `enter` are public
     * cross-package primitives and a caller may interleave arbitrary work (or
     * another create) between them, so a stale prepared session must NOT overwrite
     * a live store entry of the same id — its detach disposer would later delete
     * the REAL session. The {@link create} convenience and the agent factory call
     * the two back-to-back so they never trip this, but the public API cannot
     * assume that.
     *
     * @param session - a {@link prepare}d session not yet in the store.
     * @returns the detach disposer (publication hooks + store removal). When called from
     *   a synchronous `session/created` listener, removal and disposal wait until
     *   that creation dispatch unwinds.
     * @throws if a session with this id is already in the store.
     */
    SessionStore.prototype.enter = function (session) {
        var _this = this;
        var id = session.id;
        var carrier = (0, dsh_scope_1.scopeTarget)(session, (0, dsh_scope_1.scopeOf)(this.ctx));
        // This is the authoritative collision boundary after arbitrary unpublished
        // preparation. Only one exact same-id transaction can publish.
        if (this.store.has(id))
            throw new Error("session \"".concat(id, "\" already exists"));
        if (attachments.has(session))
            throw new Error("session \"".concat(id, "\" is already attached to a store"));
        var entry = {
            id: id,
            session: session,
            carrier: carrier,
            emitCtx: this.ctx,
            announced: false,
            announcing: false,
            appending: false,
            detachRequested: false,
            detach: function () { _this.detachEntered(entry); },
        };
        this.store.set(id, entry);
        attachments.set(session, entry);
        var entered = true;
        var detach = function () {
            if (!entered)
                return;
            entered = false;
            // A lifecycle listener may own the advanced detach capability. Keep the
            // entry and its publication hooks live until synchronous creation or append
            // publication unwinds, then publish the paired disposal edge.
            if (entry.announcing || entry.appending) {
                entry.detachRequested = true;
                return;
            }
            entry.detach();
        };
        return detach;
    };
    /** Remove one exact entered session and emit its paired disposal when announced. */
    SessionStore.prototype.detachEntered = function (entry) {
        entry.detachRequested = false;
        // A stale capability cannot remove observers or storage belonging to a
        // later same-id lifecycle.
        /* v8 ignore next -- enter() rejects replacement while this single-shot detach capability is live. */
        if (this.store.get(entry.id) !== entry)
            return;
        this.store.delete(entry.id);
        attachments.delete(entry.session);
        if (entry.announced)
            this.emitDisposed(entry);
    };
    /** Emit `session/created` exactly once for an {@link enter}ed session (with
     * the carrier {@link enter} captured). Separate from {@link enter} so the
     * caller can yield the detach disposer first (rollback safety — see
     * {@link enter}).
     * @param session - the entered session to announce to listeners.
     * @throws if the session is not live or its announcement already began,
     *   including a reentrant call from a creation listener. */
    SessionStore.prototype.announce = function (session) {
        var _this = this;
        var entry = this.liveEntryFor(session);
        if (entry.announced || entry.announcing) {
            throw new Error("session \"".concat(entry.id, "\" was already announced"));
        }
        // Mark before emit: Cordis emit may deliver to earlier listeners and then
        // throw. Rollback must still pair that partial creation with disposal, and
        // a listener cannot recursively create a second lifecycle edge.
        entry.announced = true;
        var callbackArgs = [session];
        entry.announcing = true;
        try {
            var callbacks = collectSessionCallbacks(this.ctx, [entry.carrier, 'session/created', session]);
            for (var _i = 0, callbacks_2 = callbacks; _i < callbacks_2.length; _i++) {
                var callback = callbacks_2[_i];
                // Synchronous throws intentionally propagate and veto publication; the
                // yielded detach then emits the paired disposal edge. An async function
                // is nevertheless assignable to a void listener, so observe its returned
                // promise: rejection is too late to roll back and must be logged instead
                // of becoming unhandled.
                var returned = callback.apply(void 0, callbackArgs);
                void Promise.resolve(returned).catch(function (error) {
                    _this.ctx.logger.warn("session \"".concat(entry.id, "\": session/created listener rejected: ").concat(String(error)));
                });
            }
        }
        finally {
            entry.announcing = false;
            if (entry.detachRequested && !entry.appending)
                entry.detach();
        }
    };
    /** Emit the paired teardown notification with per-listener containment. */
    SessionStore.prototype.emitDisposed = function (entry) {
        var callbackArgs = [entry.session];
        try {
            var callbacks = collectSessionCallbacks(this.ctx, [entry.carrier, 'session/disposed', entry.session]);
            invokeContainedSessionObservers(this.ctx, 'session/disposed', entry.id, callbackArgs, callbacks);
        }
        catch (error) {
            this.ctx.logger.warn("session \"".concat(entry.id, "\": session/disposed dispatch threw: ").concat(String(error)));
        }
    };
    /**
     * Dispatch the awaited `session/flush` durability checkpoint for `session`,
     * with the carrier captured at {@link enter}. THE flush entry point: the
     * store owns the carrier, so callers (the checkpoint policy's per-request
     * barrier, goal-round-driver's idle checkpoint, teardown drains, and consumers
     * that flush themselves before reading storage) must come through here
     * rather than dispatch a raw `ctx.parallel('session/flush', …)` — one owner,
     * one spelling, and the scoped-dispatch invariant can pin it.
     * @param session - the session whose buffered events must reach durable storage.
     * @returns whether at least one durability listener participated, after every
     *   listener has settled successfully.
     * @throws the first registered listener failure after every listener settles.
     */
    SessionStore.prototype.flush = function (session) {
        return __awaiter(this, void 0, void 0, function () {
            var carrier, callbackArgs, callbacks, results, failure;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        carrier = this.liveEntryFor(session).carrier;
                        callbackArgs = [session];
                        callbacks = collectSessionCallbacks(this.ctx, [carrier, 'session/flush', session]);
                        return [4 /*yield*/, Promise.allSettled(callbacks.map(function (callback) {
                                try {
                                    return callback.apply(void 0, callbackArgs);
                                }
                                catch (error) {
                                    // Preserve the listener's exact rejection value; flush is a caller-owned
                                    // failure boundary, and Cordis listeners may throw arbitrary values.
                                    // oxlint-disable-next-line typescript/prefer-promise-reject-errors
                                    return Promise.reject(error);
                                }
                            }))];
                    case 1:
                        results = _a.sent();
                        failure = results.find(function (result) { return result.status === 'rejected'; });
                        if (failure !== undefined)
                            throw failure.reason;
                        return [2 /*return*/, callbacks.length > 0];
                }
            });
        });
    };
    /** Return the exact live entry; detached/prepared objects reject. */
    SessionStore.prototype.liveEntryFor = function (session) {
        var entry = attachments.get(session);
        if (entry === undefined || this.store.get(entry.id) !== entry) {
            throw new Error("session \"".concat(session.id, "\" is not live in this store"));
        }
        return entry;
    };
    /**
     * Look up a live session.
     * @param id - the session id to look up.
     * @returns the session, or undefined when no live session has that id.
     */
    SessionStore.prototype.get = function (id) {
        var _a;
        return (_a = this.store.get(id)) === null || _a === void 0 ? void 0 : _a.session;
    };
    /**
     * All live sessions, in creation order.
     * @returns a fresh array; mutating it does not affect the store.
     */
    SessionStore.prototype.list = function () {
        return __spreadArray([], this.store.values(), true).map(function (entry) { return entry.session; });
    };
    /**
     * Create a live child session from a stable prefix of a live source.
     * `boundary` is an inclusive source event seq; omitted means the source's
     * current last event. The selected slice may end with a between-turn event
     * but must not end inside an open turn.
     *
     * @param source - Live source session object or id.
     * @param boundary - Inclusive source event seq to fork through; omitted means
     *   the source's current last event, and omitted on an empty source forks an
     *   empty child.
     * @param childSessionId - Optional child session id; omitted delegates to
     *   `SessionStore`'s id policy.
     * @returns The created live child session.
     */
    SessionStore.prototype.fork = function (source, boundary, childSessionId) {
        if (childSessionId !== undefined && this.get(childSessionId) !== undefined) {
            throw new SessionForkError("session \"".concat(childSessionId, "\" already exists"), 'SESSION_ALREADY_EXISTS');
        }
        var liveSource = this._resolveForkSource(source);
        var seed = this._forkSeed(liveSource, boundary);
        return this.create(childSessionId, {
            seed: seed,
            meta: __assign(__assign({}, liveSource.header.cwd !== undefined ? { cwd: liveSource.header.cwd } : {}), { parentSession: liveSource.id, seedLength: seed.length }),
        });
    };
    SessionStore.prototype._forkSeed = function (session, requestedBoundary) {
        var _a;
        var events = session.events;
        var lastEvent = events.at(-1);
        var boundary;
        if (requestedBoundary !== undefined) {
            boundary = requestedBoundary;
        }
        else {
            if (lastEvent === undefined)
                return [];
            boundary = lastEvent.seq;
        }
        if (!Number.isSafeInteger(boundary) || boundary < 0) {
            throw new SessionForkError("fork boundary for session \"".concat(session.id, "\" must be a non-negative safe integer, got ").concat(String(boundary)), 'INVALID_BOUNDARY');
        }
        if (boundary >= events.length) {
            var lastSeq = (_a = events.at(-1)) === null || _a === void 0 ? void 0 : _a.seq;
            throw new SessionForkError("fork boundary ".concat(boundary, " does not exist in session \"").concat(session.id, "\" (last seq: ").concat(lastSeq !== null && lastSeq !== void 0 ? lastSeq : 'none', ")"), 'INVALID_BOUNDARY');
        }
        var boundaryEvent = events[boundary];
        if (boundaryEvent === undefined || boundaryEvent.seq !== boundary) {
            throw new SessionForkError("fork boundary ".concat(boundary, " does not match a contiguous event seq in session \"").concat(session.id, "\""), 'INVALID_BOUNDARY');
        }
        var lastTurnBoundary = events.slice(0, boundary + 1)
            .findLast(function (event) { return event.type === 'turn/start' || event.type === 'turn/end'; });
        if ((lastTurnBoundary === null || lastTurnBoundary === void 0 ? void 0 : lastTurnBoundary.type) === 'turn/start') {
            throw new SessionForkError("fork boundary ".concat(boundary, " in session \"").concat(session.id, "\" ends inside open turn ").concat(lastTurnBoundary.data.turn), 'OPEN_TURN');
        }
        return events.slice(0, boundary + 1);
    };
    SessionStore.prototype._resolveForkSource = function (source) {
        if (typeof source === 'string') {
            var session = this.get(source);
            if (session === undefined)
                throw new SessionForkError("session \"".concat(source, "\" not found"), 'SESSION_NOT_FOUND');
            return session;
        }
        var live = this.get(source.id);
        if (live === undefined) {
            throw new SessionForkError("session \"".concat(source.id, "\" not found"), 'SESSION_NOT_FOUND');
        }
        if (live !== source)
            throw new SessionForkError("session \"".concat(source.id, "\" is not the live store instance"), 'SESSION_NOT_LIVE');
        return source;
    };
    return SessionStore;
}(cordis_1.Service));
exports.SessionStore = SessionStore;
var seq_ranges_ts_1 = require("./seq-ranges.ts");
Object.defineProperty(exports, "decodeSeqRanges", { enumerable: true, get: function () { return seq_ranges_ts_1.decodeSeqRanges; } });
Object.defineProperty(exports, "encodeSeqRanges", { enumerable: true, get: function () { return seq_ranges_ts_1.encodeSeqRanges; } });
exports.default = SessionStore;
