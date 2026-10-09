"use strict";
/**
 * Durable pi-ai replay metadata and assistant-history reconstruction.
 *
 * Harness content remains the durable source for text and tool calls. This
 * module stores only the provider-native metadata needed to reconstruct a
 * pi-ai assistant message on a later request.
 *
 * @module dsh-llm-pi-ai/replay
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
exports.toPiReplayState = toPiReplayState;
exports.toPiAssistant = toPiAssistant;
var dsh_llm_1 = require("@z/dsh-llm");
/** Parse tool-call argument JSON; tolerate model malformations with {}. */
function parseArguments(raw) {
    try {
        var parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed;
        }
    }
    catch (_a) {
        // fall through
    }
    return {};
}
/** Construct the zero usage value required by historical pi-ai messages. */
function emptyPiUsage() {
    return {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
}
/**
 * Project a successful pi-ai response into the minimal durable replay state.
 * The per-block half is index-aligned with the streamed blocks (pi-ai content
 * order), so `BlockAssembler` prunes an entry with its block whenever assembly
 * removes one.
 * @param message - completed native pi-ai assistant response.
 * @returns the versioned lossless-JSON replay projection.
 */
function toPiReplayState(message) {
    var response = __assign(__assign(__assign({ kind: 'pi-ai', version: 2, api: message.api, provider: message.provider, model: message.model }, message.responseModel === undefined ? {} : { responseModel: message.responseModel }), message.responseId === undefined ? {} : { responseId: message.responseId }), { stopReason: message.stopReason });
    return {
        response: response,
        blocks: message.content.map(function (block) {
            switch (block.type) {
                case 'text': return __assign({ type: 'text' }, block.textSignature === undefined ? {} : { textSignature: block.textSignature });
                case 'thinking': return __assign(__assign({ type: 'reasoning' }, block.thinkingSignature === undefined ? {} : { thinkingSignature: block.thinkingSignature }), block.redacted === undefined ? {} : { redacted: block.redacted });
                case 'toolCall': return __assign({ type: 'tool-call' }, block.thoughtSignature === undefined ? {} : { thoughtSignature: block.thoughtSignature });
            }
        }),
    };
}
function invalidReplay(message) {
    throw new dsh_llm_1.LlmError("invalid pi-ai replay state: ".concat(message), 'INVALID_REPLAY_STATE');
}
/** Validate the durable adapter-private envelope before it reaches pi-ai. */
function readReplayState(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return invalidReplay('expected a replay envelope');
    var envelope = value;
    var rawResponse = envelope['response'];
    if (typeof rawResponse !== 'object' || rawResponse === null || Array.isArray(rawResponse))
        return invalidReplay('expected a response object');
    var response = rawResponse;
    if (response['kind'] !== 'pi-ai')
        return invalidReplay('unknown state kind');
    if (response['version'] !== 2)
        return invalidReplay("unsupported version ".concat(String(response['version'])));
    for (var _i = 0, _a = ['api', 'provider', 'model']; _i < _a.length; _i++) {
        var key = _a[_i];
        if (typeof response[key] !== 'string' || response[key].length === 0)
            return invalidReplay("".concat(key, " must be a non-empty string"));
    }
    if (!['stop', 'length', 'toolUse', 'error', 'aborted'].includes(String(response['stopReason']))) {
        return invalidReplay('unknown stopReason');
    }
    if (response['responseModel'] !== undefined && typeof response['responseModel'] !== 'string')
        return invalidReplay('responseModel must be a string');
    if (response['responseId'] !== undefined && typeof response['responseId'] !== 'string')
        return invalidReplay('responseId must be a string');
    var blocks = envelope['blocks'];
    if (!Array.isArray(blocks))
        return invalidReplay('blocks must be an array');
    for (var _b = 0, _c = blocks.entries(); _b < _c.length; _b++) {
        var _d = _c[_b], index = _d[0], value_1 = _d[1];
        if (typeof value_1 !== 'object' || value_1 === null || Array.isArray(value_1))
            return invalidReplay("block ".concat(index, " must be an object"));
        var block = value_1;
        if (!['text', 'reasoning', 'tool-call'].includes(String(block['type'])))
            return invalidReplay("block ".concat(index, " has an unknown type"));
        for (var _e = 0, _f = ['textSignature', 'thinkingSignature', 'thoughtSignature']; _e < _f.length; _e++) {
            var signature = _f[_e];
            if (block[signature] !== undefined && typeof block[signature] !== 'string')
                return invalidReplay("block ".concat(index, " ").concat(signature, " must be a string"));
        }
        if (block['redacted'] !== undefined && typeof block['redacted'] !== 'boolean')
            return invalidReplay("block ".concat(index, " redacted must be boolean"));
    }
    return {
        response: response,
        blocks: blocks,
    };
}
/** Convert provider-neutral blocks without trusting them as same-model replay. */
function foreignAssistant(message) {
    var _a, _b;
    var source = message.source.kind === 'model' ? message.source : undefined;
    var content = [];
    for (var _i = 0, _c = message.content; _i < _c.length; _i++) {
        var block = _c[_i];
        switch (block.type) {
            case 'text':
                content.push({ type: 'text', text: block.text });
                break;
            case 'reasoning':
                content.push({ type: 'thinking', thinking: block.text });
                break;
            case 'tool-call':
                content.push({
                    type: 'toolCall',
                    id: block.id,
                    name: block.name,
                    arguments: parseArguments(block.arguments),
                });
                break;
            case 'image':
                throw new dsh_llm_1.LlmError('pi-ai chat history cannot represent structured assistant image output', 'UNSUPPORTED_CONTENT');
            default:
                // plugin-added block types are not representable in pi-ai.
                break;
        }
    }
    return {
        role: 'assistant',
        content: content,
        // Deliberately never equals a catalog API: absent replay state is foreign
        // even if source names the same provider/model as this request.
        api: 'dsh-foreign',
        provider: (_a = source === null || source === void 0 ? void 0 : source.provider) !== null && _a !== void 0 ? _a : 'dsh-foreign',
        model: (_b = source === null || source === void 0 ? void 0 : source.model) !== null && _b !== void 0 ? _b : 'dsh-foreign',
        usage: emptyPiUsage(),
        stopReason: content.some(function (piece) { return piece.type === 'toolCall'; }) ? 'toolUse' : 'stop',
        timestamp: 0,
    };
}
/** Recombine durable Harness content with validated pi-ai replay metadata. */
function replayedAssistant(message, source, rawState) {
    var state = readReplayState(rawState);
    if (state.response.provider !== source.provider)
        return invalidReplay('provider does not match assistant source');
    if (state.response.model !== source.model)
        return invalidReplay('model does not match assistant source');
    if (state.blocks.length !== message.content.length)
        return invalidReplay('block count does not match assistant content');
    var content = message.content.map(function (block, index) {
        var replay = state.blocks[index];
        if (replay === undefined || replay.type !== block.type)
            return invalidReplay("block ".concat(index, " does not match assistant content"));
        switch (block.type) {
            case 'text': return __assign({ type: 'text', text: block.text }, replay.type === 'text' && replay.textSignature !== undefined ? { textSignature: replay.textSignature } : {});
            case 'reasoning': return __assign(__assign({ type: 'thinking', thinking: block.text }, replay.type === 'reasoning' && replay.thinkingSignature !== undefined ? { thinkingSignature: replay.thinkingSignature } : {}), replay.type === 'reasoning' && replay.redacted !== undefined ? { redacted: replay.redacted } : {});
            case 'tool-call': return __assign({ type: 'toolCall', id: block.id, name: block.name, arguments: parseArguments(block.arguments) }, replay.type === 'tool-call' && replay.thoughtSignature !== undefined ? { thoughtSignature: replay.thoughtSignature } : {});
            /* v8 ignore next -- readReplayState rejects unknown replay tags, so an equal plugin-added Harness tag cannot reach this switch */
            default: return invalidReplay("block ".concat(index, " has an unsupported Harness type"));
        }
    });
    return __assign(__assign(__assign({ role: 'assistant', content: content, api: state.response.api, provider: state.response.provider, model: state.response.model }, state.response.responseModel === undefined ? {} : { responseModel: state.response.responseModel }), state.response.responseId === undefined ? {} : { responseId: state.response.responseId }), { usage: emptyPiUsage(), stopReason: state.response.stopReason, timestamp: 0 });
}
/**
 * Convert one durable Harness assistant message into pi-ai history.
 *
 * Durable content is the authoritative record; replay metadata only restores
 * native fidelity (ids, signatures). A replay state this build cannot use —
 * another adapter's kind, another version, a malformed value, or metadata that
 * no longer matches the content — therefore degrades the one message to
 * provider-neutral history instead of failing the request.
 * @param message - assistant content with required source and optional adapter-owned replay metadata.
 * @param onDegrade - called with the diagnostic reason when an unusable replay
 *   state falls back to provider-neutral conversion.
 * @returns a native pi-ai assistant message reconstructed from durable content.
 */
function toPiAssistant(message, onDegrade) {
    var source = message.source;
    if (source.kind !== 'model' || source.replayState === undefined)
        return foreignAssistant(message);
    try {
        return replayedAssistant(message, source, source.replayState);
    }
    catch (error) {
        /* v8 ignore next -- replayedAssistant throws only INVALID_REPLAY_STATE LlmErrors today; the
           guard keeps a future non-replay failure loud instead of silently degrading it */
        if (!(error instanceof dsh_llm_1.LlmError) || error.code !== 'INVALID_REPLAY_STATE')
            throw error;
        onDegrade === null || onDegrade === void 0 ? void 0 : onDegrade(error.message);
        return foreignAssistant(message);
    }
}
