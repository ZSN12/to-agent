"use strict";
/** Package-owned session-event invariants for desktop control. @module @z/dsh-tool-desktop/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-tool-desktop';
/** Cordis companion plugin name. */
exports.name = 'tool-desktop-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
var KINDS = new Set([
    'move',
    'click',
    'double_click',
    'drag',
    'scroll',
    'type',
    'key_combo',
    'shortcut',
    'screenshot',
]);
var OUTCOMES = new Set(['applied', 'denied']);
/* jscpd:ignore-start -- package companions share replay and dispatch plumbing */
/** Validate the package-owned event fields and ignore unrelated events. */
function validateEvent(event, fail) {
    if (event.type !== 'desktop/action')
        return;
    if (!KINDS.has(event.data.kind)) {
        fail("desktop/action carries unknown kind ".concat(JSON.stringify(event.data.kind)));
    }
    if (!OUTCOMES.has(event.data.outcome)) {
        fail("desktop/action carries unknown outcome ".concat(JSON.stringify(event.data.outcome)));
    }
}
/** Install validation for loaded and newly appended desktop records. */
var install = Object.assign(function (ctx, fail) {
    for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
        var session = _a[_i];
        for (var _b = 0, _c = session.events; _b < _c.length; _b++) {
            var event_1 = _c[_b];
            validateEvent(event_1, fail);
        }
    }
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var event = args[1];
        validateEvent(event, fail);
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
