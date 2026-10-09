"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-compaction-tool-result-pruner`.
 * @module @z/dsh-compaction-tool-result-pruner/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-compaction-tool-result-pruner';
/** Cordis companion plugin name. */
exports.name = 'compaction-tool-result-pruner-invariant';
/** Services required before the companion can register. */
exports.inject = ['invariants'];
/** No runtime invariant: Session validates each content-only rewrite and its companion owns cross-event enclosure. */
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
