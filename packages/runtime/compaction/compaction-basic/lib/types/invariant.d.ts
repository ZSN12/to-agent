/**
 * Package-owned invariant companion for `@z/dsh-compaction-basic`.
 * @module @z/dsh-compaction-basic/invariant
 */
import type { Context } from '@z/cordis';
/** Cordis companion plugin name. */
export declare const name = "compaction-basic-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map