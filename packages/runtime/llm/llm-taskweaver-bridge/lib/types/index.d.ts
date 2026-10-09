/**
 * Register TaskWeaver in-process model bridge routes on `ctx.llm`.
 * @module @z/dsh-llm-taskweaver-bridge
 */
import type { Context } from '@z/cordis';
export declare const name = "llm-taskweaver-bridge";
export declare const inject: string[];
export { TaskWeaverBridgeAdapter } from './adapter.ts';
export { ConfigSchema, resolveBridgeOptions } from './config.ts';
export type { Config } from './config.ts';
export type { ResolvedBridgeOptions } from './config.ts';
export declare const apply: (ctx: Context) => Promise<void>;
//# sourceMappingURL=index.d.ts.map