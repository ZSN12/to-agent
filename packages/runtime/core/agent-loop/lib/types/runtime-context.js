"use strict";
/**
 * Durable projection state for dynamic runtime context.
 * @module @z/dsh-agent-loop/runtime-context
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeContextProjection = void 0;
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_session_1 = require("@z/dsh-session");
var SOURCE = '@z/dsh-system-prompt';
var CLEARED = 'Current runtime context: none. Earlier runtime-context snapshots no longer apply.';
function isOwned(message) {
    return message.source.kind === 'plugin' && message.source.plugin === SOURCE;
}
function textOf(message) {
    var block = message.content[0];
    return message.content.length === 1 && (block === null || block === void 0 ? void 0 : block.type) === 'text' ? block.text : undefined;
}
/** Tracks the last retained runtime-context snapshot without owning its commit. */
var RuntimeContextProjection = /** @class */ (function () {
    /**
     * Restore projection state once, then follow authoritative session events.
     * @param ctx - agent-scoped event context.
     * @param session - session receiving projected messages.
     */
    function RuntimeContextProjection(ctx, session) {
        var _this = this;
        var _a;
        var surface = new Set(session.surface.nodes);
        for (var index = session.events.length - 1; index >= 0; index -= 1) {
            var event_1 = session.events[index];
            if ((event_1 === null || event_1 === void 0 ? void 0 : event_1.type) !== 'user/message' || !isOwned(event_1.data))
                continue;
            (_a = this.retained) !== null && _a !== void 0 ? _a : (this.retained = null);
            if (surface.has(event_1.seq)) {
                this.retained = { seq: event_1.seq, text: textOf(event_1.data) };
                break;
            }
        }
        ctx.on('session/event', function (subject, event) {
            var _a;
            if (subject !== session)
                return;
            if (event.type === 'user/message' && isOwned(event.data)) {
                _this.retained = { seq: event.seq, text: textOf(event.data) };
            }
            else if (_this.retained
                && (0, dsh_session_1.isReplacementSurfaceEvent)(event)
                && ((_a = event.sourceEventSeqs) === null || _a === void 0 ? void 0 : _a.includes(_this.retained.seq)) === true) {
                _this.retained = null;
            }
        });
    }
    /**
     * Create an uncommitted snapshot only when the retained value differs.
     * @param current - fully rendered dynamic context.
     * @param sections - named contributions that formed the current snapshot.
     * @returns a candidate user message, or `undefined` when no update is needed.
     */
    RuntimeContextProjection.prototype.project = function (current, sections) {
        var _a;
        if (this.retained === undefined && current.length === 0)
            return;
        var snapshot = current.length === 0 ? CLEARED : current;
        if (((_a = this.retained) === null || _a === void 0 ? void 0 : _a.text) === snapshot)
            return;
        return (0, dsh_llm_1.createUserMessage)({
            content: [{ type: 'text', text: snapshot }],
            // The cleared marker has no contributions left to attribute.
            source: sections.length === 0
                ? { kind: 'plugin', plugin: SOURCE }
                : { kind: 'plugin', plugin: SOURCE, form: 'snapshot', sections: sections },
        });
    };
    return RuntimeContextProjection;
}());
exports.RuntimeContextProjection = RuntimeContextProjection;
