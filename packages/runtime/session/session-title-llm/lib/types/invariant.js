"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-session-title-llm`.
 * @module @z/dsh-session-title-llm/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-session-title-llm';
/** Cordis companion plugin name. */
exports.name = 'session-title-llm-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: this stateless helper validates and freezes each auxiliary request before
 * dispatch; deadline, stream, cited message seqs, and provider/model fields are checked synchronously and by tests.
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
