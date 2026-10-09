"use strict";
/**
 * Surface retention selection and the shared log-recorded compaction
 * transaction for automatic open-turn and manual idle-session compaction.
 *
 * @module @z/dsh-compaction-basic/region
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
exports.selectCompactableRange = selectCompactableRange;
exports.compactSurfaceRegion = compactSurfaceRegion;
exports.assertNoActiveCompaction = assertNoActiveCompaction;
var node_crypto_1 = require("node:crypto");
var node_util_1 = require("node:util");
var dsh_compaction_1 = require("@z/dsh-compaction");
var dsh_llm_1 = require("@z/dsh-llm");
var summarizer_ts_1 = require("./summarizer.ts");
/**
 * Rejects a summary whose replacement boundaries are no longer the ones it was
 * built from, distinguished from summarizer and shrink failures so a manual
 * caller can report the two causes differently.
 */
var SurfaceChangedError = /** @class */ (function (_super) {
    __extends(SurfaceChangedError, _super);
    function SurfaceChangedError() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return SurfaceChangedError;
}(Error));
/**
 * Resolve the next head-anchored range while retaining a priced recent tail
 * and never splitting an assistant tool-call/result pair.
 * @param session - session supplying authoritative current surface positions.
 * @param measurement - unified pressure and surface measurement from the conversation meter.
 * @param retainTokens - minimum recent tail budget retained verbatim.
 * @returns the inclusive positional seq range to compact, or `null`.
 */
function selectCompactableRange(session, measurement, retainTokens) {
    var pricedNodes = measurement.nodes;
    if (pricedNodes.length === 0)
        return null;
    var surfaceNodes = session.surface.nodes;
    if (surfaceNodes.length !== pricedNodes.length
        || surfaceNodes.some(function (seq, index) { var _a; return seq !== ((_a = pricedNodes[index]) === null || _a === void 0 ? void 0 : _a.seq); })) {
        throw new Error('compaction: token-meter surface does not match the current session surface');
    }
    var accumulated = 0;
    var keepFromIdx = pricedNodes.length;
    for (var index = pricedNodes.length - 1; index >= 0; index -= 1) {
        // oxlint-disable-next-line typescript/no-non-null-assertion
        accumulated += pricedNodes[index].tokens;
        keepFromIdx = index;
        if (accumulated >= retainTokens)
            break;
    }
    if (keepFromIdx === 0)
        return null;
    while (keepFromIdx > 0) {
        // oxlint-disable-next-line typescript/no-non-null-assertion
        if ((0, dsh_compaction_1.toolPairingBalancedBefore)(session, surfaceNodes[keepFromIdx]))
            break;
        keepFromIdx -= 1;
    }
    if (keepFromIdx === 0)
        return null;
    // oxlint-disable-next-line typescript/no-non-null-assertion
    var first = surfaceNodes[0];
    // oxlint-disable-next-line typescript/no-non-null-assertion
    var cutoff = surfaceNodes[keepFromIdx - 1];
    return { start: first, end: cutoff };
}
/**
 * Run the single compaction transaction over one selected positional span.
 * Selection and validation are read-only. Idle/log validation and
 * `compaction/start` are synchronously adjacent, so the durable opening marker is
 * the compaction lock before summarization yields. Every later failure makes
 * exactly one `compaction/end` attempt; a failed close deliberately leaves the
 * unmatched start detectable.
 * @param dependencies - conversation meter and dynamically dispatched summarizer hook.
 * @param session - session whose surface is mutated.
 * @param start - inclusive first surface-node seq.
 * @param end - inclusive last surface-node seq.
 * @param agent - agent used by the summarizer.
 * @param options - bracket owner, stability rule, and optional durability checkpoint.
 * @param signal - optional summarization cancellation signal.
 * @returns the successful durable compaction result.
 */
function compactSurfaceRegion(dependencies, session, start, end, agent, options, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var selection, entryState, owner, compactionId, lifecycle, startEvent, assertStable, failure, flushFailure, result, closed, closing, stage, prepared, summarized, pending, endEvent, error_1, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (options.owner === null)
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    selection = validateSurfaceRegion(session, start, end);
                    entryState = inspectCompactionEntryState(session.events);
                    assertCompactionInactive(entryState.unmatchedCompactionStart, entryState.latestEndSeedSeq, 'compaction');
                    if (options.owner === null) {
                        if (entryState.openTurn !== null) {
                            throw new dsh_compaction_1.ManualCompactionError('busy', 'manual compaction: the session already has an open turn');
                        }
                        owner = null;
                    }
                    else {
                        if (entryState.openTurn === null) {
                            throw new Error('compactRegion: no open turn — automatic compaction events must be enclosed in a turn');
                        }
                        owner = entryState.openTurn;
                    }
                    compactionId = (0, dsh_compaction_1.CompactionId)((0, node_crypto_1.randomUUID)());
                    lifecycle = __assign(__assign({ compactionId: compactionId }, options.sourceCommandId === undefined ? {} : { sourceCommandId: options.sourceCommandId }), { turn: owner });
                    startEvent = session.append('compaction/start', lifecycle);
                    assertStable = options.stability === 'whole-surface'
                        ? assertWholeSurfaceUnchanged
                        : assertSelectedSpanStable;
                    closed = false;
                    closing = false;
                    stage = 'summary';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    prepared = prepareCompaction(dependencies, session, selection);
                    return [4 /*yield*/, summarizeCompaction(dependencies, prepared, agent, compactionId, options.sourceCommandId, signal)];
                case 2:
                    summarized = _a.sent();
                    if (options.owner === null)
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    assertStable(dependencies, session, summarized);
                    stage = 'commit';
                    pending = commitCompactionBody(session, startEvent, summarized);
                    closing = true;
                    endEvent = session.append('compaction/end', lifecycle);
                    closed = true;
                    result = completeCompaction(pending, endEvent);
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    failure = { error: error_1, stage: closing ? 'commit' : stage };
                    if (!closing) {
                        closing = true;
                        try {
                            session.append('compaction/end', __assign(__assign({}, lifecycle), { error: (0, dsh_llm_1.errorChain)(error_1) }));
                            closed = true;
                        }
                        catch (closeError) {
                            failure = { error: closeError, stage: 'commit' };
                        }
                    }
                    return [3 /*break*/, 4];
                case 4:
                    if (!(closed && options.flush !== undefined)) return [3 /*break*/, 8];
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, options.flush()];
                case 6:
                    _a.sent();
                    return [3 /*break*/, 8];
                case 7:
                    error_2 = _a.sent();
                    flushFailure = error_2;
                    return [3 /*break*/, 8];
                case 8:
                    if (options.owner === null)
                        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
                    if (failure !== undefined) {
                        if (options.owner === null)
                            throwManualFailure(failure);
                        throw failure.error;
                    }
                    if (flushFailure !== undefined) {
                        throw new dsh_compaction_1.ManualCompactionError('persistence', 'manual compaction durability checkpoint failed', { cause: flushFailure });
                    }
                    /* v8 ignore next -- every path without a result records and throws a failure above. */
                    if (result === undefined)
                        throw new Error('compaction committed without a result');
                    return [2 /*return*/, result];
            }
        });
    });
}
/** Classify one closed manual attempt without weakening cancellation precedence. */
function throwManualFailure(failure) {
    if (failure.stage === 'commit') {
        throw new dsh_compaction_1.ManualCompactionError('commit', 'manual compaction did not commit cleanly', { cause: failure.error });
    }
    if (failure.error instanceof SurfaceChangedError) {
        throw new dsh_compaction_1.ManualCompactionError('changed', 'the compacted history changed during manual compaction', { cause: failure.error });
    }
    throw new dsh_compaction_1.ManualCompactionError('summary', 'manual compaction could not produce a smaller summary', { cause: failure.error });
}
/**
 * Reject a durable unmatched compaction marker unless a later constructor-seed
 * boundary proves that its owner belongs to an earlier session lifecycle.
 * @param unmatchedCompactionStart - latest unmatched opening marker, if any.
 * @param latestEndSeedSeq - newest constructor-seed boundary, if any.
 * @param stage - operation label included in the busy diagnostic.
 */
function assertCompactionInactive(unmatchedCompactionStart, latestEndSeedSeq, stage) {
    if (unmatchedCompactionStart === undefined
        || (latestEndSeedSeq !== undefined
            && latestEndSeedSeq > unmatchedCompactionStart.seq))
        return;
    throw new dsh_compaction_1.ManualCompactionError('busy', "".concat(stage, ": compaction already in progress; the session compaction lock is already active"));
}
/**
 * Recheck the durable compaction lock after an asynchronous policy decision.
 * @param session - session whose latest marker state is inspected.
 * @param stage - operation label included in the busy diagnostic.
 */
function assertNoActiveCompaction(session, stage) {
    var entryState = inspectCompactionEntryState(session.events);
    assertCompactionInactive(entryState.unmatchedCompactionStart, entryState.latestEndSeedSeq, stage);
}
/** Validate one requested surface-position span before asynchronous work begins. */
function validateSurfaceRegion(session, start, end) {
    var nodes = session.surface.nodes;
    var startIdx = nodes.indexOf(start);
    var endIdx = nodes.indexOf(end);
    if (startIdx === -1)
        throw new Error("compactRegion: start seq ".concat(start, " not found in surface"));
    if (endIdx === -1)
        throw new Error("compactRegion: end seq ".concat(end, " not found in surface"));
    if (startIdx > endIdx) {
        throw new Error("compactRegion: start seq ".concat(start, " (position ").concat(startIdx, ") is after end seq ").concat(end, " (position ").concat(endIdx, ") on the surface"));
    }
    // oxlint-disable-next-line typescript/no-non-null-assertion
    if (!(0, dsh_compaction_1.toolPairingBalancedBefore)(session, nodes[startIdx])) {
        throw new Error("compactRegion: start seq ".concat(start, " is not a balanced boundary (would split a step's tool-call/result pair)"));
    }
    // oxlint-disable-next-line typescript/no-non-null-assertion
    if (!(0, dsh_compaction_1.toolPairingBalancedAfter)(session, nodes[endIdx])) {
        throw new Error("compactRegion: end seq ".concat(end, " is not a balanced boundary (would split a step, or the step is still open)"));
    }
    return { start: start, end: end, startIdx: startIdx, endIdx: endIdx, shadowedSeqs: nodes.slice(startIdx, endIdx + 1) };
}
/** Snapshot pricing and replay input for a validated surface range. */
function prepareCompaction(dependencies, session, selection) {
    var measurement = dependencies.meter.measure(session);
    var selectedNodes = measurement.nodes.slice(selection.startIdx, selection.endIdx + 1);
    if (selectedNodes.length !== selection.shadowedSeqs.length
        || selectedNodes.some(function (node, index) { return node.seq !== selection.shadowedSeqs[index]; })) {
        throw new SurfaceChangedError('compaction: selected surface changed before summarization began');
    }
    return __assign(__assign({}, selection), { measurement: measurement, selectedNodes: selectedNodes, shadowedTokenCount: selectedNodes.reduce(function (total, node) { return total + node.tokens; }, 0), input: buildSummarizationInput(session, selection.shadowedSeqs) });
}
/** Run the summarizer and frame its replacement checkpoint. */
function summarizeCompaction(dependencies, prepared, agent, compactionId, sourceCommandId, signal) {
    return __awaiter(this, void 0, void 0, function () {
        var summaryResult, checkpointMessage, framedSummaryTokenCount;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, dependencies.summarize(prepared.input, agent, signal)];
                case 1:
                    summaryResult = _a.sent();
                    checkpointMessage = (0, dsh_llm_1.createUserMessage)({
                        content: (0, summarizer_ts_1.frameSummary)(summaryResult.summary),
                        source: (0, dsh_compaction_1.compactCheckpointSource)(compactionId, sourceCommandId),
                    });
                    framedSummaryTokenCount = dependencies.meter.estimateMessage(checkpointMessage);
                    if (framedSummaryTokenCount >= prepared.shadowedTokenCount) {
                        throw new Error("summary is not smaller than the shadowed content (".concat(framedSummaryTokenCount, " estimated framed tokens >= ").concat(prepared.shadowedTokenCount, ")"));
                    }
                    return [2 /*return*/, __assign(__assign(__assign({}, prepared), summaryResult), { checkpointMessage: checkpointMessage })];
            }
        });
    });
}
/** Reject a summary prepared against any earlier surface generation. */
function assertWholeSurfaceUnchanged(dependencies, session, prepared) {
    var current = dependencies.meter.measure(session);
    if (!(0, node_util_1.isDeepStrictEqual)(current.nodes, prepared.measurement.nodes)) {
        throw new SurfaceChangedError('compaction: session surface changed during summarization');
    }
}
/**
 * Require only that the selected span remain the same present, contiguous,
 * equally priced, balanced replacement target. Nodes added outside it remain
 * visible and do not invalidate the summary.
 */
function assertSelectedSpanStable(dependencies, session, prepared) {
    var current;
    try {
        current = validateSurfaceRegion(session, prepared.start, prepared.end);
    }
    catch (error) {
        throw new SurfaceChangedError('compaction: the selected span is no longer a valid replacement target', { cause: error });
    }
    if (!(0, node_util_1.isDeepStrictEqual)(__spreadArray([], current.shadowedSeqs, true), __spreadArray([], prepared.shadowedSeqs, true))) {
        throw new SurfaceChangedError('compaction: the selected span changed during summarization');
    }
    var measured = dependencies.meter.measure(session).nodes.slice(current.startIdx, current.endIdx + 1);
    if (!(0, node_util_1.isDeepStrictEqual)(measured, prepared.selectedNodes)) {
        throw new SurfaceChangedError('compaction: the selected span was rewritten during summarization');
    }
}
/** Append one completed summary record and replacement body without yielding. */
function commitCompactionBody(session, startEvent, summarized) {
    var start = summarized.start, end = summarized.end, shadowedSeqs = summarized.shadowedSeqs, shadowedTokenCount = summarized.shadowedTokenCount, summary = summarized.summary, provider = summarized.provider, model = summarized.model, maxTokens = summarized.maxTokens, usage = summarized.usage, checkpointMessage = summarized.checkpointMessage;
    var callProvenance = summarized.llmStreamCall === true
        ? { rawOutput: summarized.rawOutput, llmStreamCall: true }
        : summarized.rawOutput === undefined ? {} : { rawOutput: summarized.rawOutput };
    var summaryEvent = session.append('compaction/summary', __assign(__assign(__assign(__assign(__assign(__assign({ compactionId: startEvent.data.compactionId }, startEvent.data.sourceCommandId === undefined
        ? {}
        : { sourceCommandId: startEvent.data.sourceCommandId }), { summary: summary }), callProvenance), { shadowedRange: { start: start, end: end }, shadowedSeqs: __spreadArray([], shadowedSeqs, true), shadowedTokenCount: shadowedTokenCount, provider: provider, model: model }), maxTokens === undefined ? {} : { maxTokens: maxTokens }), usage === undefined ? {} : { usage: usage }));
    session.append('user/message', checkpointMessage, {
        surfaceOp: { op: 'replace', start: start, end: end },
        sourceEventSeqs: __spreadArray([startEvent.seq, summaryEvent.seq], shadowedSeqs, true),
    });
    return __assign(__assign({ compactionId: startEvent.data.compactionId }, startEvent.data.sourceCommandId === undefined
        ? {}
        : { sourceCommandId: startEvent.data.sourceCommandId }), { startSeq: startEvent.seq, summarySeq: summaryEvent.seq, summary: summary, shadowedRange: { start: start, end: end }, shadowedSeqs: __spreadArray([], shadowedSeqs, true), shadowedTokenCount: shadowedTokenCount });
}
/** Attach the successfully appended close event to a pending result. */
function completeCompaction(pending, endEvent) {
    return __assign(__assign({}, pending), { endSeq: endEvent.seq });
}
/**
 * Reconstruct the last routed request's cacheable prefix for the shadowed
 * region: its system prompt and tool schemas, then the region's own derived
 * messages in surface order. The summarizer appends only the compaction
 * instruction after this, so the call is a genuine prefix of the conversation
 * and reuses the provider's KV cache.
 * @param session - session supplying the request header and per-node projection.
 * @param shadowedSeqs - the surface-node seqs, in order, being compacted.
 * @returns the replayed conversation prefix to condense.
 */
function buildSummarizationInput(session, shadowedSeqs) {
    var header = session.requestHeader();
    var events = session.events;
    var regionMessages = shadowedSeqs
        // shadowedSeqs are current surface seqs, so each is a valid log index.
        // oxlint-disable-next-line typescript/no-non-null-assertion
        .map(function (seq) { return session.deriveEventMessage(events[seq]); })
        .filter(function (message) { return message !== null; });
    return __assign(__assign(__assign({}, (header === null || header === void 0 ? void 0 : header.system) === undefined ? {} : { system: header.system }), (header === null || header === void 0 ? void 0 : header.tools) === undefined ? {} : { tools: header.tools }), { messages: regionMessages });
}
/** Inspect open-turn, unmatched-compaction, and latest seed-boundary state independently. */
function inspectCompactionEntryState(events) {
    var openTurn = null;
    var openTurnStateKnown = false;
    var unmatchedCompactionStart;
    var compactionEntryStateKnown = false;
    var latestEndSeedSeq;
    for (var index = events.length - 1; index >= 0; index -= 1) {
        // oxlint-disable-next-line typescript/no-non-null-assertion
        var event_1 = events[index];
        if (latestEndSeedSeq === undefined && event_1.type === 'session/end-seed') {
            latestEndSeedSeq = event_1.seq;
        }
        if (!compactionEntryStateKnown) {
            if (event_1.type === 'compaction/start') {
                unmatchedCompactionStart = event_1;
                compactionEntryStateKnown = true;
            }
            else if (event_1.type === 'compaction/end') {
                compactionEntryStateKnown = true;
            }
        }
        if (!openTurnStateKnown) {
            if (event_1.type === 'turn/start') {
                openTurn = event_1.data.turn;
                openTurnStateKnown = true;
            }
            else if (event_1.type === 'turn/end') {
                openTurnStateKnown = true;
            }
        }
        if (openTurnStateKnown
            && compactionEntryStateKnown
            && latestEndSeedSeq !== undefined)
            break;
    }
    return { openTurn: openTurn, unmatchedCompactionStart: unmatchedCompactionStart, latestEndSeedSeq: latestEndSeedSeq };
}
