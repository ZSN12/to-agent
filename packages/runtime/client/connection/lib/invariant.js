//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@z/dsh-client-connection`.
* @module @z/dsh-client-connection/invariant
*/
const PACKAGE_NAME = "@z/dsh-client-connection";
/** Cordis companion plugin name. */
const name = "client-connection-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the wire layer emits no cordis events and owns no
* mutable cross-plugin relation — stream/reconnect sequencing is exercised
* directly by its behavior specs, rpcId round-trip discipline is owned by the
* apiproxy contract layer, and the node half's single route registration's
* register/dispose symmetry is audited by the webserver package's invariant.
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
