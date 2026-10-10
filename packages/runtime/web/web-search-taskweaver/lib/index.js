import { TaskWeaverSearchProvider } from "./provider.js";
export { TaskWeaverSearchProvider } from "./provider.js";
export const name = 'web-search-taskweaver';
export const inject = ['web'];
export function apply(ctx) {
    ctx.web.registerSearchProvider(new TaskWeaverSearchProvider());
}
//# sourceMappingURL=index.js.map