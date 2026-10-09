"use strict";
/** First-human-message model provider for `ctx.sessionTitle`. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
var schemastery_1 = require("@z/schemastery");
var dsh_session_title_llm_1 = require("@z/dsh-session-title-llm");
exports.name = 'session-title-first-prompt-llm';
exports.inject = ['sessionTitle', 'llm', 'sessions'];
/** Loader schema shared with the all-messages provider. */
/* jscpd:ignore-start -- Loader requires each plugin to export its own statically walkable schema; the field validators remain shared. */
exports.Config = schemastery_1.default.object({
    targetWords: dsh_session_title_llm_1.SessionTitleLlmConfigFields.targetWords,
    targetCjkCharacters: dsh_session_title_llm_1.SessionTitleLlmConfigFields.targetCjkCharacters,
    maxInputBytes: dsh_session_title_llm_1.SessionTitleLlmConfigFields.maxInputBytes,
    maxOutputTokens: dsh_session_title_llm_1.SessionTitleLlmConfigFields.maxOutputTokens,
    timeoutMs: dsh_session_title_llm_1.SessionTitleLlmConfigFields.timeoutMs,
    provider: dsh_session_title_llm_1.SessionTitleLlmConfigFields.provider,
    model: dsh_session_title_llm_1.SessionTitleLlmConfigFields.model,
});
/* jscpd:ignore-end */
/**
 * Register the first-prompt model provider.
 * @param ctx - context exposing session-title, LLM, and session services.
 * @param config - required route, target, byte, token, and timeout policy.
 */
function apply(ctx, config) {
    (0, dsh_session_title_llm_1.registerSessionTitleLlmProvider)(ctx, config, exports.name, 'first-prompt', function (messages) {
        var first = messages[0];
        if (first === undefined)
            throw new Error('first-prompt title provider requires one human message');
        return [first];
    });
}
