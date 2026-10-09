"use strict";
/** Package-owned durable workflow-record invariants. @module @z/dsh-tool-workflow/invariant */
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
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-tool-workflow';
/** Cordis companion plugin name. */
exports.name = 'tool-workflow-invariant';
/** Services required to validate existing and newly appended Session logs. */
exports.inject = ['invariants'];
/** Whether this package owns the candidate Session event. */
function isWorkflowRecordEvent(event) {
    return event.type.startsWith('tool-workflow/');
}
/** Require a durable opaque identity to be a non-empty string. */
function stringId(value, label, fail) {
    if (typeof value !== 'string' || value.length === 0)
        fail("".concat(label, " must be a non-empty string"));
    return value;
}
/** Require one workflow member's 1-based sequence identity. */
function memberSeq(value, fail) {
    if (!Number.isSafeInteger(value) || value < 1) {
        fail('tool-workflow member seq must be a positive safe integer');
    }
    return value;
}
/** Read one plain payload field without trusting restored plugin data. */
function recordOf(event, fail) {
    var data = event.data;
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
        fail("".concat(event.type, " data must be a JSON object"));
    }
    return data;
}
/** Copy only the run one candidate can mutate; other committed states stay shared. */
function cloneTraceForEvent(source, event, fail) {
    var trace = new Map(source);
    if (event.type === 'tool-workflow/run-start')
        return trace;
    var data = recordOf(event, fail);
    var runId = stringId(data.runId, "".concat(event.type, " runId"), fail);
    var run = source.get(runId);
    if (run !== undefined) {
        trace.set(runId, { ended: run.ended, members: new Map(run.members) });
    }
    return trace;
}
/** Require the named run to exist and remain open. */
function openRun(trace, runId, eventType, fail) {
    var run = trace.get(runId);
    if (run === undefined)
        fail("".concat(eventType, " has no matching tool-workflow/run-start for run ").concat(runId));
    if (run.ended)
        fail("".concat(eventType, " appears after tool-workflow/run-end for run ").concat(runId));
    return run;
}
/** Advance the workflow-record fold with one relevant Session event. */
function applyEvent(trace, event, fail) {
    var data = recordOf(event, fail);
    var runId = stringId(data.runId, "".concat(event.type, " runId"), fail);
    switch (event.type) {
        case 'tool-workflow/run-start': {
            if (typeof data.name !== 'string' || data.name.length === 0) {
                fail('tool-workflow/run-start name must be a non-empty string');
            }
            if (trace.has(runId))
                fail("tool-workflow/run-start repeats run ".concat(runId));
            trace.set(runId, { ended: false, members: new Map() });
            return;
        }
        case 'tool-workflow/agent-start': {
            var run = openRun(trace, runId, event.type, fail);
            var seq = memberSeq(data.seq, fail);
            if (typeof data.label !== 'string')
                fail('tool-workflow/agent-start label must be a string');
            if (data.phase !== undefined && typeof data.phase !== 'string') {
                fail('tool-workflow/agent-start phase must be a string when present');
            }
            stringId(data.childId, 'tool-workflow/agent-start childId', fail);
            if (run.members.has(seq))
                fail("tool-workflow/agent-start repeats member seq ".concat(seq, " in run ").concat(runId));
            run.members.set(seq, false);
            return;
        }
        case 'tool-workflow/agent-end': {
            var run = openRun(trace, runId, event.type, fail);
            var seq = memberSeq(data.seq, fail);
            if (data.outcome !== 'completed' && data.outcome !== 'failed' && data.outcome !== 'cancelled') {
                fail("tool-workflow/agent-end outcome ".concat(String(data.outcome), " is invalid"));
            }
            var ended = run.members.get(seq);
            if (ended === undefined)
                fail("tool-workflow/agent-end has no matching member seq ".concat(seq, " in run ").concat(runId));
            if (ended)
                fail("tool-workflow/agent-end repeats member seq ".concat(seq, " in run ").concat(runId));
            run.members.set(seq, true);
            return;
        }
        case 'tool-workflow/run-end': {
            var run = openRun(trace, runId, event.type, fail);
            if (data.stopReason !== 'completed' && data.stopReason !== 'cancelled' && data.stopReason !== 'error') {
                fail("tool-workflow/run-end stopReason ".concat(String(data.stopReason), " is invalid"));
            }
            var openMembers = __spreadArray([], run.members, true).filter(function (_a) {
                var ended = _a[1];
                return !ended;
            }).map(function (_a) {
                var seq = _a[0];
                return seq;
            });
            if (openMembers.length > 0) {
                fail("tool-workflow/run-end leaves member seq ".concat(openMembers.join(', '), " open in run ").concat(runId));
            }
            run.ended = true;
            run.members.clear();
            return;
        }
        default:
            fail("unknown tool-workflow event type ".concat(event.type));
    }
}
/** Install an independent incremental fold over every attached Session. */
var install = Object.assign(function (ctx, fail) {
    var traces = new WeakMap();
    var staged = new WeakMap();
    var seed = function (session) {
        var trace = new Map();
        for (var _i = 0, _a = session.events.filter(isWorkflowRecordEvent); _i < _a.length; _i++) {
            var event_1 = _a[_i];
            applyEvent(trace, event_1, fail);
        }
        traces.set(session, trace);
        return trace;
    };
    ctx.sessions.list().forEach(seed);
    ctx.on('session/created', function (session) { seed(session); }, { global: true });
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var _a = args, session = _a[0], event = _a[1];
        if (!isWorkflowRecordEvent(event))
            return;
        // session/event dispatch follows list() or session/created seeding.
        var trace = cloneTraceForEvent(traces.get(session), event, fail);
        applyEvent(trace, event, fail);
        staged.set(event, { session: session, trace: trace });
    }, { global: true });
    ctx.on('session/event', function (session, event) {
        if (!isWorkflowRecordEvent(event))
            return;
        var candidate = staged.get(event);
        /* v8 ignore next 2 -- internal/dispatch stages the exact session/event callback arguments. */
        if (candidate === undefined || candidate.session !== session) {
            return fail('session/event reached publication without matching workflow-record validation');
        }
        staged.delete(event);
        traces.set(session, candidate.trace);
    }, { global: true });
}, { inject: ['sessions'] });
/** Register this package's invariant companion. */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
