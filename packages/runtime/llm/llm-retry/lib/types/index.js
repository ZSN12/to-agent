"use strict";
/**
 * Provider-routed model-request retry policy on the agent loop's request
 * recovery extension point. Each scheduled retry is durable before its cancellable wait.
 *
 * @module @z/dsh-llm-retry
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
exports.Config = exports.inject = exports.name = exports.RetryId = void 0;
exports.apply = apply;
var node_crypto_1 = require("node:crypto");
var schemastery_1 = require("@z/schemastery");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var brand_ts_1 = require("./brand.ts");
var brand_ts_2 = require("./brand.ts");
Object.defineProperty(exports, "RetryId", { enumerable: true, get: function () { return brand_ts_2.RetryId; } });
exports.name = 'llm-retry';
exports.inject = ['agents'];
/** Runtime schema for {@link Config}. */
exports.Config = schemastery_1.default.object({});
function validateConfig(config) {
    var key = Object.keys(config)[0];
    if (key === undefined)
        return;
    if (key === 'retryPolicy') {
        throw new Error('llm-retry: retryPolicy belongs under each provider configuration');
    }
    throw new Error("llm-retry: unknown key \"".concat(key, "\""));
}
var TASKWEAVER_MAX_PROVIDER_RETRIES = 3;
var TASKWEAVER_ALWAYS_RETRY_LIMIT = 1;
var TASKWEAVER_ALWAYS_RETRYABLE_CODES = Object.freeze([
    dsh_llm_1.EMPTY_RESPONSE_CODE,
    'RATE_LIMIT',
    'SERVER',
    'TRANSPORT',
]);
function taskweaverBoundedPolicy(policy) {
    var retryableCodes = policy.mode === 'always'
        ? __spreadArray([], TASKWEAVER_ALWAYS_RETRYABLE_CODES, true) : policy.retryableCodes.filter(function (code) { return code !== 'TIMEOUT'; });
    return {
        mode: 'normal',
        maxRetries: policy.mode === 'always'
            ? TASKWEAVER_ALWAYS_RETRY_LIMIT
            : Math.min(policy.maxRetries, TASKWEAVER_MAX_PROVIDER_RETRIES),
        retryableCodes: retryableCodes,
        initialDelayMs: policy.initialDelayMs,
        maxDelayMs: policy.maxDelayMs,
        jitterRatio: policy.jitterRatio,
    };
}
function settleDownstream(next) {
    return __awaiter(this, void 0, void 0, function () {
        var error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    _a = { type: 'decision' };
                    return [4 /*yield*/, next()];
                case 1: return [2 /*return*/, (_a.decision = _b.sent(), _a)];
                case 2:
                    error_1 = _b.sent();
                    return [2 /*return*/, { type: 'error', error: error_1 }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function localDelay(config, retry, random) {
    var exponent = Math.min(retry - 1, 1024);
    var exponential = Math.min(config.initialDelayMs * Math.pow(2, exponent), config.maxDelayMs);
    var jitter = 1 - config.jitterRatio + 2 * config.jitterRatio * random();
    return Math.min(exponential * jitter, config.maxDelayMs);
}
function retryPolicyKey(policy) {
    return policy.mode === 'always'
        ? JSON.stringify([policy.mode, policy.initialDelayMs, policy.maxDelayMs, policy.jitterRatio])
        : JSON.stringify([
            policy.mode,
            policy.maxRetries,
            __spreadArray([], policy.retryableCodes, true).sort(),
            policy.initialDelayMs,
            policy.maxDelayMs,
            policy.jitterRatio,
        ]);
}
function cancellableDelay(delayMs, signal) {
    if (signal.aborted)
        return Promise.resolve(false);
    return new Promise(function (resolve) {
        var timer = setTimeout(function () {
            signal.removeEventListener('abort', onAbort);
            resolve(true);
        }, delayMs);
        function onAbort() {
            clearTimeout(timer);
            resolve(false);
        }
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
/**
 * Install provider-routed normal or unbounded request recovery.
 * @param ctx - plugin context that owns the listener and active waits.
 * @param config - empty executor config; provider registrations own policy.
 * @param internals - non-serializable deterministic hooks for tests.
 */
function apply(ctx, config, internals) {
    var _this = this;
    var _a, _b;
    if (config === void 0) { config = {}; }
    if (internals === void 0) { internals = {}; }
    validateConfig(config);
    var random = (_a = internals.random) !== null && _a !== void 0 ? _a : Math.random;
    var taskweaverEmbedded = (_b = internals.taskweaverEmbedded) !== null && _b !== void 0 ? _b : (0, dsh_home_paths_1.taskweaverEmbeddedFromEnv)();
    var lifetime = new AbortController();
    var active = new Set();
    function track(operation) {
        var tracked = operation.finally(function () { return active.delete(tracked); });
        active.add(tracked);
        return tracked;
    }
    function backoff(agent, turn, step, failure, provider, policy, policyKey, retry, retryId, delayMs, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var fusedSignal, eventData;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fusedSignal = AbortSignal.any([signal, lifetime.signal]);
                        if (fusedSignal.aborted)
                            return [2 /*return*/];
                        eventData = policy.mode === 'normal'
                            ? {
                                retryId: retryId,
                                turn: turn,
                                step: step,
                                provider: provider,
                                mode: policy.mode,
                                policyKey: policyKey,
                                retry: retry,
                                maxRetries: policy.maxRetries,
                                delayMs: delayMs,
                                failure: failure,
                            }
                            : {
                                retryId: retryId,
                                turn: turn,
                                step: step,
                                provider: provider,
                                mode: policy.mode,
                                policyKey: policyKey,
                                retry: retry,
                                delayMs: delayMs,
                                failure: failure,
                            };
                        agent.session.append('llm/retry', eventData);
                        return [4 /*yield*/, cancellableDelay(delayMs, fusedSignal)];
                    case 1:
                        if (!(_a.sent()))
                            return [2 /*return*/];
                        agent.session.append('llm/retry-started', { retryId: retryId, turn: turn, step: step, retry: retry });
                        return [2 /*return*/, { kind: 'retry' }];
                }
            });
        });
    }
    function recover(_a, next_1) {
        return __awaiter(this, arguments, void 0, function (_b, next) {
            var policy, fusedSignal, downstream, policyKey, priorPolicyRetry, previousRetry, retry, retryId, delayMs;
            var _c, _d, _e;
            var agent = _b.agent, turn = _b.turn, step = _b.step, provider = _b.provider, failure = _b.failure, registeredPolicy = _b.retryPolicy, signal = _b.signal;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        if (registeredPolicy === undefined)
                            return [2 /*return*/, next()
                                // DSH keeps its provider-owned policy semantics. TaskWeaver embeds the same
                                // Host but must never let an imported/user `always` policy create an
                                // unbounded billable retry loop. This central clamp also covers native
                                // providers that do not pass through TaskWeaver's models.json mapper.
                            ];
                        policy = taskweaverEmbedded
                            ? taskweaverBoundedPolicy(registeredPolicy)
                            : registeredPolicy;
                        if (!(policy.mode === 'always')) return [3 /*break*/, 2];
                        if (signal.aborted || lifetime.signal.aborted)
                            return [2 /*return*/];
                        fusedSignal = AbortSignal.any([signal, lifetime.signal]);
                        return [4 /*yield*/, settleDownstream(next)];
                    case 1:
                        downstream = _f.sent();
                        if (fusedSignal.aborted)
                            return [2 /*return*/];
                        if (downstream.type === 'error') {
                            ctx.logger.warn("llm-retry: provider \"".concat(provider, "\" always policy ignored a downstream recovery failure: %o"), downstream.error);
                        }
                        if (downstream.type === 'decision' && ((_c = downstream.decision) === null || _c === void 0 ? void 0 : _c.kind) === 'retry') {
                            return [2 /*return*/, downstream.decision];
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        if (!policy.retryableCodes.includes(failure.code)) {
                            return [2 /*return*/, next()];
                        }
                        _f.label = 3;
                    case 3:
                        policyKey = retryPolicyKey(policy);
                        priorPolicyRetry = agent.session.events.findLast(function (event) {
                            return event.type === 'llm/retry'
                                && event.data.turn === turn
                                && event.data.step === step
                                && event.data.provider === provider
                                && event.data.policyKey === policyKey;
                        });
                        previousRetry = (_d = priorPolicyRetry === null || priorPolicyRetry === void 0 ? void 0 : priorPolicyRetry.data.retry) !== null && _d !== void 0 ? _d : 0;
                        if (policy.mode === 'normal' && previousRetry >= policy.maxRetries)
                            return [2 /*return*/, next()];
                        retry = previousRetry + 1;
                        retryId = (_e = priorPolicyRetry === null || priorPolicyRetry === void 0 ? void 0 : priorPolicyRetry.data.retryId) !== null && _e !== void 0 ? _e : (0, brand_ts_1.RetryId)((0, node_crypto_1.randomUUID)());
                        if (failure.providerRetryAfterMs !== undefined
                            && Number.isFinite(failure.providerRetryAfterMs)
                            && failure.providerRetryAfterMs > 0) {
                            if (failure.providerRetryAfterMs > policy.maxDelayMs) {
                                if (policy.mode === 'normal')
                                    return [2 /*return*/, next()];
                                delayMs = localDelay(policy, retry, random);
                            }
                            else {
                                delayMs = failure.providerRetryAfterMs;
                            }
                        }
                        else {
                            delayMs = localDelay(policy, retry, random);
                        }
                        return [2 /*return*/, backoff(agent, turn, step, failure, provider, policy, policyKey, retry, retryId, delayMs, signal)];
                }
            });
        });
    }
    var disposeListener = ctx.on('agent/request-error', function (payload, next) {
        // A waterfall may have captured this callback before its registration was
        // removed. Lifetime cancellation must prevent that stale callback from
        // entering a downstream policy after disposal.
        if (lifetime.signal.aborted)
            return Promise.resolve(undefined);
        return track(recover(payload, next));
    });
    ctx.effect(function () { return function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    disposeListener();
                    lifetime.abort(new Error('llm-retry plugin disposed'));
                    return [4 /*yield*/, Promise.allSettled(__spreadArray([], active, true))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); }; }, 'llm-retry: abort and drain active recovery');
}
