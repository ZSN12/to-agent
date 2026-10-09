"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-code-runtime-python`.
 * @module @z/dsh-code-runtime-python/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-code-runtime-python';
/** Cordis companion plugin name. */
exports.name = 'code-runtime-python-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: this package ships only the fd-3 wire-protocol codec and its Python mirror,
 * exposing no runtime event sequence or mutable data relation; `protocol.spec.ts` and
 * `protocol-mirror.e2e.ts` cover the protocol's behavior.
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
