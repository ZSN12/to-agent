"use strict";
/**
 * Shared route, framing, timeout, assembly, and validation policy for
 * model-backed session-title providers.
 * @module @z/dsh-session-title-llm
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
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionTitleLlmConfigSchema = exports.SessionTitleLlmConfigFields = exports.SESSION_TITLE_TIMEOUT_CODE = void 0;
exports.resolveSessionTitleLlmConfig = resolveSessionTitleLlmConfig;
exports.registerSessionTitleLlmProvider = registerSessionTitleLlmProvider;
exports.generateSessionTitleWithLlm = generateSessionTitleWithLlm;
var schemastery_1 = require("@z/schemastery");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_timeout_1 = require("@z/dsh-timeout");
var dsh_session_title_1 = require("@z/dsh-session-title");
/** Capability-owned timeout reason code for auxiliary title requests. */
exports.SESSION_TITLE_TIMEOUT_CODE = 'SESSION_TITLE_TIMEOUT';
/** Shared Loader field schemas with no library defaults. */
exports.SessionTitleLlmConfigFields = {
    targetWords: schemastery_1.default.number().step(1).min(1).required(),
    targetCjkCharacters: schemastery_1.default.number().step(1).min(1).required(),
    maxInputBytes: schemastery_1.default.number().step(1).min(1).required(),
    maxOutputTokens: schemastery_1.default.number().step(1).min(1).required(),
    timeoutMs: schemastery_1.default.number().step(1).min(1).max(dsh_timeout_1.MAX_TIMER_DELAY_MS).required(),
    provider: schemastery_1.default.string(),
    model: schemastery_1.default.string(),
};
/** Shared Loader schema with no library defaults. */
exports.SessionTitleLlmConfigSchema = schemastery_1.default.object(exports.SessionTitleLlmConfigFields);
/** Complete configuration key set for direct construction validation. */
var CONFIG_KEYS = new Set([
    'targetWords',
    'targetCjkCharacters',
    'maxInputBytes',
    'maxOutputTokens',
    'timeoutMs',
    'provider',
    'model',
]);
/** Validate one positive integer limit. */
function assertPositiveInteger(name, value) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error("session-title-llm: ".concat(name, " must be a positive integer"));
    }
}
/**
 * Validate and detach required model-provider configuration.
 * @param config - untrusted plugin configuration.
 * @returns immutable policy with optional route absence preserved.
 */
function resolveSessionTitleLlmConfig(config) {
    var candidate = config;
    if (candidate === null || typeof candidate !== 'object') {
        throw new Error('session-title-llm: configuration is required');
    }
    var value = candidate;
    for (var _i = 0, _a = Object.keys(value); _i < _a.length; _i++) {
        var key = _a[_i];
        if (!CONFIG_KEYS.has(key))
            throw new Error("session-title-llm: unknown config key \"".concat(key, "\""));
    }
    assertPositiveInteger('targetWords', value.targetWords);
    assertPositiveInteger('targetCjkCharacters', value.targetCjkCharacters);
    assertPositiveInteger('maxInputBytes', value.maxInputBytes);
    assertPositiveInteger('maxOutputTokens', value.maxOutputTokens);
    assertPositiveInteger('timeoutMs', value.timeoutMs);
    if (value.timeoutMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        throw new Error("session-title-llm: timeoutMs must not exceed ".concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
    var hasProvider = value.provider !== undefined;
    var hasModel = value.model !== undefined;
    if (hasProvider !== hasModel) {
        throw new Error('session-title-llm: provider and model must be supplied together');
    }
    if (hasProvider
        && (typeof value.provider !== 'string' || value.provider.length === 0
            || typeof value.model !== 'string' || value.model.length === 0)) {
        throw new Error('session-title-llm: provider and model overrides must be non-empty strings');
    }
    return (0, dsh_llm_1.deepFreeze)(__assign({}, value));
}
/**
 * Register one model-backed provider through the shared configuration and call policy.
 * @param ctx - context exposing the title and LLM services.
 * @param config - untrusted required deployment policy.
 * @param id - stable plugin id recorded with generated titles.
 * @param automatic - provider-owned automatic generation cadence.
 * @param selectMessages - exact source-message selection for one revision.
 */
function registerSessionTitleLlmProvider(ctx, config, id, automatic, selectMessages) {
    var resolved = resolveSessionTitleLlmConfig(config);
    var titleProvider = (0, dsh_session_title_1.SessionTitleProviderId)(id);
    ctx.sessionTitle.register({
        id: titleProvider,
        automatic: automatic,
        generate: function (request) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    return [2 /*return*/, generateSessionTitleWithLlm(ctx, resolved, request, selectMessages(request.messages), titleProvider)];
                });
            });
        },
    });
}
/** Resolve the explicit pair or the exact route captured from `request/header`. */
function resolveRoute(config, request) {
    if (config.provider !== undefined && config.model !== undefined) {
        return { provider: config.provider, model: config.model };
    }
    if (request.route === undefined) {
        throw new Error('session-title-llm: no logged request route is available; configure provider and model together');
    }
    return request.route;
}
/** Stable language-aware system instruction shared by both provider plugins. */
function systemPrompt(config) {
    return [
        'Create a concise title for an AI coding-assistant session from the supplied human messages.',
        'Return only the title on one line, **in plain text of natural language**, with no quotes, prefix, explanation, Markdown, XML, or terminal control codes. No code is allowed.',
        'Use the language of the messages.',
        "Aim for about ".concat(config.targetWords, " words in non-CJK languages or ").concat(config.targetCjkCharacters, " CJK characters."),
    ].join('\n');
}
/** Frame exact messages as JSON so user text cannot break structural delimiters. */
function frameMessages(messages) {
    return "Generate the session title from this JSON array of human messages:\n".concat(JSON.stringify(messages));
}
/** Translate terminal finish reasons into an auxiliary-call failure. */
function finishError(finish) {
    switch (finish.kind) {
        case 'stop':
            return undefined;
        case 'error':
        case 'aborted': {
            var error = new Error(finish.failure.message);
            error.code = finish.failure.code;
            return error;
        }
        case 'max-tokens':
            return new Error('session-title-llm: title output reached maxOutputTokens');
        case 'tool-calls':
            return new Error('session-title-llm: title model unexpectedly requested a tool');
        default:
            return new Error("session-title-llm: unsupported finish reason \"".concat(String(finish.kind), "\""));
    }
}
/**
 * Generate one title through the shared auxiliary LLM call.
 * @param ctx - context exposing the registered LLM service.
 * @param config - validated model-provider policy.
 * @param request - service-owned session, route, message snapshot, and cancellation.
 * @param selectedMessages - exact provider-selected subset to frame and attribute.
 * @param titleProvider - registered title-provider identity recorded with the request.
 * @returns normalized non-empty title, exact source seqs, and used model route.
 */
function generateSessionTitleWithLlm(ctx, config, request, selectedMessages, titleProvider) {
    return __awaiter(this, void 0, void 0, function () {
        var env_1, framedInput, inputBytes, route, messages, system, callDeadline, options, assembler, _a, _b, _c, chunk, e_1_1, terminalError, blocks, text, title, e_2;
        var _d, e_1, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    env_1 = { stack: [], error: void 0, hasError: false };
                    _g.label = 1;
                case 1:
                    _g.trys.push([1, 14, 15, 16]);
                    request.signal.throwIfAborted();
                    if (selectedMessages.length === 0) {
                        throw new Error('session-title-llm: at least one source message is required');
                    }
                    framedInput = frameMessages(selectedMessages);
                    inputBytes = Buffer.byteLength(framedInput, 'utf8');
                    if (inputBytes > config.maxInputBytes) {
                        throw new Error("session-title-llm: input is ".concat(inputBytes, " bytes, exceeding maxInputBytes ").concat(config.maxInputBytes));
                    }
                    route = resolveRoute(config, request);
                    messages = [(0, dsh_llm_1.createUserMessage)({
                            content: [{ type: 'text', text: framedInput }],
                            source: { kind: 'plugin', plugin: 'dsh-session-title-llm' },
                        })];
                    system = systemPrompt(config);
                    callDeadline = __addDisposableResource(env_1, (0, dsh_timeout_1.deadline)(request.signal, config.timeoutMs, exports.SESSION_TITLE_TIMEOUT_CODE), false);
                    options = (0, dsh_llm_1.deepFreeze)({
                        provider: route.provider,
                        model: route.model,
                        messages: messages,
                        system: system,
                        maxTokens: config.maxOutputTokens,
                        sessionId: request.session.id,
                        purpose: 'session-title',
                        signal: callDeadline.signal,
                    });
                    request.session.append('session/title-llm-request', {
                        titleProvider: titleProvider,
                        messageSeqs: selectedMessages.map(function (message) { return message.seq; }),
                        route: route,
                        system: system,
                        messages: messages,
                        maxTokens: config.maxOutputTokens,
                    });
                    callDeadline.signal.throwIfAborted();
                    assembler = new dsh_llm_1.BlockAssembler();
                    _g.label = 2;
                case 2:
                    _g.trys.push([2, 7, 8, 13]);
                    _a = true, _b = __asyncValues(ctx.llm.stream(options));
                    _g.label = 3;
                case 3: return [4 /*yield*/, _b.next()];
                case 4:
                    if (!(_c = _g.sent(), _d = _c.done, !_d)) return [3 /*break*/, 6];
                    _f = _c.value;
                    _a = false;
                    chunk = _f;
                    callDeadline.signal.throwIfAborted();
                    assembler.push(chunk);
                    _g.label = 5;
                case 5:
                    _a = true;
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 13];
                case 7:
                    e_1_1 = _g.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 13];
                case 8:
                    _g.trys.push([8, , 11, 12]);
                    if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 10];
                    return [4 /*yield*/, _e.call(_b)];
                case 9:
                    _g.sent();
                    _g.label = 10;
                case 10: return [3 /*break*/, 12];
                case 11:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 12: return [7 /*endfinally*/];
                case 13:
                    callDeadline.signal.throwIfAborted();
                    terminalError = finishError(assembler.finish);
                    if (terminalError !== undefined)
                        throw terminalError;
                    blocks = assembler.blocks();
                    if (blocks.some(function (block) { return block.type === 'tool-call'; })) {
                        throw new Error('session-title-llm: title output must contain text only');
                    }
                    text = blocks
                        .filter(function (block) { return block.type === 'text'; })
                        .map(function (block) { return block.text; })
                        .join(' ');
                    title = (0, dsh_session_title_1.normalizeSessionTitle)(text, Number.MAX_SAFE_INTEGER);
                    if (title.length === 0)
                        throw new Error('session-title-llm: title model produced no text');
                    return [2 /*return*/, {
                            title: title,
                            messageSeqs: selectedMessages.map(function (message) { return message.seq; }),
                            model: route,
                        }];
                case 14:
                    e_2 = _g.sent();
                    env_1.error = e_2;
                    env_1.hasError = true;
                    return [3 /*break*/, 16];
                case 15:
                    __disposeResources(env_1);
                    return [7 /*endfinally*/];
                case 16: return [2 /*return*/];
            }
        });
    });
}
