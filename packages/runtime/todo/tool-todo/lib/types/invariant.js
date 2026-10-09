"use strict";
/** Package-owned durable todo-snapshot invariants. @module @z/dsh-tool-todo/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-tool-todo';
var TODO_STATUSES = new Set(['pending', 'in_progress', 'completed']);
/** Cordis companion plugin name. */
exports.name = 'tool-todo-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/**
 * Validate one whole-list todo snapshot before it reaches the durable log.
 *
 * Deliberately silent on how many items are `in_progress`. That is the tool's
 * per-deployment policy (`Config.allowParallelInProgress`), not a durable-shape
 * rule: a log written while parallel work was allowed must still replay after a
 * deployment tightens the policy, so tying the invariant to the current config
 * would reject history that was valid when it was written.
 */
function validateTodos(value, fail) {
    if (!Array.isArray(value))
        fail('todo/write todos must be an array');
    var seen = new Set();
    for (var _i = 0, value_1 = value; _i < value_1.length; _i++) {
        var item = value_1[_i];
        if (typeof item !== 'object' || item === null)
            fail('todo/write entries must be objects');
        var _a = item, content = _a.content, status_1 = _a.status;
        if (typeof content !== 'string' || content.length === 0 || content.trim() !== content) {
            fail('todo/write content must be non-empty and already trimmed');
        }
        if (seen.has(content))
            fail("todo/write repeats content ".concat(JSON.stringify(content)));
        seen.add(content);
        if (typeof status_1 !== 'string' || !TODO_STATUSES.has(status_1)) {
            fail("todo/write carries unknown status ".concat(JSON.stringify(status_1)));
        }
    }
}
/* jscpd:ignore-start -- package companions share replay and dispatch plumbing */
/** Validate the package-owned event fields and ignore unrelated events. */
function validateEvent(event, fail) {
    if (event.type === 'todo/write')
        validateTodos(event.data.todos, fail);
}
/** Install validation for loaded and newly appended whole-list todo snapshots. */
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
 * Register the todo invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
