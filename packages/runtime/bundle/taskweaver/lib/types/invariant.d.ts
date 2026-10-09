/**
 * Package-owned invariant companion for `@z/dsh-taskweaver`.
 * @module @z/dsh-taskweaver/invariant
 */
import type { Context } from '@z/cordis';
/** Cordis companion plugin name. */
export declare const name = "taskweaver-api-host-invariant";
/** Service required before the companion can register. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map