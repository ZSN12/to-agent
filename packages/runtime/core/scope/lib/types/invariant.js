"use strict";
/** Package-owned scoped-dispatch invariants. @module @z/dsh-scope/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var dsh_scope_1 = require("@z/dsh-scope");
var scoped_events_generated_ts_1 = require("./scoped-events.generated.ts");
var PACKAGE_NAME = '@z/dsh-scope';
/** Cordis companion plugin name. */
exports.name = 'scope-invariant';
/** Services required before the companion can register. */
exports.inject = ['invariants'];
/** Install the scoped-dispatch contribution into its child registration fiber. */
var install = function (ctx, fail) {
    ctx.on('internal/dispatch', function (_mode, eventName, args, thisArg) {
        var subjectOf = (0, scoped_events_generated_ts_1.scopedSubjectResolverFor)(eventName);
        if (subjectOf === undefined)
            return;
        if (!(0, dsh_scope_1.isScopeCarrier)(thisArg)) {
            fail("\"".concat(eventName, "\" is a scope-filtered event but was dispatched without a scope carrier \u2014 ")
                + 'pass scopeTarget(base, subject) as the dispatch thisArg (agent events: use agentEvents(ctx, agent))');
        }
        if (subjectOf !== null && (0, dsh_scope_1.carrierKeyOf)(thisArg) !== subjectOf(args)) {
            fail("\"".concat(eventName, "\" was dispatched with a scope carrier keyed to a DIFFERENT subject than its arguments name \u2014 ")
                + 'the carrier key and the event\'s subject must be the same object (use agentEvents(ctx, agent))');
        }
    }, { global: true });
};
/**
 * Register the scope invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
