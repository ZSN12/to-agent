"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-fs-sandbox`.
 * @module @z/dsh-fs-sandbox/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-fs-sandbox';
/** Cordis companion plugin name. */
exports.name = 'fs-sandbox-invariant';
/** Services required before the companion can register. */
exports.inject = ['invariants'];
/** No runtime invariant: this stateless adapter delegates policy and filesystem relations to their owning seams. */
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
