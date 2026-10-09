export const name = 'tool-fs-inline-edit-invariant';
export const inject = ['invariants'];
const install = () => { };
export const apply = (ctx) => Promise.resolve(ctx.invariants.register('@z/dsh-tool-fs-inline-edit', install));
//# sourceMappingURL=invariant.js.map