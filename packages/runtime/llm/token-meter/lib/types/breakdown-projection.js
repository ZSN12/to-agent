"use strict";
/**
 * Pure fold for the heuristic context-composition projection: system prompt
 * and tool schemas from the newest request envelope, conversation from the
 * live surface. Prices with the same shared estimator as the meter service,
 * so the three figures match `measure()`'s heuristic vocabulary exactly.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.contextBreakdownProjectionDefinition = void 0;
var zod_1 = require("zod");
var dsh_session_1 = require("@z/dsh-session");
var estimate_ts_1 = require("./estimate.ts");
var surface_projection_ts_1 = require("./surface-projection.ts");
/** Non-negative integer token count (the shared figure shape). */
var tokenCount = zod_1.z.number().int().nonnegative();
/** The context-breakdown state schema and source of its inferred type. */
var contextBreakdownStateSchema = zod_1.z.object({
    systemTokens: tokenCount,
    toolsTokens: tokenCount,
    messageTokens: tokenCount,
    claim: zod_1.z.object({
        start: tokenCount,
        end: tokenCount,
        tokens: tokenCount,
    }).optional(),
}).strict();
var breakdownSchema = zod_1.z.object({
    systemTokens: tokenCount,
    toolsTokens: tokenCount,
    messageTokens: tokenCount,
}).strict();
/**
 * Token-meter's context-composition projection unit.
 *
 * Envelope figures are last-wins per `request/header`; the message figure
 * rides {@link foldSurfaceProjection} — the same O(1) fold the occupancy
 * projection uses — so fully metered logs equal `measure().surfaceTokens` at
 * every event boundary and compaction shrinks the figure by its logged shadow
 * price. A replacement without a claim preserves the previous total. The
 * state is a fixed handful of numbers, so the persisted checkpoint stays
 * O(1) over the session's life.
 */
exports.contextBreakdownProjectionDefinition = {
    key: 'contextBreakdown',
    stateVersion: 2,
    stateSchema: contextBreakdownStateSchema,
    init: function () { return ({ systemTokens: 0, toolsTokens: 0, messageTokens: 0 }); },
    apply: function (state, event) {
        var fold = (0, surface_projection_ts_1.foldSurfaceProjection)(state.claim, event);
        var systemTokens = state.systemTokens;
        var toolsTokens = state.toolsTokens;
        if (event.type === 'request/header') {
            var header = (0, dsh_session_1.canonicalHeader)(event.data.header);
            systemTokens = (0, estimate_ts_1.estimateSystemTokens)(header);
            toolsTokens = (0, estimate_ts_1.estimateToolsTokens)(header);
        }
        if (systemTokens === state.systemTokens
            && toolsTokens === state.toolsTokens
            && fold.deltaTokens === 0
            && fold.claim === undefined
            && state.claim === undefined)
            return state;
        return __assign({ systemTokens: systemTokens, toolsTokens: toolsTokens, messageTokens: state.messageTokens + fold.deltaTokens }, fold.claim === undefined ? {} : { claim: fold.claim });
    },
    wire: {
        viewSchema: breakdownSchema,
        view: function (_a) {
            var systemTokens = _a.systemTokens, toolsTokens = _a.toolsTokens, messageTokens = _a.messageTokens;
            return ({ systemTokens: systemTokens, toolsTokens: toolsTokens, messageTokens: messageTokens });
        },
    },
};
