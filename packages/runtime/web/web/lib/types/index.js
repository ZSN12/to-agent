"use strict";
/**
 * Service Definition for the web access capability seam (`ctx.web`): registries and provider-selecting execution for search and
 * fetch. Duplicate ids are rejected. At execution time, a configured provider must exist and
 * be usable; without one, exactly one usable provider is required, so selection never depends
 * on registration order.
 * @module @z/dsh-web
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
exports.WebRuntime = exports.WebError = void 0;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var types_ts_1 = require("./types.ts");
var types_ts_2 = require("./types.ts");
Object.defineProperty(exports, "WebError", { enumerable: true, get: function () { return types_ts_2.WebError; } });
/**
 * The web access service. Registered as `ctx.web` (one instance per context).
 *
 * Selection semantics (resolved at execution time, never order-dependent):
 * - A configured id that is registered and `available()` → that provider.
 * - A configured id not registered → `WEB_PROVIDER_CONFIGURED_MISSING`.
 * - A configured id registered but unavailable →
 *   `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
 * - No id configured, exactly one registered usable provider → that provider.
 * - No id configured, multiple usable providers → `WEB_PROVIDER_AMBIGUOUS`.
 * - No id configured, no usable provider → `WEB_PROVIDER_UNAVAILABLE`.
 */
var WebRuntime = /** @class */ (function (_super) {
    __extends(WebRuntime, _super);
    function WebRuntime(ctx, config) {
        if (config === void 0) { config = {}; }
        var _a, _b;
        var _this = _super.call(this, ctx, 'web') || this;
        _this.searchProviders = new Map();
        _this.fetchProviders = new Map();
        _this.searchProviderId = (_a = config.searchProvider) !== null && _a !== void 0 ? _a : process.env.DSH_WEB_SEARCH_PROVIDER;
        _this.fetchProviderId = (_b = config.fetchProvider) !== null && _b !== void 0 ? _b : process.env.DSH_WEB_FETCH_PROVIDER;
        return _this;
    }
    /**
     * Register a search provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
     * if its id is already registered for search. Returns a disposer; disposed
     * with the calling fiber.
     * @param provider - the provider; its `id` is the registry key.
     * @returns the disposer that unregisters the provider.
     */
    WebRuntime.prototype.registerSearchProvider = function (provider) {
        return this.registerProvider(this.searchProviders, provider);
    };
    /**
     * Register a fetch provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
     * if its id is already registered for fetch. Returns a disposer; disposed
     * with the calling fiber.
     * @param provider - the provider; its `id` is the registry key.
     * @returns the disposer that unregisters the provider.
     */
    WebRuntime.prototype.registerFetchProvider = function (provider) {
        return this.registerProvider(this.fetchProviders, provider);
    };
    WebRuntime.prototype.registerProvider = function (store, provider) {
        if (store.has(provider.id)) {
            throw new types_ts_1.WebError("a web provider with id \"".concat(provider.id, "\" is already registered"), 'WEB_DUPLICATE_PROVIDER');
        }
        var dispose = this.ctx.effect(function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        store.set(provider.id, provider);
                        return [4 /*yield*/, function () { return store.delete(provider.id); }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }, 'web.registerProvider()');
        // ctx.effect's disposer returns Promise<void>; our disposer API is
        // synchronous fire-and-forget — discard the (always-resolved) promise.
        return function () { return void dispose(); };
    };
    /**
     * Run one search through the selected provider. Resolves the provider at call
     * time with the selection rules above; throws {@link WebError} when the
     * capability cannot run. The seam enforces `request.maxResults` on the result:
     * if the provider over-returns, `sources[]` is truncated and `truncated` set.
     * @param request - the query and optional result limit.
     * @param signal - optional cancellation signal forwarded to the provider.
     * @returns the provider's results, capped to `request.maxResults`.
     */
    WebRuntime.prototype.search = function (request, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var provider, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        provider = resolveProvider(__assign({ providers: this.searchProviders }, this.searchProviderId !== undefined ? { configuredId: this.searchProviderId } : {}));
                        return [4 /*yield*/, provider.search(request, signal)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, capSources(result, request.maxResults)];
                }
            });
        });
    };
    /**
     * Retrieve one URL through the selected provider. Resolves the provider at
     * call time with the selection rules above; throws {@link WebError} when the
     * capability cannot run. A non-2xx response is a result, not a throw.
     * @param request - the URL plus retrieval options.
     * @param signal - optional cancellation signal forwarded to the provider.
     * @returns the retrieval outcome; non-2xx responses resolve descriptively.
     */
    WebRuntime.prototype.fetch = function (request, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var provider;
            return __generator(this, function (_a) {
                provider = resolveProvider(__assign({ providers: this.fetchProviders }, this.fetchProviderId !== undefined ? { configuredId: this.fetchProviderId } : {}));
                return [2 /*return*/, provider.fetch(request, signal)];
            });
        });
    };
    /**
     * Provider selection config. Operational env overrides feed the SAME fields:
     * `$DSH_WEB_SEARCH_PROVIDER` / `$DSH_WEB_FETCH_PROVIDER` are equivalent to
     * `searchProvider` / `fetchProvider` and are NOT a hidden priority chain.
     */
    WebRuntime.Config = schemastery_1.default.object({
        searchProvider: schemastery_1.default.string(),
        fetchProvider: schemastery_1.default.string(),
    });
    return WebRuntime;
}(cordis_1.Service));
exports.WebRuntime = WebRuntime;
/** Resolve the selected provider or throw the matching {@link WebError}. */
function resolveProvider(selection) {
    var configuredId = selection.configuredId, providers = selection.providers;
    if (configuredId !== undefined) {
        var provider = providers.get(configuredId);
        if (!provider) {
            throw new types_ts_1.WebError("configured web provider \"".concat(configuredId, "\" is not registered"), 'WEB_PROVIDER_CONFIGURED_MISSING');
        }
        if (!provider.available()) {
            throw new types_ts_1.WebError("configured web provider \"".concat(configuredId, "\" is registered but unavailable"), 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE');
        }
        return provider;
    }
    var usable = __spreadArray([], providers.values(), true).filter(function (provider) { return provider.available(); });
    var single = usable[0];
    if (single === undefined) {
        throw new types_ts_1.WebError('no usable web provider is registered', 'WEB_PROVIDER_UNAVAILABLE');
    }
    if (usable.length > 1) {
        var ids = usable.map(function (provider) { return provider.id; }).join(', ');
        throw new types_ts_1.WebError("multiple usable web providers are registered (".concat(ids, "); configure one explicitly"), 'WEB_PROVIDER_AMBIGUOUS');
    }
    return single;
}
/** Enforce `maxResults` on a search result: truncate `sources[]` and flag it. */
function capSources(result, maxResults) {
    if (maxResults === undefined || result.sources.length <= maxResults)
        return result;
    return __assign(__assign({}, result), { sources: result.sources.slice(0, maxResults), truncated: true });
}
exports.default = WebRuntime;
