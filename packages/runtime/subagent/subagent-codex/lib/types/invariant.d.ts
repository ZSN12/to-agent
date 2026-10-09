/**
 * Package-owned invariant companion for `@z/dsh-subagent-codex`.
 * @module @z/dsh-subagent-codex/invariant
 */
import type { Context } from '@z/cordis';
/** Cordis companion plugin name. */
export declare const name = "subagent-codex-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - plugin context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map