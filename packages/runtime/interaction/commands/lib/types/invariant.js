"use strict";
/**
 * Package-owned invariant companion for `@z/dsh-commands`:
 * command lifecycle events pair by commandId within one session log.
 * @module @z/dsh-commands/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-commands';
/** Cordis companion plugin name. */
exports.name = 'commands-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/* jscpd:ignore-start -- package companions share replay and dispatch plumbing */
/** Install pairing validation over loaded logs and newly appended lifecycle events. */
var install = Object.assign(function (ctx, fail) {
    // Install-scoped so a dispose/re-register cycle re-sweeps from a clean slate.
    var runIds = new WeakMap();
    var validateEvent = function (session, event) {
        var _a, _b;
        if (event.type === 'command/run') {
            var ids = (_a = runIds.get(session)) !== null && _a !== void 0 ? _a : new Set();
            if (ids.has(event.data.commandId)) {
                fail("command/run repeats commandId ".concat(JSON.stringify(event.data.commandId)));
            }
            ids.add(event.data.commandId);
            runIds.set(session, ids);
            return;
        }
        if (event.type !== 'command/done')
            return;
        if (((_b = runIds.get(session)) === null || _b === void 0 ? void 0 : _b.has(event.data.commandId)) !== true) {
            fail("command/done ".concat(JSON.stringify(event.data.commandId), " pairs no prior command/run in this log"));
        }
        var source = event.data.sourceEventSeq;
        var sourceEvent = source === undefined ? undefined : session.events[source];
        if (source !== undefined
            && (event.data.kind !== 'success'
                || !Number.isSafeInteger(source) || source < 0 || source >= event.seq
                || (sourceEvent === null || sourceEvent === void 0 ? void 0 : sourceEvent.seq) !== source
                || sourceEvent.type === 'command/run'
                || sourceEvent.type === 'command/done')) {
            fail("command/done ".concat(JSON.stringify(event.data.commandId), " has invalid sourceEventSeq ").concat(String(source)));
        }
    };
    for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
        var session = _a[_i];
        for (var _b = 0, _c = session.events; _b < _c.length; _b++) {
            var event_1 = _c[_b];
            validateEvent(session, event_1);
        }
    }
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var _a = args, session = _a[0], event = _a[1];
        validateEvent(session, event);
    }, { global: true });
}, { inject: ['sessions'] });
/* jscpd:ignore-end */
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
