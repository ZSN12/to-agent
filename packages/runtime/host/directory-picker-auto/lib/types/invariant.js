"use strict";
/**
 * Package-owned invariant companion for the adaptive directory-picker chooser.
 * @module @z/dsh-host-directory-picker-auto/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-host-directory-picker-auto';
/** Cordis companion plugin name. */
exports.name = 'host-directory-picker-auto-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** No runtime invariant: the sole effect is one boot-time Loader-entry mount owned by the plugin fiber; the store is authoritative. */
var install = function () { };
/**
 * Register the adaptive directory-picker invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
