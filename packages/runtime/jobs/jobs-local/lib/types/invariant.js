"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-jobs-local`.
 * @module @z/dsh-jobs-local/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-jobs-local';
/** Cordis companion plugin name. */
exports.name = 'jobs-local-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: `@z/dsh-jobs/invariant` owns per-snapshot identity, status,
 * timestamp, and owner checks. This provider's admission decision uses private configuration and
 * must fail before a backend starter runs; `LocalJobRegistry.start()` enforces it synchronously
 * for current producers. Repeating an aggregate after publication would expose private
 * configuration solely to this companion and would not verify the fail-closed pre-start guarantee.
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
