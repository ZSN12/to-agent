/**
 * Package-owned invariant companion for `@taskweaver/dsh-session-checkpoint-policy`.
 * @module @taskweaver/dsh-session-checkpoint-policy/invariant
 */
const PACKAGE_NAME = '@taskweaver/dsh-session-checkpoint-policy';
/** Cordis companion plugin name. */
export const name = 'session-checkpoint-policy-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: checkpoint ordering is enforced at the intercepted waterfall and
 * persistence seams; this stateless policy owns no independent mutable relation.
 */
const install = () => { };
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
/* jscpd:ignore-end */
//# sourceMappingURL=invariant.js.map