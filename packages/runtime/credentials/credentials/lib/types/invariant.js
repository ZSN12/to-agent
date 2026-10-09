"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-credentials`.
 * @module @z/dsh-credentials/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-credentials';
/** Cordis companion plugin name. */
exports.name = 'credentials-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * Install the commit-event lifecycle contract: `credentials/reference-updated` names a
 * committed provider-source change, so it can only fire while a credentials
 * service is live — an emission after disposal means a provider leaked work
 * past its teardown quiescence. The value relation itself (`describe`
 * agreeing with `resolve`) is asynchronous provider I/O and stays pinned by
 * each provider's own suite.
 */
var install = function (ctx, fail) {
    ctx.on('credentials/reference-updated', function (ref) {
        if (ctx.get('credentials') === undefined) {
            fail("credentials/reference-updated for \"".concat(ref, "\" emitted without a live credentials service"));
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
