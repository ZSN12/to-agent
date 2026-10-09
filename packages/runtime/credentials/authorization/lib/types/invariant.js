"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-authorization`.
 * @module @z/dsh-authorization/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-authorization';
/** Cordis companion plugin name. */
exports.name = 'authorization-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * Install the single-flight release contract: `authorization/settled` names a
 * finished attempt, and the seam admits one attempt per key, so the key must
 * already be free when the event fires. A slot still held at settlement is
 * unrecoverable — every later `begin()` for that key is refused as
 * `ALREADY_IN_FLIGHT` until the process restarts — and it is invisible from the
 * outside, because a wedged key looks exactly like a busy one.
 */
var install = function (ctx, fail) {
    ctx.on('authorization/settled', function (key) {
        var _a;
        var authorization = ctx.get('authorization');
        if (authorization === undefined) {
            fail("authorization/settled for \"".concat(key, "\" emitted without a live authorization service"));
            return;
        }
        // A flow withdrawn during its own attempt settles with nothing left to
        // describe, which is the disposer's documented behavior rather than a leak.
        if (((_a = authorization.describe(key)) === null || _a === void 0 ? void 0 : _a.inFlight) === true) {
            fail("authorization/settled for \"".concat(key, "\" left the key in flight, wedging every later attempt"));
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
