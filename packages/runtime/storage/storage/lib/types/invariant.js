"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-storage`.
 * @module @z/dsh-storage/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-storage';
/** Cordis companion plugin name. */
exports.name = 'storage-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: the hub is a pure registration table (names →
 * backends, forms → facilities) whose consistency is fully enforced at the
 * call sites (duplicate/missing entries fail loud synchronously); it owns no
 * event stream or mutable medium to cross-check.
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
