"use strict";
/**
 * Provider-owned request-retry policy configuration and resolution.
 *
 * Adapters expose one resolved policy per registered provider route; the
 * optional dsh-llm-retry plugin executes it on the agent's failed-step extension point.
 *
 * @module @z/dsh-llm/retry-policy
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
exports.RetryPolicySchema = void 0;
exports.resolveRetryPolicy = resolveRetryPolicy;
var schemastery_1 = require("@z/schemastery");
var dsh_timeout_1 = require("@z/dsh-timeout");
var error_ts_1 = require("./error.ts");
var DEFAULT_MAX_RETRIES = 5;
var DEFAULT_INITIAL_DELAY_MS = 500;
var DEFAULT_MAX_DELAY_MS = 10000;
var DEFAULT_JITTER_RATIO = 0.1;
var DEFAULT_RETRYABLE_CODES = Object.freeze([
    error_ts_1.EMPTY_RESPONSE_CODE,
    'RATE_LIMIT',
    'SERVER',
    'TIMEOUT',
    'TRANSPORT',
]);
var backoffSchema = schemastery_1.default.object({
    initialDelayMs: schemastery_1.default.number().max(dsh_timeout_1.MAX_TIMER_DELAY_MS).default(DEFAULT_INITIAL_DELAY_MS),
    maxDelayMs: schemastery_1.default.number().max(dsh_timeout_1.MAX_TIMER_DELAY_MS).default(DEFAULT_MAX_DELAY_MS),
    jitterRatio: schemastery_1.default.number().min(0).max(1).default(DEFAULT_JITTER_RATIO),
});
var normalPolicySchema = schemastery_1.default.object({
    mode: schemastery_1.default.const('normal').required(),
    maxRetries: schemastery_1.default.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_RETRIES),
    retryableCodes: schemastery_1.default.array(schemastery_1.default.string()).default(__spreadArray([], DEFAULT_RETRYABLE_CODES, true)),
    backoff: backoffSchema,
});
var alwaysPolicySchema = schemastery_1.default.object({
    mode: schemastery_1.default.const('always').required(),
    backoff: backoffSchema,
});
/** Cordis schema embedded by each concrete provider configuration. */
exports.RetryPolicySchema = schemastery_1.default.union([
    normalPolicySchema,
    alwaysPolicySchema,
]);
var NORMAL_POLICY_KEYS = new Set([
    'mode', 'maxRetries', 'retryableCodes', 'backoff',
]);
// Layered configuration can retain normal-only fields after switching modes;
// always mode ignores those inactive values while still rejecting unknown keys.
var ALWAYS_POLICY_KEYS = new Set([
    'mode', 'maxRetries', 'retryableCodes', 'backoff',
]);
var BACKOFF_KEYS = new Set(['initialDelayMs', 'maxDelayMs', 'jitterRatio']);
function validateKeys(value, allowed, path) {
    for (var _i = 0, _a = Object.keys(value); _i < _a.length; _i++) {
        var key = _a[_i];
        if (!allowed.has(key))
            throw new Error("".concat(path, ": unknown key \"").concat(key, "\""));
    }
}
function resolveBackoff(config, path) {
    var _a, _b, _c;
    if (config !== undefined)
        validateKeys(config, BACKOFF_KEYS, path);
    var initialDelayMs = (_a = config === null || config === void 0 ? void 0 : config.initialDelayMs) !== null && _a !== void 0 ? _a : DEFAULT_INITIAL_DELAY_MS;
    var maxDelayMs = (_b = config === null || config === void 0 ? void 0 : config.maxDelayMs) !== null && _b !== void 0 ? _b : DEFAULT_MAX_DELAY_MS;
    var jitterRatio = (_c = config === null || config === void 0 ? void 0 : config.jitterRatio) !== null && _c !== void 0 ? _c : DEFAULT_JITTER_RATIO;
    if (!Number.isFinite(initialDelayMs) || initialDelayMs <= 0 || initialDelayMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        throw new Error("".concat(path, ".initialDelayMs must be a positive finite number no greater than ").concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
    if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0 || maxDelayMs > dsh_timeout_1.MAX_TIMER_DELAY_MS) {
        throw new Error("".concat(path, ".maxDelayMs must be a positive finite number no greater than ").concat(dsh_timeout_1.MAX_TIMER_DELAY_MS));
    }
    if (initialDelayMs > maxDelayMs) {
        throw new Error("".concat(path, ".initialDelayMs must be less than or equal to maxDelayMs"));
    }
    if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
        throw new Error("".concat(path, ".jitterRatio must be between 0 and 1"));
    }
    return Object.freeze({ initialDelayMs: initialDelayMs, maxDelayMs: maxDelayMs, jitterRatio: jitterRatio });
}
/**
 * Validate, default, and detach one provider-owned retry policy.
 * @param config - optional provider configuration; omission selects normal defaults.
 * @param path - diagnostic path naming the provider config that owns the value.
 * @returns an immutable policy safe to capture in provider registration state.
 */
function resolveRetryPolicy(config, path) {
    var _a, _b;
    if (config === undefined) {
        return Object.freeze(__assign({ mode: 'normal', maxRetries: DEFAULT_MAX_RETRIES, retryableCodes: DEFAULT_RETRYABLE_CODES }, resolveBackoff(undefined, "".concat(path, ".backoff"))));
    }
    switch (config.mode) {
        case 'normal': {
            validateKeys(config, NORMAL_POLICY_KEYS, path);
            var maxRetries = (_a = config.maxRetries) !== null && _a !== void 0 ? _a : DEFAULT_MAX_RETRIES;
            var retryableCodes = (_b = config.retryableCodes) !== null && _b !== void 0 ? _b : __spreadArray([], DEFAULT_RETRYABLE_CODES, true);
            if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) {
                throw new Error("".concat(path, ".maxRetries must be a non-negative safe integer"));
            }
            if (retryableCodes.length === 0) {
                throw new Error("".concat(path, ".retryableCodes must not be empty"));
            }
            if (retryableCodes.some(function (code) { return typeof code !== 'string' || code.length === 0; })) {
                throw new Error("".concat(path, ".retryableCodes must contain only non-empty strings"));
            }
            if (new Set(retryableCodes).size !== retryableCodes.length) {
                throw new Error("".concat(path, ".retryableCodes must not contain duplicates"));
            }
            return Object.freeze(__assign({ mode: 'normal', maxRetries: maxRetries, retryableCodes: Object.freeze(__spreadArray([], retryableCodes, true)) }, resolveBackoff(config.backoff, "".concat(path, ".backoff"))));
        }
        case 'always':
            validateKeys(config, ALWAYS_POLICY_KEYS, path);
            return Object.freeze(__assign({ mode: 'always' }, resolveBackoff(config.backoff, "".concat(path, ".backoff"))));
        default:
            throw new Error("".concat(path, ".mode must be \"normal\" or \"always\""));
    }
}
