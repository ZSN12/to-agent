"use strict";
/**
 * Configuration schema and provider-profile validation for the pi-ai adapter.
 * Profiles are a dict keyed by provider route, so the composition base and a
 * user-settings layer merge per provider and the route set is structural.
 *
 * A route key is not required to name an installed pi-ai provider. When it does,
 * that provider's endpoint, protocol, display name, and model catalog are the
 * profile's defaults and the profile overrides them field by field; when it does
 * not, the profile is the whole provider declaration. Resolution therefore ends
 * in a built pi-ai `Provider` per route: everything a request needs is decided
 * once, while the configuration key that made a route unserviceable can still be
 * named in the failure.
 *
 * @module dsh-llm-pi-ai/config
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
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
exports.Config = exports.DEFAULT_INPUT = exports.DEFAULT_MAX_TOKENS = exports.DEFAULT_CONTEXT_WINDOW = exports.DEFAULT_REQUEST_IMAGE_MAX_BYTES = exports.DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = exports.DEFAULT_MAX_REQUEST_IMAGE_BYTES = exports.DEFAULT_STREAM_IDLE_TIMEOUT_MS = void 0;
exports.assertServiceable = assertServiceable;
exports.resolveProfiles = resolveProfiles;
var schemastery_1 = require("@z/schemastery");
var dsh_credentials_1 = require("@z/dsh-credentials");
var dsh_timeout_1 = require("@z/dsh-timeout");
var dsh_llm_1 = require("@z/dsh-llm");
var catalog_ts_1 = require("./catalog.ts");
var provider_ts_1 = require("./provider.ts");
/** Default maximum idle interval while an adapter stream read is outstanding. */
exports.DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000;
/**
 * Default request-level bound on base64-encoded image payload. Every image in
 * history is re-encoded into every request body, so an unbounded conversation
 * eventually exceeds a provider or gateway request-size cap and the session
 * can never complete another request. The 20MiB default admits fifteen 1MiB
 * request versions after base64 expansion and reserves request capacity for
 * system prompts, history, tools, and JSON.
 * Deployments behind stricter gateways lower it per route.
 */
exports.DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
/** Default total-pixel budget preserves the complete 2048px normalized attachment. */
exports.DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
/** Default raw encoded-byte cap before inline base64 expansion. */
exports.DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;
/** Context capacity assumed for a model neither configuration nor the catalog sizes. */
exports.DEFAULT_CONTEXT_WINDOW = 262144;
/** Output capability assumed for a model neither configuration nor the catalog sizes. */
exports.DEFAULT_MAX_TOKENS = 32768;
/**
 * Modalities assumed for a model neither configuration nor the catalog
 * declares. Text is the floor every supported protocol certainly carries, so
 * this is the absence of a declaration rather than a guess at the endpoint:
 * nothing can interrogate a gateway for its modalities, and the two wrong
 * answers do not cost the same. Under-claiming refuses the image before it is
 * attached, naming the model. Over-claiming admits one the provider then
 * rejects mid-turn, after the message is durable, leaving the session
 * repeating a request that cannot succeed.
 */
exports.DEFAULT_INPUT = ['text'];
var thinkingBudgets = schemastery_1.default.object({
    minimal: schemastery_1.default.number(),
    low: schemastery_1.default.number(),
    medium: schemastery_1.default.number(),
    high: schemastery_1.default.number(),
});
/**
 * One `chat_template_kwargs` value. The `$var` member is pi-ai's placeholder
 * for a value dispatch fills from the request's thinking state, which is what
 * makes a chat-template gateway configurable without restating its template.
 */
var chatTemplateKwarg = schemastery_1.default.union([
    schemastery_1.default.string(),
    schemastery_1.default.number(),
    schemastery_1.default.boolean(),
    schemastery_1.default.const(null),
    schemastery_1.default.object({
        $var: schemastery_1.default.union(catalog_ts_1.CHAT_TEMPLATE_VARS).required(),
        omitWhenOff: schemastery_1.default.boolean(),
    }),
]);
var compatProfile = schemastery_1.default.object({
    supportsStore: schemastery_1.default.boolean(),
    supportsDeveloperRole: schemastery_1.default.boolean(),
    supportsReasoningEffort: schemastery_1.default.boolean(),
    supportsUsageInStreaming: schemastery_1.default.boolean(),
    maxTokensField: schemastery_1.default.union(catalog_ts_1.MAX_TOKENS_FIELDS),
    requiresToolResultName: schemastery_1.default.boolean(),
    requiresAssistantAfterToolResult: schemastery_1.default.boolean(),
    requiresThinkingAsText: schemastery_1.default.boolean(),
    requiresReasoningContentOnAssistantMessages: schemastery_1.default.boolean(),
    thinkingFormat: schemastery_1.default.union(catalog_ts_1.SUPPORTED_THINKING_FORMATS),
    chatTemplateKwargs: schemastery_1.default.dict(chatTemplateKwarg),
    supportsStrictMode: schemastery_1.default.boolean(),
    cacheControlFormat: schemastery_1.default.union(catalog_ts_1.CACHE_CONTROL_FORMATS),
    supportsLongCacheRetention: schemastery_1.default.boolean(),
    supportsEagerToolInputStreaming: schemastery_1.default.boolean(),
    supportsCacheControlOnTools: schemastery_1.default.boolean(),
    supportsTemperature: schemastery_1.default.boolean(),
    forceAdaptiveThinking: schemastery_1.default.boolean(),
    allowEmptySignature: schemastery_1.default.boolean(),
    supportsStrictTools: schemastery_1.default.boolean(),
});
/**
 * Keys are the offered levels, values their wire spellings. A valueless key
 * (`off:`) survives validation because schemastery passes nullable data
 * through before any member schema runs — `z.const(null)` only controls the
 * error for non-null wrong values and what a configuration UI renders.
 * Only resolution decides which levels may leave the value empty, so the
 * diagnostic can name the route and model. The assertion narrows
 * schemastery's `Dict`, which types every literal key as required; dict
 * validation checks only present keys, so the runtime value is a partial record.
 */
var reasoningEfforts = schemastery_1.default.dict(schemastery_1.default.union([schemastery_1.default.string(), schemastery_1.default.const(null)]), schemastery_1.default.union(catalog_ts_1.THINKING_LEVELS));
/** The fields a `models` entry and a `modelOverrides` value share; only the id's home differs. */
var modelFields = {
    name: schemastery_1.default.string(),
    contextWindow: schemastery_1.default.number().step(1).min(1),
    maxTokens: schemastery_1.default.number().step(1).min(1),
    // No explicit default, unlike the route's `defaultInput`: schemastery
    // materializes `[]` for an absent array, and resolution reads that as "no
    // answer here" so the catalog entry below still applies.
    input: schemastery_1.default.array(schemastery_1.default.union(catalog_ts_1.MODALITIES)),
    // The union, not a bare dict: schemastery materializes an absent dict as
    // `{}`, and absent must stay distinguishable — it means "inherit the
    // installed catalog's capability", while `false` disables reasoning.
    reasoningEfforts: schemastery_1.default.union([schemastery_1.default.const(false), reasoningEfforts]),
    compat: compatProfile,
};
var modelProfile = schemastery_1.default.object(__assign({ id: schemastery_1.default.string().required() }, modelFields));
/** A {@link modelProfile} whose id lives in the `modelOverrides` dict key. */
var modelOverride = schemastery_1.default.object(modelFields);
var profile = schemastery_1.default.object({
    apiKeyEnv: schemastery_1.default.string().role('credential-ref'),
    displayName: schemastery_1.default.string(),
    api: schemastery_1.default.union((0, provider_ts_1.supportedProtocols)()),
    baseURL: schemastery_1.default.string(),
    models: schemastery_1.default.array(modelProfile),
    modelAdditions: schemastery_1.default.array(modelProfile),
    modelOverrides: schemastery_1.default.dict(modelOverride),
    compat: compatProfile,
    defaultContextWindow: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_CONTEXT_WINDOW),
    defaultMaxTokens: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_MAX_TOKENS),
    defaultInput: schemastery_1.default.array(schemastery_1.default.union(catalog_ts_1.MODALITIES)).default(__spreadArray([], exports.DEFAULT_INPUT, true)),
    headers: schemastery_1.default.dict(schemastery_1.default.string()),
    reasoning: schemastery_1.default.union(catalog_ts_1.THINKING_LEVELS),
    thinkingBudgets: thinkingBudgets,
    cacheRetention: schemastery_1.default.union(['none', 'short', 'long']),
    transport: schemastery_1.default.union(['sse', 'websocket', 'websocket-cached', 'auto']),
    timeoutMs: schemastery_1.default.natural(),
    websocketConnectTimeoutMs: schemastery_1.default.natural(),
    streamIdleTimeoutMs: schemastery_1.default.number().min(Number.MIN_VALUE).max(dsh_timeout_1.MAX_TIMER_DELAY_MS).default(exports.DEFAULT_STREAM_IDLE_TIMEOUT_MS),
    maxRequestImageBytes: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_MAX_REQUEST_IMAGE_BYTES),
    requestImagePixelBudget: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET),
    requestImageMaxBytes: schemastery_1.default.number().step(1).min(1).default(exports.DEFAULT_REQUEST_IMAGE_MAX_BYTES),
    retryPolicy: dsh_llm_1.RetryPolicySchema,
});
/** Runtime schema for {@link Config}. */
exports.Config = schemastery_1.default.object({
    providers: schemastery_1.default.dict(profile).default({}),
});
/**
 * Reject a section this adapter could not serve. Registered as the settings
 * namespace's validator, so an unserviceable profile is refused where it is
 * *written* — `settings.mutate` answers `settings-rejected` with the offending
 * route and model named — instead of being stored and then quietly disabling
 * every route in the namespace. It stays a validator rather than a schema
 * transform because the schema is also the shape a configuration surface
 * renders and the value an absent section resolves to; wrapping it would break
 * both.
 * @param config - the resolved section to check.
 * @throws Error naming the route and model that cannot be served.
 */
function assertServiceable(config) {
    resolveProfiles(config.providers);
}
/** Reject removed pre-release profile fields and name their replacements. */
function rejectRemovedFields(provider, source) {
    var legacy = source;
    if ('provider' in legacy) {
        throw new Error("llm-pi-ai: provider \"".concat(provider, "\" sets \"provider\", which moved to the providers dict key"));
    }
    if ('maxRetries' in legacy || 'maxRetryDelayMs' in legacy) {
        throw new Error("llm-pi-ai: provider \"".concat(provider, "\" sets maxRetries or maxRetryDelayMs, which were removed;")
            + ' compose agent recovery with dsh-llm-retry');
    }
}
/**
 * Validate profiles and return a detached route-keyed map suitable for
 * per-request reads. This is the one explicit resolve step, so an omitted dict
 * resolves to the empty (dormant) route set here rather than through a hidden
 * fallback, and each route's models and pi-ai provider are materialized once.
 * @param providers - configured provider profiles keyed by route.
 * @returns validated profiles in configuration order.
 */
function resolveProfiles(providers) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (Array.isArray(providers)) {
        throw new Error('llm-pi-ai: providers is now a dict keyed by provider route, not an array of profiles');
    }
    var entries = Object.entries(providers !== null && providers !== void 0 ? providers : {});
    var resolved = new Map();
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var _j = entries_1[_i], provider = _j[0], source = _j[1];
        rejectRemovedFields(provider, source);
        if (provider.length === 0)
            throw new Error('llm-pi-ai: provider names must be non-empty');
        if (source.baseURL !== undefined && source.baseURL.length === 0) {
            throw new Error("llm-pi-ai: provider \"".concat(provider, "\" has an empty baseURL"));
        }
        if (source.displayName !== undefined && source.displayName.length === 0) {
            throw new Error("llm-pi-ai: provider \"".concat(provider, "\" has an empty displayName"));
        }
        var streamIdleTimeoutMs = (_a = source.streamIdleTimeoutMs) !== null && _a !== void 0 ? _a : exports.DEFAULT_STREAM_IDLE_TIMEOUT_MS;
        if (!Number.isFinite(streamIdleTimeoutMs)
            || streamIdleTimeoutMs <= 0
            || streamIdleTimeoutMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
            throw new Error("llm-pi-ai: provider \"".concat(provider, "\" streamIdleTimeoutMs must be a positive finite number no greater than ").concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
        }
        var maxRequestImageBytes = (_b = source.maxRequestImageBytes) !== null && _b !== void 0 ? _b : exports.DEFAULT_MAX_REQUEST_IMAGE_BYTES;
        if (!Number.isInteger(maxRequestImageBytes) || maxRequestImageBytes <= 0) {
            throw new Error("llm-pi-ai: provider \"".concat(provider, "\" maxRequestImageBytes must be a positive integer"));
        }
        var requestImagePixelBudget = (_c = source.requestImagePixelBudget) !== null && _c !== void 0 ? _c : exports.DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET;
        if (!Number.isSafeInteger(requestImagePixelBudget) || requestImagePixelBudget <= 0) {
            throw new Error("llm-pi-ai: provider \"".concat(provider, "\" requestImagePixelBudget must be a positive safe integer"));
        }
        var requestImageMaxBytes = (_d = source.requestImageMaxBytes) !== null && _d !== void 0 ? _d : exports.DEFAULT_REQUEST_IMAGE_MAX_BYTES;
        if (!Number.isSafeInteger(requestImageMaxBytes) || requestImageMaxBytes <= 0) {
            throw new Error("llm-pi-ai: provider \"".concat(provider, "\" requestImageMaxBytes must be a positive safe integer"));
        }
        // Detached from the configuration object because pi-ai types `Model.input`
        // mutable. The schema's explicit default covers an absent key, so an empty
        // list here is always one someone typed — and unlike an entry's, nothing
        // below it can answer instead — so it is refused rather than read as "no
        // answer".
        var defaultInput = __spreadArray([], (_e = source.defaultInput) !== null && _e !== void 0 ? _e : exports.DEFAULT_INPUT, true);
        if (defaultInput.length === 0) {
            throw new Error("llm-pi-ai: provider \"".concat(provider, "\" defaultInput must name at least one modality"));
        }
        // The route key, not the installed provider's own name: the directory has
        // always shown route keys, and a catalog route must not silently rename
        // itself on every configuration surface just because it gained a profile.
        var displayName = (_f = source.displayName) !== null && _f !== void 0 ? _f : provider;
        var catalog = (0, catalog_ts_1.resolveRouteModels)(__assign(__assign(__assign(__assign(__assign(__assign(__assign({ provider: provider }, source.api === undefined ? {} : { api: source.api }), source.baseURL === undefined ? {} : { baseURL: source.baseURL }), source.models === undefined ? {} : { models: source.models }), source.modelAdditions === undefined ? {} : { modelAdditions: source.modelAdditions }), source.modelOverrides === undefined ? {} : { modelOverrides: source.modelOverrides }), source.compat === undefined ? {} : { compat: source.compat }), { defaultInput: defaultInput, defaultContextWindow: (_g = source.defaultContextWindow) !== null && _g !== void 0 ? _g : exports.DEFAULT_CONTEXT_WINDOW, defaultMaxTokens: (_h = source.defaultMaxTokens) !== null && _h !== void 0 ? _h : exports.DEFAULT_MAX_TOKENS }));
        var apiKeyEnv = source.apiKeyEnv, retryPolicy = source.retryPolicy, _models = source.models, _modelAdditions = source.modelAdditions, _displayName = source.displayName, rest = __rest(source, ["apiKeyEnv", "retryPolicy", "models", "modelAdditions", "displayName"]);
        resolved.set(provider, __assign(__assign(__assign(__assign(__assign(__assign(__assign({}, rest), { provider: provider, displayName: displayName }), apiKeyEnv === undefined ? {} : { apiKeyEnv: (0, dsh_credentials_1.credentialRef)(apiKeyEnv) }), { streamIdleTimeoutMs: streamIdleTimeoutMs, maxRequestImageBytes: maxRequestImageBytes, requestImagePixelBudget: requestImagePixelBudget, requestImageMaxBytes: requestImageMaxBytes, retryPolicy: (0, dsh_llm_1.resolveRetryPolicy)(retryPolicy, "llm-pi-ai: provider \"".concat(provider, "\" retryPolicy")) }), rest.headers === undefined ? {} : { headers: __assign({}, rest.headers) }), rest.thinkingBudgets === undefined ? {} : { thinkingBudgets: __assign({}, rest.thinkingBudgets) }), { configuredMaxTokens: catalog.configuredMaxTokens, piProvider: (0, provider_ts_1.buildProvider)(__assign(__assign(__assign({ provider: provider, displayName: displayName }, source.api === undefined ? {} : { api: source.api }), source.baseURL === undefined ? {} : { baseURL: source.baseURL }), { models: catalog.models, namesCredential: apiKeyEnv !== undefined })) }));
    }
    return resolved;
}
