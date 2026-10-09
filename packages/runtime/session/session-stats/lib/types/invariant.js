"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-session-stats`.
 * @module @z/dsh-session-stats/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-session-stats';
/** Cordis companion plugin name. */
exports.name = 'session-stats-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: the package owns a single pure projection fold whose
 * wire payload is schema-validated by the projection registry at every
 * snapshot and change-feed emission, and the event relations the fold relies
 * on (`step/end` exactly once per entered step, monotonic host-assigned turn
 * numbers, chunk and tool events carrying their step coordinates and call
 * ids) are owned and runtime-checked by dsh-agent-loop and the session
 * surface, not here.
 */
var install = function () { };
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
/* jscpd:ignore-end */
