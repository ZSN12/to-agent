"use strict";
/**
 * Package-owned request-reconstruction invariant for loop-built LLM calls.
 * @module @z/dsh-agent-loop/invariant
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apply = exports.inject = exports.name = void 0;
var dsh_llm_1 = require("@z/dsh-llm");
var dsh_session_1 = require("@z/dsh-session");
var PACKAGE_NAME = '@z/dsh-agent-loop';
/** Cordis companion plugin name. */
exports.name = 'agent-loop-invariant';
/** Service required before the companion can reserve package ownership. */
exports.inject = ['invariants'];
/** Install the request-reconstruction contribution into its child registration fiber. */
var install = Object.assign(function (ctx, fail) {
    // Prepend prevents a short-circuiting replay listener from silencing the check.
    ctx.on('llm/stream', function (options, next) {
        var _a, _b;
        if (!(0, dsh_llm_1.isAgentLoopRequest)(options))
            return next();
        if (!Object.isFrozen(options))
            fail('a loop-built request must be frozen');
        if (options.sessionId === undefined)
            fail('a loop-built request must carry a session id');
        var session = ctx.sessions.get(options.sessionId);
        if (!session)
            fail("a loop-built request must carry a live session id, got \"".concat(String(options.sessionId), "\""));
        if (!Object.isFrozen(options.messages)) {
            fail('a loop-built request must carry a frozen messages array');
        }
        var events = session.events;
        if (!events.some(function (event) { return event.type === 'step/start'; })) {
            return fail('a loop-built request with no step/start in its session log');
        }
        var header = (0, dsh_session_1.foldRequestHeader)(events);
        if (header === undefined) {
            return fail('a loop-built request with no request/header event in its session log');
        }
        var expected = session.deriveMessages();
        if (JSON.stringify(options.messages) !== JSON.stringify(expected)) {
            fail("llm request for session \"".concat(String(session.id), "\" diverges from the dispatch-time durable derivation (log-reconstruction desync)"));
        }
        var headerMatches = options.model === header.config.model
            && options.system === header.system
            && options.temperature === header.config.temperature
            && options.maxTokens === header.config.maxTokens
            && JSON.stringify(options.stop) === JSON.stringify(header.config.stop)
            && JSON.stringify((_a = options.tools) !== null && _a !== void 0 ? _a : []) === JSON.stringify((_b = header.tools) !== null && _b !== void 0 ? _b : []);
        if (!headerMatches) {
            fail("llm request for session \"".concat(String(session.id), "\" diverges from the folded request header"));
        }
        return next();
    }, { global: true, prepend: true });
}, { inject: ['sessions'] });
/**
 * Register the agent-loop invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
var apply = function (ctx) {
    return Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
};
exports.apply = apply;
