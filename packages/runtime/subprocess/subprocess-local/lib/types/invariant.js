"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-subprocess-local`.
 * @module @z/dsh-subprocess-local/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-subprocess-local';
/** Cordis companion plugin name. */
exports.name = 'subprocess-local-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: this package exposes no independent event sequence or mutable data relation
 * beyond contracts enforced at its owning seam.
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
