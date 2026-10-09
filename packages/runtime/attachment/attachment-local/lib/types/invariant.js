"use strict";
/** Package-owned invariant companion for `@z/dsh-attachment-local`. @module @z/dsh-attachment-local/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-attachment-local';
/** Cordis companion plugin name. */
exports.name = 'attachment-local-invariant';
/** Services required before package ownership can be reserved. */
exports.inject = ['invariants', 'attachments'];
/** No runtime invariant: immutable writes and verified reads are enforced directly at the backend boundary. */
var install = function () { };
/**
 * Register the package invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the registration disposer.
 */
var apply = function (ctx) { return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install)); };
exports.apply = apply;
/* jscpd:ignore-end */
