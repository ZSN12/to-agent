/** Package-owned hook invocation/result stream invariants. @module @z/dsh-hook-protocol/invariant */
import type { Context } from '@z/cordis';
/** Cordis companion plugin name. */
export declare const name = "hook-protocol-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register the hook-protocol invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map