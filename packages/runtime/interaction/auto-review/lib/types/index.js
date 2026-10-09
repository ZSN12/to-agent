/**
 * Auto-review: an optional `approval/request` answerer that runs a reviewer
 * subagent before a human is asked, mapping its verdict onto an
 * {@link ApprovalOutcome} with a fail-closed fallback. Enforcement stays with
 * the approval service; this plugin only recommends, and only for requests the
 * approval service has already determined need asking.
 * @module @z/dsh-auto-review
 */
import z from '@z/schemastery';
import { answerer } from "./answerer.js";
import { subagentReviewer } from "./reviewer.js";
export const name = 'auto-review';
/** Declare the subagent seam the reviewer child needs. */
export const inject = ['subagents'];
const ruleSchema = z.object({
    id: z.string(),
    categories: z.array(z.union(['exfiltration', 'credential-probing', 'destructive', 'persistent-weakening'])),
    minRisk: z.union(['low', 'medium', 'high', 'critical']),
    decision: z.union(['allow', 'deny']),
});
export const Config = z.object({
    enabled: z.boolean().default(false),
    subagentProvider: z.string().default('spawn'),
    policy: z.object({
        rules: z.array(ruleSchema).default([]),
        noMatch: z.union(['deny', 'defer']).default('defer'),
    }),
});
/**
 * Register the auto-review prepend answerer. The plugin builds the reviewer
 * around the live `ctx.subagents` seam and the configured policy, then prepends
 * it so review runs before any composed human/UI answerer. A disabled config
 * still registers the listener (it immediately delegates), keeping behavior
 * deterministic and easy to flip at runtime.
 */
export function apply(ctx, config) {
    const reviewer = subagentReviewer(ctx, config.subagentProvider);
    ctx.on('approval/request', answerer(config.policy, reviewer, config.enabled), { prepend: true });
}
//# sourceMappingURL=index.js.map