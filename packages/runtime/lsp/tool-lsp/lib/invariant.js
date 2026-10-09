//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@z/dsh-tool-lsp`.
* @module @z/dsh-tool-lsp/invariant
*/
const PACKAGE_NAME = "@z/dsh-tool-lsp";
/** Cordis companion plugin name. */
const name = "tool-lsp-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: this stateless adapter contributes one tool and prompt section, while query
* lifecycle and result relations remain owned by the tool and LSP seams it composes.
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
