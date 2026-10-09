"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-session-telemetry`.
 * @module @z/dsh-session-telemetry/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-session-telemetry';
/** Cordis companion plugin name. */
exports.name = 'session-telemetry-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * No runtime invariant: the package's whole output is the backend handoff — a
 * synchronous `emit()` call outside every authoritative event stream — and its
 * capture side never appends session events, so no event/data relation exists
 * for an independent companion to observe.
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
