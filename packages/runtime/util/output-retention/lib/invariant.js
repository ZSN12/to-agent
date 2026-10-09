//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@z/dsh-output-retention`.
* @module @z/dsh-output-retention/invariant
*/
const PACKAGE_NAME = "@z/dsh-output-retention";
/** Cordis companion plugin name. */
const name = "output-retention-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: this pure utility owns no event stream or mutable runtime data; its value
* algebra is enforced by unit tests.
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
