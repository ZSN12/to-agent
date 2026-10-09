//#region lib/types/invariant.js
const name = "tool-fs-inline-edit-invariant";
const inject = ["invariants"];
const install = () => {};
const apply = (ctx) => Promise.resolve(ctx.invariants.register("@z/dsh-tool-fs-inline-edit", install));
//#endregion
export { apply, inject, name };
