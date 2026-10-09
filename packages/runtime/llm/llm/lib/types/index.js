"use strict";
/**
 * LLM service: adapter registry with a waterfall-interceptable streaming call
 * API. Exports the `LlmRuntime` default, the abstract `LlmAdapter` for
 * provider backends, and `BlockAssembler` for chunk assembly.
 *
 * @module @z/dsh-llm
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
exports.LlmRuntime = exports.LlmAdapter = exports.LlmError = exports.markAgentLoopRequest = exports.isAgentLoopRequest = exports.deepFreeze = exports.callConfigEquals = exports.BlockAssembler = void 0;
exports.assertUsableApiKey = assertUsableApiKey;
var cordis_1 = require("@z/cordis");
var message_ts_1 = require("./message.ts");
var retry_policy_ts_1 = require("./retry-policy.ts");
var call_config_ts_1 = require("./call-config.ts");
var error_ts_1 = require("./error.ts");
var adapter_failure_ts_1 = require("./adapter-failure.ts");
var api_key_ts_1 = require("./api-key.ts");
var content_ts_1 = require("./content.ts");
__exportStar(require("./attribution.ts"), exports);
__exportStar(require("./brand.ts"), exports);
__exportStar(require("./never.ts"), exports);
__exportStar(require("./error.ts"), exports);
__exportStar(require("./api-key.ts"), exports);
__exportStar(require("./types.ts"), exports);
__exportStar(require("./content.ts"), exports);
__exportStar(require("./message.ts"), exports);
__exportStar(require("./retry-policy.ts"), exports);
var assembler_ts_1 = require("./assembler.ts");
Object.defineProperty(exports, "BlockAssembler", { enumerable: true, get: function () { return assembler_ts_1.BlockAssembler; } });
var call_config_ts_2 = require("./call-config.ts");
Object.defineProperty(exports, "callConfigEquals", { enumerable: true, get: function () { return call_config_ts_2.callConfigEquals; } });
Object.defineProperty(exports, "deepFreeze", { enumerable: true, get: function () { return call_config_ts_2.deepFreeze; } });
Object.defineProperty(exports, "isAgentLoopRequest", { enumerable: true, get: function () { return call_config_ts_2.isAgentLoopRequest; } });
Object.defineProperty(exports, "markAgentLoopRequest", { enumerable: true, get: function () { return call_config_ts_2.markAgentLoopRequest; } });
/**
 * Typed error for LLM-related failures. Extends {@link HarnessError}, so the
 * `code` string (e.g. `AUTH`, `RATE_LIMIT`, `NO_ADAPTER`) is shared taxonomy.
 */
var LlmError = /** @class */ (function (_super) {
    __extends(LlmError, _super);
    /**
     * @param message - non-empty human-readable failure summary.
     * @param code - non-empty stable provider-neutral machine code.
     * @param options - optional cause and validated serializable provider facts.
     */
    function LlmError(message, code, options) {
        var _this = this;
        if (typeof message !== 'string' || message.length === 0)
            throw new Error('LlmError message must be a non-empty string');
        if (typeof code !== 'string' || code.length === 0)
            throw new Error('LlmError code must be a non-empty string');
        if ((options === null || options === void 0 ? void 0 : options.status) !== undefined
            && (!Number.isInteger(options.status) || options.status < 100 || options.status > 599)) {
            throw new Error('LlmError status must be an integer from 100 through 599');
        }
        if ((options === null || options === void 0 ? void 0 : options.providerRetryAfterMs) !== undefined
            && (!Number.isFinite(options.providerRetryAfterMs) || options.providerRetryAfterMs <= 0)) {
            throw new Error('LlmError providerRetryAfterMs must be a positive finite number');
        }
        if ((options === null || options === void 0 ? void 0 : options.requestId) !== undefined
            && (typeof options.requestId !== 'string' || options.requestId.length === 0)) {
            throw new Error('LlmError requestId must be a non-empty string');
        }
        _this = _super.call(this, message, code, options) || this;
        _this.name = 'LlmError';
        _this.failure = Object.freeze(__assign(__assign(__assign({ message: message, code: code }, (options === null || options === void 0 ? void 0 : options.status) === undefined ? {} : { status: options.status }), (options === null || options === void 0 ? void 0 : options.providerRetryAfterMs) === undefined ? {} : { providerRetryAfterMs: options.providerRetryAfterMs }), (options === null || options === void 0 ? void 0 : options.requestId) === undefined ? {} : { requestId: options.requestId }));
        return _this;
    }
    return LlmError;
}(error_ts_1.HarnessError));
exports.LlmError = LlmError;
/**
 * Accept one supplied credential, or refuse it as unusable.
 *
 * A stored key arrives from the credentials seam, a `.env` line, or a shell
 * export, all of which pick up surrounding whitespace, so trimming is silent.
 * Anything else fails here rather than inside `fetch`, whose ByteString
 * refusal names a UTF-16 code point instead of the setting to change. The key
 * never enters the message: `ref` names where to fix it, and echoing any part
 * of a secret into a log or a UI is the failure this diagnosis avoids.
 *
 * Lives beside {@link LlmError} rather than in `./api-key.ts` so the predicate
 * module stays dependency-free; both adapters share this one diagnosis instead
 * of keeping near-identical local copies.
 * @param raw - the credential exactly as supplied.
 * @param pkg - the refusing package name, prefixed to the diagnostic.
 * @param ref - the credential reference the value resolved through.
 * @returns the trimmed, usable key.
 */
function assertUsableApiKey(raw, pkg, ref) {
    var checked = (0, api_key_ts_1.normalizeApiKey)(raw);
    if (checked.ok)
        return checked.value;
    // The Models page is named as the writer it usually is, not as the only one:
    // the same value can arrive from a hand-edited .env or a shell export in a
    // composition that mounts no credentials seam at all, where directing the
    // user to a page that deployment does not serve would be a dead end.
    throw new LlmError(checked.reason === 'empty'
        ? "".concat(pkg, ": the API key resolved from ").concat(ref, " is blank; set ").concat(ref, " to the raw key")
            + ' (the web Models page writes it) or export it in the launching environment'
        : "".concat(pkg, ": the API key resolved from ").concat(ref, " contains characters no HTTP header can carry;")
            + " set ".concat(ref, " to the raw key alone (the web Models page writes it)"), error_ts_1.INVALID_CREDENTIAL_CODE);
}
/**
 * Provider-wire adapter for the harness message and stream vocabulary. Register implementations
 * with `ctx.llm.registerAdapter(providers, adapter)`. Every provider HTTP request must include
 * `attributionHeaders()`; prove the headers are added in the wire request or library header hook. The direct-fetch
 * DeepSeek and library-backed pi-ai adapters meet this contract through different internals.
 */
var LlmAdapter = /** @class */ (function () {
    function LlmAdapter() {
    }
    /**
     * Describe one provider route owned by this adapter.
     * @param provider - a route passed to `registerAdapter()` for this instance.
     * @returns detached display metadata whose id must equal `provider`.
     */
    LlmAdapter.prototype.providerInfo = function (provider) {
        return { id: provider, name: provider };
    };
    /**
     * Return the provider-owned retry policy captured with this route.
     * @param _provider - a route passed to `registerAdapter()` for this instance.
     * @returns a resolved policy, or `undefined` to use the normal defaults.
     */
    LlmAdapter.prototype.providerRetryPolicy = function (_provider) {
        return undefined;
    };
    /**
     * List models this adapter can currently advertise for one owned provider.
     * The result is advisory: an adapter may accept unlisted model ids, and
     * consumers must not turn absence into request rejection.
     * @param _provider - one provider route owned by this adapter.
     * @returns discoverable models in adapter-preferred order.
     */
    LlmAdapter.prototype.listModels = function (_provider) {
        return Promise.resolve([]);
    };
    /**
     * Resolve all metadata available for one exact model. This query is
     * independent of the advisory catalog and does not validate request routing.
     * @param provider - one provider route owned by this adapter.
     * @param model - exact model id passed to {@link GenerateOptions.model}.
     * @param _signal - cancellation for this exact-model lookup; asynchronous
     *   implementations must settle promptly after it aborts.
     * @returns provider/model identity plus any context, call-default, and reasoning metadata.
     */
    LlmAdapter.prototype.resolveModel = function (provider, model, _signal) {
        return Promise.resolve({ provider: provider, id: model, name: model });
    };
    /**
     * Bind exact model metadata and the eventual request dispatch to one adapter generation.
     * Dynamic adapters override this so settings changes between preparation and
     * dispatch cannot combine one generation's capabilities with another's endpoint.
     * @param provider - registered provider route.
     * @param model - exact model id.
     * @param signal - cancellation for model resolution.
     * @returns model metadata and a one-generation stream entry point.
     */
    LlmAdapter.prototype.prepareCall = function (provider, model, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = {};
                        return [4 /*yield*/, this.resolveModel(provider, model, signal)];
                    case 1: return [2 /*return*/, (_a.model = _b.sent(),
                            _a.stream = function (options) { return _this.stream(options); },
                            _a)];
                }
            });
        });
    };
    return LlmAdapter;
}());
exports.LlmAdapter = LlmAdapter;
/**
 * The abstract `llm` service: an adapter registry plus a streaming model-call
 * API, interceptable via the `llm/stream` waterfall.
 */
var LlmRuntime = /** @class */ (function (_super) {
    __extends(LlmRuntime, _super);
    function LlmRuntime(ctx) {
        var _this = _super.call(this, ctx, 'llm') || this;
        _this.adapters = new Map();
        _this.directory = new Map();
        _this.discoveries = new Map();
        return _this;
    }
    /** Notify topology observers without letting one broken listener veto the commit. */
    LlmRuntime.prototype.emitAdaptersUpdated = function () {
        var _this = this;
        // Cordis emit uses Array.map: one synchronous throw starves later
        // listeners. Registry notifications are non-vetoing, so contain each
        // callback independently; INVARIANT-coded failures still surface.
        var invariantFailure;
        for (var _i = 0, _a = this.ctx.events.dispatch('emit', ['llm/adapters-updated']); _i < _a.length; _i++) {
            var listener = _a[_i];
            try {
                var returned = listener();
                if (returned != null && typeof returned.then === 'function') {
                    // An emit listener may still be an async function; its rejection
                    // cannot reach the synchronous INVARIANT rethrow below, so it is
                    // contained here instead of becoming an unhandled rejection.
                    void Promise.resolve(returned).then(undefined, function (error) {
                        _this.warnAdaptersListenerFailure(error);
                    });
                }
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 'INVARIANT') {
                    invariantFailure !== null && invariantFailure !== void 0 ? invariantFailure : (invariantFailure = error);
                    continue;
                }
                this.warnAdaptersListenerFailure(error);
            }
        }
        if (invariantFailure !== undefined)
            throw invariantFailure;
    };
    /** Contained-listener diagnostic shared by the sync and async failure paths. */
    LlmRuntime.prototype.warnAdaptersListenerFailure = function (error) {
        this.ctx.logger.warn('llm: an llm/adapters-updated listener failed');
        this.ctx.logger.warn(error);
    };
    /**
     * Register an adapter for the given provider routes. Throws `LlmError` with code
     * `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
     * Disposed with the fiber.
     * @param providers - every provider route this adapter should serve.
     * @param adapter - the adapter that streams calls for those providers.
     * @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
     */
    LlmRuntime.prototype.registerAdapter = function (providers, adapter) {
        var _this = this;
        // The routes this registration currently holds; `replace` rewrites it, and
        // the disposer releases whatever it holds at disposal time.
        var owned = new Set();
        // The disposer has run: `owned` being empty cannot say so on its own,
        // because `replace([])` legally leaves a live registration holding none.
        var released = false;
        var dispose = this.ctx.effect(function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (providers.length === 0)
                            throw new LlmError('an adapter must register at least one provider', 'INVALID_ADAPTER');
                        this.commitRoutes(owned, this.prepareRoutes(providers, adapter, owned));
                        return [4 /*yield*/, function () {
                                released = true;
                                for (var _i = 0, owned_1 = owned; _i < owned_1.length; _i++) {
                                    var provider = owned_1[_i];
                                    _this.adapters.delete(provider);
                                }
                                owned.clear();
                                _this.emitAdaptersUpdated();
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'llm.registerAdapter()');
        // ctx.effect's disposer returns Promise<void>; our disposer API is
        // synchronous fire-and-forget — discard the (always-resolved) promise.
        var handle = (function () { return void dispose(); });
        handle.replace = function (next) {
            // Registering here would leak: the effect's disposer already ran, so
            // nothing remains to release whatever this call would put in the map.
            if (released) {
                throw new LlmError('a disposed adapter registration cannot replace its routes', 'REGISTRATION_DISPOSED');
            }
            _this.commitRoutes(owned, _this.prepareRoutes(next, adapter, owned));
        };
        return handle;
    };
    /**
     * Validate one candidate route set for `adapter`, treating routes this
     * registration already holds as available. Nothing is mutated: a rejected
     * candidate leaves the registry exactly as it was.
     */
    LlmRuntime.prototype.prepareRoutes = function (providers, adapter, owned) {
        var _a;
        var unique = new Set();
        var registrations = [];
        for (var _i = 0, providers_1 = providers; _i < providers_1.length; _i++) {
            var provider = providers_1[_i];
            if (provider.length === 0)
                throw new LlmError('adapter provider names must be non-empty', 'INVALID_ADAPTER');
            if (unique.has(provider) || (this.adapters.has(provider) && !owned.has(provider))) {
                throw new LlmError("an adapter for provider \"".concat(provider, "\" is already registered"), 'DUPLICATE_ADAPTER');
            }
            var info = adapter.providerInfo(provider);
            if (typeof info.id !== 'string' || info.id !== provider || typeof info.name !== 'string' || info.name.length === 0) {
                throw new LlmError("adapter metadata for provider \"".concat(provider, "\" must preserve its id and have a non-empty name"), 'INVALID_ADAPTER');
            }
            unique.add(provider);
            var retryPolicy = (_a = adapter.providerRetryPolicy(provider)) !== null && _a !== void 0 ? _a : (0, retry_policy_ts_1.resolveRetryPolicy)(undefined, "llm: provider \"".concat(provider, "\" retryPolicy"));
            registrations.push({
                adapter: adapter,
                provider: { id: info.id, name: info.name },
                retryPolicy: retryPolicy,
            });
        }
        return registrations;
    };
    /**
     * Swap this registration's routes for the prepared ones in one synchronous
     * section, so no observer can see the registry between the release and the
     * re-registration. The route set's one mutation point is also where
     * `llm/adapters-updated` is published, so a `replace` announces itself
     * exactly like a first registration.
     */
    LlmRuntime.prototype.commitRoutes = function (owned, registrations) {
        for (var _i = 0, owned_2 = owned; _i < owned_2.length; _i++) {
            var provider = owned_2[_i];
            this.adapters.delete(provider);
        }
        owned.clear();
        for (var _a = 0, registrations_1 = registrations; _a < registrations_1.length; _a++) {
            var registration = registrations_1[_a];
            this.adapters.set(registration.provider.id, registration);
            owned.add(registration.provider.id);
        }
        this.emitAdaptersUpdated();
    };
    /**
     * Describe provider routes with a registered adapter.
     * @returns detached provider metadata in registration order.
     */
    LlmRuntime.prototype.listProviders = function () {
        return __spreadArray([], this.adapters.values(), true).map(function (_a) {
            var provider = _a.provider;
            return (__assign({}, provider));
        });
    };
    /**
     * Declare provider routes an adapter plugin can activate through
     * configuration. Registration is all-or-nothing: an empty list, invalid
     * entry, or a provider already declared by any registration throws
     * `LlmError` without registering the rest. Disposed with the fiber.
     * @param entries - every configurable provider this plugin owns.
     * @returns a handle that withdraws all of them, and can atomically replace them.
     */
    LlmRuntime.prototype.registerConfigurableProviders = function (entries) {
        var _this = this;
        var held = [];
        var disposed = false;
        /**
         * Validate a candidate set in full against everything this registration
         * does not already hold, then publish it. Nothing is written until the
         * whole set passes, so a refused candidate leaves the current entries in
         * place — the property that makes `replace` a swap rather than a
         * delete-then-add that can strand the directory empty.
         */
        var commit = function (candidates) {
            var detached = [];
            var own = new Set(held.map(function (entry) { return entry.provider; }));
            var _loop_1 = function (entry) {
                if (entry.provider.length === 0 || entry.displayName.length === 0 || entry.settingsNs.length === 0) {
                    throw new LlmError('configurable providers need a non-empty provider, displayName, and settingsNs', 'INVALID_DIRECTORY');
                }
                if (entry.settingsPath.some(function (segment) { return segment.length === 0; })) {
                    throw new LlmError("configurable provider \"".concat(entry.provider, "\" has an empty settingsPath segment"), 'INVALID_DIRECTORY');
                }
                if ((_this.directory.has(entry.provider) && !own.has(entry.provider))
                    || detached.some(function (seen) { return seen.provider === entry.provider; })) {
                    throw new LlmError("configurable provider \"".concat(entry.provider, "\" is already declared"), 'DUPLICATE_DIRECTORY');
                }
                detached.push(__assign(__assign({}, entry), { settingsPath: __spreadArray([], entry.settingsPath, true) }));
            };
            for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
                var entry = candidates_1[_i];
                _loop_1(entry);
            }
            for (var _a = 0, held_1 = held; _a < held_1.length; _a++) {
                var entry = held_1[_a];
                _this.directory.delete(entry.provider);
            }
            for (var _b = 0, detached_1 = detached; _b < detached_1.length; _b++) {
                var entry = detached_1[_b];
                _this.directory.set(entry.provider, entry);
            }
            held = detached;
            _this.emitAdaptersUpdated();
        };
        var dispose = this.ctx.effect(function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (entries.length === 0) {
                            throw new LlmError('a configurable-provider registration must declare at least one provider', 'INVALID_DIRECTORY');
                        }
                        commit(entries);
                        return [4 /*yield*/, function () {
                                disposed = true;
                                for (var _i = 0, held_2 = held; _i < held_2.length; _i++) {
                                    var entry = held_2[_i];
                                    _this.directory.delete(entry.provider);
                                }
                                held = [];
                                _this.emitAdaptersUpdated();
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'llm.registerConfigurableProviders()');
        var handle = (function () { return void dispose(); });
        handle.replace = function (next) {
            if (disposed) {
                throw new LlmError('this configurable-provider registration was disposed', 'REGISTRATION_DISPOSED');
            }
            commit(next);
        };
        return handle;
    };
    /**
     * List every declared configurable provider, registered or dormant.
     * @returns detached directory entries in declaration order.
     */
    LlmRuntime.prototype.listConfigurableProviders = function () {
        return __spreadArray([], this.directory.values(), true).map(function (entry) { return (__assign(__assign({}, entry), { settingsPath: __spreadArray([], entry.settingsPath, true) })); });
    };
    /**
     * Offer to interrogate provider endpoints on behalf of the settings
     * namespace this plugin owns. The namespace is the key because that is what
     * a configuration surface already holds from the configurable-provider
     * directory, and because a provider being *added* has no route to name yet.
     * Disposed with the fiber.
     * @param settingsNs - the namespace whose profiles this discovery serves.
     * @param discover - interrogates one endpoint; must honor `request.signal`.
     * @returns the disposer that withdraws the offer.
     */
    LlmRuntime.prototype.registerModelDiscovery = function (settingsNs, discover) {
        var dispose = this.ctx.effect(function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (settingsNs.length === 0) {
                            throw new LlmError('model discovery needs a non-empty settings namespace', 'INVALID_DISCOVERY');
                        }
                        if (this.discoveries.has(settingsNs)) {
                            throw new LlmError("model discovery for \"".concat(settingsNs, "\" is already registered"), 'DUPLICATE_DISCOVERY');
                        }
                        this.discoveries.set(settingsNs, discover);
                        return [4 /*yield*/, function () {
                                _this.discoveries.delete(settingsNs);
                            }];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }.bind(this), 'llm.registerModelDiscovery()');
        return function () { return void dispose(); };
    };
    /**
     * Interrogate one provider endpoint for the models it advertises. The
     * request describes a draft, not a stored route, so nothing here reads or
     * writes settings or credentials — the caller owns both, and the reply is
     * candidate metadata a surface may offer for adoption.
     * @param settingsNs - namespace whose registered discovery serves this draft.
     * @param request - the endpoint, protocol, and one-shot credential to use.
     * @returns the advertised models, deduplicated in endpoint order.
     */
    LlmRuntime.prototype.discoverModels = function (settingsNs, request) {
        return __awaiter(this, void 0, void 0, function () {
            var discover, discovered, seen, models, _i, discovered_1, model;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        discover = this.discoveries.get(settingsNs);
                        if (discover === undefined) {
                            throw new LlmError("no model discovery is registered for \"".concat(settingsNs, "\""), 'NO_DISCOVERY');
                        }
                        // One of the two identifies what to describe: a route the adapter knows, or
                        // an endpoint to ask. Neither leaves nothing to answer about.
                        if (((_a = request.provider) !== null && _a !== void 0 ? _a : '').length === 0 && ((_b = request.baseURL) !== null && _b !== void 0 ? _b : '').length === 0) {
                            throw new LlmError('model discovery needs a provider route or a baseURL', 'INVALID_DISCOVERY');
                        }
                        return [4 /*yield*/, discover(request)];
                    case 1:
                        discovered = _c.sent();
                        seen = new Set();
                        models = [];
                        for (_i = 0, discovered_1 = discovered; _i < discovered_1.length; _i++) {
                            model = discovered_1[_i];
                            if (typeof model.id !== 'string' || model.id.length === 0 || seen.has(model.id))
                                continue;
                            seen.add(model.id);
                            models.push(__assign(__assign(__assign({ id: model.id }, model.name === undefined ? {} : { name: model.name }), model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }), model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens }));
                        }
                        return [2 /*return*/, models];
                }
            });
        });
    };
    /**
     * Resolve the retry policy captured when one provider route was registered.
     * @param provider - registered provider route to inspect.
     * @returns the provider-owned policy, with normal defaults already resolved.
     */
    LlmRuntime.prototype.providerRetryPolicy = function (provider) {
        return this.registration(provider).retryPolicy;
    };
    /** Detach typed adapter-owned modality metadata. */
    LlmRuntime.prototype.detachedModalities = function (modalities) {
        return modalities === undefined ? undefined : __spreadArray([], modalities, true);
    };
    /**
     * Discover models advertised by one registered provider. Catalog membership
     * is advisory and never changes routing or request validation.
     * @param provider - registered provider route to inspect.
     * @returns detached model metadata in adapter-preferred order.
     */
    LlmRuntime.prototype.listModels = function (provider) {
        return __awaiter(this, void 0, void 0, function () {
            var adapter, models, seen;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        adapter = this.registration(provider).adapter;
                        return [4 /*yield*/, adapter.listModels(provider)];
                    case 1:
                        models = _a.sent();
                        seen = new Set();
                        return [2 /*return*/, models.map(function (model) {
                                if (typeof model.provider !== 'string'
                                    || model.provider !== provider
                                    || typeof model.id !== 'string'
                                    || model.id.length === 0
                                    || typeof model.name !== 'string'
                                    || model.name.length === 0
                                    || (model.description !== undefined && typeof model.description !== 'string')
                                    || seen.has(model.id)) {
                                    throw new LlmError("adapter returned invalid or duplicate model metadata for provider \"".concat(provider, "\""), 'INVALID_CATALOG');
                                }
                                seen.add(model.id);
                                var inputModalities = _this.detachedModalities(model.inputModalities);
                                return __assign(__assign({ provider: model.provider, id: model.id, name: model.name }, model.description === undefined ? {} : { description: model.description }), inputModalities === undefined ? {} : { inputModalities: inputModalities });
                            })];
                }
            });
        });
    };
    /**
     * Resolve and validate all metadata from the adapter that owns one exact
     * route. The result is detached from adapter-owned objects; catalog
     * membership remains advisory and does not control request routing.
     * @param provider - registered provider route to inspect.
     * @param model - exact model id passed to the adapter.
     * @param signal - optional cancellation for adapter-owned asynchronous lookup.
     * @returns exact model identity plus available context and reasoning metadata.
     */
    LlmRuntime.prototype.resolveModelInfo = function (provider, model, signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.resolveModelInfoFor(this.registration(provider), model, signal)];
            });
        });
    };
    LlmRuntime.prototype.resolveModelInfoFor = function (registration, model, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var resolved;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, registration.adapter.resolveModel(registration.provider.id, model, signal)];
                    case 1:
                        resolved = _a.sent();
                        return [2 /*return*/, this.normalizeModelInfo(registration, model, resolved)];
                }
            });
        });
    };
    /** Validate and detach one adapter-returned exact model result. */
    LlmRuntime.prototype.normalizeModelInfo = function (registration, model, resolved) {
        var provider = registration.provider.id;
        if (typeof resolved.provider !== 'string'
            || resolved.provider !== provider
            || typeof resolved.id !== 'string'
            || resolved.id !== model
            || typeof resolved.name !== 'string'
            || resolved.name.length === 0
            || (resolved.description !== undefined && typeof resolved.description !== 'string')) {
            throw new LlmError("adapter returned invalid exact model metadata for provider \"".concat(provider, "\" model \"").concat(model, "\""), 'INVALID_MODEL_INFO');
        }
        var context = resolved.context;
        if (context !== undefined && (!Number.isInteger(context.contextWindow) || context.contextWindow <= 0)) {
            throw new LlmError("adapter returned invalid context metadata for provider \"".concat(provider, "\" model \"").concat(model, "\""), 'INVALID_MODEL_CONTEXT');
        }
        // Capability metadata rides through: an explicit modality omission is
        // negative capability downstream preflights act on (image admission).
        var inputModalities = this.detachedModalities(resolved.inputModalities);
        var defaultMaxTokens = resolved.defaultMaxTokens;
        if (defaultMaxTokens !== undefined
            && (!Number.isSafeInteger(defaultMaxTokens) || defaultMaxTokens <= 0)) {
            throw new LlmError("adapter returned invalid default maxTokens for provider \"".concat(provider, "\" model \"").concat(model, "\""), 'INVALID_MODEL_MAX_TOKENS');
        }
        var info = __assign(__assign(__assign(__assign({ provider: provider, id: model, name: resolved.name }, resolved.description === undefined ? {} : { description: resolved.description }), inputModalities === undefined ? {} : { inputModalities: inputModalities }), context === undefined ? {} : { context: { contextWindow: context.contextWindow } }), defaultMaxTokens === undefined ? {} : { defaultMaxTokens: defaultMaxTokens });
        var reasoning = resolved.reasoning;
        if (reasoning === undefined)
            return info;
        if (reasoning.efforts.length === 0) {
            throw new LlmError("adapter returned invalid reasoning metadata for provider \"".concat(provider, "\" model \"").concat(model, "\""), 'INVALID_MODEL_REASONING');
        }
        var seen = new Set();
        var efforts = reasoning.efforts.map(function (effort) {
            if (typeof effort.id !== 'string'
                || effort.id.length === 0
                || typeof effort.name !== 'string'
                || effort.name.length === 0
                || (effort.description !== undefined && typeof effort.description !== 'string')
                || seen.has(effort.id)) {
                throw new LlmError("adapter returned invalid or duplicate reasoning effort metadata for provider \"".concat(provider, "\" model \"").concat(model, "\""), 'INVALID_MODEL_REASONING');
            }
            seen.add(effort.id);
            return __assign({ id: effort.id, name: effort.name }, effort.description === undefined ? {} : { description: effort.description });
        });
        if (reasoning.defaultEffort !== undefined && !seen.has(reasoning.defaultEffort)) {
            throw new LlmError("adapter returned an unknown default reasoning effort for provider \"".concat(provider, "\" model \"").concat(model, "\""), 'INVALID_MODEL_REASONING');
        }
        return __assign(__assign({}, info), { reasoning: __assign({ efforts: efforts }, reasoning.defaultEffort === undefined ? {} : { defaultEffort: reasoning.defaultEffort }) });
    };
    /**
     * Validate a conversation call config against its exact model capability and
     * materialize adapter-configured defaults. Unsupported explicit efforts
     * reject before provider I/O; no clamping or aliasing is performed. This
     * standalone query does not bind a later dispatch; use {@link prepareCall}
     * when logging and streaming must share one adapter registration.
     * @param config - provider/model route and optional request controls.
     * @param signal - optional cancellation for adapter-owned capability lookup.
     * @returns a detached config only when a default must be materialized.
     */
    LlmRuntime.prototype.resolveCallConfig = function (config, signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.resolveCallFor(this.registration(config.provider), config, signal)];
                    case 1: return [2 /*return*/, (_a.sent()).config];
                }
            });
        });
    };
    LlmRuntime.prototype.resolveCallFor = function (registration, config, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var info;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.resolveModelInfoFor(registration, config.model, signal)];
                    case 1:
                        info = _a.sent();
                        return [2 /*return*/, this.resolveCallWithInfo(config, info)];
                }
            });
        });
    };
    /** Validate request controls against one already-bound exact model result. */
    LlmRuntime.prototype.resolveCallWithInfo = function (config, info) {
        var defaulted = config.maxTokens === undefined && info.defaultMaxTokens !== undefined
            ? __assign(__assign({}, config), { maxTokens: info.defaultMaxTokens }) : config;
        var reasoning = info.reasoning;
        var requested = defaulted.reasoningEffort;
        var resolvedConfig = defaulted;
        if (reasoning === undefined) {
            if (requested !== undefined) {
                throw new LlmError("provider \"".concat(config.provider, "\" model \"").concat(config.model, "\" does not support reasoning effort \"").concat(requested, "\""), 'UNSUPPORTED_REASONING_EFFORT');
            }
        }
        else {
            var effective_1 = requested !== null && requested !== void 0 ? requested : reasoning.defaultEffort;
            if (effective_1 !== undefined) {
                if (!reasoning.efforts.some(function (effort) { return effort.id === effective_1; })) {
                    throw new LlmError("provider \"".concat(config.provider, "\" model \"").concat(config.model, "\" does not support reasoning effort \"").concat(effective_1, "\""), 'UNSUPPORTED_REASONING_EFFORT');
                }
                if (requested !== effective_1)
                    resolvedConfig = __assign(__assign({}, defaulted), { reasoningEffort: effective_1 });
            }
        }
        return __assign(__assign({ config: resolvedConfig }, info.context === undefined ? {} : { context: info.context }), { modelInfo: info });
    };
    /**
     * Resolve one call under its current adapter registration. The returned
     * one-shot handle keeps that registration across header logging and dispatch,
     * so HMR cannot combine one adapter's capability result with another adapter.
     * @param config - provider/model route and optional request controls.
     * @param signal - optional cancellation for adapter-owned capability lookup.
     * @returns a prepared config and its registration-bound stream entry point.
     */
    LlmRuntime.prototype.prepareCall = function (config, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var registration, adapterCall, modelInfo, resolved, resolvedConfig, context, adapterDefaults, dispatched;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        registration = this.registration(config.provider);
                        return [4 /*yield*/, registration.adapter.prepareCall(config.provider, config.model, signal)];
                    case 1:
                        adapterCall = _a.sent();
                        modelInfo = this.normalizeModelInfo(registration, config.model, adapterCall.model);
                        resolved = this.resolveCallWithInfo(config, modelInfo);
                        resolvedConfig = (0, call_config_ts_1.deepFreeze)(structuredClone(resolved.config));
                        context = resolved.context === undefined
                            ? undefined
                            : (0, call_config_ts_1.deepFreeze)(structuredClone(resolved.context));
                        adapterDefaults = (0, call_config_ts_1.deepFreeze)(__assign(__assign({}, config.reasoningEffort === undefined && resolvedConfig.reasoningEffort !== undefined
                            ? { reasoningEffort: true }
                            : {}), config.maxTokens === undefined && resolvedConfig.maxTokens !== undefined
                            ? { maxTokens: true }
                            : {}));
                        dispatched = false;
                        return [2 /*return*/, Object.freeze(__assign(__assign(__assign({ config: resolvedConfig, retryPolicy: registration.retryPolicy, adapterDefaults: adapterDefaults }, context === undefined ? {} : { context: context }), modelInfo.inputModalities === undefined
                                ? {}
                                : { inputModalities: Object.freeze(__spreadArray([], modelInfo.inputModalities, true)) }), { stream: function (options) {
                                    if (dispatched) {
                                        throw new LlmError('a prepared LLM call can only be dispatched once', 'INVALID_PREPARED_CALL');
                                    }
                                    if (!(0, call_config_ts_1.callConfigEquals)(options, resolvedConfig)) {
                                        throw new LlmError('prepared LLM call config changed before adapter dispatch', 'INVALID_PREPARED_CALL');
                                    }
                                    dispatched = true;
                                    return _this.streamWithRegistration(options, {
                                        registration: registration,
                                        config: resolvedConfig,
                                        modelInfo: modelInfo,
                                        dispatch: function (options) { return adapterCall.stream(options); },
                                    });
                                } }))];
                }
            });
        });
    };
    LlmRuntime.prototype.registration = function (provider) {
        var registration = this.adapters.get(provider);
        if (!registration)
            throw new LlmError("no adapter registered for provider \"".concat(provider, "\""), 'NO_ADAPTER');
        return registration;
    };
    /** Remove replay state whose historical route is owned by another adapter. */
    LlmRuntime.prototype.forAdapter = function (options, adapter) {
        var _this = this;
        var messages = options.messages.map(function (message) {
            var _a;
            var source = message.source;
            if (message.role !== 'assistant' || source.kind !== 'model' || source.replayState === undefined)
                return message;
            if (((_a = _this.adapters.get(source.provider)) === null || _a === void 0 ? void 0 : _a.adapter) === adapter)
                return message;
            return (0, message_ts_1.freezeMessage)(__assign(__assign({}, message), { source: { kind: 'model', provider: source.provider, model: source.model } }));
        });
        if (messages.every(function (message, index) { return message === options.messages[index]; }))
            return options;
        var filtered = __assign(__assign({}, options), { messages: messages });
        return Object.isFrozen(options) ? (0, call_config_ts_1.deepFreeze)(filtered) : filtered;
    };
    /**
     * Final adapter boundary. Adapter selection, dispatch, iterator construction,
     * and iteration failures become one terminal failure chunk. Middleware and
     * downstream consumer failures remain thrown plugin or consumer errors.
     */
    LlmRuntime.prototype.adapterStream = function (options, prepared) {
        return __asyncGenerator(this, arguments, function adapterStream_1() {
            var iterator, registration, adapter, modelInfo, resolvedConfig, dispatch, adapterCall_1, resolvedOptions, projectedOptions, stream, error_1, completed, item, next, error_2, close_1;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 4, , 8]);
                        registration = (_a = prepared === null || prepared === void 0 ? void 0 : prepared.registration) !== null && _a !== void 0 ? _a : this.registration(options.provider);
                        adapter = registration.adapter;
                        modelInfo = void 0;
                        resolvedConfig = void 0;
                        dispatch = void 0;
                        if (!(prepared === undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, __await(adapter.prepareCall(options.provider, options.model, options.signal))];
                    case 1:
                        adapterCall_1 = _c.sent();
                        modelInfo = this.normalizeModelInfo(registration, options.model, adapterCall_1.model);
                        resolvedConfig = this.resolveCallWithInfo(options, modelInfo).config;
                        dispatch = function (options) { return adapterCall_1.stream(options); };
                        return [3 /*break*/, 3];
                    case 2:
                        modelInfo = prepared.modelInfo;
                        resolvedConfig = prepared.config;
                        dispatch = prepared.dispatch;
                        _c.label = 3;
                    case 3:
                        if (prepared !== undefined && !(0, call_config_ts_1.callConfigEquals)(options, resolvedConfig)) {
                            throw new LlmError('prepared LLM call config changed before adapter dispatch', 'INVALID_PREPARED_CALL');
                        }
                        resolvedOptions = (0, call_config_ts_1.callConfigEquals)(options, resolvedConfig)
                            ? options
                            : Object.isFrozen(options)
                                ? (0, call_config_ts_1.deepFreeze)(__assign(__assign({}, options), resolvedConfig))
                                : __assign(__assign({}, options), resolvedConfig);
                        projectedOptions = modelInfo.inputModalities !== undefined
                            && !modelInfo.inputModalities.includes('image')
                            && resolvedOptions.messages.some(function (message) { return (0, content_ts_1.contentHasImage)(message.content); })
                            ? Object.isFrozen(resolvedOptions)
                                ? (0, call_config_ts_1.deepFreeze)(__assign(__assign({}, resolvedOptions), { messages: (0, content_ts_1.projectImagesForTextModel)(resolvedOptions.messages) }))
                                : __assign(__assign({}, resolvedOptions), { messages: (0, content_ts_1.projectImagesForTextModel)(resolvedOptions.messages) })
                            : resolvedOptions;
                        stream = dispatch(this.forAdapter(projectedOptions, adapter));
                        iterator = stream[Symbol.asyncIterator]();
                        return [3 /*break*/, 8];
                    case 4:
                        error_1 = _c.sent();
                        return [4 /*yield*/, __await(adapterFailureChunk(error_1, options.signal))];
                    case 5: return [4 /*yield*/, _c.sent()];
                    case 6:
                        _c.sent();
                        return [4 /*yield*/, __await(void 0)];
                    case 7: return [2 /*return*/, _c.sent()];
                    case 8:
                        completed = false;
                        _c.label = 9;
                    case 9:
                        _c.trys.push([9, , 23, 26]);
                        _c.label = 10;
                    case 10:
                        if (!true) return [3 /*break*/, 22];
                        item = void 0;
                        _c.label = 11;
                    case 11:
                        _c.trys.push([11, 13, , 17]);
                        return [4 /*yield*/, __await(iterator.next())];
                    case 12:
                        next = _c.sent();
                        item = next.done
                            ? { done: true }
                            : { done: false, value: next.value };
                        return [3 /*break*/, 17];
                    case 13:
                        error_2 = _c.sent();
                        completed = true;
                        return [4 /*yield*/, __await(adapterFailureChunk(error_2, options.signal))];
                    case 14: return [4 /*yield*/, _c.sent()];
                    case 15:
                        _c.sent();
                        return [4 /*yield*/, __await(void 0)];
                    case 16: return [2 /*return*/, _c.sent()];
                    case 17:
                        if (!item.done) return [3 /*break*/, 19];
                        completed = true;
                        return [4 /*yield*/, __await(void 0)];
                    case 18: return [2 /*return*/, _c.sent()];
                    case 19: return [4 /*yield*/, __await(item.value)];
                    case 20: 
                    // End the adapter-owned try before yielding: consumer/middleware
                    // failures resumed into this generator must remain thrown.
                    return [4 /*yield*/, _c.sent()];
                    case 21:
                        // End the adapter-owned try before yielding: consumer/middleware
                        // failures resumed into this generator must remain thrown.
                        _c.sent();
                        return [3 /*break*/, 10];
                    case 22: return [3 /*break*/, 26];
                    case 23:
                        if (!!completed) return [3 /*break*/, 25];
                        close_1 = (_b = iterator.return) === null || _b === void 0 ? void 0 : _b.bind(iterator);
                        if (!close_1) return [3 /*break*/, 25];
                        return [4 /*yield*/, __await(close_1())];
                    case 24:
                        _c.sent();
                        _c.label = 25;
                    case 25: return [7 /*endfinally*/];
                    case 26: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Stream one model call as raw chunks (token-level deltas). Replay state is
     * retained only when the same adapter instance owns its historical provider
     * and the target provider. Final adapter selection remains fixed through
     * asynchronous exact-model resolution and dispatch. Adapter selection,
     * dispatch, and iteration failures become terminal `error` or `aborted`
     * finish chunks; middleware, nested-call, cleanup, and consumer failures
     * remain thrown.
     * @param options - the full request; `options.provider` selects the adapter.
     * @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
     */
    LlmRuntime.prototype.stream = function (options) {
        return this.streamWithRegistration(options);
    };
    LlmRuntime.prototype.streamWithRegistration = function (options, prepared) {
        var _this = this;
        return this.ctx.waterfall(this, 'llm/stream', options, function () { return _this.adapterStream(options, prepared); });
    };
    return LlmRuntime;
}(cordis_1.Service));
exports.LlmRuntime = LlmRuntime;
/** Convert one adapter throw into the stream protocol's terminal outcome. */
function adapterFailureChunk(error, signal) {
    var failure = (0, adapter_failure_ts_1.normalizeLlmFailure)(error);
    return {
        type: 'finish',
        reason: (signal === null || signal === void 0 ? void 0 : signal.aborted) || failure.code === 'ABORTED'
            ? { kind: 'aborted', failure: failure }
            : { kind: 'error', failure: failure },
    };
}
exports.default = LlmRuntime;
