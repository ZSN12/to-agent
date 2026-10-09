/**
 * Model-facing Cordis runtime/package inspection, define, run, stop, and remove tools.
 * @module @z/dsh-tool-cordis
 */
import type { Context } from '@z/cordis';
export declare const name = "tool-cordis";
export declare const inject: string[];
/** Register the Cordis tools and explicit `@pluginId` context injection. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map