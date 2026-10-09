"use strict";
/**
 * Crash-recovery repair for an interrupted session log. It preserves a fully
 * written final turn and supplies the missing tool, step, and turn boundaries
 * needed to resume with a provider-valid transcript.
 * @module @z/dsh-session/repair
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
exports.TOOL_OUTCOME_UNKNOWN = exports.TOOL_NOT_STARTED = void 0;
exports.interruptedTurnClosers = interruptedTurnClosers;
var dsh_llm_1 = require("@z/dsh-llm");
/** Recovery code for an assistant tool request that never reached a recorded call start. */
exports.TOOL_NOT_STARTED = 'TOOL_NOT_STARTED';
/** Recovery code for a recorded tool call whose completed outcome was not durably recorded. */
exports.TOOL_OUTCOME_UNKNOWN = 'TOOL_OUTCOME_UNKNOWN';
/**
 * Return deterministic synthetic events that close an open tail turn. Unmatched
 * calls receive error results first, followed by an open `step/end` and an
 * interrupted `turn/end`; sequences continue the log and timestamps reuse the
 * last real event. A balanced or empty log returns no events.
 *
 * @param events - the loaded durable log to scan (a valid committed prefix, possibly with a crash tail).
 * @returns the synthetic closer events to append after `events`, in order; empty when the log is already balanced.
 */
function interruptedTurnClosers(events) {
    var openTurn = null;
    var openStep = null;
    // Reset at each turn boundary so earlier calls cannot leak into tail repair.
    // Assistant blocks register calls; later `tool/call` events add their seqs to `sourceEventSeqs`.
    var pendingCalls = new Map();
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        switch (event_1.type) {
            case 'turn/start':
                openTurn = event_1.data.turn;
                openStep = null;
                pendingCalls.clear();
                break;
            case 'turn/end':
                openTurn = null;
                openStep = null;
                pendingCalls.clear();
                break;
            case 'step/start':
                openStep = event_1.data.step;
                break;
            case 'step/end':
                pendingCalls.clear();
                openStep = null;
                break;
            case 'assistant/message':
                // The assistant message carries the tool-call blocks; each is pending
                // until a tool/result event with the same callId is logged.
                for (var _a = 0, _b = event_1.data.message.content; _a < _b.length; _a++) {
                    var block = _b[_a];
                    if (block.type === 'tool-call')
                        pendingCalls.set(block.id, { step: event_1.data.step });
                }
                break;
            case 'tool/call':
                // Cite the `tool/call` seq from the synthetic result.
                {
                    var entry = pendingCalls.get(event_1.data.callId);
                    if (entry) {
                        entry.callSeq = event_1.seq;
                    }
                }
                break;
            case 'tool/result':
                pendingCalls.delete(event_1.data.message.source.callId);
                break;
            // Other event types do not move the turn/step boundary cursor.
            default:
                break;
        }
    }
    // Balanced log (no crash mid-turn): nothing to close. An open turn implies
    // `events` is non-empty (its turn/start was logged), so `last` exists.
    var last = events.at(-1);
    if (openTurn === null || last === undefined)
        return [];
    // The last real event supplies the seq base and the timestamp for the
    // synthetic closers (reusing the last timestamp keeps them deterministic and
    // never invents a "future" time).
    var seq = last.seq + 1;
    var time = last.time;
    var closers = [];
    // Close calls before their step: providers reject dangling assistant calls,
    // and Map insertion order preserves their transcript order.
    for (var _c = 0, pendingCalls_1 = pendingCalls; _c < pendingCalls_1.length; _c++) {
        var _d = pendingCalls_1[_c], callId = _d[0], _e = _d[1], step = _e.step, callSeq = _e.callSeq;
        var started = callSeq !== undefined;
        var message = (0, dsh_llm_1.freezeMessage)({
            id: (0, dsh_llm_1.MessageId)("interrupted-tool-result-".concat(callId, "-").concat(seq)),
            role: 'user',
            source: { kind: 'tool', callId: callId },
            content: [{
                    type: 'tool-result',
                    toolCallId: callId,
                    isError: true,
                    content: [{
                            type: 'text',
                            text: started
                                ? 'The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly.'
                                : 'The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.',
                        }],
                }],
        });
        closers.push(__assign({ type: 'tool/result', seq: seq++, time: time, data: {
                turn: openTurn,
                step: step,
                message: message,
                error: started
                    ? { name: 'ToolOutcomeUnknownError', code: exports.TOOL_OUTCOME_UNKNOWN }
                    : { name: 'ToolNotStartedError', code: exports.TOOL_NOT_STARTED },
            }, surfaceOp: 'append' }, started ? { sourceEventSeqs: [callSeq] } : {}));
    }
    // Close an open step next — a turn/end while a step is open is an invariant
    // violation, so the step's boundary must be synthesized before the turn's.
    if (openStep !== null) {
        closers.push({ type: 'step/end', seq: seq++, time: time, data: { turn: openTurn, step: openStep } });
    }
    closers.push({ type: 'turn/end', seq: seq++, time: time, data: { turn: openTurn, reason: { kind: 'interrupted' } } });
    return closers;
}
