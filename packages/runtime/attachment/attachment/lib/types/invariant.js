"use strict";
/** Package-owned invariant companion for `@z/dsh-attachment`. @module @z/dsh-attachment/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-attachment';
/** Cordis companion plugin name. */
exports.name = 'attachment-invariant';
/** Service required before package ownership can be reserved. */
exports.inject = ['invariants'];
/** No runtime invariant: this stateless seam owns types while implementations enforce immutable-store checks. */
var install = function () { };
/**
 * Register the package invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the registration disposer.
 */
var apply = function (ctx) { return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install)); };
exports.apply = apply;
/* jscpd:ignore-end */
