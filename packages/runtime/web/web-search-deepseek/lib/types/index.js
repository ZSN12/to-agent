"use strict";
/**
 * Register a DeepSeek-backed provider in `ctx.web`. It calls the Anthropic-compatible Messages API
 * with native `web_search_20250305`. The provider reuses `DEEPSEEK_API_KEY` but not
 * `DEEPSEEK_BASE_URL`, because search and chat-completions use different bases.
 * @module @z/dsh-web-search-deepseek
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE = exports.Config = exports.inject = exports.name = exports.DEEPSEEK_PROVIDER_ID = exports.DEEPSEEK_DEFAULT_MODEL = exports.DEEPSEEK_DEFAULT_MAX_USES = exports.DEEPSEEK_DEFAULT_MAX_TOKENS = exports.DEEPSEEK_DEFAULT_BASE_URL = exports.DEEPSEEK_DEFAULT_API_VERSION = exports.DeepSeekSearchProvider = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_credentials_1 = require("@z/dsh-credentials");
var dsh_settings_1 = require("@z/dsh-settings");
var dsh_launch_environment_1 = require("@z/dsh-launch-environment");
var provider_ts_1 = require("./provider.ts");
var provider_ts_2 = require("./provider.ts");
Object.defineProperty(exports, "DeepSeekSearchProvider", { enumerable: true, get: function () { return provider_ts_2.DeepSeekSearchProvider; } });
Object.defineProperty(exports, "DEEPSEEK_DEFAULT_API_VERSION", { enumerable: true, get: function () { return provider_ts_2.DEEPSEEK_DEFAULT_API_VERSION; } });
Object.defineProperty(exports, "DEEPSEEK_DEFAULT_BASE_URL", { enumerable: true, get: function () { return provider_ts_2.DEEPSEEK_DEFAULT_BASE_URL; } });
Object.defineProperty(exports, "DEEPSEEK_DEFAULT_MAX_TOKENS", { enumerable: true, get: function () { return provider_ts_2.DEEPSEEK_DEFAULT_MAX_TOKENS; } });
Object.defineProperty(exports, "DEEPSEEK_DEFAULT_MAX_USES", { enumerable: true, get: function () { return provider_ts_2.DEEPSEEK_DEFAULT_MAX_USES; } });
Object.defineProperty(exports, "DEEPSEEK_DEFAULT_MODEL", { enumerable: true, get: function () { return provider_ts_2.DEEPSEEK_DEFAULT_MODEL; } });
Object.defineProperty(exports, "DEEPSEEK_PROVIDER_ID", { enumerable: true, get: function () { return provider_ts_2.DEEPSEEK_PROVIDER_ID; } });
/** Cordis plugin name used by loader diagnostics. */
exports.name = 'web-search-deepseek';
/** The web seam this provider registers into. */
exports.inject = ['web'];
var DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY';
exports.Config = schemastery_1.default.object({
    apiKey: schemastery_1.default.string().role('secret'),
    apiKeyEnv: schemastery_1.default.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
    // Declared here rather than only at the use site: a configuration surface
    // renders the resolved section, so a default the schema does not carry reads
    // there as no value at all.
    baseURL: schemastery_1.default.string(),
    model: schemastery_1.default.string().default(provider_ts_1.DEEPSEEK_DEFAULT_MODEL),
    apiVersion: schemastery_1.default.string().default(provider_ts_1.DEEPSEEK_DEFAULT_API_VERSION),
    maxTokens: schemastery_1.default.number().step(1).min(1).default(provider_ts_1.DEEPSEEK_DEFAULT_MAX_TOKENS),
    maxUses: schemastery_1.default.number().step(1).min(1).default(provider_ts_1.DEEPSEEK_DEFAULT_MAX_USES),
});
/**
 * Environment variable naming this provider's endpoint. Deliberately distinct
 * from `$DEEPSEEK_BASE_URL`, which belongs to the chat-completions adapter:
 * search speaks the Anthropic-compatible Messages API, so one variable cannot
 * serve both.
 */
var SEARCH_BASE_URL_ENV = 'DEEPSEEK_SEARCH_BASE_URL';
/** Settings namespace carrying this provider's endpoint, model, and key reference. */
exports.WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE = (0, dsh_settings_1.settingsNamespace)('web-search-deepseek');
/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider:
 * every value it reads is already fully defaulted.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(ctx, config) {
    var _this = this;
    var _a, _b, _c, _d, _e, _f, _g, _h;
    var apiKeyEnv = (0, dsh_credentials_1.credentialRef)((_a = config.apiKeyEnv) !== null && _a !== void 0 ? _a : DEFAULT_API_KEY_ENV);
    var literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0
        ? config.apiKey
        : undefined;
    return __assign(__assign({}, literalApiKey === undefined ? {} : { apiKey: literalApiKey }), { resolveApiKey: function () { return __awaiter(_this, void 0, void 0, function () {
            var credentials, ambient;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        credentials = ctx.get('credentials');
                        if (!(credentials !== undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, credentials.resolve(apiKeyEnv)];
                    case 1: return [2 /*return*/, (_a = (_b.sent())) === null || _a === void 0 ? void 0 : _a.value
                        // Without the seam the environment is the whole credential plane.
                    ];
                    case 2:
                        ambient = (0, dsh_launch_environment_1.launchEnvironmentOf)(ctx).get(apiKeyEnv);
                        return [2 /*return*/, ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined];
                }
            });
        }); }, apiKeyEnv: apiKeyEnv, baseURL: (_d = (_b = config.baseURL) !== null && _b !== void 0 ? _b : (_c = (0, dsh_launch_environment_1.launchEnvironmentOf)(ctx).get(SEARCH_BASE_URL_ENV)) === null || _c === void 0 ? void 0 : _c.value) !== null && _d !== void 0 ? _d : provider_ts_1.DEEPSEEK_DEFAULT_BASE_URL, model: (_e = config.model) !== null && _e !== void 0 ? _e : provider_ts_1.DEEPSEEK_DEFAULT_MODEL, apiVersion: (_f = config.apiVersion) !== null && _f !== void 0 ? _f : provider_ts_1.DEEPSEEK_DEFAULT_API_VERSION, maxTokens: (_g = config.maxTokens) !== null && _g !== void 0 ? _g : provider_ts_1.DEEPSEEK_DEFAULT_MAX_TOKENS, maxUses: (_h = config.maxUses) !== null && _h !== void 0 ? _h : provider_ts_1.DEEPSEEK_DEFAULT_MAX_USES, recordRequest: function (request) {
            var _a, _b;
            (_b = (_a = ctx.get('agents')) === null || _a === void 0 ? void 0 : _a.currentInitiator()) === null || _b === void 0 ? void 0 : _b.session.append('web/deepseek-search-llm-request', request);
        } });
}
/** Register the DeepSeek search provider with `ctx.web`. */
function apply(ctx, config) {
    var current = function () { return config; };
    (0, dsh_settings_1.installSettingsSection)(ctx, exports.WEB_SEARCH_DEEPSEEK_SETTINGS_NAMESPACE, exports.Config, config, {
        setSource: function (source) {
            current = source;
        },
        // The registration carries no resolved value: the provider projects the
        // section per search, so a committed change needs no re-registration.
        onChange: function () { },
    });
    ctx.web.registerSearchProvider(new provider_ts_1.DeepSeekSearchProvider(function () { return resolveOptions(ctx, current()); }));
}
