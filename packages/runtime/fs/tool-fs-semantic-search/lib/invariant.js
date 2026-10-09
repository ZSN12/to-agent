//#region lib/types/invariant.js
const name = "tool-fs-semantic-search-invariant";
const inject = ["invariants"];
const install = () => {};
const apply = (ctx) => Promise.resolve(ctx.invariants.register("@z/dsh-tool-fs-semantic-search", install));
//#endregion
export { apply, inject, name };
