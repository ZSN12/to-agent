"use strict";
/** Current-surface projection and byte-bounded rendering. */
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
exports.retainReferencedSession = retainReferencedSession;
var dsh_compaction_1 = require("@z/dsh-compaction");
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_output_retention_1 = require("@z/dsh-output-retention");
var serialization_ts_1 = require("./serialization.ts");
/** Project current user/assistant conversation while excluding tools, reasoning, and injected context. */
function projectSessionConversation(snapshot) {
    var conversation = [];
    for (var _i = 0, _a = snapshot.events; _i < _a.length; _i++) {
        var event_1 = _a[_i];
        switch (event_1.type) {
            case 'user/message': {
                var checkpoint = (0, dsh_compaction_1.isCompactCheckpointSource)(event_1.data.source);
                if (!checkpoint && event_1.data.source.kind !== 'user')
                    break;
                var text = textContent(event_1.data.content);
                if (text !== '')
                    conversation.push({ role: 'user', text: text, checkpoint: checkpoint, originalText: text, omittedBytes: 0 });
                break;
            }
            case 'assistant/message': {
                var text = textContent(event_1.data.message.content);
                if (text !== '')
                    conversation.push({ role: 'assistant', text: text, checkpoint: false, originalText: text, omittedBytes: 0 });
                break;
            }
            case 'tool/result':
                break;
            /* v8 ignore next 2 -- SurfaceEventType is closed and every variant is handled above. */
            default:
                (0, dsh_llm_1.assertNever)(event_1, 'session-reference surface event');
        }
    }
    return conversation;
}
/**
 * Fit one projected snapshot into an exact rendered JSON-object byte cap.
 * @param snapshot - current-surface source observation.
 * @param label - host-provided display label serialized with the source.
 * @param maxBytes - maximum UTF-8 bytes for the serialized data object.
 * @returns retained data and stats, or `undefined` when fixed data cannot fit.
 */
function retainReferencedSession(snapshot, label, maxBytes) {
    var _a;
    var original = projectSessionConversation(snapshot);
    var retained = original.map(function (item) { return (__assign({}, item)); });
    var omittedMessages = 0;
    var droppedOmittedBytes = 0;
    var data = function () {
        var _a;
        return ({
            sessionId: snapshot.session.id,
            label: label,
            cwd: (_a = snapshot.session.cwd) !== null && _a !== void 0 ? _a : null,
            capturedThroughSeq: snapshot.capturedThroughSeq,
            conversation: retained.map(function (_a) {
                var role = _a.role, text = _a.text;
                return ({ role: role, text: text });
            }),
        });
    };
    var size = function () { return Buffer.byteLength((0, serialization_ts_1.stringifyTagSafeJson)(data()), 'utf8'); };
    var _loop_1 = function () {
        var newestIndex = retained.length - 1;
        var dropIndex = retained.findIndex(function (item, index) { return !item.checkpoint && index !== newestIndex; });
        if (dropIndex < 0)
            return "break";
        var removed = retained.splice(dropIndex, 1)[0];
        /* v8 ignore next 3 -- dropIndex came from this exact array and is non-negative. */
        if (removed === undefined) {
            throw new Error('session-reference retention selected a missing message');
        }
        omittedMessages += 1;
        droppedOmittedBytes += Buffer.byteLength(removed.originalText, 'utf8');
    };
    while (size() > maxBytes) {
        var state_1 = _loop_1();
        if (state_1 === "break")
            break;
    }
    while (size() > maxBytes) {
        var longestIndex = -1;
        var longestBytes = 0;
        for (var _i = 0, _b = retained.entries(); _i < _b.length; _i++) {
            var _c = _b[_i], index = _c[0], item_1 = _c[1];
            var bytes = Buffer.byteLength(item_1.text, 'utf8');
            if (bytes > longestBytes) {
                longestBytes = bytes;
                longestIndex = index;
            }
        }
        if (longestIndex < 0 || longestBytes === 0)
            return undefined;
        var overflow = size() - maxBytes;
        var target = Math.max(0, longestBytes - overflow);
        var item = retained[longestIndex];
        /* v8 ignore next 3 -- longestIndex was selected from this exact array's entries. */
        if (item === undefined) {
            throw new Error('session-reference retention selected a missing longest message');
        }
        var shortened = truncateWithNotice(item.originalText, target);
        /* v8 ignore next -- strictly lowering the byte target must change a complete-string retention result. */
        if (shortened.text === ((_a = retained[longestIndex]) === null || _a === void 0 ? void 0 : _a.text))
            return undefined;
        retained[longestIndex] = __assign(__assign({}, item), { text: shortened.text, omittedBytes: shortened.omittedBytes });
    }
    var compacted = original.some(function (item) { return item.checkpoint; });
    var retainedOmittedBytes = retained.reduce(function (sum, item) { return sum + item.omittedBytes; }, 0);
    var omittedBytes = retainedOmittedBytes + droppedOmittedBytes;
    return {
        data: data(),
        stats: {
            compacted: compacted,
            originalMessages: original.length,
            retainedMessages: retained.length,
            omittedMessages: omittedMessages,
            omittedBytes: omittedBytes,
            truncated: omittedMessages > 0 || omittedBytes > 0,
        },
    };
}
function textContent(content) {
    return content.flatMap(function (block) { return block.type === 'text' && typeof block.text === 'string' ? [block.text] : []; }).join('\n');
}
function truncateWithNotice(text, maxOutputBytes) {
    /* v8 ignore next -- callers invoke this only with a target smaller than the selected original text. */
    if (Buffer.byteLength(text, 'utf8') <= maxOutputBytes)
        return { text: text, omittedBytes: 0 };
    var low = 0;
    var high = maxOutputBytes;
    var best = { text: '', omittedBytes: Buffer.byteLength(text, 'utf8') };
    while (low <= high) {
        var retainedBytes = Math.floor((low + high) / 2);
        var headBytes = Math.ceil(retainedBytes / 2);
        var tailBytes = Math.floor(retainedBytes / 2);
        var retainer = new dsh_output_retention_1.TextRetainer({ kind: 'headTail', headBytes: headBytes, tailBytes: tailBytes });
        retainer.push(text);
        var result = retainer.finish();
        // The complete source string was pushed before `finish()`, so omission is exact.
        /* v8 ignore next 3 -- complete-string TextRetainer input cannot report a lower bound. */
        if (result.omittedBytes.kind !== 'exact') {
            throw new Error('session-reference retention did not report exact omitted bytes');
        }
        var omitted = result.omittedBytes.count;
        var candidate = "".concat(result.text, "\n[\u2026 omitted ").concat(omitted, " UTF-8 bytes \u2026]");
        if (Buffer.byteLength(candidate, 'utf8') <= maxOutputBytes) {
            best = { text: candidate, omittedBytes: omitted };
            low = retainedBytes + 1;
        }
        else {
            high = retainedBytes - 1;
        }
    }
    return best;
}
