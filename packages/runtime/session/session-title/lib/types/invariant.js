"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-session-title`.
 * @module @z/dsh-session-title/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-session-title';
/** Cordis companion plugin name. */
exports.name = 'session-title-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * Durable title-source invariant: an automatic title always cites at
 * least one human `user/message` seq, and an explicit user rename cites none
 * — `messageSeqs` is empty iff `source.kind` is `user`. Provider revisions
 * are validated by the service before their append; this checks the durable
 * relationship every appended `session/title` event must keep, whichever
 * writer produced it.
 */
var install = Object.assign(function (ctx, fail) {
    // internal/dispatch interception rejects the append before publication
    // (the session/event listener would only observe the already-committed log).
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var _a = args, event = _a[1];
        if (event.type !== 'session/title')
            return;
        var _b = event.data, source = _b.source, messageSeqs = _b.messageSeqs;
        if ((messageSeqs.length === 0) !== (source.kind === 'user')) {
            var requirement = source.kind === 'user' ? 'cite no message seqs' : 'cite at least one message seq';
            fail("session/title event ".concat(String(event.seq), " with source \"").concat(source.kind, "\" must ").concat(requirement, "; got ").concat(String(messageSeqs.length)));
        }
    }, { global: true });
}, { inject: ['sessions'] });
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
