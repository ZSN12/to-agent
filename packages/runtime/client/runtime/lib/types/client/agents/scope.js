"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createScope = createScope;
exports.scopeOf = scopeOf;
/**
 * Client Agent-scope primitive: mint a Cordis context tagged with the owning
 * Agent's identity. The mechanism mirrors the host `dsh-scope` architecture
 * (no-op plugin fiber + context tag + `Context.filter` routing predicate);
 * the shape deliberately diverges: the filter lives on the actx itself
 * instead of a separate carrier object, so scoped dispatch is plain cordis —
 * `actx.bail(actx, event, payload)` / `actx.emit(actx, ...)` — with no
 * wrapper. The host needs a detached carrier because its dispatch subject is
 * the business Agent object; client scope events carry only ids, so the
 * actx is the natural subject. The second divergence stands: the scope key
 * is the branded `SessionId` (value compared), not an object identity — the
 * agent and its session share one id (1:1, same axis; no separate AgentId
 * brand), and a client scope's identity IS that wire id. Third divergence,
 * deliberate: the client scopes the Agent IDENTITY, not a live Agent object
 * — a cold session's host Agent is already disposed while its client actx
 * stays alive for history viewing.
 */
var cordis_1 = require("@z/cordis");
/** Context tag written by {@link createScope}. */
var kScope = Symbol('dsh.client.scope');
/** Shared no-op plugin backing each Agent scope fiber. */
function agentScope() { }
/**
 * Mint an Agent scope under `ctx`: a no-op plugin fiber whose context
 * carries the agent tag and the dispatch filter — untagged listeners are
 * admitted globally, tagged listeners only for a matching agent.
 * Registrations through the returned ctx dispose with the fiber.
 * @param ctx - client root context the scope fiber mounts under.
 * @param key - owning agent identity (the routing tag; agent id === session id).
 * @returns the tagged context and its backing fiber.
 */
function createScope(ctx, key) {
    var _a;
    var fiber = ctx.plugin(agentScope);
    var scoped = fiber.ctx.extend((_a = {},
        _a[kScope] = key,
        _a[cordis_1.Context.filter] = function (listenerCtx) {
            var tag = scopeOf(listenerCtx);
            return tag === undefined || tag === key;
        },
        _a));
    return {
        fiber: fiber,
        ctx: scoped,
    };
}
/**
 * Read the nearest agent tag inherited by a context.
 * @param ctx - any client context.
 * @returns its agent identity (the session id), or undefined for root contexts.
 */
function scopeOf(ctx) {
    return ctx[kScope];
}
