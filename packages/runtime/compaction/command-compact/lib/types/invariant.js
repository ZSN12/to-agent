"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-command-compact`.
 * @module @z/dsh-command-compact/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-command-compact';
/** Cordis companion plugin name. */
exports.name = 'command-compact-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: this command adapter owns no state or event stream; the compaction seam owns
 * the balanced durable transaction and the command registry owns registration and dispatch lifecycle.
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
