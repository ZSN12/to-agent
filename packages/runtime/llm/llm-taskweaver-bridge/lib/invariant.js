//#region lib/types/invariant.js
const PACKAGE_NAME = "@z/dsh-llm-taskweaver-bridge";
const name = "llm-taskweaver-bridge-invariant";
const inject = ["invariants"];
const install = () => {};
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
