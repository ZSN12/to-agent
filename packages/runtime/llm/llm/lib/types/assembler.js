"use strict";
/**
 * Incremental chunk-to-message assembler. This is the single canonical assembly
 * algorithm used by the agent loop to build an assistant message from a chunk
 * stream while logging the raw chunks for replay fidelity.
 *
 * @module @z/dsh-llm/assembler
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockAssembler = void 0;
var brand_ts_1 = require("./brand.ts");
var never_ts_1 = require("./never.ts");
var message_ts_1 = require("./message.ts");
/**
 * Incrementally assembles raw {@link StreamChunk}s into complete
 * {@link ContentBlock}s and a final assistant {@link Message}.
 *
 * The agent loop feeds it while logging raw chunks for replay fidelity, then
 * reads `blocks()` / `message()` / `usage` / `finish` once the stream ends,
 * or `interruptedBlocks()` when cancellation cut the stream short.
 *
 * Tolerant of delta-only protocols (no block-start/end); deltas arriving for
 * an index already closed by `block-end` are ignored (malformed stream) so a
 * misbehaving adapter cannot grow memory or corrupt a completed block.
 */
var BlockAssembler = /** @class */ (function () {
    function BlockAssembler() {
        this.partials = new Map();
        this.order = [];
    }
    /**
     * Feed one chunk into the assembly state.
     * @param chunk - the next raw chunk, in stream order.
     */
    BlockAssembler.prototype.push = function (chunk) {
        switch (chunk.type) {
            case 'block-start': {
                if (!this.partials.has(chunk.index)) {
                    this.order.push(chunk.index);
                    this.partials.set(chunk.index, {
                        blockType: chunk.blockType,
                        text: '',
                        toolCallArguments: '',
                    });
                }
                return;
            }
            case 'text-delta':
            case 'reasoning-delta': {
                var partial = this.ensure(chunk.index, chunk.type === 'text-delta' ? 'text' : 'reasoning');
                if (partial.block)
                    return; // closed by block-end; ignore stragglers
                partial.text += chunk.text;
                return;
            }
            case 'tool-call-delta': {
                var partial = this.ensure(chunk.index, 'tool-call');
                if (partial.block)
                    return; // closed by block-end; ignore stragglers
                partial.toolCallId = chunk.id;
                if (chunk.name)
                    partial.toolCallName = chunk.name;
                partial.toolCallArguments += chunk.argumentsDelta;
                return;
            }
            case 'block-end': {
                var partial = this.ensure(chunk.index, chunk.block.type);
                // First close wins; ignoring re-close stragglers keeps streamed output
                // and the final assembled block in agreement.
                if (partial.block)
                    return;
                partial.block = chunk.block;
                return;
            }
            case 'usage': {
                this._usage = chunk.usage;
                return;
            }
            case 'finish': {
                this._finish = chunk.reason;
                this._replayState = chunk.replayState;
                return;
            }
            default: return (0, never_ts_1.assertNever)(chunk, 'BlockAssembler.push');
        }
    };
    BlockAssembler.prototype.ensure = function (index, blockType) {
        var partial = this.partials.get(index);
        if (!partial) {
            partial = { blockType: blockType, text: '', toolCallArguments: '' };
            this.partials.set(index, partial);
            this.order.push(index);
        }
        return partial;
    };
    BlockAssembler.prototype.assemble = function (partial, index) {
        var _a, _b;
        if (partial.block)
            return partial.block;
        switch (partial.blockType) {
            case 'text': return { type: 'text', text: partial.text };
            case 'reasoning': return { type: 'reasoning', text: partial.text };
            case 'tool-call': return {
                type: 'tool-call',
                id: (_a = partial.toolCallId) !== null && _a !== void 0 ? _a : (0, brand_ts_1.CallId)("call-".concat(index)),
                name: (_b = partial.toolCallName) !== null && _b !== void 0 ? _b : '',
                arguments: partial.toolCallArguments,
            };
            default: throw new Error("cannot assemble incomplete block of type \"".concat(partial.blockType, "\""));
        }
    };
    /** Invariant accessor: every index in `order` has a partial. */
    BlockAssembler.prototype.mustGet = function (index) {
        var partial = this.partials.get(index);
        if (!partial)
            throw new Error("BlockAssembler invariant violated: no partial for index ".concat(index));
        return partial;
    };
    /**
     * The one shared keep/drop decision over all seen blocks: max-token
     * truncation drops tool calls that cannot be executed safely. Emitted blocks
     * and replay metadata both derive from this result, so they cannot disagree.
     */
    BlockAssembler.prototype.assembled = function () {
        var _this = this;
        var all = this.order.map(function (index) { return _this.assemble(_this.mustGet(index), index); });
        var kept = this.finish.kind === 'max-tokens'
            ? all.map(function (block) { return block.type !== 'tool-call'; })
            : undefined;
        var blocks = kept === undefined ? all : all.filter(function (_, position) { return kept[position]; });
        var envelope = this._replayState;
        if ((envelope === null || envelope === void 0 ? void 0 : envelope.blocks) === undefined)
            return { blocks: blocks, replay: envelope };
        if (envelope.blocks.length !== all.length)
            return { blocks: blocks, replay: undefined };
        return {
            blocks: blocks,
            replay: kept === undefined || blocks.length === all.length
                ? envelope
                : { response: envelope.response, blocks: envelope.blocks.filter(function (_, position) { return kept[position]; }) },
        };
    };
    /**
     * Assemble all blocks seen so far, in stream order.
     * @returns one block per seen index, except that max-token truncation drops
     *   tool calls that cannot be executed safely; an open block assembles from
     *   its accumulated deltas (an unknown block type never closed by `block-end` throws).
     */
    BlockAssembler.prototype.blocks = function () {
        return this.assembled().blocks;
    };
    /**
     * Assemble the prefix an interrupted stream can safely finalize: closed and
     * open text/reasoning blocks with non-whitespace content, in stream order.
     * Tool calls are omitted because interruption precedes dispatch; retaining
     * one would require a fabricated result. Open unknown blocks are also omitted.
     * @returns the kept blocks; empty when nothing streamed before the interruption.
     */
    BlockAssembler.prototype.interruptedBlocks = function () {
        var _this = this;
        return this.order
            .map(function (index) {
            var _a, _b;
            var partial = _this.mustGet(index);
            var type = (_b = (_a = partial.block) === null || _a === void 0 ? void 0 : _a.type) !== null && _b !== void 0 ? _b : partial.blockType;
            if (type !== 'text' && type !== 'reasoning')
                return undefined;
            return _this.assemble(partial, index);
        })
            .filter(function (block) {
            return ((block === null || block === void 0 ? void 0 : block.type) === 'text' || (block === null || block === void 0 ? void 0 : block.type) === 'reasoning') && block.text.trim() !== '';
        });
    };
    Object.defineProperty(BlockAssembler.prototype, "usage", {
        /** Usage from the `usage` chunk; undefined until one arrives. */
        get: function () {
            return this._usage;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(BlockAssembler.prototype, "finish", {
        /** Finish reason from the `finish` chunk; `{kind: 'stop'}` when the stream ended without one. */
        get: function () {
            var _a;
            return (_a = this._finish) !== null && _a !== void 0 ? _a : { kind: 'stop' };
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(BlockAssembler.prototype, "replayState", {
        /**
         * Replay metadata from the terminal finish chunk, if any, with per-block
         * entries pruned in step with {@link blocks}. Undefined when the envelope's
         * entries do not align with the emitted blocks.
         */
        get: function () {
            return this.assembled().replay;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * The assembled assistant message.
     * @param source - producer attribution for the assembled message.
     * @returns a frozen assistant-role message over `blocks()` (same open-block assembly rules).
     */
    BlockAssembler.prototype.message = function (source) {
        if (source === void 0) { source = { kind: 'plugin', plugin: 'dsh-llm/assembler' }; }
        return (0, message_ts_1.createMessage)({ role: 'assistant', content: this.blocks(), source: source });
    };
    return BlockAssembler;
}());
exports.BlockAssembler = BlockAssembler;
