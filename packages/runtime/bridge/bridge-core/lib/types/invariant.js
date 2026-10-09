const PACKAGE_NAME = '@z/dsh-bridge-core';
export const name = 'bridge-core-invariant';
export const inject = ['invariants'];
const install = () => { };
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map