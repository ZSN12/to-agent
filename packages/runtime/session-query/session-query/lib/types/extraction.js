"use strict";
/** First-party semantic text extraction for session-query consumers. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSessionEventText = extractSessionEventText;
/**
 * Extract searchable semantic text from one first-party session event.
 *
 * Structural boundaries, raw stream chunks, request envelopes, and unknown
 * declaration-merged events contribute no text.
 * @param event - event to inspect.
 * @returns newline-joined semantic text, or an empty string when non-searchable.
 */
function extractSessionEventText(event) {
    var _a, _b, _c, _d;
    switch (event.type) {
        case 'user/message':
            return contentText(event.data.content);
        case 'assistant/message':
            return contentText(event.data.message.content);
        case 'tool/call':
            return joinText([event.data.name, event.data.arguments]);
        case 'tool/result':
            return joinText([
                contentText(event.data.message.content),
                (_b = (_a = event.data.error) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '',
                (_d = (_c = event.data.error) === null || _c === void 0 ? void 0 : _c.code) !== null && _d !== void 0 ? _d : '',
            ]);
        case 'todo/write':
            return joinText(event.data.todos.flatMap(function (todo) { return [todo.status, todo.content]; }));
        case 'turn/end':
            return turnEndText(event.data.reason);
        case 'turn/start':
        case 'step/start':
        case 'step/end':
        case 'assistant/chunk':
        case 'request/header':
            return '';
        // SessionEventMap is merge-extensible. Unknown events remain
        // non-searchable until a concrete first-party consumer defines semantics.
        default:
            return '';
    }
}
function turnEndText(reason) {
    switch (reason.kind) {
        case 'error':
            return joinText(['error', reason.error.message]);
        case 'aborted':
            return 'aborted';
        case 'max-tokens':
        case 'interrupted':
            return reason.kind;
        case 'completed':
            return '';
        // TurnEndReasonMap is merge-extensible. Unknown outcomes stay out until
        // their owner defines which detail is semantic rather than structural.
        default:
            return '';
    }
}
function contentText(content) {
    return joinText(content.flatMap(blockText));
}
function blockText(block) {
    switch (block.type) {
        case 'text':
            return [block.text];
        case 'reasoning':
            return [];
        case 'tool-call':
            return [block.name, block.arguments];
        case 'tool-result':
            return block.content.flatMap(blockText);
        // ContentBlockMap is merge-extensible. Unknown blocks do not become
        // searchable merely because their payload happens to contain strings.
        default:
            return [];
    }
}
function joinText(parts) {
    return parts.map(function (part) { return part.trim(); }).filter(Boolean).join('\n');
}
