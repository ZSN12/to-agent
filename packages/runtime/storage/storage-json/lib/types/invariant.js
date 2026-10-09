"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-storage-json`.
 * @module @z/dsh-storage-json/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-storage-json';
/** Cordis companion plugin name. */
exports.name = 'storage-json-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: correctness here is write-durability and
 * publish-then-reparse equivalence, which require medium round-trip tests
 * (the shared backend conformance suite); the backend exposes no continuously
 * observable in-process relation.
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
