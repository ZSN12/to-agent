/**
 * The in-process SPAWN subagent backend: registers a {@link SubagentProvider} on
 * `ctx.subagents` that runs each child as a fresh child {@link Agent} on the same cordis
 * context (its own session, own system prompt, zero parent context). The cheapest transport,
 * reusing the agent factory's quiescent teardown.
 * @module @taskweaver/dsh-subagent-spawn-in-process
 */
import type { Context } from '@taskweaver/cordis';
import z from '@taskweaver/schemastery';
export declare const name = "subagent-spawn-in-process";
export declare const inject: string[];
/** Config: the registry name to register the provider under. */
export interface Config {
    /** Provider name on `ctx.subagents` (default `spawn`). */
    providerName: string;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map