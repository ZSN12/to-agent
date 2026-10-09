"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-settings`.
 * @module @z/dsh-settings/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var index_ts_1 = require("./index.ts");
var PACKAGE_NAME = '@z/dsh-settings';
/** Cordis companion plugin name. */
exports.name = 'settings-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * Install the commit-event contract: `settings/updated` fires only for a
 * currently registered namespace, only when the resolved value changed, and
 * only with the service's authoritative resolved value — all judged with the
 * seam's own equality predicate.
 */
var install = function (ctx, fail) {
    ctx.on('settings/updated', function (ns, next, prev) {
        var settings = ctx.get('settings');
        if (settings === undefined) {
            fail("settings/updated for \"".concat(ns, "\" emitted without a live settings service"));
        }
        var current = settings.get(ns);
        if (current === undefined) {
            fail("settings/updated for \"".concat(ns, "\" emitted while the namespace is unregistered"));
        }
        if (!(0, index_ts_1.deepEqualJson)(current, next)) {
            fail("settings/updated for \"".concat(ns, "\" does not match the authoritative resolved value"));
        }
        if ((0, index_ts_1.deepEqualJson)(next, prev)) {
            fail("settings/updated for \"".concat(ns, "\" emitted without a resolved-value change"));
        }
    });
};
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
