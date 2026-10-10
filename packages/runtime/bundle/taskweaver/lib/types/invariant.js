/**
 * Package-owned invariant companion for `@taskweaver/dsh-taskweaver`.
 * @module @taskweaver/dsh-taskweaver/invariant
 */
const PACKAGE_NAME = '@taskweaver/dsh-taskweaver';
/** Cordis companion plugin name. */
export const name = 'taskweaver-api-host-invariant';
/** Service required before the companion can register. */
export const inject = ['invariants'];
/**
 * No runtime invariant: the package owns no mutable state. The WebServer and
 * `/api` route lifecycle invariants belong to their respective packages.
 */
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map