"use strict";
/**
 * Package-owned invariant companion for the browse directory-picker backend.
 * @module @z/dsh-host-directory-picker-browse/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-host-directory-picker-browse';
/** Cordis companion plugin name. */
exports.name = 'host-directory-picker-browse-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** No runtime invariant: each list/create is one stateless filesystem round trip; the filesystem itself is the authoritative state. */
var install = function () { };
/**
 * Register the browse directory-picker invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
