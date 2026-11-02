//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@taskweaver/dsh-taskweaver`.
* @module @taskweaver/dsh-taskweaver/invariant
*/
const PACKAGE_NAME = "@taskweaver/dsh-taskweaver";
/** Cordis companion plugin name. */
const name = "taskweaver-api-host-invariant";
/** Service required before the companion can register. */
const inject = ["invariants"];
/**
* No runtime invariant: the package owns no mutable state. The WebServer and
* `/api` route lifecycle invariants belong to their respective packages.
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
