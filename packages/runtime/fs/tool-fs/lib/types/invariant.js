"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-tool-fs`.
 * @module @z/dsh-tool-fs/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-tool-fs';
/** Cordis companion plugin name. */
exports.name = 'tool-fs-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: this model-facing adapter has no independent lifecycle stream; execution
 * relations are owned by the capability seam it calls.
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
