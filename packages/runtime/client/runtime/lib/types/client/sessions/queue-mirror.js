"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionQueueMirror = void 0;
var QUEUE_PREVIEW_CHARS = 200;
function previewOf(content) {
    var flat = content
        .map(function (block) { return (block.type === 'text' ? block.text : "[".concat(block.type, "]")); })
        .join(' ').replace(/\s+/g, ' ').trim();
    var chars = Array.from(flat);
    return chars.length > QUEUE_PREVIEW_CHARS ? "".concat(chars.slice(0, QUEUE_PREVIEW_CHARS).join(''), "\u2026") : flat;
}
function textOf(content) {
    if (!content.every(function (block) { return block.type === 'text'; }))
        return null;
    return content.map(function (block) { return block.text; }).join('');
}
/** Authoritative transient queue projection and durable steering handoff. */
var SessionQueueMirror = /** @class */ (function () {
    function SessionQueueMirror() {
        this.current = [];
    }
    /**
     * Return the current immutable queue projection.
     * @returns current queue rows.
     */
    SessionQueueMirror.prototype.snapshot = function () {
        return this.current;
    };
    /**
     * Drop the stale generation before its replacement queue baseline arrives.
     * @returns whether any projected queue row was removed.
     */
    SessionQueueMirror.prototype.reset = function () {
        if (this.current.length === 0)
            return false;
        this.current = [];
        return true;
    };
    /**
     * Replace from one authoritative stream queue frame.
     * @param items - complete host queue snapshot.
     */
    SessionQueueMirror.prototype.replace = function (items) {
        this.current = items.map(function (item) { return ({
            id: item.id,
            messageId: item.message.id,
            placement: item.placement,
            content: item.message.content,
            preview: previewOf(item.message.content),
            text: textOf(item.message.content),
        }); });
    };
    /**
     * Retire a transient steering row once its durable message enters the log.
     * @param event - newly contiguous durable Session event.
     * @returns whether the projection changed.
     */
    SessionQueueMirror.prototype.acceptDurable = function (event) {
        if (event.type !== 'user/message')
            return false;
        var messageId = event.data.id;
        var index = this.current.findIndex(function (item) {
            return item.placement === 'steering' && item.messageId === messageId;
        });
        if (index < 0)
            return false;
        this.current = this.current.filter(function (_item, candidate) { return candidate !== index; });
        return true;
    };
    return SessionQueueMirror;
}());
exports.SessionQueueMirror = SessionQueueMirror;
