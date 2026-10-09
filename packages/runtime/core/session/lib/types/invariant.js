"use strict";
/**
 * Package-owned relational invariants for the session event log. Load this
 * companion beside `@z/dsh-invariants` to enable the checks.
 *
 * @module @z/dsh-session/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var dsh_llm_1 = require("@z/dsh-llm");
var repair_ts_1 = require("./repair.ts");
var PACKAGE_NAME = '@z/dsh-session';
/** Cordis companion plugin name. */
exports.name = 'session-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Assert that a step-scoped event names the currently open turn and step. */
function requireOpenStep(trace, kind, turn, step, fail) {
    if (trace.openTurn !== turn || trace.openStep !== step) {
        fail("".concat(kind, " names turn ").concat(turn, "/step ").concat(step, " but open is turn ").concat(trace.openTurn, "/step ").concat(trace.openStep));
    }
}
/** Validate one candidate event without mutating the committed trace. */
function validateEvent(trace, event, fail) {
    var _a;
    if (event.seq <= trace.lastSeq) {
        fail("seq must strictly increase: saw ".concat(event.seq, " after ").concat(trace.lastSeq));
    }
    var openTurn = trace.openTurn;
    var openStep = trace.openStep;
    var nextTurn = trace.nextTurn;
    var nextStep = trace.nextStep;
    var pendingCalls = { kind: 'none' };
    // Context and plugin-owned log-only events may be appended between model
    // executions. Core execution events retain their explicit turn relations.
    switch (event.type) {
        case 'turn/start': {
            if (trace.openTurn !== null) {
                fail("turn/start ".concat(event.data.turn, " while turn ").concat(trace.openTurn, " is still open"));
            }
            if (event.data.turn !== trace.nextTurn) {
                fail("turn/start expected turn ".concat(trace.nextTurn, ", got ").concat(event.data.turn));
            }
            openTurn = event.data.turn;
            nextStep = 1;
            break;
        }
        case 'turn/end': {
            if (trace.openTurn !== event.data.turn) {
                fail("turn/end ".concat(event.data.turn, " does not match open turn ").concat(trace.openTurn));
            }
            if (trace.openStep !== null) {
                fail("turn/end ".concat(event.data.turn, " while step ").concat(trace.openStep, " is still open"));
            }
            openTurn = null;
            nextTurn += 1;
            break;
        }
        case 'step/start': {
            if (trace.openTurn !== event.data.turn) {
                fail("step/start in turn ".concat(event.data.turn, " but open turn is ").concat(trace.openTurn));
            }
            if (trace.openStep !== null) {
                fail("step/start ".concat(event.data.step, " while step ").concat(trace.openStep, " is still open"));
            }
            if (event.data.step !== trace.nextStep) {
                fail("step/start expected step ".concat(trace.nextStep, " in turn ").concat(event.data.turn, ", got ").concat(event.data.step));
            }
            openStep = event.data.step;
            break;
        }
        case 'step/end': {
            requireOpenStep(trace, 'step/end', event.data.turn, event.data.step, fail);
            pendingCalls = { kind: 'clear' };
            openStep = null;
            nextStep += 1;
            break;
        }
        case 'assistant/chunk': {
            requireOpenStep(trace, 'assistant/chunk', event.data.turn, event.data.step, fail);
            break;
        }
        case 'assistant/message': {
            requireOpenStep(trace, 'assistant/message', event.data.turn, event.data.step, fail);
            break;
        }
        case 'tool/call': {
            requireOpenStep(trace, 'tool/call', event.data.turn, event.data.step, fail);
            pendingCalls = { kind: 'add', callId: event.data.callId };
            break;
        }
        case 'tool/result': {
            // Session has already validated a content rewrite that cites its replaced event.
            // It is durable turn work, not a second execution of the original call.
            if (event.surfaceOp !== 'append') {
                if (trace.openTurn === null) {
                    fail('tool/result surface replacement appended outside any open turn');
                }
                break;
            }
            requireOpenStep(trace, 'tool/result', event.data.turn, event.data.step, fail);
            var callId = event.data.message.source.callId;
            var syntheticNotStarted = event.data.message.content[0].isError === true && ((_a = event.data.error) === null || _a === void 0 ? void 0 : _a.code) === repair_ts_1.TOOL_NOT_STARTED;
            if (!trace.pendingCalls.has(callId) && !syntheticNotStarted) {
                fail("tool/result for ".concat(callId, " with no prior tool/call in this step"));
            }
            pendingCalls = { kind: 'delete', callId: callId };
            break;
        }
        case 'user/message':
            break;
        case 'session/end-seed':
            // Unconstrained: an unbalanced seed legally puts it inside an open turn.
            break;
        case 'todo/write':
        case 'request/header':
        case 'request/context': {
            if (trace.openTurn === null) {
                fail("".concat(event.type, " appended outside any open turn (core execution events must be turn-enclosed)"));
            }
            break;
        }
        default:
            // Merge-extensible event relations belong to their owning plugin.
            break;
    }
    return {
        scalars: { lastSeq: event.seq, openTurn: openTurn, openStep: openStep, nextTurn: nextTurn, nextStep: nextStep },
        pendingCalls: pendingCalls,
    };
}
/** Apply one already-validated transition after its event commits. */
function applyTransition(trace, transition) {
    Object.assign(trace, transition.scalars);
    switch (transition.pendingCalls.kind) {
        case 'none':
            break;
        case 'add':
            trace.pendingCalls.add(transition.pendingCalls.callId);
            break;
        case 'delete':
            trace.pendingCalls.delete(transition.pendingCalls.callId);
            break;
        case 'clear':
            trace.pendingCalls.clear();
            break;
        /* v8 ignore next -- validateEvent produces this closed transition union */
        default:
            (0, dsh_llm_1.assertNever)(transition.pendingCalls, 'session trace pending-call transition');
    }
}
/** Install the session contribution into its child registration fiber. */
var install = Object.assign(function (ctx, fail) {
    var traces = new WeakMap();
    var stagedTransitions = new WeakMap();
    var freshTrace = function () { return ({
        lastSeq: -1,
        openTurn: null,
        openStep: null,
        nextTurn: 1,
        nextStep: 1,
        pendingCalls: new Set(),
    }); };
    var seedSession = function (session) {
        var trace = freshTrace();
        traces.set(session, trace);
        for (var _i = 0, _a = session.events; _i < _a.length; _i++) {
            var event_1 = _a[_i];
            applyTransition(trace, validateEvent(trace, event_1, fail));
        }
        return trace;
    };
    /* v8 ignore next -- session/event always follows list() or session/created seeding */
    var traceFor = function (session) { var _a; return (_a = traces.get(session)) !== null && _a !== void 0 ? _a : seedSession(session); };
    for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
        var session = _a[_i];
        seedSession(session);
    }
    ctx.on('session/created', function (session) { seedSession(session); }, { global: true });
    ctx.on('session/event', function (session, event) {
        var staged = stagedTransitions.get(event);
        /* v8 ignore next 2 -- internal/dispatch stages the exact callback arguments */
        if (staged === undefined || staged.session !== session) {
            return fail('session/event reached publication without matching pre-commit validation');
        }
        stagedTransitions.delete(event);
        applyTransition(staged.trace, staged.transition);
    }, { global: true });
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var _a = args, session = _a[0], event = _a[1];
        var trace = traceFor(session);
        var transition = validateEvent(trace, event, fail);
        // A later dispatch listener may veto. Validation is pure, so abandoning
        // this weakly keyed transition does not advance or retain the session.
        stagedTransitions.set(event, { session: session, trace: trace, transition: transition });
    }, { global: true });
}, { inject: ['sessions'] });
/**
 * Register the session invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
