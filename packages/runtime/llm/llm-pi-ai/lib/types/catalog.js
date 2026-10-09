"use strict";
/**
 * Materialization of one provider route's model catalog. The installed pi-ai
 * catalog supplies defaults keyed by model id, and a profile's own model
 * entries override them field by field, so a route naming a catalog provider
 * stays configuration-free while a route pi-ai has never heard of is fully
 * describable from `settings.yaml`.
 *
 * Every pi-ai `Model` field the harness cannot default is required here rather
 * than at request time: an unserviceable route fails while its configuration is
 * being resolved, which is the earliest point that can name the offending key.
 *
 * @module dsh-llm-pi-ai/catalog
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
exports.CHAT_TEMPLATE_VARS = exports.CACHE_CONTROL_FORMATS = exports.MAX_TOKENS_FIELDS = exports.SUPPORTED_THINKING_FORMATS = exports.THINKING_LEVELS = exports.MODALITIES = void 0;
exports.catalogProvider = catalogProvider;
exports.catalogProviderIds = catalogProviderIds;
exports.catalogModels = catalogModels;
exports.resolveRouteModels = resolveRouteModels;
var all_1 = require("@earendil-works/pi-ai/providers/all");
/**
 * Pricing for a model the installed catalog does not describe. The harness
 * never reads pi-ai's cost metadata — `replay.ts` zeroes it and no consumer
 * reports spend — so this is the absence of a fact, not a configurable rate.
 */
var NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
/**
 * Every pi-ai request modality. The `Record` key type is a drift gate: a pi-ai
 * upgrade that adds or removes a modality fails compilation here naming the
 * drifted key, instead of silently narrowing what a profile may declare.
 */
var MODALITY_GATE = {
    text: true,
    image: true,
};
/** Every request modality a profile may declare. */
exports.MODALITIES = Object.keys(MODALITY_GATE);
/**
 * One entry's modality list, or `undefined` when it states no answer. Absent
 * and empty mean the same thing — `[]` describes a model that accepts nothing
 * and could serve no request — which is what makes an entry naming a catalog
 * model without declaring modalities keep the catalog's, since the config
 * schema materializes `[]` for an absent array.
 * @param configured - the list a `models` or `modelOverrides` entry supplied.
 * @returns the declared modalities, or `undefined` to ask the next level.
 */
function declaredInput(configured) {
    return configured === undefined || configured.length === 0 ? undefined : __spreadArray([], configured, true);
}
/**
 * Every pi-ai thinking level, in pi-ai's canonical escalation order. The
 * `Record` key type is a drift gate: a pi-ai upgrade that adds or removes a
 * level fails compilation here naming the drifted key, instead of silently
 * narrowing what a profile may declare.
 */
var THINKING_LEVEL_GATE = {
    off: true,
    minimal: true,
    low: true,
    medium: true,
    high: true,
    xhigh: true,
    max: true,
};
/** Every pi-ai thinking level a profile may declare, in escalation order. */
exports.THINKING_LEVELS = Object.keys(THINKING_LEVEL_GATE);
/**
 * The nameable reasoning-dispatch formats, most-reached first. The `Record`
 * key type is a drift gate: a pi-ai upgrade that adds a format (0.84 added
 * `baseten`) fails compilation here until the new format is named, so the
 * offer never silently lags the upstream set. The two `chat-template` variants
 * are nameable because {@link PiAiCompatProfile.chatTemplateKwargs} carries
 * the kwargs they dispatch through.
 */
var THINKING_FORMAT_GATE = {
    'openai': true,
    'deepseek': true,
    'openrouter': true,
    'together': true,
    'zai': true,
    'qwen': true,
    'chat-template': true,
    'qwen-chat-template': true,
    'string-thinking': true,
    'ant-ling': true,
    'baseten': true,
};
/** Reasoning-dispatch wire formats a profile may name, most-reached first. */
exports.SUPPORTED_THINKING_FORMATS = Object.keys(THINKING_FORMAT_GATE);
/** Drift gate over {@link PiAiMaxTokensField}; an upstream spelling added here fails compilation until named. */
var MAX_TOKENS_FIELD_GATE = {
    max_completion_tokens: true,
    max_tokens: true,
};
/** The output-cap field spellings a profile may name. */
exports.MAX_TOKENS_FIELDS = Object.keys(MAX_TOKENS_FIELD_GATE);
/** Drift gate over {@link PiAiCacheControlFormat}; a new upstream convention fails compilation until named. */
var CACHE_CONTROL_FORMAT_GATE = {
    anthropic: true,
};
/** The prompt-cache marker conventions a profile may name. */
exports.CACHE_CONTROL_FORMATS = Object.keys(CACHE_CONTROL_FORMAT_GATE);
/** Drift gate over {@link PiAiChatTemplateVar}; a new upstream placeholder fails compilation until named. */
var CHAT_TEMPLATE_VAR_GATE = {
    'thinking.enabled': true,
    'thinking.effort': true,
    'thinking.budget': true,
};
/** The request-state placeholders a profile may name. */
exports.CHAT_TEMPLATE_VARS = Object.keys(CHAT_TEMPLATE_VAR_GATE);
var providerIndex;
/**
 * Installed catalog providers by id, constructed once. Each entry owns the API
 * implementations for its own models, which is why a catalog route reuses this
 * provider instead of being rebuilt from parts.
 * @returns the catalog provider index.
 */
function catalogProviders() {
    providerIndex !== null && providerIndex !== void 0 ? providerIndex : (providerIndex = new Map((0, all_1.builtinProviders)().map(function (provider) { return [provider.id, provider]; })));
    return providerIndex;
}
/**
 * The installed catalog provider for one route, when pi-ai ships one.
 * @param provider - provider route key.
 * @returns the catalog provider, or `undefined` for a route pi-ai does not ship.
 */
function catalogProvider(provider) {
    return catalogProviders().get(provider);
}
/**
 * Every provider route the installed pi-ai catalog ships.
 * @returns the catalog provider ids.
 */
function catalogProviderIds() {
    return (0, all_1.getBuiltinProviders)();
}
/**
 * The installed catalog models for one route, indexed by model id.
 * @param provider - provider route key.
 * @returns catalog models by id; empty for a route pi-ai does not ship.
 */
function catalogModels(provider) {
    if (!catalogProviders().has(provider))
        return new Map();
    var models = (0, all_1.getBuiltinModels)(provider);
    return new Map(models.map(function (model) { return [model.id, model]; }));
}
/**
 * Disposition of every `OpenAICompletionsCompat` field. The `Record` key type
 * is a drift gate: a pi-ai upgrade that adds a field fails compilation here
 * until it is classified, so the offer never silently lags the upstream set.
 */
var COMPLETIONS_COMPAT_GATE = {
    supportsStore: 'offer',
    supportsDeveloperRole: 'offer',
    supportsReasoningEffort: 'offer',
    supportsUsageInStreaming: 'offer',
    supportsFinishReason: 'withhold',
    maxTokensField: 'offer',
    requiresToolResultName: 'offer',
    requiresAssistantAfterToolResult: 'offer',
    requiresThinkingAsText: 'offer',
    requiresReasoningContentOnAssistantMessages: 'offer',
    thinkingFormat: 'offer',
    chatTemplateKwargs: 'offer',
    chatTemplateArgs: 'withhold',
    supportsStrictMode: 'offer',
    cacheControlFormat: 'offer',
    supportsLongCacheRetention: 'offer',
    openRouterRouting: 'withhold',
    vercelGatewayRouting: 'withhold',
    zaiToolStream: 'withhold',
    thinkingTokenBudgetField: 'withhold',
    supportsThinkingTokenBudget: 'withhold',
    supportsOpenAIGrammarTools: 'withhold',
    supportsMidConvoSystemMessages: 'withhold',
    supportsMidConvoToolAdditions: 'withhold',
    sendSessionAffinityHeaders: 'withhold',
    sessionAffinityFormat: 'withhold',
    vllmPriority: 'withhold',
};
/** Disposition of every `OpenAIResponsesCompat` field; a drift gate like the one above. */
var RESPONSES_COMPAT_GATE = {
    supportsDeveloperRole: 'offer',
    supportsMidConvoSystemMessages: 'withhold',
    supportsStrictMode: 'offer',
    supportsLongCacheRetention: 'offer',
    sessionAffinityFormat: 'withhold',
    supportsOpenAIGrammarTools: 'withhold',
    supportsAdditionalTools: 'withhold',
    supportsToolSearch: 'withhold',
    supportsExplicitPromptCacheMode: 'withhold',
    supportsMaxOutputTokens: 'withhold',
};
/** Disposition of every `AnthropicMessagesCompat` field; a drift gate like the one above. */
var ANTHROPIC_COMPAT_GATE = {
    supportsEagerToolInputStreaming: 'offer',
    supportsLongCacheRetention: 'offer',
    supportsCacheControlOnTools: 'offer',
    supportsTemperature: 'offer',
    forceAdaptiveThinking: 'offer',
    allowEmptySignature: 'offer',
    supportsStrictTools: 'offer',
    sendSessionAffinityHeaders: 'withhold',
    sessionAffinityFormat: 'withhold',
    supportsMidConvoEffort: 'withhold',
    supportsMidConvoSystemMessages: 'withhold',
    supportsMidConvoToolChanges: 'withhold',
    allowedFallbackModels: 'withhold',
};
/** Disposition of every `BedrockCompat` field; a drift gate like the one above. */
var BEDROCK_COMPAT_GATE = {
    supportsStrictMode: 'offer',
};
var MISTRAL_COMPAT_GATE = {
    supportsMidConvoSystemMessages: 'withhold',
};
/**
 * The compat gate of every wire protocol a profile may configure.
 *
 * Keyed by protocol, but grouped by pi-ai's compat *type*: the three Responses
 * protocols share `OpenAIResponsesCompat`, so a switch settable on one is
 * settable on all three. Keying by protocol alone would refuse
 * `azure-openai-responses` and `openai-codex-responses` the fields their own
 * models declare.
 */
var COMPAT_GATES = {
    'openai-completions': COMPLETIONS_COMPAT_GATE,
    'openai-responses': RESPONSES_COMPAT_GATE,
    'azure-openai-responses': RESPONSES_COMPAT_GATE,
    'openai-codex-responses': RESPONSES_COMPAT_GATE,
    'anthropic-messages': ANTHROPIC_COMPAT_GATE,
    'bedrock-converse-stream': BEDROCK_COMPAT_GATE,
    'mistral-conversations': MISTRAL_COMPAT_GATE,
};
/**
 * The compat gate of one resolved protocol. A `string` lookup rather than a
 * keyed read: a route's `api` is configuration, so it may name a protocol
 * pi-ai gives no compat type — or none at all.
 * @param api - resolved wire protocol.
 * @returns that protocol's field gate, or `undefined` when it takes no compat.
 */
function compatGate(api) {
    return COMPAT_GATES[api];
}
/**
 * The compat entries a profile actually set.
 *
 * schemastery materializes an absent dict as `{}` — the behavior
 * `reasoningEfforts` works around with a union — so every parsed profile
 * carries a `chatTemplateKwargs` key whether or not anyone wrote one. An empty
 * one states nothing here: it would send no kwargs, which is exactly what
 * leaving the field out does, so absent and empty are the same request and
 * neither may make a route look like it configured a switch. A valueless
 * scalar is the other thing schemastery lets through, and it is refused by
 * {@link assertOfferedCompatFields} before this runs rather than filtered.
 * @param compat - the configured switches, when any.
 * @returns the entries carrying a value, in declaration order.
 */
function configuredCompatEntries(compat) {
    return Object.entries(compat !== null && compat !== void 0 ? compat : {}).flatMap(function (_a) {
        var field = _a[0], value = _a[1];
        var empty = typeof value === 'object' && value !== null && !Array.isArray(value)
            && Object.keys(value).length === 0;
        return empty ? [] : [[field, value]];
    });
}
/**
 * The protocols offering one compat field, in {@link COMPAT_GATES} order.
 * @param field - configured compat field name.
 * @returns the protocols whose compat takes it; empty when none does, which
 *   is either a withheld field or a name no upstream compat type declares.
 */
function compatProtocols(field) {
    return Object.entries(COMPAT_GATES).flatMap(function (_a) {
        var api = _a[0], gate = _a[1];
        return gate[field] === 'offer' ? [api] : [];
    });
}
/**
 * The compat fields one protocol offers, for a diagnostic that has to show
 * what was available instead of the name that missed.
 * @param api - wire protocol.
 * @returns the offered field names, or an empty list for a protocol taking no compat.
 */
function offeredCompatFields(api) {
    var _a;
    return Object.entries((_a = compatGate(api)) !== null && _a !== void 0 ? _a : {}).flatMap(function (_a) {
        var field = _a[0], disposition = _a[1];
        return disposition === 'offer' ? [field] : [];
    });
}
/**
 * Every offered field name, deduplicated, for the one diagnostic that cannot
 * narrow by protocol: the vocabulary check runs before any protocol resolves,
 * which is what lets it refuse a misspelling on a route whose models would
 * never have reached the protocol that declares the intended field.
 * @returns the offered field names across every protocol, in gate order.
 */
function allOfferedCompatFields() {
    var fields = new Set();
    for (var _i = 0, _a = Object.keys(COMPAT_GATES); _i < _a.length; _i++) {
        var api = _a[_i];
        for (var _b = 0, _c = offeredCompatFields(api); _b < _c.length; _b++) {
            var field = _c[_b];
            fields.add(field);
        }
    }
    return __spreadArray([], fields, true);
}
/**
 * Reject a compat key no protocol offers. Runs before any protocol is
 * resolved, so a withheld field or a misspelling fails even on a route whose
 * models never reach the protocol that would have taken it — the alternative
 * being the silent drop that let an unreadable switch look applied.
 * @param provider - provider route key, for diagnostics.
 * @param site - the configuration site, for diagnostics.
 * @param compat - the configured switches, when any.
 * @throws Error naming the offending key.
 */
function assertOfferedCompatFields(provider, site, compat) {
    var _loop_1 = function (field, value) {
        // The name is judged before the value, so a withheld or misspelled key
        // written bare is refused for being that name rather than for being empty:
        // the other order sends someone to supply a value the key would be refused
        // with anyway.
        if (compatProtocols(field).length === 0) {
            var declared = Object.values(COMPAT_GATES).some(function (gate) { return gate[field] !== undefined; });
            if (declared) {
                invalid(provider, "".concat(site, " sets compat \"").concat(field, "\", which is not configurable here: pi-ai's installed")
                    + ' catalog sets it for the vendors that need it, so name that provider as the route instead');
            }
            invalid(provider, "".concat(site, " sets compat \"").concat(field, "\", which no wire protocol declares; the configurable")
                + " switches are ".concat(allOfferedCompatFields().join(', ')));
        }
        // A valueless key (`supportsDeveloperRole:`) survives schemastery, which
        // passes nullable data through before any member schema runs — the same
        // behavior `reasoningEfforts` documents — and a `cordis.yml` entry may
        // reach the same state through `!!js undefined`. Either way the key is
        // kept, so carrying it forward writes nothing over whatever the next layer
        // resolved, leaving pi-ai's `??` at its baseURL detection: the "written but
        // not applied" outcome this surface exists to refuse.
        if (value == null) {
            invalid(provider, "".concat(site, " sets compat \"").concat(field, "\" with no value; give it one, or remove the key to")
                + ' leave the field to the next layer — the installed catalog entry, then pi-ai\'s own detection');
        }
    };
    // Every key, not only the ones carrying a value: a withheld or undeclared
    // name is never in the schema, so schemastery cannot have materialized it —
    // whatever its value, a person wrote it and expects it to do something.
    for (var _i = 0, _a = Object.entries(compat !== null && compat !== void 0 ? compat : {}); _i < _a.length; _i++) {
        var _b = _a[_i], field = _b[0], value = _b[1];
        _loop_1(field, value);
    }
}
/** Report a route the deployment cannot serve, naming the settings key at fault. */
function invalid(provider, detail) {
    throw new Error("llm-pi-ai: provider \"".concat(provider, "\" ").concat(detail));
}
/**
 * The one wire protocol a catalog route's shipped models agree on. This is what
 * lets a deployment add a model the installed catalog has not caught up with —
 * a provider's newest release — without restating the protocol its siblings
 * already use. A route whose shipped models disagree (an OpenAI-style catalog
 * spanning Responses and Chat Completions) has no such answer, so a model it
 * does not describe must name its protocol at the route.
 */
function sharedCatalogApi(defaults) {
    var apis = new Set();
    for (var _i = 0, _a = defaults.values(); _i < _a.length; _i++) {
        var model = _a[_i];
        apis.add(model.api);
    }
    return apis.size === 1 ? __spreadArray([], apis, true)[0] : undefined;
}
/**
 * Resolve one model's reasoning capability from its declared efforts.
 *
 * A declared dict translates to pi-ai's `thinkingLevelMap` with every level
 * decided explicitly: declared levels carry their wire spelling, undeclared
 * levels are pinned to `null` (unsupported). Pinning matters because pi-ai's
 * own defaulting is asymmetric — an absent key means "supported" for the five
 * base levels but "unsupported" for `xhigh`/`max` — and a profile author
 * should not need to know that. A declared `off` with no value is the one
 * exception: it stays absent from the map, which pi-ai reads as "supported,
 * send nothing" — the correct dispatch where not thinking is the parameter's
 * absence — while `off` with a value sends that value.
 * @param provider - provider route key, for diagnostics.
 * @param entry - the configured model entry.
 * @param base - the installed catalog entry of the same id, when one exists.
 * @returns the reasoning fields the materialized model carries.
 */
function resolveModelReasoning(provider, entry, base) {
    var _a;
    var efforts = entry.reasoningEfforts;
    if (efforts === undefined) {
        // Reasoning rides the installed entry or is absent: a bare capability flag
        // would make pi-ai advertise effort levels with no `thinkingLevelMap` to
        // spell them, and no listing endpoint reports a model's reasoning
        // protocol. The entry's map (when any) arrives through the `...base`
        // spread in the model literal.
        return { reasoning: (_a = base === null || base === void 0 ? void 0 : base.reasoning) !== null && _a !== void 0 ? _a : false };
    }
    // The installed entry's map may ride along through `...base`; pi-ai never
    // reads it on a non-reasoning model, so stripping it is not worth a field
    // enumeration here.
    if (efforts === false)
        return { reasoning: false };
    // A YAML `reasoningEfforts:` left valueless arrives as null through the
    // schema union — outside the field's declared type, hence the widening —
    // while an explicit `{}` arrives as an empty dict. Both declare nothing,
    // and neither is a spelling of "inherit" or "disable".
    if (efforts === null || Object.keys(efforts).length === 0) {
        invalid(provider, "model \"".concat(entry.id, "\" has an empty reasoningEfforts; declare the offered levels, set")
            + ' false for a non-reasoning model, or omit the field to keep the installed catalog\'s capability');
    }
    var declared = exports.THINKING_LEVELS.flatMap(function (level) {
        var wire = efforts[level];
        return wire === undefined ? [] : [[level, wire]];
    });
    for (var _i = 0, declared_1 = declared; _i < declared_1.length; _i++) {
        var _b = declared_1[_i], level = _b[0], wire = _b[1];
        if (wire === null) {
            if (level !== 'off') {
                invalid(provider, "model \"".concat(entry.id, "\" reasoningEfforts.").concat(level, " needs the wire value dispatch")
                    + ' should send; only "off" may leave it empty');
            }
        }
        else if (wire.length === 0) {
            invalid(provider, "model \"".concat(entry.id, "\" reasoningEfforts.").concat(level, " must not be an empty string"));
        }
    }
    if (!declared.some(function (_a) {
        var level = _a[0];
        return level !== 'off';
    })) {
        invalid(provider, "model \"".concat(entry.id, "\" reasoningEfforts offers no level beyond \"off\"; declare a thinking")
            + ' level, or set reasoningEfforts to false for a non-reasoning model');
    }
    var map = {};
    for (var _c = 0, THINKING_LEVELS_1 = exports.THINKING_LEVELS; _c < THINKING_LEVELS_1.length; _c++) {
        var level = THINKING_LEVELS_1[_c];
        var wire = efforts[level];
        if (wire === undefined) {
            map[level] = null;
        }
        else if (wire !== null) {
            map[level] = wire;
        }
    }
    return { reasoning: true, thinkingLevelMap: map };
}
/**
 * Resolve one model's compat block from the profile's switches.
 *
 * A model switch wins over the route switch field by field; whatever neither
 * sets keeps the installed entry's value, and a field no layer decides falls
 * through to pi-ai's own detection. A model-level switch its protocol does not
 * take fails resolution — about one named model it can only be a mistake —
 * while a route-level one skips past such models, since a route default must
 * stay settable on a route whose models do not all speak one protocol. Every
 * field reaching here is offered by some protocol; {@link
 * assertOfferedCompatFields} has already refused the rest.
 * @param provider - provider route key, for diagnostics.
 * @param entry - the configured model entry.
 * @param route - the route-level switches, when any.
 * @param base - the installed catalog entry of the same id, when one exists.
 * @param api - the model's resolved wire protocol.
 * @returns a `compat` field to spread into the model, or nothing.
 */
function resolveModelCompat(provider, entry, route, base, api) {
    var gate = compatGate(api);
    var configured = {};
    for (var _i = 0, _a = configuredCompatEntries(route); _i < _a.length; _i++) {
        var _b = _a[_i], field = _b[0], value = _b[1];
        if ((gate === null || gate === void 0 ? void 0 : gate[field]) !== 'offer')
            continue;
        configured[field] = value;
    }
    for (var _c = 0, _d = configuredCompatEntries(entry.compat); _c < _d.length; _c++) {
        var _e = _d[_c], field = _e[0], value = _e[1];
        if ((gate === null || gate === void 0 ? void 0 : gate[field]) !== 'offer') {
            var offered = offeredCompatFields(api);
            invalid(provider, "model \"".concat(entry.id, "\" sets compat \"").concat(field, "\", but its api is \"").concat(api, "\", which does not")
                + " take it; that switch exists on ".concat(compatProtocols(field).join(', '), ", and \"").concat(api, "\" offers")
                + " ".concat(offered.length === 0 ? 'no configurable compat' : offered.join(', ')));
        }
        configured[field] = value;
    }
    if (Object.keys(configured).length === 0)
        return {};
    // The installed entry's compat matches the entry's OWN api — a route-level
    // `api` repoint (an anthropic catalog served through an OpenAI-compatible
    // gateway) leaves `base.compat` in the other protocol's shape, so it is
    // inherited only while the resolved api still is the entry's. A repointed
    // model starts from pi-ai's baseURL-derived detection instead, which is
    // what a protocol change means for every other compat field too.
    var inherited = (base === null || base === void 0 ? void 0 : base.api) === api ? base.compat : undefined;
    return { compat: __assign(__assign({}, inherited), configured) };
}
/**
 * Materialize one route's catalog by merging the installed catalog defaults
 * under the configured entries. A route with no configured `models` serves the
 * installed catalog unchanged, which is what keeps an existing
 * `providers: { deepseek: { apiKeyEnv: … } }` profile working untouched.
 * @param request - the route-level catalog facts.
 * @returns the materialized models and the explicitly configured request caps.
 */
function resolveRouteModels(request) {
    var _a, _b, _c, _d;
    var provider = request.provider;
    var defaults = catalogModels(provider);
    var providerBaseUrl = (_a = catalogProvider(provider)) === null || _a === void 0 ? void 0 : _a.baseUrl;
    // An absent `models` key and an empty one are the same request: the config
    // schema materializes `[]` for the absent case, and an empty catalog could
    // serve no request anyway, so both mean "serve the installed catalog".
    var configured = (_b = request.models) !== null && _b !== void 0 ? _b : [];
    var additions = (_c = request.modelAdditions) !== null && _c !== void 0 ? _c : [];
    var overrides = (_d = request.modelOverrides) !== null && _d !== void 0 ? _d : {};
    if (configured.length > 0 && additions.length > 0) {
        invalid(provider, 'sets modelAdditions beside a models list; models already replaces the served catalog');
    }
    // Every miss is refused, never skipped: an override that lands nowhere is a
    // typo someone would otherwise hunt for in a silently unchanged model.
    for (var _i = 0, _e = Object.entries(overrides); _i < _e.length; _i++) {
        var _f = _e[_i], id = _f[0], override = _f[1];
        if (id.length === 0)
            invalid(provider, 'has a modelOverrides entry with an empty model id');
        if (defaults.size === 0) {
            invalid(provider, "sets modelOverrides for \"".concat(id, "\", but the installed catalog does not describe this route;")
                + ' a declared route spells every model out in its models list');
        }
        if (configured.length > 0) {
            invalid(provider, "sets modelOverrides for \"".concat(id, "\" beside a models list; models already replaces the served")
                + ' catalog, so declare the fields on its entries');
        }
        if (!defaults.has(id)) {
            invalid(provider, "modelOverrides names \"".concat(id, "\", which the installed catalog does not describe"));
        }
        // The id lives in the dict key; a value carrying its own would quietly
        // rename the model it meant to customize. The static shape already omits
        // it — this guards the schema boundary, which passes unknown keys through.
        if ('id' in override) {
            invalid(provider, "modelOverrides entry \"".concat(id, "\" sets \"id\", which is the dict key"));
        }
    }
    for (var _g = 0, additions_1 = additions; _g < additions_1.length; _g++) {
        var addition = additions_1[_g];
        if (!addition.id)
            invalid(provider, 'has a modelAdditions entry with an empty id');
        if (defaults.has(addition.id)) {
            invalid(provider, "modelAdditions names installed model \"".concat(addition.id, "\"; use modelOverrides to change it"));
        }
    }
    // An override becomes the catalog entry's configuration, so everything a
    // models entry may declare — capacities, efforts, compat — resolves through
    // the same path with the same diagnostics and request-default semantics.
    var entries = configured.length > 0
        ? configured
        : __spreadArray(__spreadArray([], __spreadArray([], defaults.values(), true).map(function (model) { return (__assign({ id: model.id }, overrides[model.id])); }), true), additions, true);
    if (entries.length === 0) {
        invalid(provider, 'resolves no models; the installed catalog does not describe this route, so its models'
            + ' must be listed in configuration');
    }
    var routeApi = sharedCatalogApi(defaults);
    // Vocabulary before protocols: a withheld or undeclared switch is refused
    // wherever it is written, so it cannot look applied on a route whose models
    // never reach the protocol that would have taken it.
    assertOfferedCompatFields(provider, 'route', request.compat);
    for (var _h = 0, entries_1 = entries; _h < entries_1.length; _h++) {
        var entry = entries_1[_h];
        assertOfferedCompatFields(provider, "model \"".concat(entry.id, "\""), entry.compat);
    }
    var seen = new Set();
    var configuredMaxTokens = new Map();
    var models = entries.map(function (entry) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        if (entry.id.length === 0)
            invalid(provider, 'has a model with an empty id');
        if (seen.has(entry.id))
            invalid(provider, "lists model \"".concat(entry.id, "\" more than once"));
        seen.add(entry.id);
        var base = defaults.get(entry.id);
        var api = (_b = (_a = request.api) !== null && _a !== void 0 ? _a : base === null || base === void 0 ? void 0 : base.api) !== null && _b !== void 0 ? _b : routeApi;
        if (api === undefined) {
            invalid(provider, "model \"".concat(entry.id, "\" needs an api; the installed catalog does not describe it, so set the")
                + ' route\'s api to the wire protocol its endpoint speaks');
        }
        var baseUrl = (_d = (_c = request.baseURL) !== null && _c !== void 0 ? _c : base === null || base === void 0 ? void 0 : base.baseUrl) !== null && _d !== void 0 ? _d : providerBaseUrl;
        if (baseUrl === undefined) {
            invalid(provider, "model \"".concat(entry.id, "\" needs a baseURL; the installed catalog does not describe this route"));
        }
        // Capacities fall back to the route's own defaults, so a model listing that
        // discloses nothing but ids still yields a serviceable route. The fallback
        // is a guess by construction, which is why it is a configurable route field
        // rather than a constant buried here.
        var contextWindow = (_f = (_e = entry.contextWindow) !== null && _e !== void 0 ? _e : base === null || base === void 0 ? void 0 : base.contextWindow) !== null && _f !== void 0 ? _f : request.defaultContextWindow;
        if (!Number.isInteger(contextWindow) || contextWindow <= 0) {
            invalid(provider, "model \"".concat(entry.id, "\" contextWindow must be a positive integer"));
        }
        var maxTokens = (_h = (_g = entry.maxTokens) !== null && _g !== void 0 ? _g : base === null || base === void 0 ? void 0 : base.maxTokens) !== null && _h !== void 0 ? _h : request.defaultMaxTokens;
        if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
            invalid(provider, "model \"".concat(entry.id, "\" maxTokens must be a positive integer"));
        }
        // Only a value the profile named is a deployment choice; the catalog's is
        // the model's capability and stays out of request defaults.
        if (entry.maxTokens !== undefined)
            configuredMaxTokens.set(entry.id, entry.maxTokens);
        return __assign(__assign(__assign(__assign({}, base), { id: entry.id, name: (_k = (_j = entry.name) !== null && _j !== void 0 ? _j : base === null || base === void 0 ? void 0 : base.name) !== null && _k !== void 0 ? _k : entry.id, api: api, provider: provider, baseUrl: baseUrl, input: (_m = (_l = declaredInput(entry.input)) !== null && _l !== void 0 ? _l : base === null || base === void 0 ? void 0 : base.input) !== null && _m !== void 0 ? _m : __spreadArray([], request.defaultInput, true), cost: (_o = base === null || base === void 0 ? void 0 : base.cost) !== null && _o !== void 0 ? _o : NO_COST, contextWindow: contextWindow, maxTokens: maxTokens }), resolveModelReasoning(provider, entry, base)), resolveModelCompat(provider, entry, request.compat, base, api));
    });
    var _loop_2 = function (field) {
        var takers = compatProtocols(field);
        if (models.some(function (model) { return takers.includes(model.api); }))
            return "continue";
        invalid(provider, "sets compat \"".concat(field, "\", but no model on the route speaks a protocol that takes it;")
            + " it exists on ".concat(takers.join(', ')));
    };
    // Per field, not per block: a route may default a switch its completions
    // models take beside one only its anthropic models do, and neither should
    // fail for the other's sake. What is refused is a route default no model on
    // the route could ever read, which is a route that will not behave as written.
    for (var _j = 0, _k = configuredCompatEntries(request.compat); _j < _k.length; _j++) {
        var field = _k[_j][0];
        _loop_2(field);
    }
    return { models: models, configuredMaxTokens: configuredMaxTokens };
}
