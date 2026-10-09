"use strict";
/** Package-owned permission-preset event invariants. @module @z/dsh-permission-presets/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-permission-presets';
/** Cordis companion plugin name. */
exports.name = 'permission-presets-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Validate the package-owned event fields and ignore unrelated events. */
function validateEvent(ctx, event, fail) {
    if (event.type === 'permission/preset' && !ctx.permissionPresets.names.includes(event.data.preset)) {
        fail("permission/preset names unknown preset ".concat(JSON.stringify(event.data.preset)));
    }
}
/** Install validation that loaded and newly appended preset events remain resolvable. */
var install = Object.assign(function (ctx, fail) {
    for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
        var session = _a[_i];
        for (var _b = 0, _c = session.events; _b < _c.length; _b++) {
            var event_1 = _c[_b];
            validateEvent(ctx, event_1, fail);
        }
    }
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var event = args[1];
        validateEvent(ctx, event, fail);
    }, { global: true });
}, { inject: ['permissionPresets', 'sessions'] });
/**
 * Register the permission invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
