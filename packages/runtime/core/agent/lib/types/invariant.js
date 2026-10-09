"use strict";
/** Package-owned agent lifecycle invariants. @module @z/dsh-agent/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-agent';
/** Cordis companion plugin name. */
exports.name = 'agent-invariant';
/** Services required before the companion can register. */
exports.inject = ['invariants'];
/** Install the agent contribution into its child registration fiber. */
var install = function (ctx, fail) {
    var lastStatus = new WeakMap();
    ctx.on('agent/status', function (_a) {
        var agent = _a.agent, status = _a.status;
        var previous = lastStatus.get(agent);
        if (previous === status) {
            fail("agent/status repeated ".concat(status, " (no-op transition)"));
        }
        lastStatus.set(agent, status);
    }, { global: true });
};
/**
 * Register the agent invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
