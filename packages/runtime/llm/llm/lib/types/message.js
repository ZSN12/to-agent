"use strict";
/** Message value types, identity, and immutable construction helpers. */
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
exports.CONTEXT_SUMMARY_MAX_CHARS = void 0;
exports.boundContextSummary = boundContextSummary;
exports.freezeMessage = freezeMessage;
exports.createMessage = createMessage;
exports.createUserMessage = createUserMessage;
exports.createAssistantMessage = createAssistantMessage;
exports.createToolResultMessage = createToolResultMessage;
exports.isTokenDelta = isTokenDelta;
var brand_ts_1 = require("./brand.ts");
var call_config_ts_1 = require("./call-config.ts");
/**
 * Bound for a `notice` summary. The account rides a collapsed transcript row
 * and is committed to the durable log, while its inputs — task labels, goal
 * objectives, tool arguments — are caller text with no length of their own.
 */
exports.CONTEXT_SUMMARY_MAX_CHARS = 120;
/**
 * Bound one `notice` summary to {@link CONTEXT_SUMMARY_MAX_CHARS}.
 * @param summary - the producer's one-line account, of any length.
 * @returns the account, ellipsized when it exceeds the bound.
 */
function boundContextSummary(summary) {
    return summary.length <= exports.CONTEXT_SUMMARY_MAX_CHARS
        ? summary
        : "".concat(summary.slice(0, exports.CONTEXT_SUMMARY_MAX_CHARS - 1), "\u2026");
}
/**
 * Detach and deep-freeze a message whose identity already exists.
 * @param message - complete message, including its stable identity.
 * @returns an immutable snapshot that preserves the identity.
 */
function freezeMessage(message) {
    return (0, call_config_ts_1.deepFreeze)(structuredClone(message));
}
/**
 * Create one identified message and freeze it before publication.
 * @param input - complete role, content, and source for a new message.
 * @returns an immutable message with a fresh stable identity.
 */
function createMessage(input) {
    return freezeMessage(__assign(__assign({}, input), { id: (0, brand_ts_1.MessageId)(crypto.randomUUID()) }));
}
/**
 * Create one identified user-role message and freeze it before publication.
 * @param input - complete content and source for a new user message.
 * @returns an immutable user message with a fresh stable identity.
 */
function createUserMessage(input) {
    return createMessage(__assign(__assign({}, input), { role: 'user' }));
}
/**
 * Create one identified model-produced assistant message and freeze it before publication.
 * @param input - complete content plus the provider, model, and optional replay state for a new assistant message.
 * @returns an immutable assistant message with fixed role/source tags and a fresh stable identity.
 */
function createAssistantMessage(input) {
    return createMessage({
        role: 'assistant',
        content: input.content,
        source: __assign({ kind: 'model' }, input.source),
    });
}
/**
 * Create and freeze one identified tool-result message.
 * @param input - call identity, raw result blocks, and outcome.
 * @returns an immutable user-role tool-result message.
 */
function createToolResultMessage(input) {
    return createUserMessage({
        source: { kind: 'tool', callId: input.callId },
        content: [{
                type: 'tool-result',
                toolCallId: input.callId,
                content: input.content,
                isError: input.isError,
            }],
    });
}
/**
 * Whether a stream chunk carries visible model output (the first-token
 * boundary shared by client step timing and the whole-log sessionStats
 * projection). Empty deltas (heartbeats, empty tool-call frames) do not count
 * as a first token.
 * @param chunk - the stream chunk to test.
 * @returns true when the chunk contains a non-empty text/reasoning/tool delta.
 */
function isTokenDelta(chunk) {
    switch (chunk.type) {
        case 'text-delta':
        case 'reasoning-delta':
            return chunk.text !== '';
        case 'tool-call-delta':
            return chunk.argumentsDelta !== '' || chunk.name !== undefined;
        default:
            return false;
    }
}
