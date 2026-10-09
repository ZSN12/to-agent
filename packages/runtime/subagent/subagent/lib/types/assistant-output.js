"use strict";
/**
 * Canonical selection of a child's final assistant output. Backend run results
 * and `subagent/end.lastAssistantMessage` apply the same rule: select the last
 * non-empty assistant message. An empty-content message records usage only
 * when the loop appends it after a max-tokens step with no executable blocks,
 * so it does not replace earlier output. If no non-empty message exists,
 * select the accumulated assistant text. Selection is independent of the
 * run's stop reason.
 *
 * @module @z/dsh-subagent/assistant-output
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantOutputFold = void 0;
exports.finalAssistantOutput = finalAssistantOutput;
/**
 * Incremental fold of the selection rule, for backends that observe a child's
 * output as it streams: session-event backends {@link push} each event, and
 * transports without session events (ACP content chunks) {@link pushText} raw
 * text into the same streamed fallback.
 */
var AssistantOutputFold = /** @class */ (function () {
    function AssistantOutputFold() {
        this.partial = [];
    }
    /**
     * Fold one session event: a non-empty assistant message becomes the
     * candidate final answer, and a `text-delta` chunk extends the streamed
     * fallback; every other event contributes nothing.
     * @param event - the next observed session event.
     */
    AssistantOutputFold.prototype.push = function (event) {
        if (event.type === 'assistant/message') {
            var content = event.data.message.content;
            if (content.length > 0)
                this.message = content;
        }
        else if (event.type === 'assistant/chunk' && event.data.chunk.type === 'text-delta') {
            this.pushText(event.data.chunk.text);
        }
    };
    /**
     * Extend the streamed fallback with text observed outside session events.
     * @param text - the next streamed text piece (an empty piece is a no-op).
     */
    AssistantOutputFold.prototype.pushText = function (text) {
        if (text.length > 0)
            this.partial.push(text);
    };
    /**
     * Select the final output folded so far.
     * @returns the last non-empty assistant message, else the accumulated
     *   streamed text, or `undefined` when the child produced neither.
     */
    AssistantOutputFold.prototype.collect = function () {
        if (this.message !== undefined)
            return this.message;
        var text = this.partial.join('');
        return text.length > 0 ? [{ type: 'text', text: text }] : undefined;
    };
    return AssistantOutputFold;
}());
exports.AssistantOutputFold = AssistantOutputFold;
/**
 * Apply the selection rule to one complete child-owned event suffix.
 * @param events - the child-owned events (after any seed or epoch boundary).
 * @returns the selected output, or `undefined` when the child produced none.
 */
function finalAssistantOutput(events) {
    // TODO: this folds the complete suffix once per run/epoch settlement. If a
    // long continuable epoch ever profiles hot here, scan backward with early
    // exit for the last non-empty message and fold text deltas only on the
    // no-message fallback.
    var fold = new AssistantOutputFold();
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        fold.push(event_1);
    }
    return fold.collect();
}
