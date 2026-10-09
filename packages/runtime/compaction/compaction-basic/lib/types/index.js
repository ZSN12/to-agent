"use strict";
/**
 * Basic replay-aware compaction backend.
 *
 * @module @z/dsh-compaction-basic
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasicCompactionEngine = void 0;
var schemastery_1 = require("@z/schemastery");
var dsh_compaction_1 = require("@z/dsh-compaction");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_home_paths_1 = require("@z/dsh-home-paths");
var config_ts_1 = require("./config.ts");
var region_ts_1 = require("./region.ts");
var summarizer_ts_1 = require("./summarizer.ts");
/** Resolve the exact provider/model durably routed for the latest request. */
function routedTarget(session) {
    var _a;
    var config = (_a = session.requestHeader()) === null || _a === void 0 ? void 0 : _a.config;
    if (config === undefined || config.provider.length === 0 || config.model.length === 0) {
        return undefined;
    }
    return { provider: config.provider, model: config.model };
}
/** Resolve the conversation target used to select an optional policy override. */
function conversationTarget(agent) {
    var routed = routedTarget(agent.session);
    if (routed !== undefined)
        return routed;
    if (agent.options.provider === undefined || agent.options.provider.length === 0
        || agent.options.model === undefined || agent.options.model.length === 0)
        return undefined;
    return { provider: agent.options.provider, model: agent.options.model };
}
var thresholdRatioSchema = schemastery_1.default.number();
var retainRatioSchema = schemastery_1.default.number();
var retainTokensSchema = schemastery_1.default.number().step(1).min(0);
var summarizationProviderSchema = schemastery_1.default.string();
var summarizationModelSchema = schemastery_1.default.string();
var maxTokensSchema = schemastery_1.default.number().step(1).min(1);
var compactionRetriesSchema = schemastery_1.default.number().step(1).min(0);
var maxOverflowRetriesSchema = schemastery_1.default.number().step(1).min(0);
/** App-specific recovery stays deliberately finite without changing shared DSH behavior. */
var TASKWEAVER_MAX_COMPACTION_RETRIES = 1;
var TASKWEAVER_MAX_OVERFLOW_RETRIES = 1;
function taskweaverBoundedRetryConfig(config) {
    var modelPolicies = Object.freeze(config.modelPolicies.map(function (policy) { return Object.freeze(__assign(__assign(__assign({}, policy), (policy.compactionRetries === undefined ? {} : {
        compactionRetries: Math.min(policy.compactionRetries, TASKWEAVER_MAX_COMPACTION_RETRIES),
    })), (policy.maxOverflowRetries === undefined ? {} : {
        maxOverflowRetries: Math.min(policy.maxOverflowRetries, TASKWEAVER_MAX_OVERFLOW_RETRIES),
    }))); }));
    return Object.freeze(__assign(__assign({}, config), { compactionRetries: Math.min(config.compactionRetries, TASKWEAVER_MAX_COMPACTION_RETRIES), maxOverflowRetries: Math.min(config.maxOverflowRetries, TASKWEAVER_MAX_OVERFLOW_RETRIES), modelPolicies: modelPolicies }));
}
var modelPolicy = schemastery_1.default.object({
    provider: schemastery_1.default.string().required(),
    model: schemastery_1.default.string().required(),
    thresholdRatio: thresholdRatioSchema,
    retainRatio: retainRatioSchema,
    retainTokens: retainTokensSchema,
    summarizationProvider: summarizationProviderSchema,
    summarizationModel: summarizationModelSchema,
    maxTokens: maxTokensSchema,
    compactionRetries: compactionRetriesSchema,
    maxOverflowRetries: maxOverflowRetriesSchema,
});
/**
 * Dependency-light compaction backend using `ctx.tokenMeter` for pressure,
 * retention, cited source events, and summary-convergence pricing.
 *
 * `summarize()` is the sole subclass customization hook; the replay and durable
 * mutation strategy stays fixed so every pricing decision uses the singleton
 * token meter.
 */
var BasicCompactionEngine = /** @class */ (function (_super) {
    __extends(BasicCompactionEngine, _super);
    function BasicCompactionEngine(ctx, config) {
        if (config === void 0) { config = {}; }
        var _this = _super.call(this, ctx) || this;
        _this.warnedPressureConfigTargets = new Set();
        _this.overflowRetries = new WeakMap();
        _this.overflowAgents = new WeakMap();
        var resolved = (0, config_ts_1.resolveConfig)(config);
        _this.config = (0, dsh_home_paths_1.taskweaverEmbeddedFromEnv)()
            ? taskweaverBoundedRetryConfig(resolved)
            : resolved;
        if (_this.config.auto)
            _this._registerAutomaticCompaction();
        return _this;
    }
    /**
     * Register automatic between-step pressure and model-request overflow
     * recovery. `compactIfNeeded` stays dynamically dispatched so subclass
     * overrides are honored at event time.
     */
    BasicCompactionEngine.prototype._registerAutomaticCompaction = function () {
        var _this = this;
        var ctx = this.ctx;
        var logResult = function (result, trigger) {
            ctx.logger.info("compaction (".concat(trigger, "): shadowed ").concat(result.shadowedSeqs.length, " surface nodes ")
                + "(seqs ".concat(result.shadowedRange.start, "-").concat(result.shadowedRange.end, ", ")
                + "~".concat(result.shadowedTokenCount, " tokens)"));
        };
        ctx.on('agent/pre-step', function (_a, next_1) { return __awaiter(_this, [_a, next_1], void 0, function (_b, next) {
            var result, error_1, message;
            var agent = _b.agent, signal = _b.signal;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!!signal.aborted) return [3 /*break*/, 4];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.compactIfNeeded(agent, 'pressure', signal)];
                    case 2:
                        result = _c.sent();
                        if (result !== null)
                            logResult(result, 'step pressure');
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _c.sent();
                        if (error_1 instanceof config_ts_1.TargetPressureConfigError) {
                            if (this.warnedPressureConfigTargets.has(error_1.targetKey))
                                return [2 /*return*/, next()];
                            this.warnedPressureConfigTargets.add(error_1.targetKey);
                        }
                        message = error_1 instanceof Error ? error_1.message : String(error_1);
                        ctx.logger.warn("step compaction failed: ".concat(message, "; continuing the turn"));
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/, next()];
                }
            });
        }); });
        ctx.on('agent/status', function (_a) {
            var agent = _a.agent, status = _a.status;
            if (status === 'idle')
                _this.overflowRetries.delete(agent);
        });
        // A successful response starts a fresh overflow-recovery sequence even
        // when tool calls continue the same turn into another request.
        ctx.on('session/event', function (session, event) {
            if (event.type !== 'assistant/message')
                return;
            var agent = _this.overflowAgents.get(session);
            if (agent !== undefined)
                _this.overflowRetries.delete(agent);
        });
        ctx.on('agent/request-error', function (_a, next_1) { return __awaiter(_this, [_a, next_1], void 0, function (_b, next) {
            var target, policy, retries, generation, result, recoveryError_1, message;
            var _c;
            var agent = _b.agent, failure = _b.failure, signal = _b.signal;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (failure.code !== dsh_llm_1.CONTEXT_WINDOW_EXCEEDED_CODE || signal.aborted)
                            return [2 /*return*/, next()];
                        this.overflowAgents.set(agent.session, agent);
                        target = routedTarget(agent.session);
                        if (target === undefined)
                            return [2 /*return*/, next()];
                        policy = (0, config_ts_1.resolveTargetPolicy)(this.config, target);
                        retries = (_c = this.overflowRetries.get(agent)) !== null && _c !== void 0 ? _c : 0;
                        if (retries >= policy.maxOverflowRetries)
                            return [2 /*return*/, next()];
                        generation = agent.session.surface.replaceGeneration;
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.compactIfNeeded(agent, 'context-overflow', signal)];
                    case 2:
                        result = _d.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        recoveryError_1 = _d.sent();
                        message = recoveryError_1 instanceof Error ? recoveryError_1.message : String(recoveryError_1);
                        // A model-free prune can land before later summary work fails. That
                        // durable reduction is sufficient retry proof; do not discard it just
                        // because the optional second phase threw. Cancellation still wins.
                        // oxlint-disable-next-line typescript/no-unnecessary-condition -- the signal can abort while recovery is awaited.
                        if (!signal.aborted && agent.session.surface.replaceGeneration > generation) {
                            ctx.logger.warn("context-overflow compaction failed after durable surface progress: ".concat(message, "; ")
                                + 'retrying from the replacement surface');
                            this.overflowRetries.set(agent, retries + 1);
                            return [2 /*return*/, { kind: 'retry' }];
                        }
                        ctx.logger.warn(
                        // oxlint-disable-next-line typescript/no-unnecessary-condition -- the signal can abort while recovery is awaited.
                        "context-overflow compaction failed: ".concat(message, "; ").concat(signal.aborted
                            ? 'cancellation prevents retry'
                            : 'preserving the original request error'));
                        return [2 /*return*/, next()];
                    case 4:
                        // oxlint-disable-next-line typescript/no-unnecessary-condition -- the signal can abort while compaction is awaited.
                        if (signal.aborted
                            || agent.session.surface.replaceGeneration <= generation)
                            return [2 /*return*/, next()];
                        if (result !== null)
                            logResult(result, 'context overflow recovery');
                        this.overflowRetries.set(agent, retries + 1);
                        return [2 /*return*/, { kind: 'retry' }];
                }
            });
        }); });
    };
    /**
     * Summarize the replayed conversation region through a direct one-shot
     * `ctx.llm.stream()` call whose prefix reuses the conversation's own system
     * prompt, tools, and messages so the provider's KV cache is not invalidated.
     * Override this sole hook for a template or remote summarizer.
     * @param input - replayed conversation prefix (system, tools, and leading messages) to condense.
     * @param agent - supplies routed-model history, fallback model, and session id.
     * @param signal - optional cancellation forwarded to the adapter.
     * @returns safe text summary blocks and the exact auxiliary call envelope and output.
     */
    BasicCompactionEngine.prototype.summarize = function (input, agent, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var target, config;
            return __generator(this, function (_a) {
                target = conversationTarget(agent);
                config = target === undefined
                    ? this.config
                    : (0, config_ts_1.resolveTargetPolicy)(this.config, target);
                return [2 /*return*/, (0, summarizer_ts_1.summarizeWithLlm)(this.ctx, config, input, agent, signal)];
            });
        });
    };
    /**
     * Compact for replayed step-boundary pressure or one provider-confirmed context
     * overflow. Both triggers price the latest durable routed request envelope;
     * overflow bypasses the normal threshold and retained-tail policy so it can
     * force one useful balanced reduction.
     * @param agent - agent whose latest durable routed request is measured.
     * @param trigger - normal step-boundary pressure or context-overflow recovery.
     * @param signal - live turn cancellation signal forwarded to summarization.
     * @returns the latest summary compaction result, or `null` when no summary ran.
     */
    BasicCompactionEngine.prototype.compactIfNeeded = function (agent, trigger, signal) {
        return __awaiter(this, void 0, void 0, function () {
            var target, policy, meter, measurement, prune, range, context, targetKey, spec, result, attempt, range;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        target = routedTarget(agent.session);
                        if (target === undefined)
                            return [2 /*return*/, null];
                        policy = (0, config_ts_1.resolveTargetPolicy)(this.config, target);
                        meter = this.ctx.tokenMeter;
                        measurement = meter.measure(agent.session);
                        switch (trigger) {
                            case 'context-overflow':
                                break;
                            case 'pressure':
                                break;
                            /* v8 ignore next -- closed-union exhaustiveness guard */
                            default:
                                (0, dsh_llm_1.assertNever)(trigger, 'compaction trigger');
                        }
                        prune = this.ctx.get('toolResultPruner');
                        if (trigger === 'context-overflow') {
                            if (prune !== undefined) {
                                prune.pruneSession(agent.session);
                                measurement = meter.measure(agent.session);
                            }
                            range = (0, region_ts_1.selectCompactableRange)(agent.session, measurement, 0);
                            if (range === null)
                                return [2 /*return*/, null];
                            return [2 /*return*/, this.compactRegion(range.start, range.end, agent, signal)];
                        }
                        return [4 /*yield*/, this.ctx.llm.resolveModelInfo(target.provider, target.model, signal)];
                    case 1:
                        context = (_a.sent()).context;
                        (0, region_ts_1.assertNoActiveCompaction)(agent.session, 'automatic pressure compaction');
                        targetKey = "".concat(target.provider, "/").concat(target.model);
                        if (context === undefined) {
                            throw new config_ts_1.TargetPressureConfigError(targetKey, "compaction-basic: no context capacity for ".concat(targetKey, "; ")
                                + 'configure contextWindow on that adapter model');
                        }
                        spec = (0, config_ts_1.resolveCompactSpec)(policy, context.contextWindow);
                        if (measurement.totalTokens < spec.thresholdTokens)
                            return [2 /*return*/, null
                                // Once pressure qualifies, land the model-free pass before choosing a
                                // summary range, then remeasure through the singleton replay fold.
                            ];
                        // Once pressure qualifies, land the model-free pass before choosing a
                        // summary range, then remeasure through the singleton replay fold.
                        if (prune !== undefined) {
                            prune.pruneSession(agent.session);
                            measurement = meter.measure(agent.session);
                        }
                        if (measurement.totalTokens < spec.thresholdTokens)
                            return [2 /*return*/, null];
                        result = null;
                        attempt = 0;
                        _a.label = 2;
                    case 2:
                        if (!(attempt <= spec.compactionRetries)) return [3 /*break*/, 5];
                        range = (0, region_ts_1.selectCompactableRange)(agent.session, measurement, spec.retainTokens);
                        if (range === null) {
                            /* v8 ignore else -- concrete replacement preserves a compactable checkpoint; subclass hooks cannot mutate it. */
                            if (result === null)
                                return [2 /*return*/, null
                                    /* v8 ignore next -- paired with the defensive post-success branch above. */
                                ];
                            /* v8 ignore next -- paired with the defensive post-success branch above. */
                            return [3 /*break*/, 5];
                        }
                        return [4 /*yield*/, this.compactRegion(range.start, range.end, agent, signal)];
                    case 3:
                        result = _a.sent();
                        measurement = meter.measure(agent.session);
                        if (measurement.totalTokens < spec.thresholdTokens)
                            return [2 /*return*/, result];
                        _a.label = 4;
                    case 4:
                        attempt += 1;
                        return [3 /*break*/, 2];
                    case 5: throw new Error("compaction still above threshold after ".concat(spec.compactionRetries + 1, " compaction attempts ")
                        + "(".concat(measurement.totalTokens, " estimated tokens >= threshold ").concat(spec.thresholdTokens, ")"));
                }
            });
        });
    };
    /**
     * Compact one inclusive positional range from the agent-owned surface using
     * the effective token meter for all retention and shrink pricing.
     * @param start - inclusive first surface-node seq.
     * @param end - inclusive last surface-node seq.
     * @param agent - owner of the target session, used by the summarizer.
     * @param signal - optional summarization cancellation signal.
     * @returns the successful durable compaction result.
     */
    BasicCompactionEngine.prototype.compactRegion = function (start, end, agent, signal) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, region_ts_1.compactSurfaceRegion)(this.regionDependencies(), agent.session, start, end, agent, { owner: 'current-turn', stability: 'whole-surface' }, signal)];
            });
        });
    };
    /**
     * Force one useful idle-session compaction below the pressure threshold, and
     * resolve only after its standalone marker pair is durably checkpointed.
     * @param agent - idle agent whose next-turn admission this call reserves.
     * @param signal - cancellation scoped to this compaction request.
     * @param sourceCommandId - initiating command identity for presentation correlation.
     * @returns the committed result, or `null` when no safe useful range exists.
     */
    BasicCompactionEngine.prototype.compactNow = function (agent, signal, sourceCommandId) {
        var _this = this;
        signal.throwIfAborted();
        try {
            return agent.runMaintenance(function (agentSignal) { return __awaiter(_this, void 0, void 0, function () {
                var operationSignal, range, error_2;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            operationSignal = AbortSignal.any([agentSignal, signal]);
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            operationSignal.throwIfAborted();
                            range = (0, region_ts_1.selectCompactableRange)(agent.session, this.ctx.tokenMeter.measure(agent.session), 0);
                            if (range === null)
                                return [2 /*return*/, null];
                            return [4 /*yield*/, (0, region_ts_1.compactSurfaceRegion)(this.regionDependencies(), agent.session, range.start, range.end, agent, __assign(__assign({ owner: null, stability: 'selected-span' }, sourceCommandId === undefined ? {} : { sourceCommandId: sourceCommandId }), { flush: function () { return __awaiter(_this, void 0, void 0, function () {
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0: return [4 /*yield*/, this.ctx.sessions.flush(agent.session)];
                                                case 1:
                                                    _a.sent();
                                                    return [2 /*return*/];
                                            }
                                        });
                                    }); } }), operationSignal)];
                        case 2: return [2 /*return*/, _a.sent()];
                        case 3:
                            error_2 = _a.sent();
                            if (agentSignal.aborted && operationSignal.reason === agentSignal.reason) {
                                throw new dsh_compaction_1.ManualCompactionError('cancelled', 'manual compaction was cancelled', { cause: error_2 });
                            }
                            operationSignal.throwIfAborted();
                            throw error_2;
                        case 4: return [2 /*return*/];
                    }
                });
            }); });
        }
        catch (error) {
            throw new dsh_compaction_1.ManualCompactionError('busy', 'manual compaction requires an idle agent with no waking queued work', { cause: error });
        }
    };
    /** Bind the effective token meter and dynamically dispatched summarizer hook. */
    BasicCompactionEngine.prototype.regionDependencies = function () {
        var _this = this;
        return {
            meter: this.ctx.tokenMeter,
            summarize: function (input, owner, abort) { return _this.summarize(input, owner, abort); },
        };
    };
    BasicCompactionEngine.inject = ['llm', 'tokenMeter', 'sessions'];
    BasicCompactionEngine.Config = schemastery_1.default.object({
        thresholdRatio: thresholdRatioSchema,
        retainRatio: retainRatioSchema,
        retainTokens: retainTokensSchema,
        summarizationProvider: summarizationProviderSchema,
        summarizationModel: summarizationModelSchema,
        maxTokens: maxTokensSchema,
        compactionRetries: compactionRetriesSchema,
        maxOverflowRetries: maxOverflowRetriesSchema,
        modelPolicies: schemastery_1.default.array(modelPolicy),
        auto: schemastery_1.default.boolean(),
    });
    return BasicCompactionEngine;
}(dsh_compaction_1.CompactionEngine));
exports.BasicCompactionEngine = BasicCompactionEngine;
exports.default = BasicCompactionEngine;
