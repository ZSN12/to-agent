"use strict";
/** Package invariant companion for `@z/dsh-session-log-export`. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-session-log-export';
exports.name = 'session-export-invariant';
exports.inject = ['invariants'];
/** No runtime invariant: the command registry owns lifecycle pairing and ApiProxy owns ZIP integrity. */
var install = function () { };
/**
 * Register this package's invariant companion.
 * @param ctx - Host context carrying the invariant registry.
 * @returns the registration disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
/* jscpd:ignore-end */
