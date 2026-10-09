/**
 * Auto-review: an optional `approval/request` answerer that runs a reviewer
 * subagent before a human is asked, mapping its verdict onto an
 * {@link ApprovalOutcome} with a fail-closed fallback. Enforcement stays with
 * the approval service; this plugin only recommends, and only for requests the
 * approval service has already determined need asking.
 * @module @z/dsh-auto-review
 */
import type { Context } from '@z/cordis';
import z from '@z/schemastery';
import type { ReviewPolicy } from './types.ts';
export declare const name = "auto-review";
/** Declare the subagent seam the reviewer child needs. */
export declare const inject: string[];
/** Plugin config: the review enablement switch, reviewer route, and policy. */
export interface Config {
    /** Whether review mode is active; defaults off so nothing is reviewed unexpectedly. */
    enabled: boolean;
    /** Provider name on `ctx.subagents` used to spawn the reviewer child. */
    subagentProvider: string;
    /** The review policy rules and closed fallback. */
    policy: ReviewPolicy;
}
export declare const Config: z<Config>;
/**
 * Register the auto-review prepend answerer. The plugin builds the reviewer
 * around the live `ctx.subagents` seam and the configured policy, then prepends
 * it so review runs before any composed human/UI answerer. A disabled config
 * still registers the listener (it immediately delegates), keeping behavior
 * deterministic and easy to flip at runtime.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map