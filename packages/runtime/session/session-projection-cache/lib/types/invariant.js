"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-session-projection-cache`.
 * @module @z/dsh-session-projection-cache/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-session-projection-cache';
/** Cordis companion plugin name. */
exports.name = 'session-projection-cache-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: the cache's correctness relation (a stored row equals
 * the registry fold at its `seq` watermark) is only checkable by re-running the
 * fold over the persisted log — duplicating the implementation rather than
 * detecting drift — and its staleness is by design (fail-soft writes). The
 * durable boundary is already schema-validated by the storage-domain layer
 * on every reopen, and the read ladder's version/watermark guards are proven
 * by the package spec.
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
