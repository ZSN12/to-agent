//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@z/dsh-session-reference`.
* @module @z/dsh-session-reference/invariant
*/
const PACKAGE_NAME = "@z/dsh-session-reference";
/** Cordis companion plugin name. */
const name = "session-reference-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: preparation returns immutable per-call snapshots validated while they are
* built, and the agent/session layers own durable context admission, freezing, and replay.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
