"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-cordis-host-runner`.
 * @module @z/dsh-cordis-host-runner/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-cordis-host-runner';
/** Cordis companion plugin name. */
exports.name = 'cordis-host-runner-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: the definition registry is process memory with no event
 * stream to observe, and its one owned relation (a running definition owns a
 * settled host-half fiber and its handler table) is established and unwound
 * inside single awaited verbs, so package tests assert it directly.
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
