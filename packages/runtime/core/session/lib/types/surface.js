"use strict";
/**
 * Surface layer on top of the session event log: an ordered view of events
 * that produce LLM messages. The append-only log remains the source of truth.
 *
 * Browser-safe: web clients consume this subpath export, so it must stay free
 * of `node:` imports (they break the vite bundle).
 *
 * @module @z/dsh-session/surface
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
exports.SurfaceManager = void 0;
exports.isSurfaceEligibleType = isSurfaceEligibleType;
exports.isSurfaceEvent = isSurfaceEvent;
exports.isAppendSurfaceEvent = isAppendSurfaceEvent;
exports.isReplacementSurfaceEvent = isReplacementSurfaceEvent;
exports.deriveEventMessage = deriveEventMessage;
exports.foldSurface = foldSurface;
/** Runtime counterpart of the message-producing event union. */
var SURFACE_EVENT_TYPES = new Set([
    'user/message',
    'assistant/message',
    'tool/result',
]);
/**
 * Whether an event type can join the model-visible surface.
 * @param type - event type to test.
 * @returns true for one of the three message-producing event types.
 */
function isSurfaceEligibleType(type) {
    return SURFACE_EVENT_TYPES.has(type);
}
/**
 * Narrow an event to a surface-eligible event carrying its required marker.
 * @param event - event to test.
 * @returns true when both the type and marker identify a surface event.
 */
function isSurfaceEvent(event) {
    if (!SURFACE_EVENT_TYPES.has(event.type))
        return false;
    return event.surfaceOp !== undefined;
}
/**
 * Narrow an event to an append-origin surface event: one that entered the
 * surface at its own log position and was never itself a replacement copy.
 *
 * The model-visible surface deliberately shadows replaced ranges, so it is the
 * wrong source for a human transcript — a landed replacement would erase
 * conversation the user already saw. Append-origin events are that transcript's
 * durable source material; replacement copies stay model-only.
 * @param event - event to test.
 * @returns true when the event appended to the surface tail.
 */
function isAppendSurfaceEvent(event) {
    return isSurfaceEvent(event) && event.surfaceOp === 'append';
}
/**
 * Narrow an event to a surface replacement: a node that shadowed an existing
 * surface range instead of appending to the tail. The counterpart of
 * {@link isAppendSurfaceEvent} over the two {@link SurfaceOp} variants.
 * @param event - event to test.
 * @returns true when the event replaced a surface range.
 */
function isReplacementSurfaceEvent(event) {
    return isSurfaceEvent(event) && event.surfaceOp !== 'append';
}
/**
 * Project a single event into the LLM message it derives to, or null when it
 * produces none — a non-surface event (chunk, boundary, log-only record) or an
 * empty-content assistant/message (which exists only to host usage). This is
 * THE per-node projection rule: `Session.deriveMessages` folds it over the
 * live surface, external reconstructors and pure projections fold the same
 * function over a log prefix's surface to rebuild the exact messages any
 * request was built from. The returned message is the already frozen message
 * nested in the event wrapper and shared by delivery, durable history, and
 * model requests.
 * @param event - the event to project.
 * @returns the derived message, or null when the event produces none.
 */
function deriveEventMessage(event) {
    // Intentionally non-exhaustive: only message-producing events derive
    // history; turn/step boundaries, chunks, usage, and errors are trace/replay
    // data.
    switch (event.type) {
        // Ordinary prompts and injected context project in user role: the event's
        // model-facing content stays verbatim. Do NOT re-add per-type framing
        // (e.g. `<context>`) here: framing is caller-owned — a producer bakes it
        // into `content`, as agent-instructions does with `<system-reminder>` — or,
        // if reintroduced, must be driven by the event `meta` map and a dedicated
        // renderer, keeping this projection a verbatim pass-through. See the
        // deferred design note in
        // ../../../../.agents/notes/implemented/simplification/2026-07-20-unwrap-injected-content-envelopes.md
        case 'user/message': {
            return event.data;
        }
        case 'assistant/message': {
            // Skip an empty-content assistant/message: it exists only to host a
            // max-tokens step's usage and must not inject a content-less assistant
            // turn into the provider transcript.
            if (event.data.message.content.length === 0)
                return null;
            return event.data.message;
        }
        case 'tool/result': {
            return event.data.message;
        }
        default:
            // A non-surface event (boundary, chunk, log-only record) projects to
            // no message. Merge-extensible union: no assertNever here.
            return null;
    }
}
/** Create an empty surface fold state. */
function createFoldState() {
    return { nodes: [], replaceGeneration: 0 };
}
/** Whether a runtime value is a non-negative safe event sequence. */
function isEventSeq(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
/** Whether a runtime value is the exact positional-replacement shape. */
function isReplaceOp(value) {
    var op = value;
    return Object.keys(op).length === 3
        && Object.hasOwn(op, 'op')
        && Object.hasOwn(op, 'start')
        && Object.hasOwn(op, 'end')
        && op['op'] === 'replace'
        && isEventSeq(op['start'])
        && isEventSeq(op['end']);
}
/** Validate event-local surface eligibility and return its operation. */
function surfaceOpOf(event) {
    var raw = event;
    if (!isSurfaceEligibleType(event.type)) {
        if (raw.surfaceOp !== undefined) {
            throw new Error("session event \"".concat(event.type, "\" is not surface-eligible and cannot carry surfaceOp"));
        }
        if (raw.sourceEventSeqs !== undefined) {
            throw new Error("session event \"".concat(event.type, "\" is not surface-eligible and cannot carry sourceEventSeqs"));
        }
        return;
    }
    var op = raw.surfaceOp;
    if (op === undefined) {
        throw new Error("session event \"".concat(event.type, "\" is surface-eligible and requires a surfaceOp marker"));
    }
    if (op === 'append')
        return op;
    if (op === null || typeof op !== 'object' || Array.isArray(op)) {
        throw new Error("session event \"".concat(event.type, "\" carries an invalid surfaceOp"));
    }
    if (!isReplaceOp(op)) {
        throw new Error("session event \"".concat(event.type, "\" carries an invalid replace surfaceOp"));
    }
    return op;
}
/** Validate cited source-event seqs against prior log entries and the replacement range. */
function assertProvenance(event, shadowedSeqs) {
    var raw = event.sourceEventSeqs;
    var sources = new Set();
    if (raw !== undefined) {
        if (!Array.isArray(raw)) {
            throw new Error("sourceEventSeqs on event at seq ".concat(event.seq, " must be an array when present"));
        }
        if (raw.length === 0 && event.type !== 'assistant/message') {
            throw new Error('sourceEventSeqs must not be empty except on assistant/message');
        }
        var nonEarlierSource = void 0;
        for (var _i = 0, raw_1 = raw; _i < raw_1.length; _i++) {
            var source = raw_1[_i];
            if (!isEventSeq(source)) {
                throw new Error("session event \"".concat(event.type, "\" sourceEventSeqs must densely contain non-negative safe integers"));
            }
            sources.add(source);
            if (nonEarlierSource === undefined && source >= event.seq)
                nonEarlierSource = source;
        }
        if (sources.size !== raw.length) {
            throw new Error('sourceEventSeqs must not contain duplicates');
        }
        if (nonEarlierSource !== undefined) {
            throw new Error("sourceEventSeqs must reference earlier events: ".concat(nonEarlierSource, " >= current seq ").concat(event.seq));
        }
    }
    var missing = shadowedSeqs.filter(function (seq) { return !sources.has(seq); });
    if (missing.length > 0) {
        throw new Error("surface replace: sourceEventSeqs must include every shadowed surface node; missing ".concat(missing.join(', ')));
    }
}
/** Locate one replacement range without mutating the current fold state. */
function replacementRange(state, op) {
    var startIdx = state.nodes.indexOf(op.start);
    if (startIdx === -1) {
        throw new Error("surface replace: start seq ".concat(op.start, " not found in surface"));
    }
    var endIdx = state.nodes.indexOf(op.end);
    if (endIdx === -1) {
        throw new Error("surface replace: end seq ".concat(op.end, " not found in surface"));
    }
    if (startIdx > endIdx) {
        throw new Error("surface replace: start seq ".concat(op.start, " (index ").concat(startIdx, ") is after end seq ").concat(op.end, " (index ").concat(endIdx, ")"));
    }
    return {
        startIdx: startIdx,
        endIdx: endIdx,
        shadowedSeqs: state.nodes.slice(startIdx, endIdx + 1),
    };
}
/**
 * Deep structural equality over the session-event JSON value domain
 * (null/boolean/number/string, arrays, plain objects). Replaces
 * `node:util`'s isDeepStrictEqual to keep this module browser-safe.
 */
function isDeepEqualJson(a, b) {
    if (a === b)
        return true;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
            return false;
        return a.every(function (item, i) { return isDeepEqualJson(item, b[i]); });
    }
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
        return false;
    var aKeys = Object.keys(a);
    var bRecord = b;
    if (aKeys.length !== Object.keys(b).length)
        return false;
    return aKeys.every(function (key) { return Object.hasOwn(b, key) && isDeepEqualJson(a[key], bRecord[key]); });
}
/** Restrict a tool-result replacement to one current result's content. */
function assertToolResultRewrite(event, shadowedSeqs, events, baseSeq) {
    if (event.type !== 'tool/result')
        return;
    if (shadowedSeqs.length !== 1) {
        throw new Error('tool/result surface replacement must rewrite exactly one current node');
    }
    for (var _i = 0, shadowedSeqs_1 = shadowedSeqs; _i < shadowedSeqs_1.length; _i++) {
        var originalSeq = shadowedSeqs_1[_i];
        var original = events[originalSeq - baseSeq];
        if ((original === null || original === void 0 ? void 0 : original.type) !== 'tool/result') {
            throw new Error('tool/result surface replacement must target a current tool/result');
        }
        var originalRest = __assign({}, original.data);
        var replacementRest = __assign({}, event.data);
        var originalResult = original.data.message.content[0];
        var replacementResult = event.data.message.content[0];
        originalRest['message'] = __assign(__assign({}, original.data.message), { content: [__assign(__assign({}, originalResult), { content: null })] });
        replacementRest['message'] = __assign(__assign({}, event.data.message), { content: [__assign(__assign({}, replacementResult), { content: null })] });
        if (!isDeepEqualJson(originalRest, replacementRest)) {
            throw new Error('tool/result surface replacement may change only content');
        }
    }
}
/** Validate one event at its replay boundary and prepare its atomic fold transition. */
function planSurfaceEvent(state, event, expectedSeq, events, baseSeq) {
    if (event.seq !== expectedSeq) {
        throw new Error("session event seq ".concat(event.seq, " is not contiguous; expected ").concat(expectedSeq));
    }
    var surfaceOp = surfaceOpOf(event);
    if (surfaceOp === undefined)
        return;
    if (surfaceOp === 'append') {
        assertProvenance(event, []);
        return { kind: 'append', seq: event.seq };
    }
    var range = replacementRange(state, surfaceOp);
    assertProvenance(event, range.shadowedSeqs);
    assertToolResultRewrite(event, range.shadowedSeqs, events, baseSeq);
    return __assign({ kind: 'replace', seq: event.seq, start: surfaceOp.start, end: surfaceOp.end }, range);
}
/** Apply one event and return replacement metadata only when one occurred. */
function applySurfaceEvent(state, event, expectedSeq, events, baseSeq) {
    var plan = planSurfaceEvent(state, event, expectedSeq, events, baseSeq);
    return applySurfacePlan(state, plan);
}
/** Commit one previously validated surface transition. */
function applySurfacePlan(state, plan) {
    if ((plan === null || plan === void 0 ? void 0 : plan.kind) === 'append') {
        state.nodes.push(plan.seq);
    }
    else if ((plan === null || plan === void 0 ? void 0 : plan.kind) === 'replace') {
        state.nodes.splice(plan.startIdx, plan.endIdx - plan.startIdx + 1, plan.seq);
        state.replaceGeneration += 1;
    }
    if ((plan === null || plan === void 0 ? void 0 : plan.kind) !== 'replace')
        return;
    return {
        seq: plan.seq,
        start: plan.start,
        end: plan.end,
        shadowedSeqs: plan.shadowedSeqs,
    };
}
/**
 * Replay a complete session log through the canonical surface fold.
 * @param events - session events in contiguous seq order.
 * @returns detached current sequences and replacement history.
 * @throws when an event violates surface metadata, source-event references, range, or tool-result rewrite rules.
 */
function foldSurface(events) {
    var state = createFoldState();
    var replacements = [];
    for (var _i = 0, _a = events.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], index = _b[0], event_1 = _b[1];
        var replacement = applySurfaceEvent(state, event_1, index, events, 0);
        if (replacement !== undefined)
            replacements.push(replacement);
    }
    return { nodes: __spreadArray([], state.nodes, true), replacements: replacements };
}
/** Incremental ordered surface view and append-boundary validator. */
var SurfaceManager = /** @class */ (function () {
    /**
     * @param log - Contiguous complete log or loaded event window.
     * @param baseSeq - Absolute sequence of the window's first event.
     */
    function SurfaceManager(log, baseSeq) {
        if (baseSeq === void 0) { baseSeq = 0; }
        this.log = log;
        this.baseSeq = baseSeq;
        /** Shared transition state; replacement history is not retained. */
        this._state = createFoldState();
        this._lastProcessedSeq = baseSeq - 1;
    }
    /**
     * Validate the next candidate without mutating the committed surface.
     * @param event - candidate event that has not entered the log yet.
     */
    SurfaceManager.prototype.validateNext = function (event) {
        if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1)
            this._processDelta();
        var expectedSeq = this.baseSeq + this.log.length;
        this._pendingPlan = {
            event: event,
            expectedSeq: expectedSeq,
            plan: planSurfaceEvent(this._state, event, expectedSeq, this.log, this.baseSeq),
        };
    };
    Object.defineProperty(SurfaceManager.prototype, "replaceGeneration", {
        /** Monotonic count of folded positional replacements. */
        get: function () {
            if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1)
                this._processDelta();
            return this._state.replaceGeneration;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SurfaceManager.prototype, "nodes", {
        /** Surface event sequences in model-visible order. */
        get: function () {
            if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1)
                this._processDelta();
            return this._state.nodes;
        },
        enumerable: false,
        configurable: true
    });
    /** Fold events appended since the previous access. */
    SurfaceManager.prototype._processDelta = function () {
        var tailSeq = this.baseSeq + this.log.length - 1;
        for (var seq = this._lastProcessedSeq + 1; seq <= tailSeq; seq++) {
            var index = seq - this.baseSeq;
            // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded by the loop condition
            var event_2 = this.log[index];
            var pending = this._pendingPlan;
            if ((pending === null || pending === void 0 ? void 0 : pending.event) === event_2 && pending.expectedSeq === seq) {
                applySurfacePlan(this._state, pending.plan);
            }
            else {
                applySurfaceEvent(this._state, event_2, seq, this.log, this.baseSeq);
            }
            if (pending !== undefined && pending.expectedSeq <= seq)
                this._pendingPlan = undefined;
            this._lastProcessedSeq = seq;
        }
    };
    return SurfaceManager;
}());
exports.SurfaceManager = SurfaceManager;
