"use strict";
/**
 * Generic pi-ai-backed implementation of the Harness LLM seam.
 *
 * Each resolution produces one **immutable** snapshot — the profiles plus a
 * `Models` collection holding the `Provider` each route built — and an
 * operation captures a whole snapshot before its first `await`. A
 * configuration change builds a *new* collection rather than mutating the one
 * in use, because `Models.streamSimple()` is lazy: it resolves the provider
 * when the stream is first consumed, which is after the credential await, so a
 * mutated collection would let a request that started under one configuration
 * finish under another — or fail with a provider that no longer exists. This is
 * what makes the seam's per-step call freeze (`llm.prepareCall()`) hold all the
 * way down: switching models mid-reply takes effect on the next step, never
 * inside the one in flight.
 *
 * A route naming a credential reference still resolves it through the harness
 * seam and passes it as the request's `apiKey` option, which pi-ai treats as
 * the highest-priority auth override — that is what keeps the fail-loud
 * reference semantics. Everything that override does not cover reaches pi-ai
 * through the collection's own auth: the credential store holds the records a
 * login wrote and a refresh rotates, and the auth context answers the ambient
 * questions a provider asks while resolving. Both are stable across snapshots,
 * so a configuration change rebuilds the collection without forgetting who is
 * signed in.
 *
 * @module dsh-llm-pi-ai/adapter
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
exports.PiAiAdapter = void 0;
var pi_ai_1 = require("@earendil-works/pi-ai");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_timeout_1 = require("@z/dsh-timeout");
var context_ts_1 = require("./context.ts");
var stream_ts_1 = require("./stream.ts");
/** Copy profile stream knobs into pi-ai's common option vocabulary. */
function profileOptions(profile, reasoning, apiKey) {
    var enabledReasoning = reasoning === 'off' ? undefined : reasoning;
    return __assign(__assign(__assign(__assign(__assign(__assign(__assign(__assign({}, apiKey === undefined ? {} : { apiKey: apiKey }), enabledReasoning === undefined ? {} : { reasoning: enabledReasoning }), profile.thinkingBudgets === undefined ? {} : { thinkingBudgets: profile.thinkingBudgets }), profile.cacheRetention === undefined ? {} : { cacheRetention: profile.cacheRetention }), profile.transport === undefined ? {} : { transport: profile.transport }), profile.timeoutMs === undefined ? {} : { timeoutMs: profile.timeoutMs }), profile.websocketConnectTimeoutMs === undefined ? {} : { websocketConnectTimeoutMs: profile.websocketConnectTimeoutMs }), { 
        // The agent recovery layer owns visible attempts; one adapter call is one SDK attempt.
        maxRetries: 0 });
}
/**
 * The profile default this exact model can actually take, for DESCRIBING it.
 * A configured level the model does not support yields none rather than
 * throwing: `resolveModel` builds the model catalog, and a catalog that fails
 * takes its whole provider out of every picker — so one mis-set profile field
 * would hide every model on the route, including the ones that support the
 * level. The request path still refuses, which is where a bad configuration
 * belongs: describing what a model can do must not fail because a deployment
 * asked it for something it cannot.
 * @param model - the resolved model descriptor.
 * @param effort - the profile's configured level, if any.
 * @returns the level when this model supports it, otherwise undefined.
 */
function describableReasoningLevel(model, effort) {
    if (effort === undefined)
        return undefined;
    return (0, pi_ai_1.getSupportedThinkingLevels)(model).some(function (level) { return level === effort; })
        ? effort
        : undefined;
}
/** Validate an explicit Harness/profile effort without invoking pi-ai's clamp. */
function resolveReasoningLevel(model, effort) {
    if (effort === undefined)
        return undefined;
    var supported = (0, pi_ai_1.getSupportedThinkingLevels)(model);
    if (supported.some(function (level) { return level === effort; }))
        return effort;
    throw new dsh_llm_1.LlmError("pi-ai provider \"".concat(model.provider, "\" model \"").concat(model.id, "\" does not support reasoning effort \"").concat(effort, "\""), 'UNSUPPORTED_REASONING_EFFORT');
}
/**
 * Selectable reasoning efforts for one model, or nothing at all.
 *
 * A model that carries no reasoning metadata — every hand-declared one, and
 * every catalog model pi-ai marks as non-reasoning — is reported by pi-ai as
 * supporting the single level `off`. Passing that through would offer a control
 * that cannot do what it says: `off` is translated to *omitting* the reasoning
 * option, which for such a model is byte-for-byte the same request as naming no
 * effort — so a provider whose own default is to think would keep thinking with
 * `off` selected. Omitting `reasoning` entirely is the seam's way of saying the
 * capability is unavailable, which leaves the surface offering only the
 * provider's default.
 * @param model - the resolved model descriptor.
 * @param defaultLevel - the profile's configured effort, already validated.
 * @returns the `reasoning` field, or an empty object when none can be offered.
 */
function reasoningInfo(model, defaultLevel) {
    if (!model.reasoning)
        return {};
    var levels = (0, pi_ai_1.getSupportedThinkingLevels)(model);
    return {
        reasoning: __assign({ efforts: levels.map(function (level) { return ({
                id: (0, dsh_llm_1.ReasoningEffortId)(level),
                name: "".concat(level.charAt(0).toUpperCase()).concat(level.slice(1)),
            }); }) }, defaultLevel === undefined ? {} : { defaultEffort: (0, dsh_llm_1.ReasoningEffortId)(defaultLevel) }),
    };
}
/** Merge deployment headers while removing case-insensitive attribution collisions. */
function requestHeaders(headers) {
    var attribution = (0, dsh_llm_1.attributionHeaders)();
    var reserved = new Set(Object.keys(attribution).map(function (name) { return name.toLowerCase(); }));
    return __assign(__assign({}, Object.fromEntries(Object.entries(headers !== null && headers !== void 0 ? headers : {}).filter(function (_a) {
        var name = _a[0];
        return !reserved.has(name.toLowerCase());
    }))), attribution);
}
/**
 * pi-ai-backed multi-provider adapter. Each operation reads the current
 * profiles, so a configuration change reaches the next request without a
 * restart; model descriptors come from the collection those profiles built.
 */
var PiAiAdapter = /** @class */ (function (_super) {
    __extends(PiAiAdapter, _super);
    function PiAiAdapter(config) {
        var _this = _super.call(this) || this;
        _this.config = config;
        return _this;
    }
    /**
     * The snapshot for the current profiles. Resolution memoizes its result, so
     * an unchanged configuration is recognized by identity; a changed one gets a
     * brand-new collection, leaving any snapshot an operation already captured
     * untouched for as long as that operation holds it.
     */
    PiAiAdapter.prototype.current = function () {
        var _a;
        var profiles = this.config.profiles();
        if (((_a = this.snapshot) === null || _a === void 0 ? void 0 : _a.profiles) === profiles)
            return this.snapshot;
        var models = (0, pi_ai_1.createModels)(this.config.auth);
        for (var _i = 0, _b = profiles.values(); _i < _b.length; _i++) {
            var profile = _b[_i];
            models.setProvider(profile.piProvider);
        }
        this.snapshot = { profiles: profiles, models: models };
        return this.snapshot;
    };
    /** The profile for one route within one snapshot, or the not-owned failure. */
    PiAiAdapter.prototype.profileOf = function (snapshot, provider) {
        var profile = snapshot.profiles.get(provider);
        if (profile === undefined) {
            throw new dsh_llm_1.LlmError("pi-ai adapter does not own provider \"".concat(provider, "\""), 'NO_ADAPTER');
        }
        return profile;
    };
    /** The configured descriptor for one exact route/model pair within one snapshot. */
    PiAiAdapter.prototype.modelOf = function (snapshot, provider, model) {
        this.profileOf(snapshot, provider);
        var resolved = snapshot.models.getModel(provider, model);
        if (resolved === undefined) {
            throw new dsh_llm_1.LlmError("pi-ai provider \"".concat(provider, "\" has no configured model \"").concat(model, "\""), 'UNKNOWN_MODEL');
        }
        return resolved;
    };
    PiAiAdapter.prototype.providerInfo = function (provider) {
        var _a, _b;
        // The configured name, not the route key: `displayName` exists so a
        // deployment can label a route, and a label only the configuration surface
        // reads would leave every selector showing the raw key.
        return { id: provider, name: (_b = (_a = this.current().profiles.get(provider)) === null || _a === void 0 ? void 0 : _a.displayName) !== null && _b !== void 0 ? _b : provider };
    };
    PiAiAdapter.prototype.providerRetryPolicy = function (provider) {
        var _a;
        return (_a = this.current().profiles.get(provider)) === null || _a === void 0 ? void 0 : _a.retryPolicy;
    };
    PiAiAdapter.prototype.listModels = function (provider) {
        var _this = this;
        return Promise.resolve().then(function () {
            var snapshot = _this.current();
            _this.profileOf(snapshot, provider);
            return snapshot.models.getModels(provider).map(function (model) { return ({
                provider: provider,
                id: model.id,
                name: model.name,
                inputModalities: __spreadArray([], model.input, true),
            }); });
        });
    };
    PiAiAdapter.prototype.resolveModel = function (provider, model, _signal) {
        var _this = this;
        return Promise.resolve().then(function () {
            var snapshot = _this.current();
            return _this.modelInfo(snapshot, provider, model);
        });
    };
    PiAiAdapter.prototype.modelInfo = function (snapshot, provider, model) {
        var profile = this.profileOf(snapshot, provider);
        var resolvedModel = this.modelOf(snapshot, provider, model);
        var defaultLevel = describableReasoningLevel(resolvedModel, profile.reasoning);
        // Only a cap the deployment configured is a request default; the
        // catalog's `maxTokens` sizes the model and stops there.
        var configuredMaxTokens = profile.configuredMaxTokens.get(model);
        return __assign(__assign({ provider: provider, id: model, name: resolvedModel.name, inputModalities: __spreadArray([], resolvedModel.input, true), context: { contextWindow: resolvedModel.contextWindow } }, configuredMaxTokens === undefined ? {} : { defaultMaxTokens: configuredMaxTokens }), reasoningInfo(resolvedModel, defaultLevel));
    };
    PiAiAdapter.prototype.prepareCall = function (provider, model, _signal) {
        var _this = this;
        var snapshot = this.current();
        return Promise.resolve({
            model: this.modelInfo(snapshot, provider, model),
            stream: function (options) { return _this.streamWithSnapshot(options, snapshot); },
        });
    };
    PiAiAdapter.prototype.stream = function (options) {
        return this.streamWithSnapshot(options, this.current());
    };
    PiAiAdapter.prototype.streamWithSnapshot = function (options, snapshot) {
        return __asyncGenerator(this, arguments, function streamWithSnapshot_1() {
            var env_1, profile, model, reasoning, apiKey, consumer, upstream, streamIdleTimeoutMs, watchdog, containsImage, attachments, onReplayDegrade, context, _a, events, iterator, exhausted, result, timeout, _abortedSdkTeardown_1, error_1, e_1;
            var _this = this;
            var _b, _c, _d, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        env_1 = { stack: [], error: void 0, hasError: false };
                        _g.label = 1;
                    case 1:
                        _g.trys.push([1, 30, 31, 32]);
                        if (options.stop !== undefined) {
                            throw new dsh_llm_1.LlmError('llm-pi-ai does not support GenerateOptions.stop', 'UNSUPPORTED_OPTION');
                        }
                        profile = this.profileOf(snapshot, options.provider);
                        model = this.modelOf(snapshot, options.provider, options.model);
                        reasoning = resolveReasoningLevel(model, (_b = options.reasoningEffort) !== null && _b !== void 0 ? _b : profile.reasoning);
                        return [4 /*yield*/, __await(this.config.resolveApiKey(options.provider, profile))];
                    case 2:
                        apiKey = _g.sent();
                        consumer = new AbortController();
                        upstream = options.signal === undefined
                            ? consumer.signal
                            : AbortSignal.any([options.signal, consumer.signal]);
                        streamIdleTimeoutMs = profile.streamIdleTimeoutMs;
                        watchdog = __addDisposableResource(env_1, (0, dsh_timeout_1.idleWatchdog)(upstream, streamIdleTimeoutMs, 'LLM_STREAM_IDLE_TIMEOUT'), false);
                        _g.label = 3;
                    case 3:
                        _g.trys.push([3, 27, 28, 29]);
                        if (!((_c = options.signal) === null || _c === void 0 ? void 0 : _c.aborted)) return [3 /*break*/, 9];
                        return [4 /*yield*/, __await({ type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } })];
                    case 4: return [4 /*yield*/, _g.sent()];
                    case 5:
                        _g.sent();
                        return [4 /*yield*/, __await({
                                type: 'finish',
                                reason: {
                                    kind: 'aborted',
                                    failure: { message: 'pi-ai request aborted by caller', code: 'ABORTED' },
                                },
                            })];
                    case 6: return [4 /*yield*/, _g.sent()];
                    case 7:
                        _g.sent();
                        return [4 /*yield*/, __await(void 0)];
                    case 8: return [2 /*return*/, _g.sent()];
                    case 9:
                        containsImage = options.messages.some(function (message) { return (0, dsh_llm_1.contentHasImage)(message.content); });
                        if (containsImage && !model.input.includes('image')) {
                            throw new dsh_llm_1.LlmError("pi-ai model \"".concat(model.id, "\" does not support image input"), 'UNSUPPORTED_CONTENT');
                        }
                        attachments = containsImage ? (_e = (_d = this.config).resolveAttachments) === null || _e === void 0 ? void 0 : _e.call(_d) : undefined;
                        if (containsImage && attachments === undefined) {
                            throw new dsh_llm_1.LlmError('pi-ai image input requires the durable attachment service', 'UNSUPPORTED_CONTENT');
                        }
                        onReplayDegrade = function (reason) {
                            var _a, _b;
                            (_b = (_a = _this.config).onReplayDegrade) === null || _b === void 0 ? void 0 : _b.call(_a, { provider: options.provider, model: options.model, reason: reason });
                        };
                        if (!(attachments === undefined)) return [3 /*break*/, 10];
                        _a = (0, context_ts_1.toPiContext)(options, undefined, onReplayDegrade);
                        return [3 /*break*/, 12];
                    case 10: return [4 /*yield*/, __await((0, context_ts_1.toPiContext)(__assign(__assign({}, options), { signal: watchdog.signal }), attachments, onReplayDegrade, profile.maxRequestImageBytes, {
                            maxPixels: profile.requestImagePixelBudget,
                            maxBytes: profile.requestImageMaxBytes,
                        }))];
                    case 11:
                        _a = _g.sent();
                        _g.label = 12;
                    case 12:
                        context = _a;
                        events = snapshot.models.streamSimple(model, context, __assign(__assign(__assign(__assign(__assign({}, profileOptions(profile, reasoning, apiKey)), options.temperature === undefined ? {} : { temperature: options.temperature }), options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }), options.sessionId === undefined ? {} : { sessionId: String(options.sessionId) }), { signal: watchdog.signal, 
                            // Profile headers are deployment-owned; attribution names are
                            // Harness-owned and therefore win collisions.
                            headers: requestHeaders(profile.headers) }));
                        iterator = (0, stream_ts_1.toStreamChunks)(events, model.contextWindow)[Symbol.asyncIterator]();
                        exhausted = false;
                        _g.label = 13;
                    case 13:
                        _g.trys.push([13, , 21, 26]);
                        _g.label = 14;
                    case 14:
                        if (!true) return [3 /*break*/, 20];
                        return [4 /*yield*/, __await(watchdog.next(iterator))];
                    case 15:
                        result = _g.sent();
                        timeout = (0, dsh_timeout_1.timeoutOf)(watchdog.signal, 'LLM_STREAM_IDLE_TIMEOUT');
                        if (timeout !== undefined)
                            throw timeout;
                        if (!result.done) return [3 /*break*/, 17];
                        exhausted = true;
                        return [4 /*yield*/, __await(void 0)];
                    case 16: return [2 /*return*/, _g.sent()];
                    case 17: return [4 /*yield*/, __await(result.value)];
                    case 18: return [4 /*yield*/, _g.sent()];
                    case 19:
                        _g.sent();
                        return [3 /*break*/, 14];
                    case 20: return [3 /*break*/, 26];
                    case 21:
                        if (!!exhausted) return [3 /*break*/, 25];
                        consumer.abort('pi-ai stream consumer stopped');
                        _g.label = 22;
                    case 22:
                        _g.trys.push([22, 24, , 25]);
                        return [4 /*yield*/, __await(iterator.return(undefined))];
                    case 23:
                        _g.sent();
                        return [3 /*break*/, 25];
                    case 24:
                        _abortedSdkTeardown_1 = _g.sent();
                        return [3 /*break*/, 25];
                    case 25: return [7 /*endfinally*/];
                    case 26: return [3 /*break*/, 29];
                    case 27:
                        error_1 = _g.sent();
                        if ((0, dsh_timeout_1.timeoutOf)(watchdog.signal, 'LLM_STREAM_IDLE_TIMEOUT') !== undefined) {
                            throw new dsh_llm_1.LlmError("pi-ai stream idle timeout after ".concat(streamIdleTimeoutMs, "ms"), 'TIMEOUT', { cause: error_1 });
                        }
                        if ((_f = options.signal) === null || _f === void 0 ? void 0 : _f.aborted) {
                            throw new dsh_llm_1.LlmError('pi-ai request aborted by caller', 'ABORTED', { cause: error_1 });
                        }
                        throw error_1;
                    case 28:
                        consumer.abort('pi-ai stream consumer stopped');
                        return [7 /*endfinally*/];
                    case 29: return [3 /*break*/, 32];
                    case 30:
                        e_1 = _g.sent();
                        env_1.error = e_1;
                        env_1.hasError = true;
                        return [3 /*break*/, 32];
                    case 31:
                        __disposeResources(env_1);
                        return [7 /*endfinally*/];
                    case 32: return [2 /*return*/];
                }
            });
        });
    };
    return PiAiAdapter;
}(dsh_llm_1.LlmAdapter));
exports.PiAiAdapter = PiAiAdapter;
