"use strict";
/**
 * Load-time validation and routed-model policy resolution for compaction-basic.
 *
 * @module @z/dsh-compaction-basic/config
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
exports.TargetPressureConfigError = void 0;
exports.resolveConfig = resolveConfig;
exports.resolveTargetPolicy = resolveTargetPolicy;
exports.resolveCompactSpec = resolveCompactSpec;
var dsh_llm_1 = require("@z/dsh-llm");
/** Default request-pressure fraction for every routed model. */
var DEFAULT_THRESHOLD_RATIO = 0.8;
/** Default verbatim-tail fraction for every routed model. */
var DEFAULT_RETAIN_RATIO = 0.16;
/** Fields shared by top-level defaults and exact-target overrides. */
var POLICY_CONFIG_KEYS = [
    'thresholdRatio',
    'retainRatio',
    'retainTokens',
    'summarizationProvider',
    'summarizationModel',
    'maxTokens',
    'compactionRetries',
    'maxOverflowRetries',
];
/** Complete public top-level configuration key set. */
var BASIC_COMPACT_CONFIG_KEYS = new Set(__spreadArray(__spreadArray([], POLICY_CONFIG_KEYS, true), [
    'modelPolicies',
    'auto',
], false));
/** Complete exact-target override key set. */
var MODEL_POLICY_KEYS = new Set(__spreadArray([
    'provider',
    'model'
], POLICY_CONFIG_KEYS, true));
/** Target-specific pressure configuration failure eligible for warning suppression. */
var TargetPressureConfigError = /** @class */ (function (_super) {
    __extends(TargetPressureConfigError, _super);
    /**
     * @param targetKey - exact provider/model route used as the warning key.
     * @param message - actionable configuration failure detail.
     */
    function TargetPressureConfigError(targetKey, message) {
        var _this = _super.call(this, message) || this;
        _this.targetKey = targetKey;
        return _this;
    }
    return TargetPressureConfigError;
}(Error));
exports.TargetPressureConfigError = TargetPressureConfigError;
/**
 * Resolve and validate service defaults plus exact-target partial overrides.
 * @param config - untrusted plugin configuration after Loader normalization.
 * @returns detached immutable defaults and validated exact-target overrides.
 */
function resolveConfig(config) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (config === void 0) { config = {}; }
    validateKeys(config, BASIC_COMPACT_CONFIG_KEYS, 'BasicCompactionConfig');
    validatePolicy(config, 'BasicCompactionConfig');
    if (config.auto !== undefined && typeof config.auto !== 'boolean') {
        throw new Error('BasicCompactionConfig: auto must be a boolean');
    }
    var thresholdRatio = (_a = config.thresholdRatio) !== null && _a !== void 0 ? _a : DEFAULT_THRESHOLD_RATIO;
    var retention = resolveRetention(config, { retainRatio: DEFAULT_RETAIN_RATIO });
    validateRatioRetention(thresholdRatio, retention, 'BasicCompactionConfig');
    var modelPolicies = resolveModelPolicies(config.modelPolicies);
    for (var _i = 0, _j = modelPolicies.entries(); _i < _j.length; _i++) {
        var _k = _j[_i], index = _k[0], policy = _k[1];
        validateRatioRetention((_b = policy.thresholdRatio) !== null && _b !== void 0 ? _b : thresholdRatio, resolveRetention(policy, retention), "BasicCompactionConfig: modelPolicies[".concat(index, "]"));
    }
    return (0, dsh_llm_1.deepFreeze)(__assign(__assign({ thresholdRatio: thresholdRatio }, retention), { summarizationProvider: (_c = config.summarizationProvider) !== null && _c !== void 0 ? _c : '', summarizationModel: (_d = config.summarizationModel) !== null && _d !== void 0 ? _d : '', maxTokens: (_e = config.maxTokens) !== null && _e !== void 0 ? _e : 8192, compactionRetries: (_f = config.compactionRetries) !== null && _f !== void 0 ? _f : 1, maxOverflowRetries: (_g = config.maxOverflowRetries) !== null && _g !== void 0 ? _g : 1, modelPolicies: modelPolicies, auto: (_h = config.auto) !== null && _h !== void 0 ? _h : true }));
}
/**
 * Merge the exact provider/model override over the validated default policy.
 * @param config - validated service defaults and override table.
 * @param target - exact durable provider/model route to match.
 * @returns detached immutable policy before model-capacity scaling.
 */
function resolveTargetPolicy(config, target) {
    var _a, _b, _c, _d, _e, _f;
    var override = config.modelPolicies.find(function (policy) { return (policy.provider === target.provider && policy.model === target.model); });
    var inheritedRetention = config.retainTokens === undefined
        ? { retainRatio: config.retainRatio }
        : { retainTokens: config.retainTokens };
    return (0, dsh_llm_1.deepFreeze)(__assign(__assign({ target: { provider: target.provider, model: target.model }, thresholdRatio: (_a = override === null || override === void 0 ? void 0 : override.thresholdRatio) !== null && _a !== void 0 ? _a : config.thresholdRatio }, resolveRetention(override !== null && override !== void 0 ? override : {}, inheritedRetention)), { summarizationProvider: (_b = override === null || override === void 0 ? void 0 : override.summarizationProvider) !== null && _b !== void 0 ? _b : config.summarizationProvider, summarizationModel: (_c = override === null || override === void 0 ? void 0 : override.summarizationModel) !== null && _c !== void 0 ? _c : config.summarizationModel, maxTokens: (_d = override === null || override === void 0 ? void 0 : override.maxTokens) !== null && _d !== void 0 ? _d : config.maxTokens, compactionRetries: (_e = override === null || override === void 0 ? void 0 : override.compactionRetries) !== null && _e !== void 0 ? _e : config.compactionRetries, maxOverflowRetries: (_f = override === null || override === void 0 ? void 0 : override.maxOverflowRetries) !== null && _f !== void 0 ? _f : config.maxOverflowRetries }));
}
/**
 * Scale one routed policy into concrete token budgets for its model capacity.
 * @param policy - merged policy for the exact routed target.
 * @param contextWindow - positive adapter-owned capacity for that target.
 * @returns detached immutable pressure and retention budgets.
 */
function resolveCompactSpec(policy, contextWindow) {
    var targetKey = "".concat(policy.target.provider, "/").concat(policy.target.model);
    if (!Number.isInteger(contextWindow) || contextWindow <= 0) {
        throw new TargetPressureConfigError(targetKey, "BasicCompactionConfig: contextWindow (".concat(contextWindow, ") must be a positive integer"));
    }
    var thresholdTokens = Math.floor(contextWindow * policy.thresholdRatio);
    var retainTokens = policy.retainTokens === undefined
        ? Math.floor(contextWindow * policy.retainRatio)
        : policy.retainTokens;
    if (retainTokens >= thresholdTokens) {
        throw new TargetPressureConfigError(targetKey, "BasicCompactionConfig: ".concat(policy.target.provider, "/").concat(policy.target.model, " retainTokens ")
            + "(".concat(retainTokens, ") must be less than threshold tokens ").concat(thresholdTokens));
    }
    return (0, dsh_llm_1.deepFreeze)({
        target: __assign({}, policy.target),
        contextWindow: contextWindow,
        thresholdRatio: policy.thresholdRatio,
        thresholdTokens: thresholdTokens,
        retainTokens: retainTokens,
        summarizationProvider: policy.summarizationProvider,
        summarizationModel: policy.summarizationModel,
        maxTokens: policy.maxTokens,
        compactionRetries: policy.compactionRetries,
        maxOverflowRetries: policy.maxOverflowRetries,
    });
}
/** Choose an explicit retention form or inherit the already-resolved fallback. */
function resolveRetention(config, fallback) {
    if (config.retainTokens !== undefined)
        return { retainTokens: config.retainTokens };
    if (config.retainRatio !== undefined)
        return { retainRatio: config.retainRatio };
    return fallback;
}
/** Reject a capacity-independent retention conflict at plugin load. */
function validateRatioRetention(thresholdRatio, retention, name) {
    if (retention.retainRatio !== undefined && retention.retainRatio >= thresholdRatio) {
        throw new Error("".concat(name, ": retainRatio (").concat(retention.retainRatio, ") must be less than ")
            + "the resolved thresholdRatio (".concat(thresholdRatio, ")"));
    }
}
/** Validate, detach, and reject duplicate exact-target policies. */
function resolveModelPolicies(configured) {
    if (configured === undefined)
        return [];
    if (!Array.isArray(configured)) {
        throw new Error('BasicCompactionConfig: modelPolicies must be an array');
    }
    var seen = new Set();
    return configured.map(function (source, index) {
        var name = "BasicCompactionConfig: modelPolicies[".concat(index, "]");
        assertModelPolicy(source, name);
        var key = "".concat(source.provider, "\0").concat(source.model);
        if (seen.has(key)) {
            throw new Error("BasicCompactionConfig: duplicate model policy for ".concat(source.provider, "/").concat(source.model));
        }
        seen.add(key);
        return __assign({}, source);
    });
}
/** Validate one untrusted exact-target override and narrow its public type. */
function assertModelPolicy(source, name) {
    if (!isUnknownRecord(source))
        throw new Error("".concat(name, " must be an object"));
    validateKeys(source, MODEL_POLICY_KEYS, name);
    assertNonEmptyString("".concat(name, ".provider"), source.provider);
    assertNonEmptyString("".concat(name, ".model"), source.model);
    validatePolicy(source, name);
}
/** Validate the fields common to defaults and exact-target partial overrides. */
function validatePolicy(config, name) {
    var thresholdRatio = config.thresholdRatio;
    var retainRatio = config.retainRatio;
    var retainTokens = config.retainTokens;
    var maxTokens = config.maxTokens;
    var compactionRetries = config.compactionRetries;
    var maxOverflowRetries = config.maxOverflowRetries;
    if (thresholdRatio !== undefined)
        assertRatio("".concat(name, ".thresholdRatio"), thresholdRatio);
    if (retainRatio !== undefined)
        assertRatio("".concat(name, ".retainRatio"), retainRatio);
    if (retainTokens !== undefined)
        assertNonNegativeInteger("".concat(name, ".retainTokens"), retainTokens);
    if (retainRatio !== undefined && retainTokens !== undefined) {
        throw new Error("".concat(name, ": retainRatio and retainTokens are mutually exclusive"));
    }
    if (maxTokens !== undefined)
        assertPositiveInteger("".concat(name, ".maxTokens"), maxTokens);
    if (compactionRetries !== undefined) {
        assertNonNegativeInteger("".concat(name, ".compactionRetries"), compactionRetries);
    }
    if (maxOverflowRetries !== undefined) {
        assertNonNegativeInteger("".concat(name, ".maxOverflowRetries"), maxOverflowRetries);
    }
    validateSummarizationPair(config, name);
}
/** Require one scope to omit, clear, or replace the summarization target as a pair. */
function validateSummarizationPair(config, name) {
    var provider = config.summarizationProvider;
    var model = config.summarizationModel;
    if (provider !== undefined && typeof provider !== 'string') {
        throw new Error("".concat(name, ".summarizationProvider must be a string"));
    }
    if (model !== undefined && typeof model !== 'string') {
        throw new Error("".concat(name, ".summarizationModel must be a string"));
    }
    if (provider === undefined && model === undefined)
        return;
    if (provider === undefined || model === undefined
        || (provider.length === 0) !== (model.length === 0)) {
        throw new Error("".concat(name, ": summarizationProvider and summarizationModel must be set together ")
            + 'as an empty or non-empty pair');
    }
}
/** Reject stale or misspelled keys before defaults can hide them. */
function validateKeys(config, keys, name) {
    for (var _i = 0, _a = Object.keys(config); _i < _a.length; _i++) {
        var key = _a[_i];
        if (!keys.has(key))
            throw new Error("".concat(name, ": unknown key \"").concat(key, "\""));
    }
}
function isUnknownRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertNonEmptyString(name, value) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error("".concat(name, " must be a non-empty string"));
    }
}
function assertPositiveInteger(name, value) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new Error("".concat(name, " (").concat(String(value), ") must be a positive integer"));
    }
}
function assertNonNegativeInteger(name, value) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error("".concat(name, " (").concat(String(value), ") must be a non-negative integer"));
    }
}
function assertRatio(name, value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1) {
        throw new Error("".concat(name, " (").concat(String(value), ") must be a number in (0, 1]"));
    }
}
