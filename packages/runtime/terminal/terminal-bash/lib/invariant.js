//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@taskweaver/dsh-terminal-bash`.
* @module @taskweaver/dsh-terminal-bash/invariant
*/
const PACKAGE_NAME = "@taskweaver/dsh-terminal-bash";
/** Cordis companion plugin name. */
const name = "terminal-bash-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: readiness, terminal buffers, and process-tree state are private per-session
* implementation state, and the backend publishes no independent lifecycle stream or snapshot.
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
