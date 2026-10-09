"use strict";
/** Content-block structure helpers. @module @z/dsh-llm/content */
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
exports.OFFLOADED_IMAGE_TEXT = void 0;
exports.textOnlyImageText = textOnlyImageText;
exports.requestImageHandleText = requestImageHandleText;
exports.contentHasImage = contentHasImage;
exports.projectImagesForTextModel = projectImagesForTextModel;
exports.offloadRequestImages = offloadRequestImages;
exports.offloadRequestImagesWithPolicy = offloadRequestImagesWithPolicy;
/** Model-facing stand-in for an image removed to fit a provider request bound. */
exports.OFFLOADED_IMAGE_TEXT = '[image omitted to keep the request within its image limit; older images are omitted first. If this image is still needed, read its file again when a path is available; otherwise ask the user to attach it again.]';
/**
 * Stable text shown to a model that cannot accept one durable image reference.
 * @param ref - durable master reference omitted from the request.
 * @returns deterministic text-only placeholder.
 */
function textOnlyImageText(ref) {
    var digest = String(ref.attachmentId).slice('sha256:'.length, 'sha256:'.length + 8);
    return "[image omitted because this model accepts text only; attachment sha256:".concat(digest, "]");
}
/**
 * Stable model-facing handle for one exact request image.
 * @param version - exact request image shown beside the text.
 * @returns attachment handle and request-image dimensions.
 */
function requestImageHandleText(version) {
    return "Image ".concat(version.attachment.attachmentId, "; request image ").concat(version.width, "x").concat(version.height, "px.");
}
/**
 * True when typed model content contains an image block, walking nested
 * tool-result content. This is the one recursive image walk shared by every
 * image policy (capability gating, text-only serialization, compaction
 * survey), so a consumer cannot silently diverge on nesting depth.
 * @param content - typed model content blocks.
 * @returns whether any nested block is an image.
 */
function contentHasImage(content) {
    return content.some(function (block) { return block.type === 'image'
        || (block.type === 'tool-result' && contentHasImage(block.content)); });
}
/** Base64 length of raw image bytes, including padding. */
function base64Length(bytes) {
    return Math.ceil(bytes / 3) * 4;
}
/** Collect represented image lengths in request and nested-block order. */
function collectImageLengths(blocks, lengths, policy) {
    for (var _i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
        var block = blocks_1[_i];
        if (block.type === 'image') {
            var bytes = policy.byteLength === undefined
                ? block.attachment.bytes
                : policy.byteLength(block.attachment);
            lengths.push(policy.representation === 'base64' ? base64Length(bytes) : bytes);
        }
        else if (block.type === 'tool-result') {
            collectImageLengths(block.content, lengths, policy);
        }
    }
}
/** Replace the first `remaining.count` image occurrences without mutating durable messages. */
function replaceOldestImages(blocks, remaining) {
    var next;
    for (var _i = 0, _a = blocks.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], index = _b[0], block = _b[1];
        if (block.type === 'image' && remaining.count > 0) {
            remaining.count -= 1;
            next !== null && next !== void 0 ? next : (next = blocks.slice(0, index));
            next.push({ type: 'text', text: exports.OFFLOADED_IMAGE_TEXT });
            continue;
        }
        if (block.type === 'tool-result') {
            var content = replaceOldestImages(block.content, remaining);
            if (content !== block.content) {
                next !== null && next !== void 0 ? next : (next = blocks.slice(0, index));
                next.push(__assign(__assign({}, block), { content: content }));
                continue;
            }
        }
        next === null || next === void 0 ? void 0 : next.push(block);
    }
    return next !== null && next !== void 0 ? next : blocks;
}
/** Replace every image occurrence, including nested tool results, for a text-only model. */
function replaceImagesForTextModel(blocks) {
    var next;
    for (var _i = 0, _a = blocks.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], index = _b[0], block = _b[1];
        if (block.type === 'image') {
            next !== null && next !== void 0 ? next : (next = blocks.slice(0, index));
            next.push({ type: 'text', text: textOnlyImageText(block.attachment) });
            continue;
        }
        if (block.type === 'tool-result') {
            var content = replaceImagesForTextModel(block.content);
            if (content !== block.content) {
                next !== null && next !== void 0 ? next : (next = blocks.slice(0, index));
                next.push(__assign(__assign({}, block), { content: content }));
                continue;
            }
        }
        next === null || next === void 0 ? void 0 : next.push(block);
    }
    return next !== null && next !== void 0 ? next : blocks;
}
/**
 * Project durable image history into deterministic text for an exact text-only model.
 * @param messages - complete request history.
 * @returns the original list without images, otherwise shallow message copies with stable placeholders.
 */
function projectImagesForTextModel(messages) {
    if (!messages.some(function (message) { return contentHasImage(message.content); }))
        return messages;
    return messages.map(function (message) {
        var content = replaceImagesForTextModel(message.content);
        return content === message.content ? message : __assign(__assign({}, message), { content: content });
    });
}
/**
 * Return transient request messages whose oldest images are replaced until
 * their accumulated base64 payload fits the configured bound. The selection
 * is deterministic from durable message order and attachment metadata; a
 * provider can serialize the returned messages without reading omitted bytes.
 * @param messages - complete request history, oldest first.
 * @param maxRequestImageBytes - positive bound on total base64 image payload; undefined preserves every image.
 * @returns the original messages when they already fit, otherwise shallow message copies with replaced content trees.
 */
function offloadRequestImages(messages, maxRequestImageBytes) {
    return offloadRequestImagesWithPolicy(messages, __assign(__assign({ representation: 'base64' }, maxRequestImageBytes === undefined ? {} : { maxBytes: maxRequestImageBytes }), { byteQuantum: 1 }));
}
/**
 * Return a deterministic transient projection whose oldest images are replaced
 * in whole count and byte quanta after a route budget is exceeded. The target
 * depends only on complete durable history: at 129 one-megabyte images under
 * a 128 MiB bound with a 64 MiB quantum, the oldest 65 images are removed so
 * 64 MiB remain; that removed prefix stays fixed until total history exceeds
 * 192 MiB.
 * @param messages - complete request history, oldest first.
 * @param policy - route representation, budgets, and removal quanta.
 * @returns original messages below both bounds, otherwise shallow copies with deterministic placeholders.
 */
function offloadRequestImagesWithPolicy(messages, policy) {
    var _a, _b;
    var lengths = [];
    for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
        var message = messages_1[_i];
        collectImageLengths(message.content, lengths, policy);
    }
    var total = lengths.reduce(function (sum, bytes) { return sum + bytes; }, 0);
    var excessCount = policy.maxImages === undefined ? 0 : Math.max(0, lengths.length - policy.maxImages);
    var excessBytes = policy.maxBytes === undefined ? 0 : Math.max(0, total - policy.maxBytes);
    if (excessCount === 0 && excessBytes === 0)
        return messages;
    var countQuantum = (_a = policy.countQuantum) !== null && _a !== void 0 ? _a : 1;
    var byteQuantum = (_b = policy.byteQuantum) !== null && _b !== void 0 ? _b : 1;
    var removeCount = excessCount === 0 ? 0 : Math.ceil(excessCount / countQuantum) * countQuantum;
    var removeBytes = excessBytes === 0 ? 0 : Math.ceil(excessBytes / byteQuantum) * byteQuantum;
    var count = 0;
    var removedBytes = 0;
    for (var _c = 0, lengths_1 = lengths; _c < lengths_1.length; _c++) {
        var imageBytes = lengths_1[_c];
        var byteTargetMet = removeBytes === 0
            || (byteQuantum === 1 ? removedBytes >= removeBytes : removedBytes > removeBytes);
        if (count >= removeCount && byteTargetMet)
            break;
        removedBytes += imageBytes;
        count += 1;
    }
    var remaining = { count: count };
    return messages.map(function (message) {
        var content = replaceOldestImages(message.content, remaining);
        return content === message.content ? message : __assign(__assign({}, message), { content: content });
    });
}
