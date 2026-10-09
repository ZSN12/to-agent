"use strict";
/**
 * Scriptable OpenAI-compatible HTTP/SSE server for transport, protocol, and
 * semantic-empty LLM recovery tests. Each accepted chat-completions request
 * consumes one behavior; the server never retries or interprets harness policy.
 *
 * @module @z/dsh-llm-mock-server
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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
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
exports.MAX_MOCK_LLM_TIMER_DELAY_MS = exports.DEFAULT_MOCK_LLM_RANDOM_WEIGHTS = exports.MOCK_LLM_BEHAVIORS = void 0;
exports.startMockLlmServer = startMockLlmServer;
var node_http_1 = require("node:http");
var node_crypto_1 = require("node:crypto");
var node_net_1 = require("node:net");
var promises_1 = require("node:timers/promises");
/** Request-scoped behaviors accepted by {@link startMockLlmServer}. */
exports.MOCK_LLM_BEHAVIORS = [
    'connection_reset',
    'stream_disconnect',
    'empty',
    'empty_body',
    'stream_eof',
    'partial_eof',
    'partial_disconnect',
    'stall',
    'malformed_json',
    'malformed_event',
    'wrong_content_type',
    'rate_limit',
    'server_error',
    'service_unavailable',
    'auth_error',
    'invalid_request',
    'context_overflow',
    'quota_exceeded',
    'success',
    'reasoning_success',
    'tool_call_success',
    'max_tokens',
    'slow_success',
    'random',
];
/**
 * Default stress profile for `random`. Weights are configurable test pressure,
 * not a claim about production incident frequency.
 */
exports.DEFAULT_MOCK_LLM_RANDOM_WEIGHTS = Object.freeze({
    success: 48,
    slow_success: 10,
    max_tokens: 2,
    connection_reset: 5,
    stream_disconnect: 5,
    partial_disconnect: 10,
    empty: 5,
    stall: 2,
    rate_limit: 5,
    server_error: 4,
    service_unavailable: 2,
    partial_eof: 1,
    malformed_json: 1,
});
/** Largest millisecond delay accepted by Node timers without truncation. */
exports.MAX_MOCK_LLM_TIMER_DELAY_MS = 2147483647;
var DEFAULT_SUCCESS_TEXT = 'mock response recovered';
var DEFAULT_PARTIAL_TEXT = 'discarded partial response';
var DEFAULT_REASONING_TEXT = 'mock reasoning';
var CONCRETE_BEHAVIORS = new Set(exports.MOCK_LLM_BEHAVIORS.filter(function (behavior) { return behavior !== 'random'; }));
function boundedInteger(name, value, min, max) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error("llm-mock-server: ".concat(name, " must be an integer between ").concat(min, " and ").concat(max));
    }
    return value;
}
function resolveOptions(options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    var host = (_a = options.host) !== null && _a !== void 0 ? _a : '127.0.0.1';
    var port = boundedInteger('port', (_b = options.port) !== null && _b !== void 0 ? _b : 0, 0, 65535);
    var chunkSize = boundedInteger('chunkSize', (_c = options.chunkSize) !== null && _c !== void 0 ? _c : 8, 1, Number.MAX_SAFE_INTEGER);
    var chunkDelayMs = boundedInteger('chunkDelayMs', (_d = options.chunkDelayMs) !== null && _d !== void 0 ? _d : 25, 0, exports.MAX_MOCK_LLM_TIMER_DELAY_MS);
    var disconnectDelayMs = boundedInteger('disconnectDelayMs', (_e = options.disconnectDelayMs) !== null && _e !== void 0 ? _e : 10, 0, exports.MAX_MOCK_LLM_TIMER_DELAY_MS);
    var retryAfterMs = boundedInteger('retryAfterMs', (_f = options.retryAfterMs) !== null && _f !== void 0 ? _f : 1000, 1, exports.MAX_MOCK_LLM_TIMER_DELAY_MS);
    var randomSeed = boundedInteger('randomSeed', (_g = options.randomSeed) !== null && _g !== void 0 ? _g : (0, node_crypto_1.randomBytes)(4).readUInt32LE(0), 0, 4294967295);
    var successText = (_h = options.successText) !== null && _h !== void 0 ? _h : DEFAULT_SUCCESS_TEXT;
    var partialText = (_j = options.partialText) !== null && _j !== void 0 ? _j : DEFAULT_PARTIAL_TEXT;
    var reasoningText = (_k = options.reasoningText) !== null && _k !== void 0 ? _k : DEFAULT_REASONING_TEXT;
    var toolName = (_l = options.toolName) !== null && _l !== void 0 ? _l : 'mock_tool';
    var toolArguments = (_m = options.toolArguments) !== null && _m !== void 0 ? _m : '{"value":"mock"}';
    if (host.length === 0)
        throw new Error('llm-mock-server: host must not be empty');
    if (options.sequence.length === 0)
        throw new Error('llm-mock-server: sequence must not be empty');
    var lastBehavior = options.sequence.reduce(function (_previous, behavior) { return behavior; });
    if (options.apiKey === '')
        throw new Error('llm-mock-server: apiKey must not be empty');
    if (successText.length === 0)
        throw new Error('llm-mock-server: successText must not be empty');
    if (partialText.length === 0)
        throw new Error('llm-mock-server: partialText must not be empty');
    if (reasoningText.length === 0)
        throw new Error('llm-mock-server: reasoningText must not be empty');
    if (toolName.length === 0)
        throw new Error('llm-mock-server: toolName must not be empty');
    if (options.requestId === '')
        throw new Error('llm-mock-server: requestId must not be empty');
    try {
        JSON.parse(toolArguments);
    }
    catch (_q) {
        throw new Error('llm-mock-server: toolArguments must be valid JSON');
    }
    var configuredWeights = (_o = options.randomWeights) !== null && _o !== void 0 ? _o : exports.DEFAULT_MOCK_LLM_RANDOM_WEIGHTS;
    var randomWeights = [];
    for (var _i = 0, _r = Object.entries(configuredWeights); _i < _r.length; _i++) {
        var _s = _r[_i], behavior = _s[0], weight = _s[1];
        if (!CONCRETE_BEHAVIORS.has(behavior)) {
            throw new Error("llm-mock-server: randomWeights contains unknown concrete behavior ".concat(JSON.stringify(behavior)));
        }
        if (!Number.isFinite(weight) || weight < 0) {
            throw new Error("llm-mock-server: random weight for ".concat(behavior, " must be a non-negative finite number"));
        }
        if (weight > 0)
            randomWeights.push([behavior, weight]);
    }
    if (randomWeights.length === 0) {
        throw new Error('llm-mock-server: randomWeights must contain at least one positive weight');
    }
    return __assign(__assign(__assign(__assign(__assign({ host: host, port: port }, options.apiKey === undefined ? {} : { apiKey: options.apiKey }), { sequence: __spreadArray([], options.sequence, true), lastBehavior: lastBehavior, repeatLast: (_p = options.repeatLast) !== null && _p !== void 0 ? _p : false, randomSeed: randomSeed, randomWeights: randomWeights, successText: successText, partialText: partialText, reasoningText: reasoningText, chunkSize: chunkSize, chunkDelayMs: chunkDelayMs, disconnectDelayMs: disconnectDelayMs, retryAfterMs: retryAfterMs }), options.requestId === undefined ? {} : { requestId: options.requestId }), { toolName: toolName, toolArguments: toolArguments }), options.onEvent === undefined ? {} : { onEvent: options.onEvent });
}
function emit(options, event) {
    var _a;
    try {
        (_a = options.onEvent) === null || _a === void 0 ? void 0 : _a.call(options, Object.freeze(event));
    }
    catch (_telemetryObserverFailure) {
        // Test telemetry is observational; a broken observer cannot change provider wire behavior.
    }
}
function readJsonBody(request) {
    return __awaiter(this, void 0, void 0, function () {
        var chunks, chunk, e_1_1, body;
        var _a, request_1, request_1_1;
        var _b, e_1, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    chunks = [];
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 6, 7, 12]);
                    _a = true, request_1 = __asyncValues(request);
                    _e.label = 2;
                case 2: return [4 /*yield*/, request_1.next()];
                case 3:
                    if (!(request_1_1 = _e.sent(), _b = request_1_1.done, !_b)) return [3 /*break*/, 5];
                    _d = request_1_1.value;
                    _a = false;
                    chunk = _d;
                    chunks.push(Buffer.from(chunk));
                    _e.label = 4;
                case 4:
                    _a = true;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 12];
                case 6:
                    e_1_1 = _e.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 12];
                case 7:
                    _e.trys.push([7, , 10, 11]);
                    if (!(!_a && !_b && (_c = request_1.return))) return [3 /*break*/, 9];
                    return [4 /*yield*/, _c.call(request_1)];
                case 8:
                    _e.sent();
                    _e.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 11: return [7 /*endfinally*/];
                case 12:
                    body = Buffer.concat(chunks).toString('utf8');
                    return [2 /*return*/, body.length === 0 ? undefined : JSON.parse(body)];
            }
        });
    });
}
function splitText(text, size) {
    var points = Array.from(text);
    var chunks = [];
    for (var index = 0; index < points.length; index += size)
        chunks.push(points.slice(index, index + size).join(''));
    return chunks;
}
function openSse(response, contentType) {
    if (contentType === void 0) { contentType = 'text/event-stream; charset=utf-8'; }
    response.writeHead(200, {
        'content-type': contentType,
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
    });
    response.flushHeaders();
}
function writeSse(record, response, payload) {
    response.write("data: ".concat(typeof payload === 'string' ? payload : JSON.stringify(payload), "\n\n"));
    record.chunksSent += 1;
}
function writeDone(record, response) {
    writeSse(record, response, '[DONE]');
}
function finishRecord(options, record, outcome) {
    if (record.outcome !== undefined)
        return;
    record.outcome = outcome;
    emit(options, {
        type: 'result',
        attempt: record.attempt,
        scriptBehavior: record.scriptBehavior,
        behavior: record.behavior,
        outcome: outcome,
        chunksSent: record.chunksSent,
    });
}
function httpError(options, record, response, status, message, code, type) {
    if (type === void 0) { type = 'mock_error'; }
    var headers = { 'content-type': 'application/json' };
    if (record.behavior === 'rate_limit') {
        headers['retry-after'] = String(Math.ceil(options.retryAfterMs / 1000));
    }
    if (options.requestId !== undefined)
        headers['x-request-id'] = options.requestId;
    response.writeHead(status, headers);
    response.end(JSON.stringify({ error: { message: message, type: type, code: code } }));
    finishRecord(options, record, 'completed');
}
function terminalChunk(reason, outputTokens) {
    return {
        choices: [{ index: 0, delta: { content: '' }, finish_reason: reason }],
        usage: { prompt_tokens: 3, completion_tokens: outputTokens },
    };
}
function pause(milliseconds, response) {
    return __awaiter(this, void 0, void 0, function () {
        var controller, stop, _responseClosed_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (milliseconds === 0)
                        return [2 /*return*/, !response.destroyed];
                    controller = new AbortController();
                    stop = function () { controller.abort(); };
                    response.once('close', stop);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    return [4 /*yield*/, (0, promises_1.setTimeout)(milliseconds, undefined, { signal: controller.signal })];
                case 2:
                    _a.sent();
                    return [2 /*return*/, true];
                case 3:
                    _responseClosed_1 = _a.sent();
                    // The timer only receives this response-owned abort signal; closing the response cancels its wait.
                    return [2 /*return*/, false];
                case 4:
                    response.off('close', stop);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function streamText(options, record, response, text, delayMs) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, _a, chunk;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _i = 0, _a = splitText(text, options.chunkSize);
                    _b.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 4];
                    chunk = _a[_i];
                    writeSse(record, response, { choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] });
                    return [4 /*yield*/, pause(delayMs, response)];
                case 2:
                    if (!(_b.sent()))
                        return [2 /*return*/, false];
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, true];
            }
        });
    });
}
function completeText(options, record, response, reason, delayMs) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, streamText(options, record, response, options.successText, delayMs)];
                case 1:
                    if (!(_a.sent())) {
                        finishRecord(options, record, 'client_closed');
                        return [2 /*return*/];
                    }
                    writeSse(record, response, terminalChunk(reason, Array.from(options.successText).length));
                    writeDone(record, response);
                    response.end();
                    finishRecord(options, record, 'completed');
                    return [2 /*return*/];
            }
        });
    });
}
function disconnect(options, record, response) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, pause(options.disconnectDelayMs, response)];
                case 1:
                    if (!(_a.sent())) {
                        finishRecord(options, record, 'client_closed');
                        return [2 /*return*/];
                    }
                    finishRecord(options, record, 'reset');
                    response.destroy();
                    return [2 /*return*/];
            }
        });
    });
}
function toolCallChunks(options) {
    var midpoint = Math.max(1, Math.floor(options.toolArguments.length / 2));
    return [
        {
            choices: [{
                    index: 0,
                    delta: {
                        tool_calls: [{
                                index: 0,
                                id: 'mock-call-1',
                                type: 'function',
                                function: { name: options.toolName, arguments: options.toolArguments.slice(0, midpoint) },
                            }],
                    },
                    finish_reason: null,
                }],
        },
        {
            choices: [{
                    index: 0,
                    delta: { tool_calls: [{ index: 0, function: { arguments: options.toolArguments.slice(midpoint) } }] },
                    finish_reason: null,
                }],
        },
    ];
}
function runBehavior(options, record, request, response) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, _i, _b, chunk, _c, _d, chunk;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _a = record.behavior;
                    switch (_a) {
                        case 'script_exhausted': return [3 /*break*/, 1];
                        case 'connection_reset': return [3 /*break*/, 2];
                        case 'stream_disconnect': return [3 /*break*/, 3];
                        case 'empty': return [3 /*break*/, 5];
                        case 'empty_body': return [3 /*break*/, 6];
                        case 'stream_eof': return [3 /*break*/, 7];
                        case 'partial_eof': return [3 /*break*/, 8];
                        case 'partial_disconnect': return [3 /*break*/, 10];
                        case 'stall': return [3 /*break*/, 13];
                        case 'malformed_json': return [3 /*break*/, 14];
                        case 'malformed_event': return [3 /*break*/, 15];
                        case 'wrong_content_type': return [3 /*break*/, 16];
                        case 'rate_limit': return [3 /*break*/, 18];
                        case 'server_error': return [3 /*break*/, 19];
                        case 'service_unavailable': return [3 /*break*/, 20];
                        case 'auth_error': return [3 /*break*/, 21];
                        case 'invalid_request': return [3 /*break*/, 22];
                        case 'context_overflow': return [3 /*break*/, 23];
                        case 'quota_exceeded': return [3 /*break*/, 24];
                        case 'success': return [3 /*break*/, 25];
                        case 'reasoning_success': return [3 /*break*/, 27];
                        case 'tool_call_success': return [3 /*break*/, 29];
                        case 'max_tokens': return [3 /*break*/, 30];
                        case 'slow_success': return [3 /*break*/, 32];
                    }
                    return [3 /*break*/, 34];
                case 1:
                    httpError(options, record, response, 500, 'mock script exhausted', 'MOCK_SCRIPT_EXHAUSTED');
                    return [2 /*return*/];
                case 2:
                    finishRecord(options, record, 'reset');
                    request.socket.destroy();
                    return [2 /*return*/];
                case 3:
                    openSse(response);
                    return [4 /*yield*/, disconnect(options, record, response)];
                case 4:
                    _e.sent();
                    return [2 /*return*/];
                case 5:
                    openSse(response);
                    writeSse(record, response, terminalChunk('stop', 0));
                    writeDone(record, response);
                    response.end();
                    finishRecord(options, record, 'completed');
                    return [2 /*return*/];
                case 6:
                    openSse(response);
                    response.end();
                    finishRecord(options, record, 'completed');
                    return [2 /*return*/];
                case 7:
                    openSse(response);
                    writeSse(record, response, { choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });
                    response.end();
                    finishRecord(options, record, 'completed');
                    return [2 /*return*/];
                case 8:
                    openSse(response);
                    return [4 /*yield*/, streamText(options, record, response, options.partialText, 0)];
                case 9:
                    _e.sent();
                    response.end();
                    finishRecord(options, record, 'completed');
                    return [2 /*return*/];
                case 10:
                    openSse(response);
                    return [4 /*yield*/, streamText(options, record, response, options.partialText, options.chunkDelayMs)];
                case 11:
                    if (!(_e.sent()))
                        return [2 /*return*/];
                    return [4 /*yield*/, disconnect(options, record, response)];
                case 12:
                    _e.sent();
                    return [2 /*return*/];
                case 13:
                    openSse(response);
                    finishRecord(options, record, 'stalled');
                    return [2 /*return*/];
                case 14:
                    openSse(response);
                    writeSse(record, response, '{not-json');
                    writeDone(record, response);
                    response.end();
                    finishRecord(options, record, 'completed');
                    return [2 /*return*/];
                case 15:
                    openSse(response);
                    writeSse(record, response, { choices: [null] });
                    writeDone(record, response);
                    response.end();
                    finishRecord(options, record, 'completed');
                    return [2 /*return*/];
                case 16:
                    openSse(response, 'application/json');
                    return [4 /*yield*/, completeText(options, record, response, 'stop', 0)];
                case 17:
                    _e.sent();
                    return [2 /*return*/];
                case 18:
                    httpError(options, record, response, 429, 'mock rate limit', 'rate_limit');
                    return [2 /*return*/];
                case 19:
                    httpError(options, record, response, 500, 'mock server error', 'server_error');
                    return [2 /*return*/];
                case 20:
                    httpError(options, record, response, 503, 'mock service unavailable', 'service_unavailable');
                    return [2 /*return*/];
                case 21:
                    httpError(options, record, response, 401, 'mock authentication failed', 'invalid_api_key');
                    return [2 /*return*/];
                case 22:
                    httpError(options, record, response, 400, 'mock invalid request', 'invalid_request');
                    return [2 /*return*/];
                case 23:
                    httpError(options, record, response, 400, 'mock input exceeds the model context window', 'context_length_exceeded', 'invalid_request_error');
                    return [2 /*return*/];
                case 24:
                    httpError(options, record, response, 429, 'mock insufficient quota', 'insufficient_quota');
                    return [2 /*return*/];
                case 25:
                    openSse(response);
                    return [4 /*yield*/, completeText(options, record, response, 'stop', 0)];
                case 26:
                    _e.sent();
                    return [2 /*return*/];
                case 27:
                    openSse(response);
                    for (_i = 0, _b = splitText(options.reasoningText, options.chunkSize); _i < _b.length; _i++) {
                        chunk = _b[_i];
                        writeSse(record, response, {
                            choices: [{ index: 0, delta: { reasoning_content: chunk }, finish_reason: null }],
                        });
                    }
                    return [4 /*yield*/, completeText(options, record, response, 'stop', 0)];
                case 28:
                    _e.sent();
                    return [2 /*return*/];
                case 29:
                    openSse(response);
                    for (_c = 0, _d = toolCallChunks(options); _c < _d.length; _c++) {
                        chunk = _d[_c];
                        writeSse(record, response, chunk);
                    }
                    writeSse(record, response, terminalChunk('tool_calls', 2));
                    writeDone(record, response);
                    response.end();
                    finishRecord(options, record, 'completed');
                    return [2 /*return*/];
                case 30:
                    openSse(response);
                    return [4 /*yield*/, completeText(options, record, response, 'length', 0)];
                case 31:
                    _e.sent();
                    return [2 /*return*/];
                case 32:
                    openSse(response);
                    return [4 /*yield*/, completeText(options, record, response, 'stop', options.chunkDelayMs)];
                case 33:
                    _e.sent();
                    return [2 /*return*/];
                case 34: return [2 /*return*/];
            }
        });
    });
}
function seededRandom(seed) {
    var state = seed;
    return function () {
        state = (state + 1831565813) >>> 0;
        var mixed = state;
        mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
        return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
    };
}
function chooseRandomBehavior(weights, random) {
    var total = weights.reduce(function (sum, entry) { return sum + entry[1]; }, 0);
    var draw = random() * total;
    for (var _i = 0, weights_1 = weights; _i < weights_1.length; _i++) {
        var _a = weights_1[_i], behavior = _a[0], weight = _a[1];
        if (draw < weight)
            return behavior;
        draw -= weight;
    }
    // Floating-point subtraction can only leave a rounding residue at the upper boundary.
    /* v8 ignore next -- seededRandom is strictly less than one; this guards floating-point residue only */
    return weights.at(-1)[0];
}
/**
 * Start a local chat-completions server that consumes one configured behavior
 * per accepted request. Only a `POST` path ending in `/chat/completions` consumes the script;
 * invalid routes, methods, authorization, and JSON receive ordinary 4xx
 * responses. Closing the handle terminates stalled connections.
 *
 * @param options - listener, script, response content, timing, and telemetry options.
 * @returns the listening handle after the port is bound.
 */
function startMockLlmServer(options) {
    return __awaiter(this, void 0, void 0, function () {
        var resolved, requests, random, cursor, selectBehavior, handle, server, closing, close, address, advertisedHost;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    resolved = resolveOptions(options);
                    requests = [];
                    random = seededRandom(resolved.randomSeed);
                    cursor = 0;
                    selectBehavior = function () {
                        var selected = resolved.sequence[cursor];
                        cursor += 1;
                        var scriptBehavior = selected !== null && selected !== void 0 ? selected : (resolved.repeatLast ? resolved.lastBehavior : 'script_exhausted');
                        return {
                            scriptBehavior: scriptBehavior,
                            behavior: scriptBehavior === 'random'
                                ? chooseRandomBehavior(resolved.randomWeights, random)
                                : scriptBehavior,
                        };
                    };
                    handle = function (request, response) { return __awaiter(_this, void 0, void 0, function () {
                        var path, body, _a, selected, record;
                        var _b;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    path = new URL((_b = request.url) !== null && _b !== void 0 ? _b : '/', 'http://mock.invalid').pathname;
                                    if (request.method !== 'POST') {
                                        response.writeHead(405, { allow: 'POST' }).end();
                                        return [2 /*return*/];
                                    }
                                    if (!path.endsWith('/chat/completions')) {
                                        response.writeHead(404).end();
                                        return [2 /*return*/];
                                    }
                                    if (resolved.apiKey !== undefined && request.headers.authorization !== "Bearer ".concat(resolved.apiKey)) {
                                        response.writeHead(401, { 'content-type': 'application/json' });
                                        response.end(JSON.stringify({ error: { message: 'invalid mock bearer token', code: 'invalid_api_key' } }));
                                        return [2 /*return*/];
                                    }
                                    _c.label = 1;
                                case 1:
                                    _c.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, readJsonBody(request)];
                                case 2:
                                    body = _c.sent();
                                    return [3 /*break*/, 4];
                                case 3:
                                    _a = _c.sent();
                                    response.writeHead(400, { 'content-type': 'application/json' });
                                    response.end(JSON.stringify({ error: { message: 'request body must be valid JSON', code: 'invalid_json' } }));
                                    return [2 /*return*/];
                                case 4:
                                    selected = selectBehavior();
                                    record = {
                                        attempt: requests.length + 1,
                                        scriptBehavior: selected.scriptBehavior,
                                        behavior: selected.behavior,
                                        path: path,
                                        headers: __assign({}, request.headers),
                                        body: body,
                                        chunksSent: 0,
                                    };
                                    requests.push(record);
                                    response.once('close', function () {
                                        if (!response.writableFinished && record.outcome === undefined) {
                                            finishRecord(resolved, record, 'client_closed');
                                        }
                                    });
                                    emit(resolved, {
                                        type: 'request',
                                        attempt: record.attempt,
                                        scriptBehavior: record.scriptBehavior,
                                        behavior: record.behavior,
                                        path: path,
                                    });
                                    return [4 /*yield*/, runBehavior(resolved, record, request, response)];
                                case 5:
                                    _c.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); };
                    server = (0, node_http_1.createServer)(function (request, response) {
                        /* v8 ignore start -- last-resort containment for Node response failures after validated test inputs */
                        handle(request, response).catch(function (error) {
                            var record = requests.at(-1);
                            if (record !== undefined)
                                finishRecord(resolved, record, 'server_error');
                            if (response.headersSent) {
                                response.destroy(error instanceof Error ? error : new Error(String(error)));
                                return;
                            }
                            response.writeHead(500, { 'content-type': 'application/json' });
                            response.end(JSON.stringify({ error: { message: 'mock server handler failed', code: 'MOCK_HANDLER_FAILED' } }));
                        });
                        /* v8 ignore stop */
                    });
                    close = function () { return (closing !== null && closing !== void 0 ? closing : (closing = new Promise(function (resolveClose) {
                        server.close(function () { resolveClose(); });
                        server.closeAllConnections();
                    }))); };
                    return [4 /*yield*/, new Promise(function (resolveListen, rejectListen) {
                            server.once('error', rejectListen);
                            server.listen(resolved.port, resolved.host, function () {
                                server.off('error', rejectListen);
                                resolveListen();
                            });
                        })];
                case 1:
                    _a.sent();
                    address = server.address();
                    advertisedHost = (0, node_net_1.isIP)(resolved.host) === 6 ? "[".concat(resolved.host, "]") : resolved.host;
                    return [2 /*return*/, {
                            baseURL: "http://".concat(advertisedHost, ":").concat(address.port),
                            port: address.port,
                            randomSeed: resolved.randomSeed,
                            requests: requests,
                            close: close,
                        }];
            }
        });
    });
}
