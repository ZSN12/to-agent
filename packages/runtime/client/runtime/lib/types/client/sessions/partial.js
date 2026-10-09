"use strict";
// PartialAccumulator: assistant/chunk accumulator.
// Folds the six StreamChunk variants into AssistantBlock[] keyed by block index;
// block-level immutability (a delta only swaps that block's reference).
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
exports.PartialAccumulator = void 0;
exports.isVisibleAssistantChunk = isVisibleAssistantChunk;
exports.emptyAssistantBlock = emptyAssistantBlock;
var conversation_ts_1 = require("./conversation.ts");
/**
 * Whether a stream chunk changes the partial assistant projection shown by the UI.
 * @param type - Stream chunk discriminant.
 * @returns Whether publishing the accumulated partial can change the visible snapshot.
 */
function isVisibleAssistantChunk(type) {
    return type === 'block-start'
        || type === 'text-delta'
        || type === 'reasoning-delta'
        || type === 'tool-call-delta'
        || type === 'block-end';
}
/** assistant/chunk accumulator: folds StreamChunks into AssistantBlock[] with block-level immutability. */
var PartialAccumulator = /** @class */ (function () {
    /**
     * @param turn - Owning agent turn.
     * @param step - Owning model step.
     * @param initialBlocks - Materialized prefix when accumulation begins after history replay.
     */
    function PartialAccumulator(turn, step, initialBlocks) {
        if (initialBlocks === void 0) { initialBlocks = []; }
        this.turn = turn;
        this.step = step;
        // Sparse on purpose: block-start may arrive out of order, leaving holes until compaction.
        this.blocks = [];
        this.changed = true;
        this.blocks = __spreadArray([], initialBlocks, true);
        this.snapshot = { turn: turn, step: step, blocks: initialBlocks };
    }
    /**
     * Fold one chunk.
     * @param chunk - the stream chunk.
     * @returns whether it caused a visible change (usage/finish return false, skipping notification).
     */
    PartialAccumulator.prototype.push = function (chunk) {
        var _a;
        switch (chunk.type) {
            case 'block-start': {
                this.blocks[chunk.index] = emptyAssistantBlock(chunk.blockType);
                this.changed = true;
                return true;
            }
            case 'text-delta': {
                var prev = this.blocks[chunk.index];
                this.blocks[chunk.index] = { kind: 'text', text: ((prev === null || prev === void 0 ? void 0 : prev.kind) === 'text' ? prev.text : '') + chunk.text };
                this.changed = true;
                return true;
            }
            case 'reasoning-delta': {
                var prev = this.blocks[chunk.index];
                this.blocks[chunk.index] = { kind: 'reasoning', text: ((prev === null || prev === void 0 ? void 0 : prev.kind) === 'reasoning' ? prev.text : '') + chunk.text };
                this.changed = true;
                return true;
            }
            case 'tool-call-delta': {
                var prev = this.blocks[chunk.index];
                var base = (prev === null || prev === void 0 ? void 0 : prev.kind) === 'tool-call' ? prev : { kind: 'tool-call', callId: '', name: '', argsRaw: '' };
                this.blocks[chunk.index] = {
                    kind: 'tool-call',
                    callId: base.callId || String(chunk.id),
                    name: (_a = chunk.name) !== null && _a !== void 0 ? _a : base.name,
                    argsRaw: base.argsRaw + chunk.argumentsDelta,
                };
                this.changed = true;
                return true;
            }
            case 'block-end': {
                this.blocks[chunk.index] = (0, conversation_ts_1.toAssistantBlock)(chunk.block);
                this.changed = true;
                return true;
            }
            default:
                // usage / finish / merge-extensible unknown variants: no visible block change
                // (finish is immediately followed by the assistant/message that supersedes the partial).
                return false;
        }
    };
    /**
     * Current partial projection.
     * @returns the cached snapshot (the blocks array reference only changes after a mutation).
     */
    PartialAccumulator.prototype.toPartial = function () {
        if (this.changed) {
            // Compact sparse indexes (out-of-order block-start) into render order.
            this.snapshot = { turn: this.turn, step: this.step, blocks: this.blocks.filter(function (b) { return b !== undefined; }) };
            this.changed = false;
        }
        return this.snapshot;
    };
    return PartialAccumulator;
}());
exports.PartialAccumulator = PartialAccumulator;
/**
 * Create the empty client projection for one streamed Assistant block kind.
 * @param blockType - wire block kind.
 * @returns empty projected block ready to receive deltas.
 */
function emptyAssistantBlock(blockType) {
    switch (blockType) {
        case 'text': return { kind: 'text', text: '' };
        case 'reasoning': return { kind: 'reasoning', text: '' };
        case 'tool-call': return { kind: 'tool-call', callId: '', name: '', argsRaw: '' };
        default: return { kind: 'other', block: null };
    }
}
