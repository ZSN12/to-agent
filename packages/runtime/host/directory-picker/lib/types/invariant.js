"use strict";
/** Package-owned invariant companion for the directory-picker seam. @module @z/dsh-host-directory-picker/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-host-directory-picker';
/** Cordis companion plugin name. */
exports.name = 'host-directory-picker-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: this stateless Service Definition owns the capability
 * vocabulary, while backends and the RPC consumer own observations.
 */
var install = function () { };
/**
 * Register the directory-picker invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
