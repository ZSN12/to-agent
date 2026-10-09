"use strict";
/**
 * Model argument schemas, normalization, and filter construction.
 *
 * @module @z/dsh-tool-session-query/input
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
exports.toolInput = void 0;
var dsh_session_1 = require("@z/dsh-session");
var dsh_session_query_1 = require("@z/dsh-session-query");
var sessionSearchParameters = {
    query: { type: 'string', required: true, description: 'Literal full-text query over prior session history.' },
    session_ids: { type: 'array', items: { type: 'string' }, description: 'Optional session ids to include.' },
    created_at_from: { type: 'string', description: 'Inclusive timezone-qualified ISO 8601 creation-time lower bound.' },
    created_at_to: { type: 'string', description: 'Inclusive timezone-qualified ISO 8601 creation-time upper bound.' },
    parent_session_ids: { type: 'array', items: { type: 'string' }, description: 'Optional direct parent session ids.' },
    include_root_sessions: { type: 'boolean', description: 'Include sessions with no parent in the parent filter.' },
    availability: {
        type: 'array',
        items: { type: 'string', enum: ['live', 'persisted'] },
        description: 'Require at least one selected source availability.',
    },
    event_seq_from: { type: 'integer', description: 'Inclusive event sequence lower bound.' },
    event_seq_to: { type: 'integer', description: 'Inclusive event sequence upper bound.' },
    event_time_from: { type: 'string', description: 'Inclusive timezone-qualified ISO 8601 event-time lower bound.' },
    event_time_to: { type: 'string', description: 'Inclusive timezone-qualified ISO 8601 event-time upper bound.' },
    event_types: { type: 'array', items: { type: 'string' }, description: 'Event types to include.' },
    event_surfaces: {
        type: 'array',
        items: { type: 'string', enum: ['current', 'shadowed', 'log-only'] },
        description: 'Event surfaces to include.',
    },
};
var eventSearchParameters = {
    session_id: { type: 'string', description: 'Target session id. Omit for the current session.' },
    query: { type: 'string', required: true, description: 'Literal full-text query over the target session.' },
    seq_from: { type: 'integer', description: 'Inclusive event sequence lower bound.' },
    seq_to: { type: 'integer', description: 'Inclusive event sequence upper bound.' },
    time_from: { type: 'string', description: 'Inclusive timezone-qualified ISO 8601 event-time lower bound.' },
    time_to: { type: 'string', description: 'Inclusive timezone-qualified ISO 8601 event-time upper bound.' },
    event_types: { type: 'array', items: { type: 'string' }, description: 'Event types to include.' },
    surfaces: {
        type: 'array',
        items: { type: 'string', enum: ['current', 'shadowed', 'log-only'] },
        description: 'Event surfaces to include.',
    },
};
var targetSessionParameter = {
    session_id: { type: 'string', description: 'Target session id. Omit for the current session.' },
};
function buildSessionFilters(args) {
    var filters = [];
    if (args.session_ids !== undefined) {
        assertNonEmptyArray('session_ids', args.session_ids);
        filters.push({ kind: 'id', values: args.session_ids.map(dsh_session_1.SessionId) });
    }
    var created = timestampRange('created_at', args.created_at_from, args.created_at_to);
    if (created !== undefined)
        filters.push(__assign({ kind: 'created-at' }, created));
    if (args.availability !== undefined) {
        assertNonEmptyArray('availability', args.availability);
        filters.push({ kind: 'availability', values: args.availability });
    }
    return filters;
}
function materializeParentSessionIds(values) {
    if (values === undefined)
        return undefined;
    assertNonEmptyArray('parent_session_ids', values);
    return __spreadArray([], new Set(values.map(dsh_session_1.SessionId)), true);
}
function buildEventFilters(input) {
    var filters = [];
    var seq = sequenceRange(input.seqFrom, input.seqTo);
    if (seq.from !== undefined || seq.to !== undefined)
        filters.push(__assign({ kind: 'seq' }, seq));
    var time = timestampRange('time', input.timeFrom, input.timeTo);
    if (time !== undefined)
        filters.push(__assign({ kind: 'time' }, time));
    if (input.eventTypes !== undefined) {
        assertNonEmptyArray('event_types', input.eventTypes);
        filters.push({ kind: 'type', values: input.eventTypes });
    }
    if (input.surfaces !== undefined) {
        assertNonEmptyArray('surfaces', input.surfaces);
        filters.push({ kind: 'surface', values: input.surfaces });
    }
    return filters;
}
function normalizeQuery(value) {
    var query = value.trim().replace(/\s+/gu, ' ');
    if (query.length === 0) {
        throw new dsh_session_query_1.SessionQueryError('session-search query must contain non-whitespace text', 'SESSION_QUERY_INVALID_QUERY');
    }
    if (query.includes('\0')) {
        throw new dsh_session_query_1.SessionQueryError('session-search query must not contain NUL', 'SESSION_QUERY_INVALID_QUERY');
    }
    return query;
}
function sequenceRange(from, to) {
    if (from !== undefined)
        assertNonNegativeSafeInteger('sequence lower bound', from);
    if (to !== undefined)
        assertNonNegativeSafeInteger('sequence upper bound', to);
    if (from !== undefined && to !== undefined && from > to) {
        throw invalidRange('sequence', 'from must be less than or equal to to');
    }
    return __assign(__assign({}, from === undefined ? {} : { from: from }), to === undefined ? {} : { to: to });
}
function timestampRange(name, from, to) {
    if (from === undefined && to === undefined)
        return undefined;
    var fromTimestamp = from === undefined ? undefined : parseIsoTimestamp("".concat(name, "_from"), from);
    var toTimestamp = to === undefined ? undefined : parseIsoTimestamp("".concat(name, "_to"), to);
    if (fromTimestamp !== undefined
        && toTimestamp !== undefined
        && compareTimestamps(fromTimestamp, toTimestamp) > 0) {
        throw invalidRange(name, 'from must be less than or equal to to');
    }
    return __assign(__assign({}, fromTimestamp === undefined ? {} : { from: timestampLowerBound(fromTimestamp) }), toTimestamp === undefined ? {} : { to: timestampUpperBound(toTimestamp) });
}
var ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|([+-])(\d{2}):(\d{2}))$/;
function parseIsoTimestamp(name, value) {
    var _a, _b, _c, _d, _e;
    var match = ISO_TIMESTAMP.exec(value);
    if (match === null) {
        throw invalidRange(name, 'must be an ISO 8601 timestamp with Z or a numeric offset');
    }
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var hour = Number(match[4]);
    var minute = Number(match[5]);
    var second = Number((_a = match[6]) !== null && _a !== void 0 ? _a : 0);
    var offsetHour = Number((_b = match[10]) !== null && _b !== void 0 ? _b : 0);
    var offsetMinute = Number((_c = match[11]) !== null && _c !== void 0 ? _c : 0);
    if (month < 1 || month > 12
        || day < 1 || day > daysInMonth(year, month)
        || hour > 23 || minute > 59 || second > 59
        || offsetHour > 23 || offsetMinute > 59) {
        throw invalidRange(name, 'must be a valid ISO 8601 timestamp');
    }
    var fraction = (_d = match[7]) !== null && _d !== void 0 ? _d : '';
    var millisecondDigits = fraction.slice(0, 3).padEnd(3, '0');
    var normalized = "".concat(match[1], "-").concat(match[2], "-").concat(match[3], "T").concat(match[4], ":").concat(match[5])
        + ":".concat((_e = match[6]) !== null && _e !== void 0 ? _e : '00', ".").concat(millisecondDigits).concat(match[8]);
    var timestamp = Date.parse(normalized);
    if (!Number.isSafeInteger(timestamp)) {
        throw invalidRange(name, 'must be a valid ISO 8601 timestamp');
    }
    return {
        millisecond: timestamp,
        remainder: fraction.slice(3).replace(/0+$/u, ''),
    };
}
function compareTimestamps(left, right) {
    var _a, _b;
    if (left.millisecond !== right.millisecond) {
        return left.millisecond < right.millisecond ? -1 : 1;
    }
    var length = Math.max(left.remainder.length, right.remainder.length);
    for (var index = 0; index < length; index += 1) {
        var leftDigit = (_a = left.remainder[index]) !== null && _a !== void 0 ? _a : '0';
        var rightDigit = (_b = right.remainder[index]) !== null && _b !== void 0 ? _b : '0';
        if (leftDigit !== rightDigit)
            return leftDigit < rightDigit ? -1 : 1;
    }
    return 0;
}
function timestampLowerBound(timestamp) {
    return timestamp.remainder.length === 0
        ? timestamp.millisecond
        : nextUpFinite(timestamp.millisecond);
}
function timestampUpperBound(timestamp) {
    return timestamp.remainder.length === 0
        ? timestamp.millisecond
        : nextDownFinite(timestamp.millisecond + 1);
}
function nextUpFinite(value) {
    if (value === 0)
        return Number.MIN_VALUE;
    var view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value);
    var bits = view.getBigUint64(0);
    view.setBigUint64(0, value > 0 ? bits + 1n : bits - 1n);
    return view.getFloat64(0);
}
function nextDownFinite(value) {
    if (value === 0)
        return -Number.MIN_VALUE;
    var view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value);
    var bits = view.getBigUint64(0);
    view.setBigUint64(0, value > 0 ? bits - 1n : bits + 1n);
    return view.getFloat64(0);
}
function daysInMonth(year, month) {
    if (month === 2)
        return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function invalidRange(name, detail) {
    return new dsh_session_query_1.SessionQueryError("session ".concat(name, " range ").concat(detail), 'SESSION_QUERY_INVALID_FILTER');
}
function assertNonNegativeSafeInteger(name, value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new dsh_session_query_1.SessionQueryError("".concat(name, " must be a non-negative safe integer"), 'SESSION_QUERY_INVALID_FILTER');
    }
}
function assertNonEmptyArray(name, values) {
    if (values.length === 0) {
        throw new dsh_session_query_1.SessionQueryError("".concat(name, " must contain at least one value when supplied"), 'SESSION_QUERY_INVALID_FILTER');
    }
}
/** Model schemas and model-owned value normalization shared by tool operations. */
exports.toolInput = {
    sessionSearchParameters: sessionSearchParameters,
    eventSearchParameters: eventSearchParameters,
    targetSessionParameter: targetSessionParameter,
    buildSessionFilters: buildSessionFilters,
    materializeParentSessionIds: materializeParentSessionIds,
    buildEventFilters: buildEventFilters,
    normalizeQuery: normalizeQuery,
    sequenceRange: sequenceRange,
    assertNonNegativeSafeInteger: assertNonNegativeSafeInteger,
};
