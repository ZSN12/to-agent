"use strict";
/**
 * Replay-safe, model-free tool-result pruning service.
 *
 * @module @z/dsh-compaction-tool-result-pruner
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.ToolResultPruner = exports.resolveConfig = exports.PRUNE_MARKER = exports.DEFAULTS = exports.codePointLength = void 0;
var cordis_1 = require("@z/cordis");
var schemastery_1 = require("@z/schemastery");
var dsh_llm_1 = require("@z/dsh-llm");
var config_ts_1 = require("./config.ts");
var config_ts_2 = require("./config.ts");
Object.defineProperty(exports, "codePointLength", { enumerable: true, get: function () { return config_ts_2.codePointLength; } });
Object.defineProperty(exports, "DEFAULTS", { enumerable: true, get: function () { return config_ts_2.DEFAULTS; } });
Object.defineProperty(exports, "PRUNE_MARKER", { enumerable: true, get: function () { return config_ts_2.PRUNE_MARKER; } });
Object.defineProperty(exports, "resolveConfig", { enumerable: true, get: function () { return config_ts_2.resolveConfig; } });
/** Deterministic head/middle/tail pruning for current tool-result surface nodes. */
var ToolResultPruner = /** @class */ (function (_super) {
    __extends(ToolResultPruner, _super);
    function ToolResultPruner(ctx, config) {
        if (config === void 0) { config = {}; }
        var _this = _super.call(this, ctx, 'toolResultPruner') || this;
        _this.config = (0, config_ts_1.resolveConfig)(config);
        return _this;
    }
    /**
     * Measure text content in Unicode code points; non-text blocks cost zero.
     * @param blocks - tool-result content to measure.
     * @returns total Unicode code points across text blocks.
     */
    ToolResultPruner.prototype.measureContent = function (blocks) {
        var chars = 0;
        for (var _i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
            var block = blocks_1[_i];
            if (block.type === 'text')
                chars += (0, config_ts_1.codePointLength)(block.text);
        }
        return chars;
    };
    /**
     * Replace an over-budget text middle while retaining rich-block order.
     * Text slicing is by Unicode code point, not UTF-16 code unit, so a retained
     * boundary cannot split a surrogate pair. Grapheme clusters may still split.
     * @param blocks - original tool-result content.
     * @returns pruned content, or `null` when the text is within budget.
     */
    ToolResultPruner.prototype.pruneContent = function (blocks) {
        var totalChars = this.measureContent(blocks);
        if (totalChars <= this.config.thresholdChars)
            return null;
        var removedStart = this.config.headChars;
        var removedEnd = totalChars - this.config.tailChars;
        var pruned = [];
        var consumed = 0;
        var markerInserted = false;
        for (var _i = 0, blocks_2 = blocks; _i < blocks_2.length; _i++) {
            var block = blocks_2[_i];
            if (block.type !== 'text') {
                pruned.push(block);
                continue;
            }
            var points = Array.from(block.text);
            var blockStart = consumed;
            var blockEnd = blockStart + points.length;
            var headEnd = Math.min(points.length, Math.max(0, removedStart - blockStart));
            var tailStart = Math.min(points.length, Math.max(0, removedEnd - blockStart));
            var intersectsRemoved = blockStart < removedEnd && blockEnd > removedStart;
            var marker = intersectsRemoved && !markerInserted ? config_ts_1.PRUNE_MARKER : '';
            if (marker.length > 0)
                markerInserted = true;
            var text = points.slice(0, headEnd).join('')
                + marker
                + points.slice(tailStart).join('');
            if (text.length > 0)
                pruned.push(__assign(__assign({}, block), { text: text }));
            consumed = blockEnd;
        }
        /* v8 ignore next -- totalChars > threshold and valid budgets guarantee a removed text span. */
        if (!markerInserted)
            throw new Error('tool-result prune: failed to locate the removed text span');
        var charsAfter = this.measureContent(pruned);
        /* v8 ignore next -- config validation fixes the emitted head + marker + tail budget. */
        if (charsAfter > this.config.thresholdChars || charsAfter >= totalChars) {
            throw new Error('tool-result prune: replacement must be smaller and within threshold');
        }
        return pruned;
    };
    /**
     * Prune every over-budget tool result from one stable current-surface snapshot.
     * Each replacement preserves the complete event data except for `content`,
     * cites the shadowed node so replay can recover the replacement input, and is
     * immediately preceded by a `compaction/prune` shadow-price event pricing the
     * shadowed node through the injected token meter, so pure consumers can
     * subtract it without per-node state.
     * @param session - session whose current surface is rewritten.
     * @returns landed replacements and aggregate Unicode-code-point savings.
     * @throws when the session rejects a replacement; replacements committed
     * earlier in the pass remain durable.
     */
    ToolResultPruner.prototype.pruneSession = function (session) {
        var candidates = [];
        for (var _i = 0, _a = __spreadArray([], session.surface.nodes, true); _i < _a.length; _i++) {
            var seq = _a[_i];
            var event_1 = session.events[seq];
            /* v8 ignore next -- surface seqs are validated contiguous log references. */
            if ((event_1 === null || event_1 === void 0 ? void 0 : event_1.type) === 'tool/result')
                candidates.push({ seq: seq, event: event_1 });
        }
        var pruned = [];
        var charsRemoved = 0;
        for (var _b = 0, candidates_1 = candidates; _b < candidates_1.length; _b++) {
            var _c = candidates_1[_b], seq = _c.seq, event_2 = _c.event;
            var result = event_2.data.message.content[0];
            var content = this.pruneContent(result.content);
            if (content === null)
                continue;
            var charsBefore = this.measureContent(result.content);
            var charsAfter = this.measureContent(content);
            var message = (0, dsh_llm_1.freezeMessage)(__assign(__assign({}, event_2.data.message), { content: [__assign(__assign({}, result), { content: content })] }));
            // Shadow-price protocol: the metering event and its replacement are
            // appended synchronously adjacent, so pure consumers subtract the
            // shadowed node's heuristic price without retaining per-node state.
            session.append('compaction/prune', {
                shadowedRange: { start: seq, end: seq },
                shadowedSeqs: [seq],
                shadowedTokenCount: this.ctx.tokenMeter.estimateMessage(event_2.data.message),
            });
            var replacement = session.append('tool/result', __assign(__assign({}, event_2.data), { message: message }), {
                surfaceOp: { op: 'replace', start: seq, end: seq },
                sourceEventSeqs: [seq],
            });
            pruned.push({
                originalSeq: seq,
                replacementSeq: replacement.seq,
                callId: event_2.data.message.source.callId,
                charsBefore: charsBefore,
                charsAfter: charsAfter,
            });
            charsRemoved += charsBefore - charsAfter;
        }
        return { pruned: pruned, charsRemoved: charsRemoved };
    };
    // The token meter prices each shadowed node for its logged shadow-price
    // event, so pruning genuinely requires the pricing capability.
    ToolResultPruner.inject = ['tokenMeter'];
    ToolResultPruner.Config = schemastery_1.default.object({
        thresholdChars: schemastery_1.default.number().step(1).min(1).default(config_ts_1.DEFAULTS.thresholdChars),
        headChars: schemastery_1.default.number().step(1).min(0).default(config_ts_1.DEFAULTS.headChars),
        tailChars: schemastery_1.default.number().step(1).min(0).default(config_ts_1.DEFAULTS.tailChars),
    });
    return ToolResultPruner;
}(cordis_1.Service));
exports.ToolResultPruner = ToolResultPruner;
exports.default = ToolResultPruner;
