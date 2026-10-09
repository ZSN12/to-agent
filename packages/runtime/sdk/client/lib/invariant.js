//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@z/dsh-sdk-client`.
* @module @z/dsh-sdk-client/invariant
*/
const PACKAGE_NAME = "@z/dsh-sdk-client";
/** Cordis companion plugin name. */
const name = "sdk-client-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: this client library runs outside any harness context
* (its peer is a separate runtime process); the runtime's own packages own
* the event-stream relations.
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
