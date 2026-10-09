"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-file-reference-local`.
 * @module @z/dsh-file-reference-local/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-file-reference-local';
/** Cordis companion plugin name. */
exports.name = 'file-reference-local-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: per-agent indexes are private advisory caches whose
 * invalidation and disposal are observed directly through service tests.
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
