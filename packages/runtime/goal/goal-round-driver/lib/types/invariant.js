"use strict";
/** Package-owned goal-round prompt invariants. @module @z/dsh-goal-round-driver/invariant */
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
exports.apply = exports.inject = exports.name = void 0;
var node_util_1 = require("node:util");
var dsh_goal_1 = require("@z/dsh-goal");
var prompt_ts_1 = require("./prompt.ts");
var PACKAGE_NAME = '@z/dsh-goal-round-driver';
/** Cordis companion plugin name. */
exports.name = 'goal-round-driver-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Attribute strict goal-fold failures to this companion's reconstruction. */
function foldChecked(events, fail) {
    try {
        return (0, dsh_goal_1.foldGoal)(events);
    }
    catch (error) {
        /* v8 ignore next -- the strict goal decoder throws Error instances */
        var message = error instanceof Error ? error.message : String(error);
        return fail("cannot reconstruct the goal before a continuation message: ".concat(message));
    }
}
/** Recreate the live-shaped view consumed by the package's pure prompt renderer. */
function goalView(folded, source, fail) {
    var goal = folded.goal;
    if (goal === undefined || folded.createdAt === undefined || folded.updatedAt === undefined
        || goal.phase !== 'active' || goal.id !== source.goalId || goal.revision !== source.revision
        || source.round !== folded.roundsStarted + 1 || source.round > goal.maxGoalRounds) {
        return fail("goal round ".concat(source.round, " cannot be reconstructed from the preceding durable goal state"));
    }
    return __assign(__assign({}, goal), { roundsStarted: folded.roundsStarted, createdAt: folded.createdAt, updatedAt: folded.updatedAt, activation: 'armed' });
}
/** Validate one package-owned continuation message against its durable prefix. */
function validateEvent(prior, event, fail) {
    if (event.type !== 'user/message')
        return;
    var source = event.data.source;
    if (source.kind !== 'goal' || source.round <= 0)
        return;
    var expected = (0, prompt_ts_1.renderGoalRoundPrompt)(goalView(foldChecked(prior, fail), source, fail), source.round);
    if (!(0, node_util_1.isDeepStrictEqual)(event.data.content, expected)) {
        fail("goal round ".concat(source.round, " content does not match the package-owned continuation prompt"));
    }
}
/** Check existing sessions and every candidate event before Session publishes it. */
var install = Object.assign(function (ctx, fail) {
    for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
        var session = _a[_i];
        var prior = [];
        for (var _b = 0, _c = session.events; _b < _c.length; _b++) {
            var event_1 = _c[_b];
            validateEvent(prior, event_1, fail);
            prior.push(event_1);
        }
    }
    /* jscpd:ignore-start -- package companions share dispatch and registration plumbing */
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var _a = args, session = _a[0], event = _a[1];
        validateEvent(session.events, event, fail);
    }, { global: true });
}, { inject: ['sessions'] });
/**
 * Register the goal-round-driver invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
/* jscpd:ignore-end */
