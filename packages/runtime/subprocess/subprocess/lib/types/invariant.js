"use strict";
/** Package-owned invariant companion for the subprocess seam. @module @z/dsh-subprocess/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-subprocess';
/** Cordis companion plugin name. */
exports.name = 'subprocess-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** No runtime invariant: this stateless Service Definition owns spawn-spec/handle types, while Service Providers own observations. */
var install = function () { };
/**
 * Register the subprocess invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
