"use strict";
// Shared assistant step-timing fold: Chat Definitions and the Trajectory
// history fold derive AssistantTiming from the same step/start -> first token
// delta -> assistant/message sequence.
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
exports.isTokenDelta = void 0;
exports.assistantStepKey = assistantStepKey;
exports.indexAssistantStepTiming = indexAssistantStepTiming;
exports.settledAssistantTiming = settledAssistantTiming;
var message_1 = require("@z/dsh-llm/message");
// The first-token predicate lives beside the StreamChunk type in dsh-llm;
// re-exported here so Chat Definitions keep their client-runtime import.
var message_2 = require("@z/dsh-llm/message");
Object.defineProperty(exports, "isTokenDelta", { enumerable: true, get: function () { return message_2.isTokenDelta; } });
/**
 * Composite map key for one assistant step.
 * @param turn - turn number from the event payload.
 * @param step - step number from the event payload.
 * @returns collision-free `turn`/`step` key (NUL separator).
 */
function assistantStepKey(turn, step) {
    return "".concat(turn, "\0").concat(step);
}
/**
 * Fold one event into the per-step timing index: step/start opens the entry,
 * the first non-empty token delta stamps first-token time once. Other event
 * types are no-ops.
 * @param steps - the mutable per-step index, keyed by {@link assistantStepKey}.
 * @param event - the raw window event.
 */
function indexAssistantStepTiming(steps, event) {
    var _a;
    if (event.type === 'step/start') {
        steps.set(assistantStepKey(event.data.turn, event.data.step), { stepStartTime: event.time, firstTokenTime: null });
    }
    else if (event.type === 'assistant/chunk' && (0, message_1.isTokenDelta)(event.data.chunk)) {
        var key = assistantStepKey(event.data.turn, event.data.step);
        var current = (_a = steps.get(key)) !== null && _a !== void 0 ? _a : { stepStartTime: null, firstTokenTime: null };
        if (current.firstTokenTime === null) {
            steps.set(key, __assign(__assign({}, current), { firstTokenTime: event.time }));
        }
    }
}
/**
 * Settle one finalized assistant message's timing from its step entry; a step
 * whose start or first token fell outside the window yields null boundaries.
 * @param steps - the per-step index built by {@link indexAssistantStepTiming}.
 * @param turn - the assistant/message turn number.
 * @param step - the assistant/message step number.
 * @param completedTime - the assistant/message event timestamp (epoch ms).
 * @returns the node-ready timing record.
 */
function settledAssistantTiming(steps, turn, step, completedTime) {
    var _a;
    return __assign(__assign({}, ((_a = steps.get(assistantStepKey(turn, step))) !== null && _a !== void 0 ? _a : { stepStartTime: null, firstTokenTime: null })), { completedTime: completedTime });
}
