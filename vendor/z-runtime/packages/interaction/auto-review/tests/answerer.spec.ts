import { describe, expect, it } from 'vitest'
import { Context } from '@z/cordis'
import { SessionId } from '@z/dsh-session'
import type { Agent } from '@z/dsh-agent'
import { mountAgentLoopTestDependencies } from '@z/dsh-agent-loop-testkit'
import AgentLoop from '@z/dsh-agent-loop'
import type { ApprovalOutcome, ApprovalRequest } from '@z/dsh-user-approval'
import { answerer } from '../src/answerer.ts'
import type { ReviewOutcome, ReviewPolicy, Reviewer } from '../src/types.ts'

const allowDestructivePolicy: ReviewPolicy = {
  rules: [{ id: 'r1', categories: ['destructive'], minRisk: 'high', decision: 'allow' }],
  noMatch: 'defer',
}

function reviewing(outcome: ReviewOutcome): Reviewer {
  return { run: async () => outcome }
}

/** Mount a real agent loop and return a live agent carrying a durable session. */
async function setup(): Promise<Agent> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  return ctx.agentLoop.create(SessionId('a1'), { provider: 'mock', model: 'mock' })
}

const delegating = () => Promise.resolve<ApprovalOutcome>('unavailable')

describe('answerer', () => {
  it('delegates when review is disabled', async () => {
    const agent = await setup()
    const listener = answerer(allowDestructivePolicy, reviewing({ risk: 'high', decision: 'allow' }), false)
    const outcome = await listener({ agent, toolName: 'Bash' } satisfies ApprovalRequest, delegating)
    expect(outcome).toBe('unavailable')
    expect(agent.session.events.some(e => e.type === 'approval/review')).toBe(false)
  })

  it('returns allowed-once and logs a review record when the policy allows', async () => {
    const agent = await setup()
    const listener = answerer(
      { rules: [{ id: 'r1', categories: ['destructive'], minRisk: 'high', decision: 'allow' }], noMatch: 'defer' },
      reviewing({ risk: 'high', decision: 'allow', reason: 'benign' }),
      true,
    )
    const outcome = await listener({ agent, toolName: 'rm', reason: 'remove temp dir' } satisfies ApprovalRequest, delegating)
    expect(outcome).toBe('allowed-once')
    const review = agent.session.events.find(e => e.type === 'approval/review')
    expect(review?.type === 'approval/review' && review.data.verdict).toBe('allow')
    expect(review?.type === 'approval/review' && review.data.risk).toBe('high')
    expect(review?.type === 'approval/review' && review.data.reason).toBe('benign')
  })

  it('returns rejected when the policy denies', async () => {
    const agent = await setup()
    const listener = answerer(
      { rules: [{ id: 'r1', categories: ['destructive'], minRisk: 'high', decision: 'deny' }], noMatch: 'defer' },
      reviewing({ risk: 'high', decision: 'deny' }),
      true,
    )
    const outcome = await listener({ agent, toolName: 'rm' } satisfies ApprovalRequest, delegating)
    expect(outcome).toBe('rejected')
  })

  it('delegates when the policy defers (no matching rule, noMatch defer)', async () => {
    const agent = await setup()
    const listener = answerer({ rules: [], noMatch: 'defer' }, reviewing({ risk: 'low', decision: 'allow' }), true)
    const outcome = await listener({ agent, toolName: 'ls' } satisfies ApprovalRequest, delegating)
    expect(outcome).toBe('unavailable')
  })

  it('fails closed (delegates) when the reviewer throws', async () => {
    const agent = await setup()
    const throwing: Reviewer = { run: async () => { throw new Error('reviewer boom') } }
    const listener = answerer(allowDestructivePolicy, throwing, true)
    const outcome = await listener({ agent, toolName: 'Bash' } satisfies ApprovalRequest, delegating)
    expect(outcome).toBe('unavailable')
  })
})
