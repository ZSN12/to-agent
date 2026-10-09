"use strict";
/** Package-owned tool-pipeline invariants. @module @z/dsh-tools/invariant */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var PACKAGE_NAME = '@z/dsh-tools';
/** Cordis companion plugin name. */
exports.name = 'tools-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Validate the immutable final execution/result snapshot. */
function validateResult(exec, result, fail) {
    if (!Object.isFrozen(exec))
        fail('tools/result execution must be frozen before publication');
    if (!Object.isFrozen(result) || !Object.isFrozen(result.content)) {
        fail('tools/result outcome and content must be frozen before publication');
    }
    if (exec.name.length === 0 || String(exec.callId).length === 0) {
        fail('tools/result execution must carry non-empty name and callId');
    }
}
/** Install monotonic pipeline, final-snapshot, and code-dispatch enclosure checks. */
var install = Object.assign(function (ctx, fail) {
    var stages = new WeakMap();
    var openTurns = new WeakMap();
    var dispatchRoots = new WeakMap();
    var validateDispatch = function (session, event) {
        if (event.type !== 'tool/code-dispatch-start' && event.type !== 'tool/code-dispatch')
            return;
        var root = String(event.data.rootCallId);
        var parent = String(event.data.parentCallId);
        var child = String(event.data.subCallId);
        if (root.length === 0 || parent.length === 0 || child.length === 0) {
            fail("".concat(event.type, " must carry non-empty rootCallId, parentCallId, and subCallId"));
            return;
        }
        var roots = dispatchRoots.get(session);
        var known = roots === null || roots === void 0 ? void 0 : roots.get(child);
        if (known !== undefined && known !== root)
            fail("".concat(event.type, " changed rootCallId for subCallId ").concat(child));
        if (parent !== root && (roots === null || roots === void 0 ? void 0 : roots.get(parent)) !== root) {
            fail("".concat(event.type, " parentCallId ").concat(parent, " does not belong to rootCallId ").concat(root));
        }
    };
    var commitDispatch = function (session, event) {
        if (event.type !== 'tool/code-dispatch-start' && event.type !== 'tool/code-dispatch')
            return;
        var roots = dispatchRoots.get(session);
        roots.set(String(event.data.subCallId), String(event.data.rootCallId));
    };
    var seed = function (session) {
        var openTurn = null;
        dispatchRoots.set(session, new Map());
        for (var _i = 0, _a = session.events; _i < _a.length; _i++) {
            var event_1 = _a[_i];
            validateDispatch(session, event_1);
            commitDispatch(session, event_1);
            if (event_1.type === 'turn/start')
                openTurn = event_1.data.turn;
            else if (event_1.type === 'turn/end')
                openTurn = null;
            else if ((event_1.type === 'tool/code-dispatch-start' || event_1.type === 'tool/code-dispatch')
                && openTurn === null) {
                fail("".concat(event_1.type, " appended outside any open turn"));
            }
        }
        openTurns.set(session, openTurn);
        return openTurn;
    };
    var openTurnFor = function (session) { var _a; return (_a = openTurns.get(session)) !== null && _a !== void 0 ? _a : seed(session); };
    for (var _i = 0, _a = ctx.sessions.list(); _i < _a.length; _i++) {
        var session = _a[_i];
        seed(session);
    }
    ctx.on('session/created', function (session) { seed(session); }, { global: true });
    ctx.on('session/event', function (session, event) {
        validateDispatch(session, event);
        commitDispatch(session, event);
        if (event.type === 'turn/start')
            openTurns.set(session, event.data.turn);
        else if (event.type === 'turn/end')
            openTurns.set(session, null);
    }, { global: true });
    ctx.on('internal/dispatch', function (_mode, eventName, args) {
        if (eventName === 'session/event') {
            var _a = args, session = _a[0], event_2 = _a[1];
            validateDispatch(session, event_2);
            if ((event_2.type === 'tool/code-dispatch-start' || event_2.type === 'tool/code-dispatch')
                && openTurnFor(session) === null) {
                fail("".concat(event_2.type, " appended outside any open turn"));
            }
            return;
        }
        if (eventName === 'tools/pre-execute') {
            var exec_1 = args[0];
            if (stages.has(exec_1))
                fail('tools/pre-execute repeated for one execution');
            stages.set(exec_1, 'pre');
            return;
        }
        if (eventName === 'tools/execute') {
            var exec_2 = args[0];
            if (stages.get(exec_2) !== 'pre')
                fail('tools/execute must follow tools/pre-execute');
            stages.set(exec_2, 'execute');
            return;
        }
        if (eventName === 'tools/post-execute') {
            var exec_3 = args[0];
            var previous = stages.get(exec_3);
            if (previous !== 'pre' && previous !== 'execute') {
                fail('tools/post-execute must follow tools/pre-execute or tools/execute');
            }
            stages.set(exec_3, 'post');
            return;
        }
        if (eventName !== 'tools/result')
            return;
        var _b = args, exec = _b[0], result = _b[1];
        validateResult(exec, result, fail);
        stages.delete(exec);
    }, { global: true });
}, { inject: ['sessions'] });
/**
 * Register the tools invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
