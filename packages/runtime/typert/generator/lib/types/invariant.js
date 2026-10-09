"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-typert-generator`.
 * @module @z/dsh-typert-generator/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-typert-generator';
/** Cordis companion plugin name. */
exports.name = 'typert-generator-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: this source-project analyzer and build-time emitter
 * runs outside any cordis runtime; model snapshots, executable artifacts, and
 * consuming-package typechecks enforce its output contract.
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
