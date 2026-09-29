/**
 * The real reviewer executor: drives a one-shot subagent through `ctx.subagents`
 * with a structured `outputSchema`, so the reviewer returns a validated
 * {@link ReviewOutcome} without inheriting parent context. The child runs with
 * a narrowed tool set so the reviewer cannot itself become an attack surface.
 * @module @z/dsh-auto-review
 */

import type { Context } from '@z/cordis'
import type { Agent } from '@z/dsh-agent'
import type { ObjectJsonSchema } from '@z/dsh-tools'
import type {} from '@z/dsh-subagent'
import type { ReviewOutcome, ReviewRequest, Reviewer } from './types.ts'

/**
 * The object-rooted JSON schema the reviewer child must satisfy. Restricted to
 * the subset `assertObjectJsonSchema` enforces: enum, const, plain types.
 */
const OUTCOME_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  properties: {
    risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    decision: { type: 'string', enum: ['allow', 'deny', 'defer'] },
    reason: { type: 'string' },
  },
  required: ['risk', 'decision'],
  additionalProperties: false,
}

/**
 * Build a {@link Reviewer} whose `run` spawns a fresh, sanitized subagent and
 * resolves its structured outcome.
 *
 * @param ctx - context carrying the subagent seam.
 * @param provider - the provider name registered on `ctx.subagents`.
 * @returns a reviewer that runs one independent evaluation per call.
 */
export function subagentReviewer(ctx: Context, provider: string): Reviewer {
  return {
    async run(request: ReviewRequest, parent: Agent, signal: AbortSignal): Promise<ReviewOutcome> {
      const run = await ctx.subagents.start(provider, {
        parent,
        signal,
        outputSchema: OUTCOME_SCHEMA,
        prompt: [
          {
            type: 'text',
            text: [
              'Review the following approval request and return a structured verdict.',
              `Tool: ${request.toolName}`,
              ...request.reason !== undefined ? [`Reason: ${request.reason}`] : [],
              'Risk: one of low/medium/high/critical. Decision: allow/deny/defer.',
            ].join('\n'),
          },
        ],
        // Narrow the reviewer's tool set to nothing: it reasons only and must
        // not become an attack surface.
        toolFilter: { allow: [] },
      })
      const result = await run.result
      if (result.stopReason !== 'completed' || result.structured === undefined) {
        throw new Error(`auto-review: reviewer did not complete with a structured verdict (${result.stopReason})`)
      }
      return result.structured as ReviewOutcome
    },
  }
}
