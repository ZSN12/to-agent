"use strict";
/** Package-owned approval audit-stream invariants. @module @z/dsh-user-approval/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var index_ts_1 = require("./index.ts");
var PACKAGE_NAME = '@z/dsh-user-approval';
var APPROVAL_OUTCOMES = ['allowed-once', 'rejected', 'cancelled', 'unavailable'];
/** Cordis companion plugin name. */
exports.name = 'user-approval-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Validate one approval event against committed unmatched questions. */
function validateApprovalEvent(trace, event, fail) {
    if (event.type === 'approval/asked') {
        if (trace.openTurn === null)
            fail('approval/asked appended outside any open turn');
        if (event.data.toolName.length === 0)
            fail('approval/asked toolName must be non-empty');
        if (trace.pending.has(event.data.id))
            fail("approval/asked repeated open id ".concat(JSON.stringify(event.data.id)));
        return { kind: 'asked', id: event.data.id };
    }
    if (event.type === 'approval/decided') {
        if (trace.openTurn === null)
            fail('approval/decided appended outside any open turn');
        if (!trace.pending.has(event.data.id))
            fail("approval/decided has no matching approval/asked for id ".concat(JSON.stringify(event.data.id)));
        if (!APPROVAL_OUTCOMES.includes(event.data.outcome)) {
            fail("approval/decided carries unknown outcome ".concat(JSON.stringify(event.data.outcome)));
        }
        return { kind: 'decided', id: event.data.id };
    }
    if (event.type === 'approval/policy' && !index_ts_1.APPROVAL_POLICIES.includes(event.data.policy)) {
        fail("approval/policy carries unknown policy ".concat(JSON.stringify(event.data.policy)));
    }
    return undefined;
}
/** Apply one accepted approval-pair transition. */
function applyApprovalTransition(pending, transition) {
    if (transition.kind === 'asked')
        pending.add(transition.id);
    else
        pending.delete(transition.id);
}
/** Install audit pairing and closed-vocabulary checks. */
// Event owners keep precommit staging local so their vocabularies never move into a central helper.
/* jscpd:ignore-start */
var install = Object.assign(function (ctx, fail) {
    var traces = new WeakMap();
    var staged = new WeakMap();
    var seed = function (session) {
        var trace = { openTurn: null, pending: new Set() };
        traces.set(session, trace);
        for (var _i = 0, _a = session.events; _i < _a.length; _i++) {
            var event_1 = _a[_i];
            if (event_1.type === 'turn/start')
                trace.openTurn = event_1.data.turn;
            else if (event_1.type === 'turn/end')
                trace.openTurn = null;
            var transition = validateApprovalEvent(trace, event_1, fail);
            if (transition !== undefined)
                applyApprovalTransition(trace.pending, transition);
        }
        return trace;
    };
    var traceFor = function (session) { var _a; return (_a = traces.get(session)) !== null && _a !== void 0 ? _a : seed(session); };
    for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
        var session = _a[_i];
        seed(session);
    }
    ctx.on('session/created', function (session) { seed(session); }, { global: true });
    ctx.on('session/event', function (session, event) {
        var trace = traceFor(session);
        if (event.type === 'turn/start') {
            trace.openTurn = event.data.turn;
            return;
        }
        if (event.type === 'turn/end') {
            trace.openTurn = null;
            return;
        }
        if (event.type !== 'approval/asked' && event.type !== 'approval/decided')
            return;
        var candidate = staged.get(event);
        /* v8 ignore next -- internal/dispatch stages every package-owned pair event */
        if (candidate === undefined || candidate.session !== session)
            return fail('approval audit event published without pre-commit validation');
        staged.delete(event);
        applyApprovalTransition(trace.pending, candidate.transition);
    }, { global: true });
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var _a = args, session = _a[0], event = _a[1];
        var transition = validateApprovalEvent(traceFor(session), event, fail);
        if (transition !== undefined)
            staged.set(event, { session: session, transition: transition });
    }, { global: true });
}, { inject: ['sessions'] });
/* jscpd:ignore-end */
/**
 * Register the approval invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
