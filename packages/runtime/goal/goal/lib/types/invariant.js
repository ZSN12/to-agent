"use strict";
/** Package-owned durable goal-stream invariants. @module @z/dsh-goal/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var fold_ts_1 = require("./fold.ts");
var PACKAGE_NAME = '@z/dsh-goal';
/** Cordis companion plugin name. */
exports.name = 'goal-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Copy the independent fold before validating one candidate event. */
function cloneState(state) {
    return {
        goal: state.goal,
        roundsStarted: state.roundsStarted,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        lastRef: state.lastRef,
        seenGoalIds: new Set(state.seenGoalIds),
    };
}
/** Apply one event through the strict goal decoder and attribute failures. */
function applyChecked(state, event, fail) {
    try {
        (0, fold_ts_1.applyGoalEvent)(state, event);
    }
    catch (error) {
        /* v8 ignore next -- the strict goal decoder throws Error instances */
        var message = error instanceof Error ? error.message : String(error);
        fail("session event ".concat(event.seq, " violates the durable goal stream: ").concat(message));
    }
}
/** Install an independent incremental fold over every attached session. */
var install = Object.assign(function (ctx, fail) {
    var states = new WeakMap();
    var staged = new WeakMap();
    var seed = function (session) {
        var state = (0, fold_ts_1.emptyGoalFoldState)();
        for (var _i = 0, _a = session.events; _i < _a.length; _i++) {
            var event_1 = _a[_i];
            applyChecked(state, event_1, fail);
        }
        states.set(session, state);
        return state;
    };
    /* v8 ignore next -- session/event always follows list() or session/created seeding */
    var stateFor = function (session) { var _a; return (_a = states.get(session)) !== null && _a !== void 0 ? _a : seed(session); };
    for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
        var session = _a[_i];
        seed(session);
    }
    ctx.on('session/created', function (session) { seed(session); }, { global: true });
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var _a = args, session = _a[0], event = _a[1];
        var state = cloneState(stateFor(session));
        applyChecked(state, event, fail);
        staged.set(event, { session: session, state: state });
    }, { global: true });
    ctx.on('session/event', function (session, event) {
        var candidate = staged.get(event);
        /* v8 ignore next 2 -- internal/dispatch stages the exact callback arguments */
        if (candidate === undefined || candidate.session !== session) {
            return fail('session/event reached publication without matching goal-fold validation');
        }
        staged.delete(event);
        states.set(session, candidate.state);
    }, { global: true });
}, { inject: ['sessions'] });
/**
 * Register the goal-stream invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
