/**
 * The real reviewer executor: drives a one-shot subagent through `ctx.subagents`
 * with a structured `outputSchema`, so the reviewer returns a validated
 * {@link ReviewOutcome} without inheriting parent context. The child runs with
 * a narrowed tool set so the reviewer cannot itself become an attack surface.
 * @module @z/dsh-auto-review
 */
import type { Context } from '@z/cordis';
import type { Reviewer } from './types.ts';
/**
 * Build a {@link Reviewer} whose `run` spawns a fresh, sanitized subagent and
 * resolves its structured outcome.
 *
 * @param ctx - context carrying the subagent seam.
 * @param provider - the provider name registered on `ctx.subagents`.
 * @returns a reviewer that runs one independent evaluation per call.
 */
export declare function subagentReviewer(ctx: Context, provider: string): Reviewer;
//# sourceMappingURL=reviewer.d.ts.map