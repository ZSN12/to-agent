"use strict";
/**
 * Model text rendering and generic tool-call presentation.
 *
 * @module @z/dsh-tool-session-query/presentation
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.presentation = void 0;
var dsh_session_query_1 = require("@z/dsh-session-query");
var workspace_access_ts_1 = require("./workspace-access.ts");
function formatSessionSearch(collected, titles, authorizedParents) {
    if (collected.items.length === 0)
        return formatEmptySessionSearch();
    var lines = ["Session search results (".concat(collected.items.length, "):")];
    for (var _i = 0, _a = collected.items.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], index = _b[0], hit = _b[1];
        var parent_1 = hit.header.parentSession === undefined
            ? 'root'
            : authorizedParents.has(hit.header.parentSession)
                ? hit.header.parentSession
                : '[outside workspace]';
        var availability = [
            hit.live ? 'live' : undefined,
            hit.persisted ? 'persisted' : undefined,
        ].filter(function (value) { return value !== undefined; }).join(', ') || 'unavailable';
        lines.push('', "".concat(index + 1, ". Session ").concat(hit.header.id, " \u2014 ").concat(workspace_access_ts_1.workspaceAccess.titleText(titles.get(hit.header.id))), "   Created: ".concat(formatTime(hit.header.createdAt)), "   Parent: ".concat(parent_1), "   Availability: ".concat(availability), "   Best match: seq ".concat(hit.bestMatch.seq, " | ").concat(hit.bestMatch.type, " | ").concat(hit.bestMatch.surface, " | ").concat(formatTime(hit.bestMatch.time)), "   Snippet: ".concat(hit.bestMatch.snippet));
    }
    if (collected.capped) {
        lines.push('', 'Result cap reached. Narrow the query or add filters to find additional matches.');
    }
    return lines.join('\n');
}
function formatEmptySessionSearch() {
    return 'No prior session matches found.';
}
function formatEventSearch(sessionId, title, collected) {
    var lines = ["Session ".concat(sessionId, " \u2014 ").concat(workspace_access_ts_1.workspaceAccess.titleText(title))];
    if (collected.items.length === 0) {
        lines.push('', 'No prior event matches found.');
        return lines.join('\n');
    }
    lines.push('', "Event search results (".concat(collected.items.length, "):"));
    for (var _i = 0, _a = collected.items.entries(); _i < _a.length; _i++) {
        var _b = _a[_i], index = _b[0], hit = _b[1];
        lines.push("".concat(index + 1, ". seq ").concat(hit.seq, " | ").concat(hit.type, " | ").concat(hit.surface, " | ").concat(formatTime(hit.time)), "   Snippet: ".concat(hit.snippet));
    }
    if (collected.capped) {
        lines.push('', 'Result cap reached. Narrow the query or add filters to find additional matches.');
    }
    return lines.join('\n');
}
function formatSessionTrace(trace, ancestors, ancestorBoundary, descendants, titles) {
    var lines = [
        "Session ".concat(trace.target.header.id, " \u2014 ").concat(workspace_access_ts_1.workspaceAccess.titleText(titles.get(trace.target.header.id))),
        "Created: ".concat(formatTime(trace.target.header.createdAt)),
        "Availability: ".concat(availabilityText(trace.target)),
        '',
        'Ancestors (nearest first):',
    ];
    if (ancestors.length === 0 && !ancestorBoundary)
        lines.push('- none (target is a root session)');
    for (var _i = 0, ancestors_1 = ancestors; _i < ancestors_1.length; _i++) {
        var record = ancestors_1[_i];
        lines.push("- ".concat(record.header.id, " \u2014 ").concat(workspace_access_ts_1.workspaceAccess.titleText(titles.get(record.header.id)), " | ").concat(formatTime(record.header.createdAt), " | ").concat(availabilityText(record)));
    }
    if (ancestorBoundary)
        lines.push('- [outside workspace boundary]');
    lines.push('', 'Descendants:');
    if (descendants.length === 0)
        lines.push('- none');
    else
        renderDescendants(lines, descendants, titles);
    return lines.join('\n');
}
function renderDescendants(lines, nodes, titles) {
    for (var _i = 0, _a = workspace_access_ts_1.workspaceAccess.visitDescendants(nodes); _i < _a.length; _i++) {
        var _b = _a[_i], node = _b.node, depth = _b.depth;
        var indent = '  '.repeat(depth);
        if (node === null) {
            lines.push("".concat(indent, "- [outside workspace subtree]"));
            continue;
        }
        var id = node.record.header.id;
        lines.push("".concat(indent, "- ").concat(id, " \u2014 ").concat(workspace_access_ts_1.workspaceAccess.titleText(titles.get(id)), " | ").concat(formatTime(node.record.header.createdAt), " | ").concat(availabilityText(node.record)));
    }
}
function formatEventTrace(sessionId, title, trace) {
    var _a;
    return [
        "Session ".concat(sessionId, " \u2014 ").concat(workspace_access_ts_1.workspaceAccess.titleText(title)),
        "Target: seq ".concat(trace.target.seq, " | ").concat(trace.target.type, " | ").concat(trace.target.surface, " | ").concat(formatTime(trace.target.time)),
        "Replaced by: ".concat((_a = trace.replacedBy) !== null && _a !== void 0 ? _a : 'none'),
        "Replacement chain: ".concat(seqList(trace.replacementChain)),
        "Events replaced by target: ".concat(seqList(trace.replacedEventSeqs)),
        "Events cited directly as sources: ".concat(seqList(trace.sourceEventSeqs)),
        "Direct derived events: ".concat(seqList(trace.derivedEventSeqs)),
    ].join('\n');
}
function formatEventRead(sessionId, title, window) {
    var before = window.events.filter(function (event) { return event.seq < window.target.seq; });
    var after = window.events.filter(function (event) { return event.seq > window.target.seq; });
    var lines = [
        "Session ".concat(sessionId, " \u2014 ").concat(workspace_access_ts_1.workspaceAccess.titleText(title)),
        "Target event seq ".concat(window.target.seq, ":"),
        '```json',
        JSON.stringify(window.target, null, 2),
        '```',
    ];
    if (before.length > 0) {
        lines.push('', 'Before:');
        for (var _i = 0, before_1 = before; _i < before_1.length; _i++) {
            var event_1 = before_1[_i];
            lines.push(formatNeighbor(event_1));
        }
    }
    if (after.length > 0) {
        lines.push('', 'After:');
        for (var _a = 0, after_1 = after; _a < after_1.length; _a++) {
            var event_2 = after_1[_a];
            lines.push(formatNeighbor(event_2));
        }
    }
    return lines.join('\n');
}
function formatNeighbor(event) {
    var text = (0, dsh_session_query_1.extractSessionEventText)(event);
    return "- seq ".concat(event.seq, " | ").concat(event.type, " | ").concat(formatTime(event.time))
        + (text.length === 0 ? ' | (no semantic text)' : "\n  ".concat(text.replaceAll('\n', '\n  ')));
}
function availabilityText(record) {
    return [
        record.live ? 'live' : undefined,
        record.persisted ? 'persisted' : undefined,
    ].filter(function (value) { return value !== undefined; }).join(', ') || 'unavailable';
}
function seqList(values) {
    return values.length === 0 ? 'none' : values.join(', ');
}
function formatTime(value) {
    return new Date(value).toISOString();
}
function presentSessionSearchCall(args) {
    return { card: 'generic', kind: 'search', title: 'Search prior sessions', rawInput: args.query };
}
function presentEventSearchCall(args) {
    return { card: 'generic', kind: 'search', title: 'Search session events', rawInput: args.query };
}
function presentSessionTraceCall(args) {
    return __assign({ card: 'generic', kind: 'read', title: args.session_id === undefined ? 'Trace current session' : "Trace session ".concat(args.session_id) }, args.session_id === undefined ? {} : { rawInput: args.session_id });
}
function presentEventTargetCall(action, args) {
    return {
        card: 'generic',
        kind: 'read',
        title: "".concat(action, " ").concat(args.seq),
        rawInput: __assign(__assign({}, args.session_id === undefined ? {} : { session_id: args.session_id }), { seq: args.seq }),
    };
}
/** Text output and call-card presentation for every session-query tool. */
exports.presentation = {
    formatSessionSearch: formatSessionSearch,
    formatEmptySessionSearch: formatEmptySessionSearch,
    formatEventSearch: formatEventSearch,
    formatSessionTrace: formatSessionTrace,
    formatEventTrace: formatEventTrace,
    formatEventRead: formatEventRead,
    presentSessionSearchCall: presentSessionSearchCall,
    presentEventSearchCall: presentEventSearchCall,
    presentSessionTraceCall: presentSessionTraceCall,
    presentEventTargetCall: presentEventTargetCall,
};
