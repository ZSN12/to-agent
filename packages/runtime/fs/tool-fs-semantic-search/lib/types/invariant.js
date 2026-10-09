export const name = 'tool-fs-semantic-search-invariant';
export const inject = ['invariants'];
const install = () => { };
export const apply = (ctx) => Promise.resolve(ctx.invariants.register('@z/dsh-tool-fs-semantic-search', install));
//# sourceMappingURL=invariant.js.map