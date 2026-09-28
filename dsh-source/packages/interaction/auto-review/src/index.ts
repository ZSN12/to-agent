/**
 * Auto-review: an optional `approval/request` answerer that runs a reviewer
 * subagent before a human is asked, mapping its verdict onto an
 * {@link ApprovalOutcome} with a fail-closed fallback. Enforcement stays with
 * the approval service; this plugin only recommends, and only for requests the
 * approval service has already determined need asking.
 * @module @deepseek-ai/dsh-auto-review
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { answerer } from './answerer.ts'
import { subagentReviewer } from './reviewer.ts'
import type { ReviewPolicy, ReviewPolicyRule } from './types.ts'

export const name = 'auto-review'

/** Declare the subagent seam the reviewer child needs. */
export const inject = ['subagents']

/** Plugin config: the review enablement switch, reviewer route, and policy. */
export interface Config {
  /** Whether review mode is active; defaults off so nothing is reviewed unexpectedly. */
  enabled: boolean
  /** Provider name on `ctx.subagents` used to spawn the reviewer child. */
  subagentProvider: string
  /** The review policy rules and closed fallback. */
  policy: ReviewPolicy
}

const ruleSchema: z<ReviewPolicyRule> = z.object({
  id: z.string(),
  categories: z.array(z.union(['exfiltration', 'credential-probing', 'destructive', 'persistent-weakening'] as const)),
  minRisk: z.union(['low', 'medium', 'high', 'critical'] as const),
  decision: z.union(['allow', 'deny'] as const),
})

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false),
  subagentProvider: z.string().default('spawn'),
  policy: z.object({
    rules: z.array(ruleSchema).default([]),
    noMatch: z.union(['deny', 'defer'] as const).default('defer'),
  }),
})

/**
 * Register the auto-review prepend answerer. The plugin builds the reviewer
 * around the live `ctx.subagents` seam and the configured policy, then prepends
 * it so review runs before any composed human/UI answerer. A disabled config
 * still registers the listener (it immediately delegates), keeping behavior
 * deterministic and easy to flip at runtime.
 */
export function apply(ctx: Context, config: Config): void {
  const reviewer = subagentReviewer(ctx, config.subagentProvider)
  ctx.on('approval/request', answerer(config.policy, reviewer, config.enabled), { prepend: true })
}
