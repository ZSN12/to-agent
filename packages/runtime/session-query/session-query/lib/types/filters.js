"use strict";
/** Pure provider-independent predicates for logical sessions and event text. */
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
exports.filterSessionResults = filterSessionResults;
exports.filterSessionEventDocuments = filterSessionEventDocuments;
exports.materializeSessionResultFilters = materializeSessionResultFilters;
exports.materializeSessionEventResultFilters = materializeSessionEventResultFilters;
exports.compileSessionTextFilter = compileSessionTextFilter;
var config_ts_1 = require("./config.ts");
/**
 * Apply ANDed logical-session filters while preserving input order.
 * @param records - detached logical-session records to inspect.
 * @param filters - clauses whose list values are ORed within each clause.
 * @returns records accepted by every clause.
 */
function filterSessionResults(records, filters) {
    if (filters === void 0) { filters = []; }
    var predicates = filters.map(sessionPredicate);
    return records.filter(function (record) { return predicates.every(function (predicate) { return predicate(record); }); });
}
/**
 * Apply ANDed event filters to extracted semantic documents.
 * @param documents - semantic documents produced by {@link buildSessionEventSearchDocuments}.
 * @param filters - metadata and literal-text predicates.
 * @returns documents accepted by every clause, in input order.
 */
function filterSessionEventDocuments(documents, filters) {
    if (filters === void 0) { filters = []; }
    var predicates = filters.map(eventPredicate);
    return documents.filter(function (document) { return predicates.every(function (predicate) { return predicate(document); }); });
}
/**
 * Copy and validate logical-session filters before an asynchronous boundary.
 * @param filters - caller-owned clauses to materialize.
 * @returns detached validated clauses.
 */
function materializeSessionResultFilters(filters) {
    assertArray(filters);
    return filters.map(function (filter) {
        switch (filter.kind) {
            case 'id':
                return { kind: filter.kind, values: copyStrings(filter.kind, filter.values) };
            case 'cwd':
                return { kind: filter.kind, values: copyNullableStrings(filter.kind, filter.values) };
            case 'created-at':
                return copyRange(filter.kind, filter);
            case 'parent':
                return { kind: filter.kind, values: copyNullableStrings(filter.kind, filter.values) };
            case 'availability': {
                var values = copyStrings(filter.kind, filter.values);
                assertAllowedValues(filter.kind, values, ['live', 'persisted']);
                return { kind: filter.kind, values: values };
            }
            default:
                return unknownFilter(filter);
        }
    });
}
/**
 * Copy and validate event filters before an asynchronous boundary.
 * @param filters - caller-owned clauses to materialize.
 * @returns detached validated clauses.
 */
function materializeSessionEventResultFilters(filters) {
    assertArray(filters);
    return filters.map(function (filter) {
        switch (filter.kind) {
            case 'seq':
            case 'time':
                return copyRange(filter.kind, filter);
            case 'type':
                return { kind: filter.kind, values: copyStrings(filter.kind, filter.values) };
            case 'surface': {
                var values = copyStrings(filter.kind, filter.values);
                assertAllowedValues(filter.kind, values, ['current', 'shadowed', 'log-only']);
                return { kind: filter.kind, values: values };
            }
            case 'text':
                if (typeof filter.text !== 'string')
                    throw invalidFilter('text filter text must be a string');
                return { kind: filter.kind, text: filter.text };
            default:
                return unknownFilter(filter);
        }
    });
}
/**
 * Compile a literal case-insensitive, whitespace-flexible semantic-text match.
 * @param text - caller-provided literal text.
 * @returns Unicode-aware regular expression safe from regex injection.
 */
function compileSessionTextFilter(text) {
    var trimmed = text.trim();
    if (trimmed.length === 0) {
        throw new config_ts_1.SessionQueryError('session text filter must contain non-whitespace text', 'SESSION_QUERY_INVALID_FILTER');
    }
    var pattern = trimmed
        .split(/\s+/u)
        .map(function (part) { return part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'); })
        .join('\\s+');
    return new RegExp(pattern, 'iu');
}
function sessionPredicate(filter) {
    switch (filter.kind) {
        case 'id':
            return function (record) { return filter.values.includes(record.header.id); };
        case 'cwd':
            return function (record) { var _a; return filter.values.includes((_a = record.header.cwd) !== null && _a !== void 0 ? _a : null); };
        case 'created-at': {
            var range_1 = validateRange(filter.kind, filter);
            return function (record) { return matchesRange(record.header.createdAt, range_1); };
        }
        case 'parent':
            return function (record) { var _a; return filter.values.includes((_a = record.header.parentSession) !== null && _a !== void 0 ? _a : null); };
        case 'availability':
            assertAllowedValues(filter.kind, filter.values, ['live', 'persisted']);
            return function (record) { return filter.values.some(function (value) { return value === 'live' ? record.live : record.persisted; }); };
        default:
            return unknownFilter(filter);
    }
}
function eventPredicate(filter) {
    switch (filter.kind) {
        case 'seq': {
            var range_2 = validateRange(filter.kind, filter);
            return function (document) { return matchesRange(document.seq, range_2); };
        }
        case 'time': {
            var range_3 = validateRange(filter.kind, filter);
            return function (document) { return matchesRange(document.time, range_3); };
        }
        case 'type':
            return function (document) { return filter.values.includes(document.type); };
        case 'surface':
            assertAllowedValues(filter.kind, filter.values, ['current', 'shadowed', 'log-only']);
            return function (document) { return filter.values.includes(document.surface); };
        case 'text': {
            var pattern_1 = compileSessionTextFilter(filter.text);
            return function (document) { return pattern_1.test(document.text); };
        }
        default:
            return unknownFilter(filter);
    }
}
function copyStrings(name, values) {
    if (!isRuntimeArray(values) || values.some(function (value) { return typeof value !== 'string'; })) {
        throw invalidFilter("".concat(name, " filter values must be an array of strings"));
    }
    return __spreadArray([], values, true);
}
function assertArray(value) {
    if (!Array.isArray(value))
        throw invalidFilter('filters must be an array');
}
function copyNullableStrings(name, values) {
    if (!isRuntimeArray(values) || values.some(function (value) { return value !== null && typeof value !== 'string'; })) {
        throw invalidFilter("".concat(name, " filter values must be an array of strings or null"));
    }
    return __spreadArray([], values, true);
}
function copyRange(kind, range) {
    var copy = __assign(__assign({ kind: kind }, range.from === undefined ? {} : { from: range.from }), range.to === undefined ? {} : { to: range.to });
    validateRange(kind, copy);
    return copy;
}
function unknownFilter(filter) {
    var kind = filter.kind;
    throw invalidFilter("unknown filter kind ".concat(typeof kind === 'string' ? "\"".concat(kind, "\"") : '(missing)'));
}
function assertAllowedValues(name, values, allowed) {
    for (var _i = 0, values_1 = values; _i < values_1.length; _i++) {
        var value = values_1[_i];
        if (!allowed.includes(value)) {
            throw new config_ts_1.SessionQueryError("session ".concat(name, " filter contains unknown value \"").concat(value, "\""), 'SESSION_QUERY_INVALID_FILTER');
        }
    }
}
function validateRange(name, range) {
    if (range.from !== undefined && !Number.isFinite(range.from)) {
        throw invalidRange(name, 'from must be finite');
    }
    if (range.to !== undefined && !Number.isFinite(range.to)) {
        throw invalidRange(name, 'to must be finite');
    }
    if (range.from !== undefined && range.to !== undefined && range.from > range.to) {
        throw invalidRange(name, 'from must be less than or equal to to');
    }
    return range;
}
function matchesRange(value, range) {
    return (range.from === undefined || value >= range.from)
        && (range.to === undefined || value <= range.to);
}
function invalidRange(name, detail) {
    return invalidFilter("".concat(name, " filter ").concat(detail));
}
function invalidFilter(detail) {
    return new config_ts_1.SessionQueryError("session ".concat(detail), 'SESSION_QUERY_INVALID_FILTER');
}
function isRuntimeArray(value) {
    return Array.isArray(value);
}
