"use strict";
/**
 * Generic pi-ai-backed LLM adapter plugin. One plugin instance owns a dict of
 * provider routes; a route naming an installed pi-ai provider inherits that
 * provider's endpoint, protocol, and model catalog as defaults, and a route
 * pi-ai does not ship is declared outright. Profile facts resolve per request
 * over the optional `llm-pi-ai` user-settings section and the optional
 * credential seam, so a changed key, endpoint, model, or knob reaches the next
 * request without a restart; a changed *route set* (or a route's
 * registration-captured retry policy) re-registers the same adapter instance
 * in place.
 *
 * ```yaml
 * - id: llm
 *   name: '@z/dsh-llm-pi-ai'
 *   config:
 *     providers:
 *       # Catalog route: everything but the credential comes from pi-ai.
 *       openai:
 *         apiKeyEnv: OPENAI_API_KEY
 *         retryPolicy:
 *           mode: normal
 *           maxRetries: 2
 *       # Catalog route with the catalog narrowed and one capacity corrected.
 *       anthropic:
 *         apiKeyEnv: ANTHROPIC_API_KEY
 *         models:
 *           - id: claude-sonnet-4-5
 *             contextWindow: 200000
 *       # Hand-declared route: pi-ai ships nothing under this key.
 *       acme-gateway:
 *         displayName: Acme Gateway
 *         apiKeyEnv: ACME_GATEWAY_API_KEY
 *         api: openai-completions
 *         baseURL: https://gateway.acme.example/v1
 *         # Reasoning dialect for a URL pi-ai cannot recognize.
 *         compat:
 *           thinkingFormat: deepseek
 *         models:
 *           - id: acme-large
 *             name: Acme Large
 *             contextWindow: 65536
 *             maxTokens: 4096
 *           - id: acme-think
 *             name: Acme Think
 *             contextWindow: 262144
 *             maxTokens: 32768
 *             # key = selectable level, value = wire spelling; only off may
 *             # leave the value empty (supported, send nothing).
 *             reasoningEfforts:
 *               off:
 *               high: high
 *               max: ultra
 * ```
 *
 * @module @z/dsh-llm-pi-ai
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
exports.inject = exports.name = exports.supportedProtocols = exports.recordKeyFor = exports.Config = exports.PiAiAdapter = void 0;
exports.apply = apply;
var dsh_launch_environment_1 = require("@z/dsh-launch-environment");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_settings_1 = require("@z/dsh-settings");
var adapter_ts_1 = require("./adapter.ts");
var auth_ts_1 = require("./auth.ts");
var catalog_ts_1 = require("./catalog.ts");
var config_ts_1 = require("./config.ts");
var discovery_ts_1 = require("./discovery.ts");
var login_ts_1 = require("./login.ts");
var adapter_ts_2 = require("./adapter.ts");
Object.defineProperty(exports, "PiAiAdapter", { enumerable: true, get: function () { return adapter_ts_2.PiAiAdapter; } });
var config_ts_2 = require("./config.ts");
Object.defineProperty(exports, "Config", { enumerable: true, get: function () { return config_ts_2.Config; } });
var auth_ts_2 = require("./auth.ts");
Object.defineProperty(exports, "recordKeyFor", { enumerable: true, get: function () { return auth_ts_2.recordKeyFor; } });
var provider_ts_1 = require("./provider.ts");
Object.defineProperty(exports, "supportedProtocols", { enumerable: true, get: function () { return provider_ts_1.supportedProtocols; } });
exports.name = 'llm-pi-ai';
exports.inject = ['llm'];
var NS = (0, dsh_settings_1.settingsNamespace)('llm-pi-ai');
/**
 * The registry captures these per route; a change here must re-register.
 * Sorted by provider so a settings document that merely reorders its keys is
 * not mistaken for a route change.
 */
function registrationFacts(profiles) {
    return __spreadArray([], profiles.entries(), true).map(function (_a) {
        var provider = _a[0], profile = _a[1];
        return ({
            provider: provider,
            displayName: profile.displayName,
            retryPolicy: profile.retryPolicy,
        });
    })
        .sort(function (left, right) { return left.provider.localeCompare(right.provider); });
}
/**
 * The configurable-provider directory: every installed catalog route, plus
 * every route the current profiles declare. A hand-declared route has no
 * catalog entry, so without this union it would have no settings address and
 * configuration surfaces could neither show nor edit it.
 * @param profiles - the currently resolved provider profiles.
 * @returns the directory entries in catalog order, declared routes last.
 */
function directoryEntries(profiles) {
    var catalog = new Set((0, catalog_ts_1.catalogProviderIds)());
    var entries = new Map();
    var declare = function (provider, displayName) {
        entries.set(provider, {
            provider: provider,
            displayName: displayName,
            settingsNs: NS,
            settingsPath: ['providers', provider],
            // Membership of the installed catalog, not of the settings document:
            // narrowing a shipped provider's models stores a profile too, and that
            // route is still one pi-ai knows.
            declared: !catalog.has(provider),
        });
    };
    for (var _i = 0, catalog_1 = catalog; _i < catalog_1.length; _i++) {
        var provider = catalog_1[_i];
        declare(provider, provider);
    }
    for (var _a = 0, profiles_1 = profiles; _a < profiles_1.length; _a++) {
        var _b = profiles_1[_a], provider = _b[0], profile = _b[1];
        declare(provider, profile.displayName);
    }
    return __spreadArray([], entries.values(), true);
}
/** Register one generic pi-ai adapter for all configured provider routes. */
function apply(ctx, config) {
    var _this = this;
    var current = function () { return config; };
    var lastRaw;
    var memoized;
    /**
     * The resolved profiles for the current configuration, memoized by the raw
     * snapshot's identity — which is also what makes the adapter's own snapshot
     * stable across operations that observe no change.
     *
     * No fallback for an unserviceable snapshot lives here: the section schema
     * resolves the whole profile set, so a write that could not be served is
     * refused where it is written, and the settings seam keeps a namespace's
     * last good value for a stored section that fails. Anything reaching this
     * point has already resolved once.
     */
    var profiles = function () {
        var raw = current();
        if (raw === lastRaw && memoized !== undefined)
            return memoized;
        var next = (0, config_ts_1.resolveProfiles)(raw.providers);
        lastRaw = raw;
        memoized = next;
        return next;
    };
    profiles();
    var resolveApiKey = function (provider, profile) { return __awaiter(_this, void 0, void 0, function () {
        var ref, credentials, hit, _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    ref = profile.apiKeyEnv;
                    // Only a profile that names no credential at all defers to pi-ai's
                    // provider-native discovery. Once one is named, a miss must fail loud:
                    // handing pi-ai `undefined` would let it pick up an unrelated ambient key
                    // (OPENAI_API_KEY and friends), billing another tenant for a request the
                    // deployment meant to authenticate differently.
                    if (ref === undefined)
                        return [2 /*return*/, undefined];
                    credentials = ctx.get('credentials');
                    if (!(credentials !== undefined)) return [3 /*break*/, 2];
                    return [4 /*yield*/, credentials.resolve(ref)];
                case 1:
                    _a = (_b = (_d.sent())) === null || _b === void 0 ? void 0 : _b.value;
                    return [3 /*break*/, 3];
                case 2:
                    _a = (_c = (0, dsh_launch_environment_1.launchEnvironmentOf)(ctx).get(ref)) === null || _c === void 0 ? void 0 : _c.value;
                    _d.label = 3;
                case 3:
                    hit = _a;
                    if (hit !== undefined && hit.length > 0)
                        return [2 /*return*/, (0, dsh_llm_1.assertUsableApiKey)(hit, 'llm-pi-ai', ref)];
                    throw new dsh_llm_1.LlmError("llm-pi-ai: no credential for provider route \"".concat(provider, "\"; its profile resolves ").concat(ref, ", which is not")
                        + " set \u2014 store ".concat(ref, " through the credentials service (the web Models page writes it) or export it,")
                        + ' and remove apiKeyEnv only if this provider should authenticate from pi-ai\'s own environment discovery', 'MISSING_CREDENTIAL');
            }
        });
    }); };
    // One store and one ambient context for the whole plugin instance: both read
    // through `ctx` per call, so they stay correct across the collection rebuilds
    // a configuration change causes, and a sign-in survives one.
    var auth = { credentials: (0, auth_ts_1.credentialStoreFrom)(ctx), authContext: (0, auth_ts_1.authContextFrom)(ctx) };
    var adapter = new adapter_ts_1.PiAiAdapter({
        profiles: profiles,
        resolveApiKey: resolveApiKey,
        auth: auth,
        resolveAttachments: function () { return ctx.get('attachments'); },
        onReplayDegrade: function (_a) {
            var provider = _a.provider, model = _a.model, reason = _a.reason;
            ctx.logger.warn("llm-pi-ai: unusable replay state on assistant history for route \"".concat(provider, "/").concat(model, "\";")
                + " sending that message as provider-neutral content (".concat(reason, ")"));
        },
    });
    // Independent of the route set: signing in is what makes a route worth
    // adding, so the flows are offered before any profile names their provider.
    // Scoped to the authorization seam rather than injected outright, because a
    // composition without it (headless, ACP) simply has no surface to sign in
    // from, while everything else this plugin does still works.
    ctx.inject(['authorization'], function (authorized) { (0, login_ts_1.registerPiAiFlows)(authorized, auth); });
    // The full installed catalog is configurable from the moment the plugin
    // mounts — dormant or not — so configuration surfaces can offer every
    // pi-ai provider before any route exists. Hand-declared routes join it as
    // profiles appear, and leave with them.
    var directory;
    var directoryFacts;
    var ensureDirectory = function () {
        var entries = directoryEntries(profiles());
        if ((0, dsh_settings_1.deepEqualJson)(entries, directoryFacts))
            return;
        // Atomic replace, never dispose-then-register: a route another adapter
        // family already declares (a profile keyed `deepseek-official`) would
        // otherwise leave this plugin's whole directory withdrawn and the Models
        // page empty. The candidate set is validated first, so a collision keeps
        // the previous entries serving and only costs a diagnostic.
        if (directory === undefined) {
            directory = ctx.llm.registerConfigurableProviders(entries);
        }
        else {
            directory.replace(entries);
        }
        directoryFacts = entries;
    };
    ensureDirectory();
    /**
     * The credential a named route already resolves, for an interrogation whose
     * draft carries none. A route being declared for the first time names no
     * profile yet, and a profile that names no credential defers to pi-ai's own
     * discovery, so both answer `undefined` and the endpoint is asked
     * unauthenticated — the same posture a request to that route would take.
     */
    var storedApiKey = function (provider) { return __awaiter(_this, void 0, void 0, function () {
        var profile;
        return __generator(this, function (_a) {
            if (provider === undefined)
                return [2 /*return*/, undefined];
            profile = profiles().get(provider);
            if (profile === undefined)
                return [2 /*return*/, undefined];
            return [2 /*return*/, resolveApiKey(provider, profile)];
        });
    }); };
    // Interrogating an endpoint is a configuration-time action over a draft, so
    // it is offered for the whole namespace rather than per route: the provider
    // a surface is adding does not exist yet. The draft is the whole request
    // except the credential: a configuration surface edits a redacted descriptor
    // and never holds a stored secret, so an already-configured route supplies
    // its own here rather than being interrogated unauthenticated.
    ctx.llm.registerModelDiscovery(NS, function (request) { return (0, discovery_ts_1.discoverModels)(request, function () { return storedApiKey(request.provider); }); });
    // Route effects bind to this apply fiber via the stable `ctx` reference,
    // even when a swap runs inside the scoped settings callback below. A bare
    // mount (zero routes) is the dormant posture: nothing registers until a
    // settings section supplies profiles, and routes drop when it empties.
    var registration;
    var registeredFacts;
    var ensureRegistrationFacts = function () {
        var facts = registrationFacts(profiles());
        if ((0, dsh_settings_1.deepEqualJson)(facts, registeredFacts))
            return;
        // The registry captures the route set and each route's retry policy at
        // registration, so a change to either must re-register. The swap is
        // atomic (same adapter instance, validated before anything moves): a
        // conflicting route leaves the previous routes serving requests, and
        // `registeredFacts` only advances once the registry actually holds the
        // new set — so returning to a working configuration always re-applies.
        var routes = __spreadArray([], profiles().keys(), true);
        if (registration === undefined) {
            // Dormant bare mount: nothing is registered until a section supplies
            // profiles, and an empty section keeps it that way.
            if (routes.length === 0) {
                registeredFacts = facts;
                return;
            }
            registration = ctx.llm.registerAdapter(routes, adapter);
        }
        else {
            registration.replace(routes);
        }
        registeredFacts = facts;
    };
    ensureRegistrationFacts();
    (0, dsh_settings_1.installSettingsSection)(ctx, NS, config_ts_1.Config, config, {
        // Refuse an unserviceable section where it is written: without this a
        // schema-valid profile the adapter cannot serve would be stored and then
        // silently disable every route in this namespace.
        validate: config_ts_1.assertServiceable,
        setSource: function (source) {
            current = source;
        },
        onChange: function () {
            // Named here rather than left to the settings watcher: `assertServiceable`
            // cannot see the llm registry, so a profile claiming a route another
            // adapter family owns is stored successfully and only fails at this swap.
            // Without its own diagnostic that refusal reaches the operator as a
            // generic "settings: watcher failed", naming neither the route nor why it
            // is not serving. The previous routes keep serving either way.
            try {
                ensureRegistrationFacts();
            }
            catch (error) {
                ctx.logger.error('llm-pi-ai: keeping the previously registered routes after a refused update');
                ctx.logger.error(error);
            }
            // The directory follows the profiles the registry accepted, so a route
            // that failed to register is not advertised as configurable. A refused
            // directory swap is contained here for the same reason the registry's
            // is: the previous entries keep serving, and `directoryFacts` stays put
            // so returning to a working configuration re-applies.
            try {
                ensureDirectory();
            }
            catch (error) {
                ctx.logger.error('llm-pi-ai: keeping the previous configurable-provider directory after a refused update');
                ctx.logger.error(error);
            }
        },
    });
}
