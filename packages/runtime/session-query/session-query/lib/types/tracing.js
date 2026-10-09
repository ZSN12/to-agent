"use strict";
/** One-shot session-lineage and event-relationship tracing helpers. */
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
exports.eventRecords = eventRecords;
exports.currentSurfaceEvents = currentSurfaceEvents;
exports.traceEvent = traceEvent;
exports.traceSession = traceSession;
var dsh_session_1 = require("@z/dsh-session");
var config_ts_1 = require("./config.ts");
/**
 * Classify a raw event log with one canonical surface fold.
 * @param sessionId - owner of the event log.
 * @param events - detached raw event log.
 * @returns lightweight records in ascending log order.
 */
function eventRecords(sessionId, events) {
    return analyzeEventLog(sessionId, events).records;
}
/**
 * Fold and return the current model surface after validating the whole log.
 * @param sessionId - owner used in query diagnostics.
 * @param events - detached raw event log from one corpus observation.
 * @returns detached current surface events in folded order.
 */
function currentSurfaceEvents(sessionId, events) {
    var analysis = analyzeEventLog(sessionId, events);
    return analysis.currentSeqs.map(function (seq) {
        var event = events[seq];
        /* v8 ignore next 6 -- analyzeEventLog validated contiguous seqs and foldSurface returned only surface-event seqs. */
        if (event === undefined || event.seq !== seq || !(0, dsh_session_1.isSurfaceEvent)(event)) {
            throw new config_ts_1.SessionQueryError("invalid session surface: current node ".concat(seq, " is not a surface event"), 'SESSION_QUERY_INVALID_SURFACE');
        }
        return (0, dsh_session_1.snapshotSessionEvent)(event);
    });
}
/**
 * Trace one target after one canonical surface fold and whole-log validation.
 * @param sessionId - owner of the event log.
 * @param events - detached raw event log.
 * @param seq - target event seq.
 * @returns direct surface replacements and relationships to cited source events.
 */
function traceEvent(sessionId, events, seq) {
    var _a;
    var target = events[seq];
    if (target === undefined || target.seq !== seq) {
        throw new config_ts_1.SessionQueryError("session \"".concat(sessionId, "\" has no event at seq ").concat(seq), 'SESSION_QUERY_EVENT_NOT_FOUND');
    }
    var analysis = analyzeEventLog(sessionId, events);
    var replacementChain = [];
    var replacement = analysis.replacedBy.get(seq);
    while (replacement !== undefined) {
        replacementChain.push(replacement);
        replacement = analysis.replacedBy.get(replacement);
    }
    var derivedEventSeqs = [];
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        if (event_1.seq <= seq)
            continue;
        if (eventSources(event_1).includes(seq))
            derivedEventSeqs.push(event_1.seq);
    }
    // The target check above proves the parallel record exists at this index.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    var targetRecord = analysis.records[seq];
    var replacedBy = analysis.replacedBy.get(seq);
    return __assign(__assign({ target: targetRecord }, replacedBy === undefined ? {} : { replacedBy: replacedBy }), { replacementChain: replacementChain, replacedEventSeqs: (_a = analysis.replacedEventSeqs.get(seq)) !== null && _a !== void 0 ? _a : [], sourceEventSeqs: __spreadArray([], eventSources(target), true), derivedEventSeqs: derivedEventSeqs });
}
/**
 * Trace one target's known ancestry and recursively known descendants.
 * @param records - complete logical corpus from one observation.
 * @param sessionId - target session id.
 * @returns complete or explicitly partial lineage.
 */
function traceSession(records, sessionId) {
    var _a, _b;
    var byId = new Map(records.map(function (record) { return [record.header.id, record]; }));
    var target = byId.get(sessionId);
    if (target === undefined) {
        throw new config_ts_1.SessionQueryError("session \"".concat(sessionId, "\" not found"), 'SESSION_QUERY_SESSION_NOT_FOUND');
    }
    var ancestors = [];
    var ancestrySeen = new Set([sessionId]);
    var unresolvedParentId;
    var parentId = target.header.parentSession;
    while (parentId !== undefined) {
        if (ancestrySeen.has(parentId)) {
            throw new config_ts_1.SessionQueryError("session lineage contains a cycle at \"".concat(parentId, "\""), 'SESSION_QUERY_INVALID_LINEAGE');
        }
        ancestrySeen.add(parentId);
        var parent_1 = byId.get(parentId);
        if (parent_1 === undefined) {
            unresolvedParentId = parentId;
            break;
        }
        ancestors.push(parent_1);
        parentId = parent_1.header.parentSession;
    }
    var childrenByParent = new Map();
    for (var _i = 0, records_1 = records; _i < records_1.length; _i++) {
        var record = records_1[_i];
        var parent_2 = record.header.parentSession;
        if (parent_2 === undefined)
            continue;
        var children = (_a = childrenByParent.get(parent_2)) !== null && _a !== void 0 ? _a : [];
        children.push(record);
        childrenByParent.set(parent_2, children);
    }
    for (var _c = 0, _d = childrenByParent.values(); _c < _d.length; _c++) {
        var children = _d[_c];
        children.sort(function (a, b) { return a.header.createdAt - b.header.createdAt || a.header.id.localeCompare(b.header.id); });
    }
    var descendants = buildDescendants(childrenByParent, sessionId);
    var common = {
        target: cloneRecord(target),
        ancestors: ancestors.map(cloneRecord),
        descendants: descendants,
    };
    if (unresolvedParentId !== undefined) {
        return __assign(__assign({}, common), { complete: false, unresolvedParentId: unresolvedParentId });
    }
    return __assign(__assign({}, common), { complete: true, root: cloneRecord((_b = ancestors.at(-1)) !== null && _b !== void 0 ? _b : target) });
}
function analyzeEventLog(sessionId, events) {
    var folded;
    try {
        folded = (0, dsh_session_1.foldSurface)(events);
    }
    catch (error) {
        throw new config_ts_1.SessionQueryError(
        /* v8 ignore next -- foldSurface throws Error instances */
        "invalid session surface: ".concat(error instanceof Error ? error.message : 'unknown error'), 'SESSION_QUERY_INVALID_SURFACE', { cause: error });
    }
    var current = new Set(folded.nodes);
    var replacedBy = new Map();
    var replacedEventSeqs = new Map();
    for (var _i = 0, _a = folded.replacements; _i < _a.length; _i++) {
        var replacement = _a[_i];
        var removed = replacement.shadowedSeqs;
        replacedEventSeqs.set(replacement.seq, removed);
        for (var _b = 0, removed_1 = removed; _b < removed_1.length; _b++) {
            var removedSeq = removed_1[_b];
            replacedBy.set(removedSeq, replacement.seq);
        }
    }
    return {
        records: events.map(function (event) { return ({
            sessionId: sessionId,
            seq: event.seq,
            type: event.type,
            time: event.time,
            surface: current.has(event.seq)
                ? 'current'
                : replacedBy.has(event.seq) ? 'shadowed' : 'log-only',
        }); }),
        replacedBy: replacedBy,
        replacedEventSeqs: replacedEventSeqs,
        currentSeqs: __spreadArray([], folded.nodes, true),
    };
}
function eventSources(event) {
    var _a;
    return (_a = event.sourceEventSeqs) !== null && _a !== void 0 ? _a : [];
}
function buildDescendants(childrenByParent, sessionId) {
    var _a;
    var descendants = [];
    var stack = [{ sessionId: sessionId, descendants: descendants }];
    while (stack.length > 0) {
        // The length guard proves a frame exists.
        // oxlint-disable-next-line typescript/no-non-null-assertion
        var frame = stack.pop();
        var nodes = [];
        for (var _i = 0, _b = (_a = childrenByParent.get(frame.sessionId)) !== null && _a !== void 0 ? _a : []; _i < _b.length; _i++) {
            var child = _b[_i];
            var node = { session: cloneRecord(child), descendants: [] };
            nodes.push(node);
            frame.descendants.push(node);
        }
        for (var index = nodes.length - 1; index >= 0; index -= 1) {
            // The loop bounds prove this indexed node exists.
            // oxlint-disable-next-line typescript/no-non-null-assertion
            var node = nodes[index];
            stack.push({ sessionId: node.session.header.id, descendants: node.descendants });
        }
    }
    return descendants;
}
function cloneRecord(record) {
    return __assign(__assign({}, record), { header: structuredClone(record.header) });
}
