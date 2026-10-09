"use strict";
/** Shared event metadata and semantic-document projection. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSessionEventRecords = buildSessionEventRecords;
exports.buildSessionEventSearchDocuments = buildSessionEventSearchDocuments;
var dsh_session_1 = require("@z/dsh-session");
var config_ts_1 = require("./config.ts");
var extraction_ts_1 = require("./extraction.ts");
/**
 * Project a raw log into lightweight surface-aware event records.
 * @param sessionId - session that owns the log.
 * @param events - complete contiguous raw event log.
 * @returns one record per event in ascending seq order.
 */
function buildSessionEventRecords(sessionId, events) {
    var surfaceBySeq = classifySurface(events);
    return events.map(function (event) {
        var _a;
        return ({
            sessionId: sessionId,
            seq: event.seq,
            type: event.type,
            time: event.time,
            surface: (_a = surfaceBySeq.get(event.seq)) !== null && _a !== void 0 ? _a : 'log-only',
        });
    });
}
/**
 * Build first-party semantic documents for one complete raw event log.
 * @param sessionId - session that owns the log.
 * @param events - complete contiguous raw event log.
 * @returns searchable documents in ascending seq order; structural events are omitted.
 */
function buildSessionEventSearchDocuments(sessionId, events) {
    var _a;
    var surfaceBySeq = classifySurface(events);
    var documents = [];
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        var text = (0, extraction_ts_1.extractSessionEventText)(event_1);
        if (text.length === 0)
            continue;
        documents.push({
            sessionId: sessionId,
            seq: event_1.seq,
            type: event_1.type,
            time: event_1.time,
            surface: (_a = surfaceBySeq.get(event_1.seq)) !== null && _a !== void 0 ? _a : 'log-only',
            text: text,
        });
    }
    return documents;
}
function classifySurface(events) {
    var folded;
    try {
        folded = (0, dsh_session_1.foldSurface)(events);
    }
    catch (error) {
        throw new config_ts_1.SessionQueryError(
        /* v8 ignore next -- foldSurface throws Error instances */
        "invalid session surface: ".concat(error instanceof Error ? error.message : 'unknown error'), 'SESSION_QUERY_INVALID_SURFACE', { cause: error });
    }
    var result = new Map();
    for (var _i = 0, _a = folded.nodes; _i < _a.length; _i++) {
        var seq = _a[_i];
        result.set(seq, 'current');
    }
    for (var _b = 0, _c = folded.replacements; _b < _c.length; _b++) {
        var replacement = _c[_b];
        for (var _d = 0, _e = replacement.shadowedSeqs; _d < _e.length; _d++) {
            var seq = _e[_d];
            result.set(seq, 'shadowed');
        }
    }
    return result;
}
