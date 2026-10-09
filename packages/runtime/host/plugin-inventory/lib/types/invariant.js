"use strict";
/** Package-owned invariant companion. @module @z/dsh-host-plugin-inventory/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-host-plugin-inventory';
/** Cordis companion plugin name. */
exports.name = 'host-plugin-inventory-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** No runtime invariant: every snapshot is projected directly from Loader-owned state. */
var install = function () { };
/** Register this package's invariant companion. */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
/* jscpd:ignore-end */
