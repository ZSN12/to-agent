"use strict";
// ConversationSnapshot / ConversationNode: the only data shape the logic layer feeds the UI.
// Publication contract: every change swaps the top-level object; unchanged
// substructures keep their references (the React.memo premise). Chat node and
// Location stores are stable live readers, so old snapshots are not time-point
// views. callId/approvalId stay plain string here (narrow to real brands when
// convenient).
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_CHAT_SNAPSHOT = exports.EMPTY_CONVERSATION_VIEWS = void 0;
exports.toAssistantBlocks = toAssistantBlocks;
exports.toAssistantBlock = toAssistantBlock;
/**
 * core ContentBlock[] -> AssistantBlock[] (classifier shared by finalized messages and partial block-end).
 * @param content - core content blocks verbatim.
 * @returns UI-classified blocks in source order.
 */
function toAssistantBlocks(content) {
    return content.map(toAssistantBlock);
}
/**
 * Classify one block (ToolCallBlock fields are id/arguments, mapped to callId/argsRaw).
 * @param block - one core content block.
 * @returns the UI classification.
 */
function toAssistantBlock(block) {
    switch (block.type) {
        case 'text': return { kind: 'text', text: block.text };
        case 'reasoning': return { kind: 'reasoning', text: block.text };
        case 'image': return { kind: 'image', attachment: block.attachment };
        case 'tool-call': return { kind: 'tool-call', callId: String(block.id), name: block.name, argsRaw: block.arguments };
        default: return { kind: 'other', block: block };
    }
}
var EMPTY_LIST = [];
var EMPTY_TIMELINE = { turnOrder: EMPTY_LIST, turns: new Map() };
/** Empty target store used by fixtures and Sessions without registered views. */
exports.EMPTY_CONVERSATION_VIEWS = {
    get: function () { return undefined; },
};
/** Empty Chat target used before a view builder is registered. */
exports.EMPTY_CHAT_SNAPSHOT = {
    order: EMPTY_LIST,
    nodes: {
        get: function () { return undefined; },
        values: function () { return EMPTY_LIST; },
    },
    locations: {
        getTurn: function () { return EMPTY_LIST; },
        getStep: function () { return EMPTY_LIST; },
    },
    timeline: EMPTY_TIMELINE,
    legacy: {
        nodes: EMPTY_LIST,
        turnTimings: new Map(),
        turnEnds: new Map(),
        partial: null,
        runningCalls: EMPTY_LIST,
    },
};
