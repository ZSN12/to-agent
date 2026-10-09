"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-tool-goal`.
 * @module @z/dsh-tool-goal/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-tool-goal';
/** Cordis companion plugin name. */
exports.name = 'tool-goal-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: this model-facing adapter owns no independent state or event protocol;
 * accepted mutations are checked by the goal domain and authority behavior is package-tested.
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
