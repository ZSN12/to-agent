"use strict";
/**
 * The `sessionStats` projection unit: a pure fold of step boundaries, stream
 * chunks, tool pairs, and assembled assistant messages into whole-log counts
 * and wall times.
 *
 * `step/end` — not `assistant/message` — is the counted step event because it
 * is the step lifecycle authority: the loop appends exactly one per entered
 * step, in a `finally`, so completed, failed, cancelled, and max-tokens steps
 * all land one. Counting assembled assistant messages instead would overcount
 * max-tokens usage-host messages (empty content, excluded from the surface)
 * and undercount cancelled steps (aborted before the message assembles).
 *
 * The wall-time folds mirror the client window fold field by field
 * (`deriveStats` in dsh-client-ui-conversation, that fold's whole-window
 * fallback role): model time is `step/start` → `assistant/message`, first
 * token is the first non-empty delta chunk and survives an in-step
 * `llm/retry`, decode spans first token → assembled message on steps that
 * also report output tokens, and tool time pairs `tool/call` → `tool/result`
 * by callId. A cancelled step assembles no message, so its partial stream
 * time stays uncounted in every time figure — matching the window, which
 * renders it as an untimed interrupted node.
 *
 * @module @z/dsh-session-stats/projection
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
exports.sessionStatsProjectionDefinition = void 0;
var zod_1 = require("zod");
var message_1 = require("@z/dsh-llm/message");
var sessionStatsSchema = zod_1.z.object({
    turns: zod_1.z.number().int().nonnegative(),
    steps: zod_1.z.number().int().nonnegative(),
    toolCalls: zod_1.z.number().int().nonnegative(),
    llmMs: zod_1.z.number().nonnegative(),
    toolMs: zod_1.z.number().nonnegative(),
    ttftMs: zod_1.z.number().nonnegative(),
    ttftSteps: zod_1.z.number().int().nonnegative(),
    decodeMs: zod_1.z.number().nonnegative(),
    decodeTokens: zod_1.z.number().nonnegative(),
}).strict();
/**
 * The fold state's shape (totals plus in-flight boundaries), validated on
 * persisted-cache rows after their `ver` gate — the unit's input boundary.
 * The view is a strict subset of the state, so this schema extends
 * `sessionStatsSchema` (the wire output boundary) with the boundary fields.
 */
var sessionStatsStateSchema = sessionStatsSchema.extend({
    lastTurn: zod_1.z.number().int().nonnegative().nullable(),
    openStep: zod_1.z.object({
        turn: zod_1.z.number().int().nonnegative(),
        step: zod_1.z.number().int().nonnegative(),
        startTime: zod_1.z.number().nonnegative(),
        firstTokenTime: zod_1.z.number().nonnegative().nullable(),
    }).nullable(),
    pendingCalls: zod_1.z.record(zod_1.z.string(), zod_1.z.number().nonnegative()),
});
/**
 * Provider-reported completion tokens, guarded the way the window fold guards
 * node usage.
 * @param usage - the assistant/message event's optional usage record.
 * @returns the output-token count, or null when unreported or invalid.
 */
function usageOutputTokens(usage) {
    if (typeof usage !== 'object' || usage === null)
        return null;
    var value = usage.outputTokens;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
/** The `sessionStats` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
exports.sessionStatsProjectionDefinition = {
    key: 'sessionStats',
    stateVersion: 2,
    stateSchema: sessionStatsStateSchema,
    init: function () { return ({
        turns: 0,
        steps: 0,
        toolCalls: 0,
        llmMs: 0,
        toolMs: 0,
        ttftMs: 0,
        ttftSteps: 0,
        decodeMs: 0,
        decodeTokens: 0,
        lastTurn: null,
        openStep: null,
        pendingCalls: {},
    }); },
    apply: function (state, event) {
        var _a;
        // Every uninteresting event returns the same reference (Object.is gates the change feed).
        // Code Mode start events are an optional tool-runtime event augmentation;
        // count them without making this projection depend on the tool package.
        if (event.type === 'tool/code-dispatch-start') {
            return __assign(__assign({}, state), { toolCalls: state.toolCalls + 1 });
        }
        switch (event.type) {
            case 'step/start':
                return __assign(__assign({}, state), { openStep: { turn: event.data.turn, step: event.data.step, startTime: event.time, firstTokenTime: null } });
            case 'assistant/chunk': {
                var open_1 = state.openStep;
                if (open_1 === null || open_1.turn !== event.data.turn || open_1.step !== event.data.step)
                    return state;
                if (open_1.firstTokenTime !== null || !(0, message_1.isTokenDelta)(event.data.chunk))
                    return state;
                return __assign(__assign({}, state), { openStep: __assign(__assign({}, open_1), { firstTokenTime: event.time }) });
            }
            case 'assistant/message': {
                var open_2 = state.openStep;
                if (open_2 === null || open_2.turn !== event.data.turn || open_2.step !== event.data.step)
                    return state;
                // One assembled message per step: closing the boundary means a
                // defensive duplicate cannot accrue twice.
                var next = __assign(__assign({}, state), { llmMs: state.llmMs + Math.max(0, event.time - open_2.startTime), openStep: null });
                if (open_2.firstTokenTime !== null) {
                    next.ttftMs += Math.max(0, open_2.firstTokenTime - open_2.startTime);
                    next.ttftSteps += 1;
                    var outputTokens = usageOutputTokens(event.data.usage);
                    if (outputTokens !== null) {
                        next.decodeMs += Math.max(0, event.time - open_2.firstTokenTime);
                        next.decodeTokens += outputTokens;
                    }
                }
                return next;
            }
            case 'tool/call':
                return __assign(__assign({}, state), { toolCalls: state.toolCalls + 1, pendingCalls: __assign(__assign({}, state.pendingCalls), (_a = {}, _a[event.data.callId] = event.time, _a)) });
            case 'tool/result': {
                // Own-key check: callId is provider-minted (model/tool JSON boundary),
                // so a prototype property name ('constructor', 'toString') on a result
                // with no recorded call must read as unmatched, not as an inherited
                // function that would poison toolMs with NaN.
                var callId_1 = event.data.message.source.callId;
                var dispatched = Object.hasOwn(state.pendingCalls, callId_1) ? state.pendingCalls[callId_1] : undefined;
                if (dispatched === undefined)
                    return state;
                var pendingCalls = Object.fromEntries(Object.entries(state.pendingCalls).filter(function (_a) {
                    var id = _a[0];
                    return id !== callId_1;
                }));
                return __assign(__assign({}, state), { toolMs: state.toolMs + Math.max(0, event.time - dispatched), pendingCalls: pendingCalls });
            }
            case 'step/end':
                return __assign(__assign({}, state), { turns: state.lastTurn === event.data.turn ? state.turns : state.turns + 1, steps: state.steps + 1, lastTurn: event.data.turn, openStep: null });
            case 'turn/end':
                // A call whose result never landed belongs to a cancelled or failed
                // turn; results always land within their turn, so drop the leftovers
                // instead of growing persisted state forever.
                return Object.keys(state.pendingCalls).length === 0 ? state : __assign(__assign({}, state), { pendingCalls: {} });
            default:
                return state;
        }
    },
    wire: {
        viewSchema: sessionStatsSchema,
        view: function (state) { return ({
            turns: state.turns,
            steps: state.steps,
            toolCalls: state.toolCalls,
            llmMs: state.llmMs,
            toolMs: state.toolMs,
            ttftMs: state.ttftMs,
            ttftSteps: state.ttftSteps,
            decodeMs: state.decodeMs,
            decodeTokens: state.decodeTokens,
        }); },
    },
};
