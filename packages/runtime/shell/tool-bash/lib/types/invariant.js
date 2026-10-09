"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-tool-bash`.
 * @module @z/dsh-tool-bash/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-tool-bash';
/** Cordis companion plugin name. */
exports.name = 'tool-bash-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: the environment registry validates ownership and collected values at each
 * mutation/read; it publishes no independent snapshot that a companion could cross-check.
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
