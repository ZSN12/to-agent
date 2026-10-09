"use strict";
/**
 * Pure folds for durable provider-reported token usage and context occupancy.
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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contextPressureProjectionDefinition = exports.tokenUsageProjectionDefinition = void 0;
var zod_1 = require("zod");
var surface_projection_ts_1 = require("./surface-projection.ts");
var zeroBuckets = function () { return ({
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
}); };
var bucketsFrom = function (usage) {
    var _a, _b;
    return ({
        uncachedInputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: (_a = usage.cacheReadTokens) !== null && _a !== void 0 ? _a : 0,
        cacheWriteTokens: (_b = usage.cacheWriteTokens) !== null && _b !== void 0 ? _b : 0,
    });
};
var bucketsEqual = function (left, right) {
    return left.uncachedInputTokens === right.uncachedInputTokens
        && left.outputTokens === right.outputTokens
        && left.cacheReadTokens === right.cacheReadTokens
        && left.cacheWriteTokens === right.cacheWriteTokens;
};
var addReplacing = function (totals, previous, next) {
    var _a, _b, _c, _d;
    return ({
        uncachedInputTokens: totals.uncachedInputTokens - ((_a = previous === null || previous === void 0 ? void 0 : previous.uncachedInputTokens) !== null && _a !== void 0 ? _a : 0) + next.uncachedInputTokens,
        outputTokens: totals.outputTokens - ((_b = previous === null || previous === void 0 ? void 0 : previous.outputTokens) !== null && _b !== void 0 ? _b : 0) + next.outputTokens,
        cacheReadTokens: totals.cacheReadTokens - ((_c = previous === null || previous === void 0 ? void 0 : previous.cacheReadTokens) !== null && _c !== void 0 ? _c : 0) + next.cacheReadTokens,
        cacheWriteTokens: totals.cacheWriteTokens - ((_d = previous === null || previous === void 0 ? void 0 : previous.cacheWriteTokens) !== null && _d !== void 0 ? _d : 0) + next.cacheWriteTokens,
    });
};
var projectionSchema = zod_1.z.object({
    uncachedInputTokens: zod_1.z.number().int().nonnegative(),
    outputTokens: zod_1.z.number().int().nonnegative(),
    cacheReadTokens: zod_1.z.number().int().nonnegative(),
    cacheWriteTokens: zod_1.z.number().int().nonnegative(),
}).strict();
/**
 * The token-usage unit's state schema — the one definition of the state
 * shape; the state type is inferred from it.
 */
var tokenUsageStateSchema = zod_1.z.object({
    totals: projectionSchema,
    last: zod_1.z.object({
        turn: zod_1.z.number().int().nonnegative(),
        step: zod_1.z.number().int().nonnegative(),
        buckets: projectionSchema,
    }).nullable(),
}).strict();
var pressureSchema = zod_1.z.object({
    pressureTokens: zod_1.z.number().int().nonnegative().optional(),
    projectedTokens: zod_1.z.number().int().nonnegative().optional(),
    contextWindow: zod_1.z.number().int().positive().optional(),
}).strict().transform(function (_a) {
    var pressureTokens = _a.pressureTokens, projectedTokens = _a.projectedTokens, contextWindow = _a.contextWindow;
    return (__assign(__assign(__assign({}, pressureTokens === undefined ? {} : { pressureTokens: pressureTokens }), projectedTokens === undefined ? {} : { projectedTokens: projectedTokens }), contextWindow === undefined ? {} : { contextWindow: contextWindow }));
});
/** Prompt-side pressure of one request: input plus cache traffic, no output. */
var pressureFrom = function (usage) { var _a, _b; return usage.inputTokens + ((_a = usage.cacheReadTokens) !== null && _a !== void 0 ? _a : 0) + ((_b = usage.cacheWriteTokens) !== null && _b !== void 0 ? _b : 0); };
/** The usage a chunk or finalized message reports for its step, if any. */
var usageOf = function (event) {
    return event.type === 'assistant/chunk' && event.data.chunk.type === 'usage'
        ? event.data.chunk.usage
        : event.type === 'assistant/message'
            ? event.data.usage
            : undefined;
};
/** The context-pressure state schema and source of its inferred type. */
var contextPressureStateSchema = zod_1.z.object({
    contextWindow: zod_1.z.number().int().positive().optional(),
    pressureTokens: zod_1.z.number().int().nonnegative().optional(),
    surfaceTokens: zod_1.z.number().int().nonnegative(),
    sampledSurfaceTokens: zod_1.z.number().int().nonnegative().optional(),
    claim: zod_1.z.object({
        start: zod_1.z.number().int().nonnegative(),
        end: zod_1.z.number().int().nonnegative(),
        tokens: zod_1.z.number().int().nonnegative(),
    }).optional(),
}).strict();
/**
 * Token-meter's session projection unit.
 *
 * Usage chunks provide an early sample that survives a later request failure;
 * an assistant message provides the final sample for the same turn/step. A
 * repeated sample replaces that step's earlier value instead of double
 * counting it. The single `last` slot relies on the session-log invariant
 * that usage reports for one turn/step are adjacent: once a later step begins,
 * a legal log never reports usage for an earlier step again.
 */
exports.tokenUsageProjectionDefinition = {
    key: 'tokenUsage',
    stateVersion: 1,
    stateSchema: tokenUsageStateSchema,
    init: function () { return ({ totals: zeroBuckets(), last: null }); },
    apply: function (state, event) {
        var _a, _b;
        var turn;
        var step;
        var usage;
        if (event.type === 'assistant/chunk' && event.data.chunk.type === 'usage') {
            ;
            (_a = event.data, turn = _a.turn, step = _a.step);
            usage = event.data.chunk.usage;
        }
        else if (event.type === 'assistant/message' && event.data.usage !== undefined) {
            ;
            (_b = event.data, turn = _b.turn, step = _b.step, usage = _b.usage);
        }
        else {
            return state;
        }
        var buckets = bucketsFrom(usage);
        var previous = state.last !== null
            && state.last.turn === turn
            && state.last.step === step
            ? state.last.buckets
            : undefined;
        if (previous !== undefined && bucketsEqual(previous, buckets))
            return state;
        return {
            totals: addReplacing(state.totals, previous, buckets),
            last: { turn: turn, step: step, buckets: buckets },
        };
    },
    wire: { viewSchema: projectionSchema, view: function (state) { return state.totals; } },
};
/**
 * Token-meter's context-occupancy projection unit.
 *
 * Independent last-wins slots: the newest usage sample supplies the provider
 * numerator, the newest `request/context` record the denominator. Both are
 * whole values, so replay order alone decides the result and no cross-field
 * consistency is claimed — the pair is explicitly not one atomic request
 * observation (see {@link ContextPressureProjection}).
 *
 * `pressureTokens` is prompt-side only, so it holds still while a turn streams
 * and steps forward once the next request reports its usage. Because nothing
 * but a request reports usage, it also cannot see a compaction: the fold
 * therefore carries a running surface total alongside it and publishes
 * `projectedTokens` — the sample plus the surface's signed movement since it
 * was taken — so occupancy answers for the next request rather than the last
 * one. The total rides {@link foldSurfaceProjection}, so the state stays O(1)
 * and a replacement shrinks it by its logged shadow price. A replacement
 * without a claim preserves the previous total. A usage sample is stamped
 * BEFORE the same event joins the surface, so an `assistant/message` anchors
 * against the surface its own request saw.
 */
exports.contextPressureProjectionDefinition = {
    key: 'contextPressure',
    stateVersion: 4,
    stateSchema: contextPressureStateSchema,
    init: function () { return ({ surfaceTokens: 0 }); },
    apply: function (state, event) {
        var fold = (0, surface_projection_ts_1.foldSurfaceProjection)(state.claim, event);
        var next = state;
        if (event.type === 'request/context') {
            var contextWindow = event.data.contextWindow;
            if (contextWindow !== state.contextWindow) {
                if (contextWindow !== undefined) {
                    next = __assign(__assign({}, next), { contextWindow: contextWindow });
                }
                else {
                    var _removed = next.contextWindow, withoutContextWindow = __rest(next, ["contextWindow"]);
                    next = withoutContextWindow;
                }
            }
        }
        var usage = usageOf(event);
        if (usage !== undefined) {
            var pressureTokens = pressureFrom(usage);
            if (pressureTokens !== next.pressureTokens || next.sampledSurfaceTokens !== next.surfaceTokens) {
                next = __assign(__assign({}, next), { pressureTokens: pressureTokens, sampledSurfaceTokens: next.surfaceTokens });
            }
        }
        if (fold.deltaTokens !== 0) {
            next = __assign(__assign({}, next), { surfaceTokens: next.surfaceTokens + fold.deltaTokens });
        }
        // A defined fold.claim is always freshly built, so presence decides claim
        // bookkeeping: no claim before or after this event leaves `next` as is.
        if (state.claim === undefined && fold.claim === undefined)
            return next;
        var _expired = next.claim, withoutClaim = __rest(next, ["claim"]);
        return fold.claim === undefined ? withoutClaim : __assign(__assign({}, withoutClaim), { claim: fold.claim });
    },
    wire: {
        viewSchema: pressureSchema,
        view: function (_a) {
            var contextWindow = _a.contextWindow, pressureTokens = _a.pressureTokens, surfaceTokens = _a.surfaceTokens, sampledSurfaceTokens = _a.sampledSurfaceTokens;
            return (__assign(__assign(__assign({}, contextWindow === undefined ? {} : { contextWindow: contextWindow }), pressureTokens === undefined ? {} : { pressureTokens: pressureTokens }), pressureTokens === undefined || sampledSurfaceTokens === undefined
                ? {}
                : { projectedTokens: Math.max(0, pressureTokens + surfaceTokens - sampledSurfaceTokens) }));
        },
    },
};
