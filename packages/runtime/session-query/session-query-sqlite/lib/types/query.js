"use strict";
/** Request normalization, parameterized predicates, and result presentation. */
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
exports.SQLITE_FTS5_OUTER_PREDICATE_LIMIT = exports.SQLITE_PORTABLE_VARIABLE_LIMIT = exports.SQLITE_MAX_PAGE_LIMIT = exports.FTS_HIGHLIGHT_END = exports.FTS_HIGHLIGHT_START = void 0;
exports.assertPortableBindingCount = assertPortableBindingCount;
exports.assertFts5OuterPredicateCount = assertFts5OuterPredicateCount;
exports.normalizeSessionRequest = normalizeSessionRequest;
exports.normalizeEventRequest = normalizeEventRequest;
exports.buildSessionWhere = buildSessionWhere;
exports.buildEventWhere = buildEventWhere;
exports.quoteFtsData = quoteFtsData;
exports.sanitizeFtsText = sanitizeFtsText;
exports.requestFingerprint = requestFingerprint;
exports.makeSnippet = makeSnippet;
var dsh_session_query_1 = require("@z/dsh-session-query");
/** Collision-free marker inserted before an FTS5 match by `highlight()`. */
exports.FTS_HIGHLIGHT_START = '\uFDD0';
/** Collision-free marker inserted after an FTS5 match by `highlight()`. */
exports.FTS_HIGHLIGHT_END = '\uFDD1';
/** Largest page size whose internal lookahead remains an exact SQLite integer binding. */
exports.SQLITE_MAX_PAGE_LIMIT = Number.MAX_SAFE_INTEGER - 1;
/** Portable host-parameter ceiling shared by predicate and statement builders. */
exports.SQLITE_PORTABLE_VARIABLE_LIMIT = 32766;
/** Supported outer-predicate budget that keeps SQLite FTS5 MATCH usable. */
exports.SQLITE_FTS5_OUTER_PREDICATE_LIMIT = 14;
/**
 * Reject prospective SQLite binding growth beyond the portable ceiling.
 * @param count - binding count at the current construction boundary.
 */
function assertPortableBindingCount(count) {
    if (count > exports.SQLITE_PORTABLE_VARIABLE_LIMIT) {
        throw new dsh_session_query_1.SessionQueryError("session-search request exceeds SQLite's portable ".concat(exports.SQLITE_PORTABLE_VARIABLE_LIMIT, "-variable limit; reduce filter values"), 'SESSION_QUERY_INVALID_FILTER');
    }
}
/**
 * Reject compiled outer predicates beyond the supported FTS5 planner budget.
 * @param count - predicate count including fixed statement predicates.
 */
function assertFts5OuterPredicateCount(count) {
    if (count > exports.SQLITE_FTS5_OUTER_PREDICATE_LIMIT) {
        throw new dsh_session_query_1.SessionQueryError("session-search request exceeds the supported SQLite FTS5 outer-predicate budget of ".concat(exports.SQLITE_FTS5_OUTER_PREDICATE_LIMIT, "; reduce filters"), 'SESSION_QUERY_INVALID_FILTER');
    }
}
/**
 * Validate and canonicalize a cross-session request.
 * @param request - caller-provided query, filters, limit, and cursor.
 * @param limits - configured default and maximum page sizes.
 * @returns normalized request with explicit arrays and limit.
 */
function normalizeSessionRequest(request, limits) {
    var _a, _b;
    var sessionFilters = (0, dsh_session_query_1.materializeSessionResultFilters)((_a = request.sessionFilters) !== null && _a !== void 0 ? _a : []);
    var eventFilters = materializeMetadataFilters((_b = request.eventFilters) !== null && _b !== void 0 ? _b : []);
    var cursor = materializeCursor(request.cursor);
    return __assign({ query: normalizeQuery(request.query), sessionFilters: sessionFilters, eventFilters: eventFilters, limit: normalizeLimit(request.limit, limits) }, cursor === undefined ? {} : { cursor: cursor });
}
/**
 * Validate and canonicalize a within-session request.
 * @param request - caller-provided target, query, filters, limit, and cursor.
 * @param limits - configured default and maximum page sizes.
 * @returns normalized request with an explicit filter array and limit.
 */
function normalizeEventRequest(request, limits) {
    var _a;
    if (typeof request.sessionId !== 'string') {
        throw new dsh_session_query_1.SessionQueryError('session-search session id must be text', 'SESSION_QUERY_INVALID_FILTER');
    }
    var filters = materializeMetadataFilters((_a = request.filters) !== null && _a !== void 0 ? _a : []);
    var cursor = materializeCursor(request.cursor);
    return __assign({ sessionId: request.sessionId, query: normalizeQuery(request.query), filters: filters, limit: normalizeLimit(request.limit, limits) }, cursor === undefined ? {} : { cursor: cursor });
}
/**
 * Compile logical-session predicates against selected-document columns.
 * @param filters - validated ANDed logical-session clauses.
 * @returns parameterized SQL fragment and ordered bindings.
 */
function buildSessionWhere(filters) {
    var clauses = [];
    var params = [];
    for (var _i = 0, filters_1 = filters; _i < filters_1.length; _i++) {
        var filter = filters_1[_i];
        switch (filter.kind) {
            case 'id':
                addList(clauses, params, 'session_id', filter.values);
                break;
            case 'cwd':
                addNullableList(clauses, params, 'cwd', filter.values);
                break;
            case 'created-at':
                addRange(clauses, params, 'created_at', filter);
                break;
            case 'parent':
                addNullableList(clauses, params, 'parent_session', filter.values);
                break;
            case 'availability': {
                var availability = __spreadArray([], new Set(filter.values), true);
                if (availability.length === 0)
                    clauses.push('0');
                else if (availability.length === 1) {
                    var value = availability[0];
                    switch (value) {
                        case 'live':
                            clauses.push('live = 1');
                            break;
                        case 'persisted':
                            clauses.push('persisted = 1');
                            break;
                        default:
                            unknownAvailability(value);
                    }
                }
                break;
            }
            default:
                unknownFilter(filter);
        }
    }
    assertFts5OuterPredicateCount(clauses.length);
    return { sql: clauses.join(' AND '), params: params, predicateCount: clauses.length };
}
/**
 * Compile event metadata predicates against selected-document columns.
 * @param filters - validated ANDed event metadata clauses.
 * @returns parameterized SQL fragment and ordered bindings.
 */
function buildEventWhere(filters) {
    var clauses = [];
    var params = [];
    for (var _i = 0, filters_2 = filters; _i < filters_2.length; _i++) {
        var filter = filters_2[_i];
        switch (filter.kind) {
            case 'seq':
                addRange(clauses, params, 'seq', filter);
                break;
            case 'time':
                addRange(clauses, params, 'time', filter);
                break;
            case 'type':
                addList(clauses, params, 'type', filter.values);
                break;
            case 'surface':
                addList(clauses, params, 'surface', filter.values);
                break;
            default:
                unknownFilter(filter);
        }
    }
    assertFts5OuterPredicateCount(clauses.length);
    return { sql: clauses.join(' AND '), params: params, predicateCount: clauses.length };
}
/**
 * Quote caller text as one FTS5 phrase so query syntax remains inert data.
 * @param query - normalized caller query.
 * @returns FTS5 expression containing one escaped literal phrase.
 */
function quoteFtsData(query) {
    return "\"".concat(query.replaceAll('"', '""'), "\"");
}
/**
 * Remove reserved marker collisions before text enters FTS5 or MATCH.
 * @param text - extracted document text or normalized caller query.
 * @returns text with reserved noncharacters mapped to replacement characters.
 */
function sanitizeFtsText(text) {
    return text
        .replaceAll('\0', '\uFFFD')
        .replaceAll(exports.FTS_HIGHLIGHT_START, '\uFFFD')
        .replaceAll(exports.FTS_HIGHLIGHT_END, '\uFFFD');
}
/**
 * Build the stable normalized request identity stored in opaque cursors.
 * @param request - normalized request whose filter ordering is canonicalized.
 * @returns deterministic JSON identity for cursor binding.
 */
function requestFingerprint(request) {
    if ('sessionId' in request) {
        return JSON.stringify({
            scope: 'events',
            sessionId: request.sessionId,
            query: request.query,
            filters: canonicalFilters(request.filters),
            limit: request.limit,
        });
    }
    return JSON.stringify({
        scope: 'sessions',
        query: request.query,
        sessionFilters: canonicalFilters(request.sessionFilters),
        eventFilters: canonicalFilters(request.eventFilters),
        limit: request.limit,
    });
}
/**
 * Build a whitespace-normalized excerpt no longer than `maxChars`.
 * @param markedText - complete document with FTS5 `highlight()` markers.
 * @param maxChars - maximum result length in Unicode code points.
 * @returns bounded plain-text snippet.
 */
function makeSnippet(markedText, maxChars) {
    var _a = normalizeMarkedText(markedText), clean = _a.text, matchStart = _a.matchStart;
    var characters = Array.from(clean);
    if (characters.length <= maxChars)
        return clean;
    if (maxChars === 1)
        return '…';
    var matchedIndex = Math.min(matchStart, characters.length - 1);
    var start = Math.max(0, matchedIndex - Math.floor(maxChars / 3));
    var prefix = start > 0 ? '…' : '';
    var suffix = '…';
    var contentLength = maxChars - prefix.length - suffix.length;
    if (contentLength < 1) {
        start = matchedIndex;
        suffix = '';
        contentLength = maxChars - prefix.length - suffix.length;
    }
    else if (matchedIndex >= start + contentLength) {
        start = matchedIndex - contentLength + 1;
    }
    var end = Math.min(characters.length, start + contentLength);
    if (end === characters.length) {
        suffix = '';
        contentLength = maxChars - prefix.length;
        start = Math.max(0, end - contentLength);
    }
    end = Math.min(characters.length, start + contentLength);
    return "".concat(prefix).concat(characters.slice(start, end).join('')).concat(suffix);
}
function normalizeMarkedText(markedText) {
    var characters = [];
    var matchStart;
    for (var _i = 0, markedText_1 = markedText; _i < markedText_1.length; _i++) {
        var character = markedText_1[_i];
        if (character === exports.FTS_HIGHLIGHT_START) {
            matchStart !== null && matchStart !== void 0 ? matchStart : (matchStart = characters.length);
            continue;
        }
        if (character === exports.FTS_HIGHLIGHT_END)
            continue;
        if (/\s/u.test(character)) {
            if (characters.length > 0 && characters.at(-1) !== ' ')
                characters.push(' ');
        }
        else {
            characters.push(character);
        }
    }
    if (characters.at(-1) === ' ')
        characters.pop();
    return {
        text: characters.join(''),
        matchStart: matchStart !== null && matchStart !== void 0 ? matchStart : 0,
    };
}
function normalizeQuery(value) {
    if (typeof value !== 'string') {
        throw new dsh_session_query_1.SessionQueryError('session-search query must be text', 'SESSION_QUERY_INVALID_QUERY');
    }
    var query = value.trim().replace(/\s+/gu, ' ');
    if (query.length === 0) {
        throw new dsh_session_query_1.SessionQueryError('session-search query must contain non-whitespace text', 'SESSION_QUERY_INVALID_QUERY');
    }
    if (query.includes('\0')) {
        throw new dsh_session_query_1.SessionQueryError('session-search query must not contain NUL', 'SESSION_QUERY_INVALID_QUERY');
    }
    return sanitizeFtsText(query);
}
function materializeCursor(cursor) {
    if (cursor === undefined)
        return undefined;
    if (typeof cursor !== 'string') {
        throw new dsh_session_query_1.SessionQueryError('session-search cursor must be text', 'SESSION_QUERY_INVALID_CURSOR');
    }
    return cursor;
}
function materializeMetadataFilters(filters) {
    var candidates = filters;
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var filter = candidates_1[_i];
        switch (filter.kind) {
            case 'seq':
            case 'time':
            case 'type':
            case 'surface':
                break;
            case 'text':
                throw new dsh_session_query_1.SessionQueryError('session-search metadata filters do not accept text clauses', 'SESSION_QUERY_INVALID_FILTER');
            default:
                unknownFilter(filter);
        }
    }
    return (0, dsh_session_query_1.materializeSessionEventResultFilters)(filters);
}
function normalizeLimit(value, limits) {
    var limit = value !== null && value !== void 0 ? value : limits.defaultLimit;
    var maxLimit = Math.min(limits.maxLimit, exports.SQLITE_MAX_PAGE_LIMIT);
    if (!Number.isSafeInteger(limit)
        || limit < 1
        || limit > maxLimit) {
        throw new dsh_session_query_1.SessionQueryError("session-search limit must be an integer between 1 and ".concat(maxLimit), 'SESSION_QUERY_INVALID_LIMIT');
    }
    return limit;
}
function addList(clauses, params, column, values) {
    if (values.length === 0) {
        clauses.push('0');
        return;
    }
    clauses.push("".concat(column, " IN (").concat(appendListBindings(params, values), ")"));
}
function addNullableList(clauses, params, column, values) {
    if (values.length === 0) {
        clauses.push('0');
        return;
    }
    var concrete = values.filter(function (value) { return value !== null; });
    var parts = [];
    if (concrete.length > 0) {
        parts.push("".concat(column, " IN (").concat(appendListBindings(params, concrete), ")"));
    }
    if (values.includes(null))
        parts.push("".concat(column, " IS NULL"));
    clauses.push("(".concat(parts.join(' OR '), ")"));
}
function addRange(clauses, params, column, range) {
    if (range.from !== undefined) {
        assertPortableBindingCount(params.length + 1);
        clauses.push("CAST(".concat(column, " AS INTEGER) >= ?"));
        params.push(range.from);
    }
    if (range.to !== undefined) {
        assertPortableBindingCount(params.length + 1);
        clauses.push("CAST(".concat(column, " AS INTEGER) <= ?"));
        params.push(range.to);
    }
}
function appendListBindings(params, values) {
    assertPortableBindingCount(params.length + values.length);
    for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
        var value = values_1[_i];
        params.push(value);
    }
    return values.map(function () { return '?'; }).join(', ');
}
function canonicalFilters(filters) {
    return filters.map(function (filter) {
        var _a, _b;
        if ('values' in filter) {
            return __assign(__assign({}, filter), { values: __spreadArray([], filter.values, true).sort(compareNullable) });
        }
        return {
            kind: filter.kind,
            from: (_a = filter.from) !== null && _a !== void 0 ? _a : null,
            to: (_b = filter.to) !== null && _b !== void 0 ? _b : null,
        };
    }).sort(function (a, b) { return JSON.stringify(a).localeCompare(JSON.stringify(b)); });
}
function compareNullable(a, b) {
    if (a === b)
        return 0;
    if (a === null)
        return -1;
    if (b === null)
        return 1;
    return a.localeCompare(b);
}
function unknownAvailability(value) {
    throw new dsh_session_query_1.SessionQueryError("session availability filter contains unknown value \"".concat(String(value), "\""), 'SESSION_QUERY_INVALID_FILTER');
}
function unknownFilter(filter) {
    var kind = filter.kind;
    throw new dsh_session_query_1.SessionQueryError("session filter contains unknown kind ".concat(typeof kind === 'string' ? "\"".concat(kind, "\"") : '(missing)'), 'SESSION_QUERY_INVALID_FILTER');
}
