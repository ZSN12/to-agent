"use strict";
/**
 * Package-owned invariant companion for the native directory-picker backend.
 * @module @z/dsh-host-directory-picker-native/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-host-directory-picker-native';
/** Cordis companion plugin name. */
exports.name = 'host-directory-picker-native-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** No runtime invariant: each pick is one stateless subprocess round trip; the chooser outcome is only the returned path. */
var install = function () { };
/**
 * Register the native directory-picker invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
