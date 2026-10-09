"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-client-connection`.
 * @module @z/dsh-client-connection/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-client-connection';
/** Cordis companion plugin name. */
exports.name = 'client-connection-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: the wire layer emits no cordis events and owns no
 * mutable cross-plugin relation — stream/reconnect sequencing is exercised
 * directly by its behavior specs, rpcId round-trip discipline is owned by the
 * apiproxy contract layer, and the node half's single route registration's
 * register/dispose symmetry is audited by the webserver package's invariant.
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
