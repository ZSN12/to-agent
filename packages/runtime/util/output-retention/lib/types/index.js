"use strict";
/**
 * A dependency-light **retention** library: bounded model-facing output for
 * tools that must cap how much context they return. A caller feeds items or
 * text chunks into a bounded object, then gets the retained content plus exact
 * omission metadata ({@link RetainedItems} / {@link RetainedText}).
 *
 * The library owns ONLY the mechanical question "what did we keep, what did we
 * omit?". Tool-specific code still owns
 * business semantics: file grouping, line numbering, exit codes, provider error
 * states, per-line preview truncation, spill files, and the model-facing prose.
 * In particular {@link RetainedText.truncated}/{@link RetainedItems.truncated}
 * means "the retainer omitted otherwise-available content because of a budget" —
 * NOT "the upstream was incomplete". Permission failures, skipped binaries,
 * provider partial failures, and unreadable candidates stay in tool-domain
 * fields, never folded into `truncated`.
 *
 * This is deliberately a library, not a cordis service or plugin: it takes no
 * `ctx`, registers nothing, and emits no events. The two retainers are the only
 * stateful pieces and their state is per-instance (one accumulation), never
 * cross-call. Tool packages import it directly when they need bounded output.
 *
 * The two retainers differ in resource model, which is why they are two names
 * rather than one generic collector:
 * - {@link ItemRetainer} bounds ordered logical units (paths, grep matches,
 *   search sources). `head` retention only in v1.
 * - {@link TextRetainer} bounds byte-oriented text streams (bash stdout/stderr,
 *   web bodies). `head` / `tail` / `headTail`, preserving UTF-8 boundaries at
 *   {@link TextRetainer.finish}.
 *
 * @module @z/dsh-output-retention
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextRetainer = exports.ItemRetainer = void 0;
exports.describeOmitted = describeOmitted;
exports.formatRetentionNotice = formatRetentionNotice;
/** Assert a budget field is a non-negative integer (the retainer request contract). */
function assertBudget(value, name) {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error("".concat(name, " must be a non-negative integer"));
    }
}
/**
 * Bounds an ordered stream of logical units, keeping the first `maxItems`
 * ({@link ItemRetentionStrategy} `head`). `push()` reports, per unit, whether it
 * was kept and whether the retained result is now truncated.
 *
 * Grouping, sorting, path mapping, per-unit preview truncation, and any
 * `incomplete` state stay OUTSIDE the retainer: it counts and keeps, nothing
 * more. The caller pushes prepared logical units and, after {@link finish},
 * groups/sorts the retained subset itself.
 */
var ItemRetainer = /** @class */ (function () {
    /** @param strategy Head strategy: `maxItems` (non-negative integer). */
    function ItemRetainer(strategy) {
        this.items = [];
        this.seen = 0;
        this.omittedCount = 0;
        assertBudget(strategy.maxItems, 'maxItems');
        this.maxItems = strategy.maxItems;
    }
    /**
     * Offer one unit. Kept when the retainer is below `maxItems`; otherwise dropped
     * and counted as omitted. Callers keep pushing all observed units, so the final
     * {@link Omitted} count is exact.
     *
     * @param item The prepared logical unit (path, flat match, source).
     * @returns The per-push {@link PushDecision}.
     */
    ItemRetainer.prototype.push = function (item) {
        this.seen++;
        if (this.items.length < this.maxItems) {
            // Reached only below the cap, before any omission (items only grow, the
            // cap is fixed), so nothing has been dropped yet: truncated is always false.
            this.items.push(item);
            return { kept: true, truncated: false };
        }
        this.omittedCount++;
        return {
            kept: false,
            truncated: true,
        };
    };
    /**
     * Finalize and report what was kept and omitted.
     *
     * @returns The {@link RetainedItems} snapshot (safe to group/sort downstream).
     */
    ItemRetainer.prototype.finish = function () {
        var truncated = this.omittedCount > 0;
        return {
            items: this.items,
            truncated: truncated,
            seen: this.seen,
            kept: this.items.length,
            omitted: truncated
                ? { kind: 'exact', count: this.omittedCount }
                : { kind: 'none' },
        };
    };
    return ItemRetainer;
}());
exports.ItemRetainer = ItemRetainer;
var encoder = new TextEncoder();
var decoder = new TextDecoder(); // utf-8, non-fatal: internal malformed bytes → U+FFFD
/**
 * Drop a trailing incomplete UTF-8 sequence so a prefix cut never emits a
 * replacement char at the boundary. Walks back over continuation bytes
 * (`10xxxxxx`) to the lead byte; if fewer bytes follow it than the lead byte's
 * length declares, the sequence is incomplete and is trimmed. A complete tail,
 * or a run too long/short to be a valid lead, is returned untouched (any
 * genuinely malformed interior is left for the decoder to replace).
 */
function trimTrailingPartialUtf8(bytes) {
    var i = bytes.length - 1;
    // Continuation bytes are 0b10xxxxxx; scan back at most 3 (max sequence is 4).
    // Indices are bounds-checked by the loop guard, so the reads are in range.
    while (i >= 0 && (bytes[i] & 0xc0) === 0x80 && bytes.length - i <= 3)
        i--;
    if (i < 0)
        return bytes;
    var lead = bytes[i];
    var expected = lead < 0x80 ? 1 : lead < 0xe0 ? 2 : lead < 0xf0 ? 3 : lead < 0xf8 ? 4 : 0;
    // expected 0 → not a lead byte (stray continuation / invalid): leave it.
    if (expected === 0)
        return bytes;
    return bytes.length - i < expected ? bytes.subarray(0, i) : bytes;
}
/**
 * Drop leading continuation bytes (`10xxxxxx`) so a suffix cut starts on a
 * lead/ASCII byte instead of mid-codepoint.
 */
function trimLeadingContinuationUtf8(bytes) {
    var i = 0;
    // i < length guards the read.
    while (i < bytes.length && (bytes[i] & 0xc0) === 0x80)
        i++;
    return bytes.subarray(i);
}
/**
 * Bounds a byte-oriented text stream, keeping a prefix, a suffix, or both
 * ({@link TextRetentionStrategy}). All three strategies share one prefix/suffix
 * accumulator: `head` is prefix-only, `tail` is suffix-only, `headTail` is both.
 *
 * Bytes, not characters: caps and `omittedBytes` are byte counts for process/
 * body safety. Chunks that straddle a codepoint are handled — {@link finish}
 * trims a partial codepoint at each cut so the returned text never introduces a
 * replacement char at the boundary. The retainer holds at most
 * `prefixCap + tailBytes + one chunk` in memory (old suffix chunks are dropped
 * as they slide out), so a large stream does not accumulate unbounded.
 */
var TextRetainer = /** @class */ (function () {
    /** @param strategy One {@link TextRetentionStrategy} variant; byte budgets must be non-negative integers. */
    function TextRetainer(strategy) {
        this.prefixChunks = [];
        this.prefixHeld = 0;
        this.suffixChunks = [];
        this.suffixHeld = 0;
        this.total = 0;
        switch (strategy.kind) {
            case 'head':
                assertBudget(strategy.maxBytes, 'maxBytes');
                this.prefixCap = strategy.maxBytes;
                this.suffixCap = 0;
                break;
            case 'tail':
                assertBudget(strategy.maxBytes, 'maxBytes');
                this.prefixCap = 0;
                this.suffixCap = strategy.maxBytes;
                break;
            case 'headTail':
                assertBudget(strategy.headBytes, 'headBytes');
                assertBudget(strategy.tailBytes, 'tailBytes');
                this.prefixCap = strategy.headBytes;
                this.suffixCap = strategy.tailBytes;
                break;
        }
    }
    /**
     * Offer one chunk (a `Uint8Array`, or a `string` encoded as UTF-8). Prefix
     * bytes fill up to the prefix cap then stop; suffix bytes roll so only the
     * last `suffixCap` bytes are retained. `kept` is `true` only when no byte of
     * this chunk was dropped.
     *
     * @param chunk The next bytes of the stream (`Uint8Array` or UTF-8 `string`).
     * @returns The per-push {@link PushDecision}.
     */
    TextRetainer.prototype.push = function (chunk) {
        var bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
        var before = this.total;
        this.total += bytes.length;
        // Prefix: take only up to the cap; the rest of this chunk is "not prefixed".
        var room = this.prefixCap - this.prefixHeld;
        var take = Math.max(0, Math.min(room, bytes.length));
        if (take > 0) {
            this.prefixChunks.push(bytes.subarray(0, take));
            this.prefixHeld += take;
        }
        // Suffix: append the whole chunk, then drop whole leading chunks that have
        // fully slid out of the last `suffixCap` bytes (bounded memory).
        if (this.suffixCap > 0) {
            this.suffixChunks.push(bytes);
            this.suffixHeld += bytes.length;
            var head = this.suffixChunks[0];
            while (head !== undefined && this.suffixHeld - head.length >= this.suffixCap) {
                this.suffixChunks.shift();
                this.suffixHeld -= head.length;
                head = this.suffixChunks[0];
            }
            // The head chunk can still hold leading bytes beyond the last `suffixCap`
            // — a single chunk LARGER than the window is retained whole by the loop
            // above (dropping the only chunk would leave < cap). Trim those leading
            // bytes so the accumulator (and finish()'s concat) stays bounded by
            // `suffixCap` instead of allocating/copying the full chunk again;
            // finish() only ever reads the last `suffixLen ≤ suffixCap` bytes, so this
            // drops nothing it would return. (head.length > excess by the loop
            // invariant `suffixHeld - head.length < suffixCap`, so the slice is non-empty.)
            if (head !== undefined && this.suffixHeld > this.suffixCap) {
                var excess = this.suffixHeld - this.suffixCap;
                this.suffixChunks[0] = head.subarray(excess);
                this.suffixHeld -= excess;
            }
        }
        // Dropped = bytes that no side can keep. Compute cumulative omission the
        // SAME way finish() does (via omittedAt), so push and finish never disagree;
        // per-push we only need whether THIS chunk pushed the total past what the
        // two caps hold.
        var droppedThisChunk = this.omittedAt(this.total) > this.omittedAt(before);
        return {
            kept: !droppedThisChunk,
            truncated: this.omittedAt(this.total) > 0,
        };
    };
    /** Bytes omitted once `total` bytes have been seen: `total − keptPrefix − keptSuffix`. */
    TextRetainer.prototype.omittedAt = function (total) {
        var prefixLen = Math.min(total, this.prefixCap);
        var suffixLen = Math.min(total - prefixLen, this.suffixCap);
        return total - prefixLen - suffixLen;
    };
    /**
     * Finalize: decode the retained prefix and suffix (each trimmed to a UTF-8
     * boundary at its cut) and report the exact omitted byte count.
     *
     * @returns The {@link RetainedText} snapshot (safe to hand to a formatter).
     */
    TextRetainer.prototype.finish = function () {
        var prefixLen = Math.min(this.total, this.prefixCap);
        var suffixLen = Math.min(this.total - prefixLen, this.suffixCap);
        var prefix = concat(this.prefixChunks); // exactly prefixLen bytes (prefixHeld === prefixLen)
        var suffix = concat(this.suffixChunks).subarray(this.suffixHeld - suffixLen);
        // With nothing omitted by budget, prefix and suffix are ADJACENT slices of
        // one stream (prefixLen + suffixLen === total), so the head|tail split is
        // artificial: a codepoint may span it. Decode the contiguous whole as one
        // buffer — trimming or decoding the halves separately here would corrupt a
        // boundary-spanning codepoint though no content was dropped. Only a real
        // omitted gap makes each side a true cut: trim each to a UTF-8 boundary and
        // decode separately so a codepoint is never reconstructed across the gap.
        var budgetOmitted = this.omittedAt(this.total);
        var _a = budgetOmitted > 0
            ? [trimTrailingPartialUtf8(prefix), trimLeadingContinuationUtf8(suffix)]
            : [prefix, suffix], keptPrefix = _a[0], keptSuffix = _a[1];
        var text = budgetOmitted > 0
            ? decoder.decode(keptPrefix) + decoder.decode(keptSuffix)
            : decoder.decode(concat([prefix, suffix]));
        // Report omission against the bytes ACTUALLY returned, not the pre-trim
        // budget: a boundary trim drops partial-codepoint bytes too, so an exact
        // count derived from the budget alone would overstate the retained text (and
        // any "Omitted N bytes" notice built from it would be a lie).
        var omitted = this.total - keptPrefix.length - keptSuffix.length;
        var truncated = omitted > 0;
        return {
            text: text,
            truncated: truncated,
            omittedBytes: truncated
                ? { kind: 'exact', count: omitted }
                : { kind: 'none' },
        };
    };
    return TextRetainer;
}());
exports.TextRetainer = TextRetainer;
/** Concatenate chunks into one contiguous buffer (their exact total length). */
function concat(chunks) {
    var length = 0;
    for (var _i = 0, chunks_1 = chunks; _i < chunks_1.length; _i++) {
        var chunk = chunks_1[_i];
        length += chunk.length;
    }
    var out = new Uint8Array(length);
    var offset = 0;
    for (var _a = 0, chunks_2 = chunks; _a < chunks_2.length; _a++) {
        var chunk = chunks_2[_a];
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}
/**
 * Standardized, false-precision-safe wording for one {@link Omitted} value —
 * the "may standardize omission wording" half the library owns. `exact` prints
 * the count (`Omitted 3 items`); `unknown` prints NO count because the caller
 * did not provide one. `none` is the empty string.
 *
 * @param omitted The omission metadata from a retainer result.
 * @param unit The noun for the omitted quantity (`items`, `bytes`, `chars`, `lines`).
 * @returns A neutral clause (no trailing space), or `''` when nothing was omitted.
 */
function describeOmitted(omitted, unit) {
    switch (omitted.kind) {
        case 'none':
            return '';
        case 'exact':
            return "Omitted ".concat(omitted.count, " ").concat(unit, ".");
        case 'unknown':
            return "More ".concat(unit, " were omitted.");
    }
}
/**
 * Turn a {@link RetentionNotice} into a one-line footer: the library-owned
 * standardized omission clause ({@link describeOmitted}) followed by the tool's
 * own recovery guidance. The library never owns recovery words — only the tool
 * knows the action ("narrow the pattern", "fetch a more specific URL", "read the
 * spill file") — so `recovery` supplies them and receives the full notice to
 * phrase from (`kept`, `limit`, `omitted`, …). Either half may be empty; the two
 * are joined with a single space.
 *
 * @param notice The neutral retention outcome.
 * @param recovery Tool-supplied guidance builder; receives the notice, returns a sentence (or `''`).
 * @returns The combined footer line.
 */
function formatRetentionNotice(notice, recovery) {
    return [describeOmitted(notice.omitted, notice.unit), recovery(notice)]
        .filter(function (part) { return part.length > 0; })
        .join(' ');
}
