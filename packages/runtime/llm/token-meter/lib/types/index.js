"use strict";
/**
 * Single replay-aware token-meter service for request and surface pressure.
 *
 * @module @z/dsh-token-meter
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenMeter = void 0;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_session_1 = require("@z/dsh-session");
var breakdown_projection_ts_1 = require("./breakdown-projection.ts");
var usage_projection_ts_1 = require("./usage-projection.ts");
var estimate_ts_1 = require("./estimate.ts");
var surface_fold_ts_1 = require("./surface-fold.ts");
/** Sum disjoint provider usage buckets without double-counting reasoning output. */
function usageTokens(usage) {
    var _a, _b;
    return usage.inputTokens
        + ((_a = usage.cacheReadTokens) !== null && _a !== void 0 ? _a : 0)
        + ((_b = usage.cacheWriteTokens) !== null && _b !== void 0 ? _b : 0)
        + usage.outputTokens;
}
/** Compare optional envelopes so a headerless estimate can track later surface deltas. */
function optionalHeaderEquals(left, right) {
    if (left === undefined || right === undefined)
        return left === right;
    return (0, dsh_session_1.headerEquals)(left, right);
}
/** Reject stale or misspelled keys before defaults can hide them. */
function validateConfigKeys(config) {
    for (var _i = 0, _a = Object.keys(config); _i < _a.length; _i++) {
        var key = _a[_i];
        throw new Error("TokenMeterConfig: unknown key \"".concat(key, "\" (no settings are supported)"));
    }
}
/** Replay owner for one service-wide estimator and isolated per-session folds. */
var TokenMeter = /** @class */ (function (_super) {
    __extends(TokenMeter, _super);
    function TokenMeter(ctx, config) {
        if (config === void 0) { config = {}; }
        var _this = _super.call(this, ctx, 'tokenMeter') || this;
        _this.states = new WeakMap();
        validateConfigKeys(config);
        // Projection registration is an optional child: compositions without the
        // generic registry keep the meter's standalone read shape.
        ctx.inject(['sessionProjections'], function (projectionCtx) {
            projectionCtx.sessionProjections.register(usage_projection_ts_1.tokenUsageProjectionDefinition);
            projectionCtx.sessionProjections.register(usage_projection_ts_1.contextPressureProjectionDefinition);
            projectionCtx.sessionProjections.register(breakdown_projection_ts_1.contextBreakdownProjectionDefinition);
        });
        // Readers catch up independently, while eager observation bounds ordinary
        // read latency without creating state for sessions no consumer has read.
        ctx.on('session/event', function (session) {
            if (_this.states.has(session))
                _this._sync(session);
        });
        return _this;
    }
    /**
     * Measure current request pressure and surface through the durable tail.
     *
     * Provider usage is reused only when the latest successful call's canonical
     * request envelope matches `requestHeader` and its total is no lower than
     * that call's full heuristic anchor; otherwise the complete envelope and
     * surface are heuristically repriced.
     *
     * `requestHeader` affects request pressure only; surface fields always
     * describe the current session surface. Every call clones those positional
     * nodes, so measurement is O(surface).
     *
     * @param session - session to replay through its current durable tail.
     * @param requestHeader - optional effective request envelope replacing the latest logged header.
     * @returns a detached deeply immutable pressure and surface measurement.
     */
    TokenMeter.prototype.measure = function (session, requestHeader) {
        var state = this._sync(session);
        var header = requestHeader === undefined
            ? state.header
            : (0, dsh_session_1.canonicalHeader)(requestHeader);
        var anchor = state.anchor;
        var baseline;
        var surfaceDeltaTokens;
        if (anchor !== undefined && optionalHeaderEquals(anchor.header, header)) {
            baseline = anchor.baseline;
            surfaceDeltaTokens = state.surfaceTokens - anchor.surfaceTokens;
        }
        else if (header === undefined && state.surfaceTokens === 0) {
            baseline = { kind: 'none', tokens: 0 };
            surfaceDeltaTokens = 0;
        }
        else {
            baseline = {
                kind: 'estimated',
                tokens: (0, estimate_ts_1.estimateHeader)(header) + state.surfaceTokens,
            };
            surfaceDeltaTokens = 0;
        }
        return (0, dsh_llm_1.deepFreeze)(structuredClone({
            logRevision: state.consumedEvents,
            baseline: baseline,
            surfaceDeltaTokens: surfaceDeltaTokens,
            totalTokens: Math.max(0, baseline.tokens + surfaceDeltaTokens),
            surfaceTokens: state.surfaceTokens,
            nodes: state.surface,
        }));
    };
    /**
     * Heuristically price one model-visible message (instance face of the pure
     * `estimateMessage` export from `estimate.ts`).
     * @param message - message to price without mutation.
     * @returns content and role-framing tokens under the fixed service heuristic.
     */
    TokenMeter.prototype.estimateMessage = function (message) {
        return (0, estimate_ts_1.estimateMessage)(message);
    };
    /** Catch one session's fold up to the current durable tail. */
    TokenMeter.prototype._sync = function (session) {
        var state = this.states.get(session);
        if (state === undefined) {
            state = {
                consumedEvents: 0,
                header: undefined,
                surface: [],
                surfaceTokens: 0,
                stepStart: undefined,
                anchor: undefined,
            };
            this.states.set(session, state);
        }
        while (state.consumedEvents < session.events.length) {
            // oxlint-disable-next-line typescript/no-non-null-assertion -- contiguous session seqs index the durable log
            var event_1 = session.events[state.consumedEvents];
            this._foldEvent(session, state, event_1);
            state.consumedEvents += 1;
        }
        return state;
    };
    /**
     * Validate and prepare every fallible part before mutating replay state.
     * A malformed event remains unread on every retry instead of partially
     * applying the same mutation more than once.
     */
    TokenMeter.prototype._foldEvent = function (session, state, event) {
        var nextHeader = state.header;
        var nextStepStart = state.stepStart;
        var nextAnchor = state.anchor;
        switch (event.type) {
            case 'request/header':
                nextHeader = (0, dsh_session_1.canonicalHeader)(event.data.header);
                break;
            case 'step/start':
                if (state.stepStart !== undefined) {
                    throw new Error("token meter: step/start at seq ".concat(event.seq, " arrived before turn ").concat(state.stepStart.turn, "/step ").concat(state.stepStart.step, " ended"));
                }
                nextStepStart = __assign(__assign({}, event.data), { surfaceTokens: state.surfaceTokens });
                break;
            case 'step/end':
                if (state.stepStart === undefined
                    || state.stepStart.turn !== event.data.turn
                    || state.stepStart.step !== event.data.step) {
                    throw new Error("token meter: step/end at seq ".concat(event.seq, " has no matching step/start event"));
                }
                nextStepStart = undefined;
                break;
            default:
                break;
        }
        var surface = (0, dsh_session_1.isSurfaceEvent)(event)
            ? (0, surface_fold_ts_1.foldSurfaceTokens)(state.surface, event)
            : undefined;
        if (event.type === 'assistant/message') {
            var stepStart = state.stepStart;
            if (stepStart === undefined
                || stepStart.turn !== event.data.turn
                || stepStart.step !== event.data.step) {
                throw new Error("token meter: assistant/message at seq ".concat(event.seq, " has no matching step/start event"));
            }
            // assistant/message is surface-mandatory at every append/seed boundary.
            // oxlint-disable-next-line typescript/no-non-null-assertion
            var eventTokens = surface.tokens;
            if (event.data.usage !== undefined && nextHeader !== undefined) {
                var providerAssistantTokens = this._estimateProviderAssistant(session, event, eventTokens);
                var anchorSurfaceTokens = stepStart.surfaceTokens + providerAssistantTokens;
                var providerTokens = usageTokens(event.data.usage);
                var estimatedAnchorTokens = (0, estimate_ts_1.estimateHeader)(nextHeader) + anchorSurfaceTokens;
                nextAnchor = {
                    header: nextHeader,
                    surfaceTokens: anchorSurfaceTokens,
                    // Signed heuristic deltas remain conservative only from an anchor
                    // that is at least as large as the matching full heuristic price.
                    baseline: providerTokens >= estimatedAnchorTokens
                        ? { kind: 'usage', tokens: providerTokens, usage: event.data.usage }
                        : { kind: 'estimated', tokens: estimatedAnchorTokens },
                };
            }
            else {
                var anchorSurfaceTokens = stepStart.surfaceTokens + eventTokens;
                nextAnchor = {
                    header: nextHeader,
                    surfaceTokens: anchorSurfaceTokens,
                    baseline: {
                        kind: 'estimated',
                        tokens: (0, estimate_ts_1.estimateHeader)(nextHeader) + anchorSurfaceTokens,
                    },
                };
            }
        }
        state.header = nextHeader;
        state.stepStart = nextStepStart;
        if (surface !== undefined) {
            state.surface = surface.nodes;
            state.surfaceTokens += surface.deltaTokens;
        }
        state.anchor = nextAnchor;
    };
    /**
     * Reassemble provider output from the exact cited chunk seqs for a usage anchor.
     * Missing legacy source seqs conservatively treat the durable output as the
     * provider output; an explicit empty list prices a known empty stream.
     */
    TokenMeter.prototype._estimateProviderAssistant = function (session, event, durableEventTokens) {
        var sourceSeqs = event.sourceEventSeqs;
        if (sourceSeqs === undefined)
            return durableEventTokens;
        if (sourceSeqs.length === 0)
            return 0;
        var assembler = new dsh_llm_1.BlockAssembler();
        var seen = new Set();
        var usedChunks = false;
        for (var _i = 0, sourceSeqs_1 = sourceSeqs; _i < sourceSeqs_1.length; _i++) {
            var seq = sourceSeqs_1[_i];
            if (seq >= event.seq) {
                throw new Error("token meter: assistant/message at seq ".concat(event.seq, " source seq ").concat(seq, " is not earlier"));
            }
            if (seen.has(seq)) {
                throw new Error("token meter: assistant/message at seq ".concat(event.seq, " repeats source seq ").concat(seq));
            }
            seen.add(seq);
            // Session construction validates contiguous seqs, and the explicit
            // earlier-than-assistant check above therefore guarantees existence.
            var sourceEvent = session.events[seq];
            // oxlint-disable-next-line typescript/no-non-null-assertion
            var source = sourceEvent;
            if (source.type !== 'assistant/chunk')
                continue;
            if (source.data.turn !== event.data.turn || source.data.step !== event.data.step)
                continue;
            assembler.push(source.data.chunk);
            usedChunks = true;
        }
        if (!usedChunks)
            return durableEventTokens;
        var providerContent = assembler.blocks();
        return providerContent.length === 0 ? 0 : (0, estimate_ts_1.estimateContent)(providerContent) + estimate_ts_1.ROLE_OVERHEAD;
    };
    // Schemastery preserves untrusted loader keys on an empty object schema;
    // the public type excludes settings while validateConfigKeys rejects them.
    TokenMeter.Config = schemastery_1.default.object({});
    return TokenMeter;
}(cordis_1.Service));
exports.TokenMeter = TokenMeter;
exports.default = TokenMeter;
