"use strict";
/**
 * Harness request-history conversion into pi-ai's Context vocabulary.
 *
 * @module dsh-llm-pi-ai/context
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPiContext = toPiContext;
var dsh_llm_1 = require("@z/dsh-llm");
var replay_ts_1 = require("./replay.ts");
var config_ts_1 = require("./config.ts");
/** Join the text blocks of a harness message. */
function flattenText(message) {
    return message.content
        .filter(function (block) { return block.type === 'text'; })
        .map(function (block) { return block.text; })
        .join('');
}
/** Flatten text recursively inside one tool result. */
function toolResultText(blocks) {
    return blocks.map(function (block) { return block.type === 'text'
        ? block.text
        : block.type === 'tool-result' ? toolResultText(block.content) : ''; }).join('');
}
/** Reject image roles that pi-ai cannot replay before request-size offloading can replace them. */
function assertSupportedImageRoles(messages) {
    for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
        var message = messages_1[_i];
        if (message.role !== 'user' && (0, dsh_llm_1.contentHasImage)(message.content)) {
            throw new dsh_llm_1.LlmError("pi-ai cannot represent an image in an in-history ".concat(message.role, " message"), 'UNSUPPORTED_CONTENT');
        }
    }
}
function userContent(blocks, requestImages) {
    return __awaiter(this, void 0, void 0, function () {
        var content, _i, blocks_1, block, _a, version, nested;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    content = [];
                    _i = 0, blocks_1 = blocks;
                    _b.label = 1;
                case 1:
                    if (!(_i < blocks_1.length)) return [3 /*break*/, 8];
                    block = blocks_1[_i];
                    _a = block.type;
                    switch (_a) {
                        case 'text': return [3 /*break*/, 2];
                        case 'image': return [3 /*break*/, 3];
                        case 'tool-result': return [3 /*break*/, 4];
                    }
                    return [3 /*break*/, 6];
                case 2:
                    if (block.text.length > 0)
                        content.push({ type: 'text', text: block.text });
                    return [3 /*break*/, 7];
                case 3:
                    {
                        version = requestImages.get(block.attachment.attachmentId);
                        content.push({ type: 'text', text: (0, dsh_llm_1.requestImageHandleText)(version) });
                        content.push({
                            type: 'image',
                            data: Buffer.from(version.data).toString('base64'),
                            mimeType: version.mediaType,
                        });
                        return [3 /*break*/, 7];
                    }
                    _b.label = 4;
                case 4: return [4 /*yield*/, userContent(block.content, requestImages)];
                case 5:
                    nested = _b.sent();
                    if (typeof nested === 'string') {
                        if (nested.length > 0)
                            content.push({ type: 'text', text: nested });
                    }
                    else {
                        content.push.apply(content, nested);
                    }
                    return [3 /*break*/, 7];
                case 6: 
                // Other merge-extensible blocks are not user-input vocabulary for pi-ai.
                return [3 /*break*/, 7];
                case 7:
                    _i++;
                    return [3 /*break*/, 1];
                case 8:
                    if (content.every(function (block) { return block.type === 'text'; }))
                        return [2 /*return*/, content.map(function (block) { return block.text; }).join('')];
                    return [2 /*return*/, content];
            }
        });
    });
}
function collectImageRefs(blocks, refs) {
    for (var _i = 0, blocks_2 = blocks; _i < blocks_2.length; _i++) {
        var block = blocks_2[_i];
        if (block.type === 'image')
            refs.set(block.attachment.attachmentId, block.attachment);
        else if (block.type === 'tool-result')
            collectImageRefs(block.content, refs);
    }
}
function prepareRequestImages(messages, attachments, policy, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var refs, _i, messages_2, message, orderedRefs, prepared, versions, _a, _b, _c, index, ref;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    refs = new Map();
                    for (_i = 0, messages_2 = messages; _i < messages_2.length; _i++) {
                        message = messages_2[_i];
                        collectImageRefs(message.content, refs);
                    }
                    orderedRefs = __spreadArray([], refs.values(), true);
                    return [4 /*yield*/, Promise.all(orderedRefs.map(function (ref) { return attachments.readImageRequest(ref, policy, signal); }))];
                case 1:
                    prepared = _d.sent();
                    versions = new Map();
                    for (_a = 0, _b = orderedRefs.entries(); _a < _b.length; _a++) {
                        _c = _b[_a], index = _c[0], ref = _c[1];
                        versions.set(ref.attachmentId, prepared[index]);
                    }
                    return [2 /*return*/, versions];
            }
        });
    });
}
function toolsOf(options) {
    var _a;
    return (_a = options.tools) === null || _a === void 0 ? void 0 : _a.map(function (tool) { return ({
        name: tool.name,
        description: tool.description,
        // ToolSchema.parameters is a JSON Schema object; pi-ai's TSchema
        // (TypeBox) is structurally JSON Schema, so it assigns directly.
        parameters: tool.parameters,
    }); });
}
/** Assemble the request-level pi-ai context envelope shared by both conversion paths. */
function piContext(options, messages) {
    var tools = toolsOf(options);
    return __assign(__assign(__assign({}, options.system !== undefined ? { systemPrompt: options.system } : {}), { messages: messages }), tools !== undefined && tools.length > 0 ? { tools: tools } : {});
}
function textOnlyContext(options, onReplayDegrade) {
    var _a, _b;
    var toolNames = new Map();
    var messages = [];
    for (var _i = 0, _c = options.messages; _i < _c.length; _i++) {
        var message = _c[_i];
        if ((0, dsh_llm_1.contentHasImage)(message.content)) {
            throw new dsh_llm_1.LlmError('pi-ai image conversion requires the durable attachment service', 'UNSUPPORTED_CONTENT');
        }
        if (message.role === 'system') {
            messages.push({ role: 'user', content: flattenText(message), timestamp: 0 });
            continue;
        }
        if (message.role === 'assistant') {
            var assistant = (0, replay_ts_1.toPiAssistant)(message, onReplayDegrade);
            for (var _d = 0, _e = assistant.content; _d < _e.length; _d++) {
                var block = _e[_d];
                if (block.type === 'toolCall')
                    toolNames.set((0, dsh_llm_1.CallId)(block.id), block.name);
            }
            messages.push(assistant);
            continue;
        }
        var text = flattenText(message);
        var results = message.content.filter(function (block) { return block.type === 'tool-result'; });
        if (text.length > 0 || results.length === 0)
            messages.push({ role: 'user', content: text, timestamp: 0 });
        for (var _f = 0, results_1 = results; _f < results_1.length; _f++) {
            var result = results_1[_f];
            messages.push({
                role: 'toolResult',
                toolCallId: result.toolCallId,
                toolName: (_a = toolNames.get(result.toolCallId)) !== null && _a !== void 0 ? _a : 'unknown',
                content: [{
                        type: 'text',
                        text: toolResultText(result.content) || '(no output)',
                    }],
                isError: (_b = result.isError) !== null && _b !== void 0 ? _b : false,
                timestamp: 0,
            });
        }
    }
    return piContext(options, messages);
}
function toPiContext(options, attachments, onReplayDegrade, maxRequestImageBytes, requestImagePolicy) {
    return attachments === undefined
        ? textOnlyContext(options, onReplayDegrade)
        : toPiContextWithImages(options, attachments, onReplayDegrade, maxRequestImageBytes, requestImagePolicy);
}
function toPiContextWithImages(options_1, attachments_1, onReplayDegrade_1, maxRequestImageBytes_1) {
    return __awaiter(this, arguments, void 0, function (options, attachments, onReplayDegrade, maxRequestImageBytes, requestImagePolicy) {
        var requestMessages, requestImages, exactMessages, toolNames, messages, _i, exactMessages_1, message, assistant, _a, _b, block, regular, content, results, _c, results_2, result, resultContent;
        var _d, _e;
        if (requestImagePolicy === void 0) { requestImagePolicy = {
            maxPixels: config_ts_1.DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
            maxBytes: config_ts_1.DEFAULT_REQUEST_IMAGE_MAX_BYTES,
        }; }
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    assertSupportedImageRoles(options.messages);
                    requestMessages = (0, dsh_llm_1.offloadRequestImagesWithPolicy)(options.messages, __assign(__assign({ representation: 'base64' }, maxRequestImageBytes === undefined ? {} : { maxBytes: maxRequestImageBytes }), { byteQuantum: 1, byteLength: function (ref) { return Math.min(ref.bytes, requestImagePolicy.maxBytes); } }));
                    return [4 /*yield*/, prepareRequestImages(requestMessages, attachments, requestImagePolicy, options.signal)];
                case 1:
                    requestImages = _f.sent();
                    exactMessages = (0, dsh_llm_1.offloadRequestImagesWithPolicy)(requestMessages, __assign(__assign({ representation: 'base64' }, maxRequestImageBytes === undefined ? {} : { maxBytes: maxRequestImageBytes }), { byteQuantum: 1, byteLength: function (ref) { return requestImages.get(ref.attachmentId).bytes; } }));
                    toolNames = new Map();
                    messages = [];
                    _i = 0, exactMessages_1 = exactMessages;
                    _f.label = 2;
                case 2:
                    if (!(_i < exactMessages_1.length)) return [3 /*break*/, 8];
                    message = exactMessages_1[_i];
                    if (message.role === 'system') {
                        // pi-ai has a single systemPrompt slot; in-history system messages are
                        // folded into user messages to preserve order (rare in practice — the
                        // harness sends the system prompt via options.system).
                        messages.push({ role: 'user', content: flattenText(message), timestamp: 0 });
                        return [3 /*break*/, 7];
                    }
                    if (message.role === 'assistant') {
                        assistant = (0, replay_ts_1.toPiAssistant)(message, onReplayDegrade);
                        for (_a = 0, _b = assistant.content; _a < _b.length; _a++) {
                            block = _b[_a];
                            if (block.type === 'toolCall')
                                toolNames.set((0, dsh_llm_1.CallId)(block.id), block.name);
                        }
                        messages.push(assistant);
                        return [3 /*break*/, 7];
                    }
                    regular = message.content.filter(function (block) { return block.type !== 'tool-result'; });
                    return [4 /*yield*/, userContent(regular, requestImages)];
                case 3:
                    content = _f.sent();
                    results = message.content.filter(function (block) { return (block.type === 'tool-result'); });
                    if (content.length > 0 || results.length === 0) {
                        messages.push({ role: 'user', content: content, timestamp: 0 });
                    }
                    _c = 0, results_2 = results;
                    _f.label = 4;
                case 4:
                    if (!(_c < results_2.length)) return [3 /*break*/, 7];
                    result = results_2[_c];
                    return [4 /*yield*/, userContent(result.content, requestImages)];
                case 5:
                    resultContent = _f.sent();
                    messages.push({
                        role: 'toolResult',
                        toolCallId: result.toolCallId,
                        toolName: (_d = toolNames.get(result.toolCallId)) !== null && _d !== void 0 ? _d : 'unknown',
                        content: typeof resultContent === 'string'
                            ? [{ type: 'text', text: resultContent || '(no output)' }]
                            : resultContent,
                        isError: (_e = result.isError) !== null && _e !== void 0 ? _e : false,
                        timestamp: 0,
                    });
                    _f.label = 6;
                case 6:
                    _c++;
                    return [3 /*break*/, 4];
                case 7:
                    _i++;
                    return [3 /*break*/, 2];
                case 8: return [2 /*return*/, piContext(options, messages)];
            }
        });
    });
}
