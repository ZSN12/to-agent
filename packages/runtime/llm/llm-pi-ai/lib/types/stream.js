"use strict";
/**
 * pi-ai assistant event translation into the Harness streaming protocol.
 *
 * pi-ai tool-call arguments are parsed objects while the Harness keeps their
 * raw JSON representation. pi-ai also reports failures as terminal stream
 * events, which this module maps into Harness finish chunks.
 *
 * @module dsh-llm-pi-ai/stream
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapUsage = mapUsage;
exports.mapStopReason = mapStopReason;
exports.toStreamChunks = toStreamChunks;
var dsh_llm_1 = require("@z/dsh-llm");
var pi_ai_1 = require("@earendil-works/pi-ai");
var replay_ts_1 = require("./replay.ts");
/**
 * Map pi-ai usage (reasoning folded into output by pi-ai).
 * @param usage - cumulative usage from the terminal pi-ai event.
 * @returns harness counts; cache fields appear only when non-zero (pi-ai reports zeros, not absence).
 */
function mapUsage(usage) {
    return __assign(__assign({ inputTokens: usage.input, outputTokens: usage.output }, usage.cacheRead > 0 ? { cacheReadTokens: usage.cacheRead } : {}), usage.cacheWrite > 0 ? { cacheWriteTokens: usage.cacheWrite } : {});
}
// XXX(pi-ai upstream): pi-ai flattens the caught error to `error.message`
// (api/anthropic-messages.js: `errorMessage = error instanceof Error ?
// error.message : JSON.stringify(error)`), discarding the original Error and its
// `cause` chain before it reaches us. undici carries the actionable transport
// detail on `cause` (e.g. `SocketError: other side closed`) but hands the fetch
// wrapper a bare `terminated`, so we are left pattern-matching terse words here.
// If pi-ai ever forwards the original Error (or a fetch/dispatcher hook that lets
// us capture the cause ourselves), classify on `code`/`cause` instead of text.
function classifyPiAiError(message) {
    if (/\b(?:401|403)\b/.test(message))
        return 'AUTH';
    if ((0, dsh_llm_1.isQuotaExceededError)(message))
        return dsh_llm_1.QUOTA_EXCEEDED_CODE;
    if (/\b429\b|rate.?limit/i.test(message))
        return 'RATE_LIMIT';
    // A rejected request body (gateway or provider size cap): resending the
    // same request cannot succeed, so it is invalid, not transient.
    if (/\b413\b|failed to buffer the request body:\s*length limit exceeded|payload too large|request body too large/i.test(message))
        return 'INVALID_REQUEST';
    if (/\b400\b|invalid.?request/i.test(message))
        return 'INVALID_REQUEST';
    if (/\b5\d\d\b/.test(message))
        return 'SERVER';
    if (/\btime(?:d)?\s*out\b|timeout/i.test(message))
        return 'TIMEOUT';
    // A stream truncated before the provider's terminal event: each pi-ai provider
    // throws its own wording when the wire closes mid-response without a terminal
    // event (`… stream ended before message_stop`, `… before a terminal response
    // event`, `… ended without a terminal event`, `Stream ended without
    // finish_reason`). The connection dropped mid-response, so this is a transport
    // truncation, not a model-level error.
    if (/stream ended (?:before|without)\b/i.test(message))
        return 'TRANSPORT';
    if (/\b(?:network|connection|socket|fetch)\b|\bECONN[A-Z]+\b/i.test(message)
        || /\b(?:other side closed|HTTP2 request did not get a response|WebSocket closed unexpectedly)\b/i.test(message)
        // undici renders a mid-stream socket drop as a bare `terminated` (its
        // `cause` — the real SocketError — was flattened away upstream); Node's
        // stream layer says `Premature close`.
        || /\bterminated\b|premature close/i.test(message)) {
        return 'TRANSPORT';
    }
    return 'PI_AI_ERROR';
}
/**
 * Map a terminal pi-ai event to the harness finish reason.
 * @param message - the assistant message carried by the `done` or `error` event.
 * @param contextWindow - resolved catalog capacity for usage-based overflow detection.
 * @returns the mapped harness reason. Recognized error text, `stop` usage above
 *   `contextWindow`, and zero-output `length` usage that fills the window map
 *   to `CONTEXT_WINDOW_EXCEEDED`; a `stop` with no content blocks maps to an
 *   `EMPTY_RESPONSE` error.
 */
function mapStopReason(message, contextWindow) {
    var _a, _b, _c;
    var piAiOverflow = (0, pi_ai_1.isContextOverflow)(message, contextWindow);
    var harnessOverflow = message.stopReason === 'error'
        && message.errorMessage !== undefined
        && (0, dsh_llm_1.isContextWindowExceededError)(message.errorMessage);
    if (piAiOverflow || harnessOverflow) {
        return {
            kind: 'error',
            failure: {
                message: (_a = message.errorMessage) !== null && _a !== void 0 ? _a : "pi-ai detected context overflow for model \"".concat(message.model, "\""),
                code: dsh_llm_1.CONTEXT_WINDOW_EXCEEDED_CODE,
            },
        };
    }
    switch (message.stopReason) {
        case 'pending':
        case 'deferred':
            return {
                kind: 'error',
                failure: { message: "model \"".concat(message.model, "\" returned an unresolved deferred response"), code: 'PI_AI_ERROR' },
            };
        case 'stop':
            // A terminal stop that produced no content blocks is a degenerate
            // provider completion, not a successful (empty) assistant message.
            if (message.content.length === 0) {
                return {
                    kind: 'error',
                    failure: {
                        message: "model \"".concat(message.model, "\" returned a completed response with no content"),
                        code: dsh_llm_1.EMPTY_RESPONSE_CODE,
                    },
                };
            }
            return { kind: 'stop' };
        case 'length': return { kind: 'max-tokens' };
        case 'toolUse': return { kind: 'tool-calls' };
        case 'aborted': return {
            kind: 'aborted',
            failure: { message: (_b = message.errorMessage) !== null && _b !== void 0 ? _b : 'pi-ai stream aborted', code: 'ABORTED' },
        };
        case 'error': {
            var text = (_c = message.errorMessage) !== null && _c !== void 0 ? _c : 'pi-ai stream error';
            return { kind: 'error', failure: { message: text, code: classifyPiAiError(text) } };
        }
    }
}
/**
 * Translate the pi-ai event stream into StreamChunks. pi-ai never throws
 * mid-stream — failures arrive as `error` events, which become error/aborted
 * `finish` chunks (the harness protocol's other error-delivery style).
 * @param events - one assistant turn's pi-ai event stream.
 * @param contextWindow - resolved catalog capacity for usage-based overflow detection.
 * @returns the harness chunks, ending with `usage` then `finish`; throws
 *   `LlmError` (`STREAM_CLOSED`) if the source ends without a terminal event.
 */
function toStreamChunks(events, contextWindow) {
    return __asyncGenerator(this, arguments, function toStreamChunks_1() {
        var toolIds, _a, events_1, events_1_1, event_1, _b, partial, id, name_1, known, e_1_1;
        var _c, e_1, _d, _e;
        var _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    toolIds = new Map();
                    _g.label = 1;
                case 1:
                    _g.trys.push([1, 46, 47, 52]);
                    _a = true, events_1 = __asyncValues(events);
                    _g.label = 2;
                case 2: return [4 /*yield*/, __await(events_1.next())];
                case 3:
                    if (!(events_1_1 = _g.sent(), _c = events_1_1.done, !_c)) return [3 /*break*/, 45];
                    _e = events_1_1.value;
                    _a = false;
                    event_1 = _e;
                    _b = event_1.type;
                    switch (_b) {
                        case 'start': return [3 /*break*/, 4];
                        case 'text_start': return [3 /*break*/, 5];
                        case 'text_delta': return [3 /*break*/, 8];
                        case 'text_end': return [3 /*break*/, 11];
                        case 'thinking_start': return [3 /*break*/, 14];
                        case 'thinking_delta': return [3 /*break*/, 17];
                        case 'thinking_end': return [3 /*break*/, 20];
                        case 'toolcall_start': return [3 /*break*/, 23];
                        case 'toolcall_delta': return [3 /*break*/, 26];
                        case 'toolcall_end': return [3 /*break*/, 29];
                        case 'done': return [3 /*break*/, 32];
                        case 'error': return [3 /*break*/, 38];
                    }
                    return [3 /*break*/, 44];
                case 4: return [3 /*break*/, 44];
                case 5: return [4 /*yield*/, __await({ type: 'block-start', index: event_1.contentIndex, blockType: 'text' })];
                case 6: return [4 /*yield*/, _g.sent()];
                case 7:
                    _g.sent();
                    return [3 /*break*/, 44];
                case 8: return [4 /*yield*/, __await({ type: 'text-delta', index: event_1.contentIndex, text: event_1.delta })];
                case 9: return [4 /*yield*/, _g.sent()];
                case 10:
                    _g.sent();
                    return [3 /*break*/, 44];
                case 11: return [4 /*yield*/, __await({ type: 'block-end', index: event_1.contentIndex, block: { type: 'text', text: event_1.content } })];
                case 12: return [4 /*yield*/, _g.sent()];
                case 13:
                    _g.sent();
                    return [3 /*break*/, 44];
                case 14: return [4 /*yield*/, __await({ type: 'block-start', index: event_1.contentIndex, blockType: 'reasoning' })];
                case 15: return [4 /*yield*/, _g.sent()];
                case 16:
                    _g.sent();
                    return [3 /*break*/, 44];
                case 17: return [4 /*yield*/, __await({ type: 'reasoning-delta', index: event_1.contentIndex, text: event_1.delta })];
                case 18: return [4 /*yield*/, _g.sent()];
                case 19:
                    _g.sent();
                    return [3 /*break*/, 44];
                case 20: return [4 /*yield*/, __await({ type: 'block-end', index: event_1.contentIndex, block: { type: 'reasoning', text: event_1.content } })];
                case 21: return [4 /*yield*/, _g.sent()];
                case 22:
                    _g.sent();
                    return [3 /*break*/, 44];
                case 23:
                    partial = event_1.partial.content[event_1.contentIndex];
                    id = (partial === null || partial === void 0 ? void 0 : partial.type) === 'toolCall' ? partial.id : '';
                    name_1 = (partial === null || partial === void 0 ? void 0 : partial.type) === 'toolCall' ? partial.name : '';
                    toolIds.set(event_1.contentIndex, { id: id, name: name_1 });
                    return [4 /*yield*/, __await({ type: 'block-start', index: event_1.contentIndex, blockType: 'tool-call' })];
                case 24: return [4 /*yield*/, _g.sent()];
                case 25:
                    _g.sent();
                    return [3 /*break*/, 44];
                case 26:
                    known = toolIds.get(event_1.contentIndex);
                    return [4 /*yield*/, __await(__assign(__assign({ type: 'tool-call-delta', index: event_1.contentIndex, id: (0, dsh_llm_1.CallId)((_f = known === null || known === void 0 ? void 0 : known.id) !== null && _f !== void 0 ? _f : '') }, (known === null || known === void 0 ? void 0 : known.name) !== undefined && known.name.length > 0 ? { name: known.name } : {}), { argumentsDelta: event_1.delta }))];
                case 27: return [4 /*yield*/, _g.sent()];
                case 28:
                    _g.sent();
                    return [3 /*break*/, 44];
                case 29: return [4 /*yield*/, __await({
                        type: 'block-end',
                        index: event_1.contentIndex,
                        block: {
                            type: 'tool-call',
                            id: (0, dsh_llm_1.CallId)(event_1.toolCall.id),
                            name: event_1.toolCall.name,
                            // pi-ai hands back the PARSED arguments; the harness vocabulary
                            // keeps the raw string.
                            arguments: JSON.stringify(event_1.toolCall.arguments),
                        },
                    })];
                case 30: return [4 /*yield*/, _g.sent()];
                case 31:
                    _g.sent();
                    return [3 /*break*/, 44];
                case 32: return [4 /*yield*/, __await({ type: 'usage', usage: mapUsage(event_1.message.usage) })];
                case 33: return [4 /*yield*/, _g.sent()];
                case 34:
                    _g.sent();
                    return [4 /*yield*/, __await({
                            type: 'finish',
                            reason: mapStopReason(event_1.message, contextWindow),
                            replayState: (0, replay_ts_1.toPiReplayState)(event_1.message),
                        })];
                case 35: return [4 /*yield*/, _g.sent()];
                case 36:
                    _g.sent();
                    return [4 /*yield*/, __await(void 0)];
                case 37: return [2 /*return*/, _g.sent()];
                case 38: return [4 /*yield*/, __await({ type: 'usage', usage: mapUsage(event_1.error.usage) })];
                case 39: 
                // In-stream error delivery (pi-ai's style) → error finish chunk
                // (the harness's other sanctioned error path besides throwing).
                return [4 /*yield*/, _g.sent()];
                case 40:
                    // In-stream error delivery (pi-ai's style) → error finish chunk
                    // (the harness's other sanctioned error path besides throwing).
                    _g.sent();
                    return [4 /*yield*/, __await({ type: 'finish', reason: mapStopReason(event_1.error, contextWindow) })];
                case 41: return [4 /*yield*/, _g.sent()];
                case 42:
                    _g.sent();
                    return [4 /*yield*/, __await(void 0)];
                case 43: return [2 /*return*/, _g.sent()];
                case 44:
                    _a = true;
                    return [3 /*break*/, 2];
                case 45: return [3 /*break*/, 52];
                case 46:
                    e_1_1 = _g.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 52];
                case 47:
                    _g.trys.push([47, , 50, 51]);
                    if (!(!_a && !_c && (_d = events_1.return))) return [3 /*break*/, 49];
                    return [4 /*yield*/, __await(_d.call(events_1))];
                case 48:
                    _g.sent();
                    _g.label = 49;
                case 49: return [3 /*break*/, 51];
                case 50:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 51: return [7 /*endfinally*/];
                case 52: throw new dsh_llm_1.LlmError('pi-ai event stream ended without done/error', 'STREAM_CLOSED');
            }
        });
    });
}
