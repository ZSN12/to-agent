"use strict";
/** Package-owned durable plan-mode invariants. @module @z/dsh-plan-mode/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-plan-mode';
/** Cordis companion plugin name. */
exports.name = 'plan-mode-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * Validate one `plan/mode` event before it reaches the durable log.
 * `plan/mode` is a standalone whole-value event: an idle selection commits
 * between turns and a mid-turn selection commits at the step boundary, so
 * no turn-enclosure relation exists — only the payload shape is checkable.
 */
function validateEvent(event, fail) {
    if (event.type !== 'plan/mode')
        return;
    var active = event.data.active;
    if (typeof active !== 'boolean') {
        fail("plan/mode carries invalid active state ".concat(JSON.stringify(active), "; expected a boolean"));
    }
}
/** Install validation for loaded and newly appended plan-mode state. */
var install = Object.assign(function (ctx, fail) {
    var seed = function (session) {
        for (var _i = 0, _a = session.events; _i < _a.length; _i++) {
            var event_1 = _a[_i];
            validateEvent(event_1, fail);
        }
    };
    for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
        var session = _a[_i];
        seed(session);
    }
    ctx.on('session/created', function (session) { seed(session); }, { global: true });
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName !== 'session/event')
            return;
        var _a = args, event = _a[1];
        validateEvent(event, fail);
    }, { global: true });
}, { inject: ['sessions'] });
/**
 * Register the plan-mode invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
