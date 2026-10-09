"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-session-projection`.
 * @module @z/dsh-session-projection/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-session-projection';
/** Cordis companion plugin name. */
exports.name = 'session-projection-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: the registry's own contracts (duplicate-key and
 * stateVersion rejection, effect-tied removal, the Object.is change gate) are
 * enforced synchronously inside the service and proven by its spec, the
 * drive relation (every committed `session/event` passes every unit) would
 * require re-running the drive to check — duplicating the implementation
 * rather than detecting drift — and the served-value relation (every served
 * key has a live registration) lives on each carrier's wire path, which
 * emits no cordis event this companion could observe; carrier specs assert
 * it. Synchronous-unit discipline is enforced as far as practical by the
 * boundary `schema.parse` (a Promise-returning view fails loudly).
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
