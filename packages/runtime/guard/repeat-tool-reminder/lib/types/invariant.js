"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-repeat-tool-reminder`.
 * @module @z/dsh-repeat-tool-reminder/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-repeat-tool-reminder';
/** Cordis companion plugin name. */
exports.name = 'repeat-tool-reminder-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: the repeat chain is private to one post-execute listener and exposes no
 * package-owned event or snapshot that an independent companion can observe.
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
