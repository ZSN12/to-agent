const PACKAGE_NAME = '@taskweaver/dsh-llm-taskweaver-bridge';
export const name = 'llm-taskweaver-bridge-invariant';
export const inject = ['invariants'];
const install = () => { };
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map