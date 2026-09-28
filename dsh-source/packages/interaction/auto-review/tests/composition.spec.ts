import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { STRUCTURED_OUTPUT_TOOL } from '@deepseek-ai/dsh-subagent-in-process-driver'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { MockAdapter, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as AutoReview from '../src/index.ts'

/**
 * REAL-composition guard: the agent loop and in-process spawn subagent provider
 * composed on one context, with a scripted mock MODEL (the only mocked
 * boundary) driving the reviewer child. Each test mounts the AutoReview plugin
 * itself so disposal can be observed in isolation. A review request flows
 * through the answerer → real subagent → structured outcome → ApprovalOutcome.
 */
async function setup(script: ConstructorParameters<typeof MockAdapter>[0]) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(spawn, { providerName: 'spawn' })
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = ctx.agentLoop.create(SessionId('parent'), { provider: 'mock', model: 'mock' })
  return { ctx, agent }
}

function mount(ctx: Context) {
  return ctx.plugin(AutoReview, { enabled: true, subagentProvider: 'spawn', policy: { rules: [], noMatch: 'deny' } })
}

describe('auto-review over the real in-process stack', () => {
  it('runs a reviewer subagent and maps its deny verdict to rejected', async () => {
    const { ctx, agent } = await setup([
      toolCallResponse('c1', STRUCTURED_OUTPUT_TOOL, { risk: 'high', decision: 'deny' }),
    ])
    await mount(ctx)
    const outcome = await ctx.waterfall(
      'approval/request',
      { agent, toolName: 'rm', reason: 'remove temp dir' },
      () => Promise.resolve<ApprovalOutcome>('unavailable'),
    )
    expect(outcome).toBe('rejected')
    // The review verdict is appended to the owning session's log.
    const review = agent.session.events.find(e => e.type === 'approval/review')
    expect(review?.type === 'approval/review' && review.data.verdict).toBe('deny')
    expect(review?.type === 'approval/review' && review.data.risk).toBe('high')
  }, 15_000)

  it('maps an allowed low-risk exfiltration request to allowed-once', async () => {
    const { ctx, agent } = await setup([
      toolCallResponse('c1', STRUCTURED_OUTPUT_TOOL, { risk: 'low', decision: 'allow' }),
    ])
    await ctx.plugin(AutoReview, {
      enabled: true,
      subagentProvider: 'spawn',
      policy: { rules: [{ id: 'r1', categories: ['exfiltration'], minRisk: 'low', decision: 'allow' }], noMatch: 'deny' },
    })
    const outcome = await ctx.waterfall(
      'approval/request',
      { agent, toolName: 'curl', reason: 'fetch public api' },
      () => Promise.resolve<ApprovalOutcome>('unavailable'),
    )
    expect(outcome).toBe('allowed-once')
  }, 15_000)

  it('disposing the plugin fiber unregisters the review answerer (HMR safety)', async () => {
    const { ctx, agent } = await setup([
      toolCallResponse('c1', STRUCTURED_OUTPUT_TOOL, { risk: 'high', decision: 'deny' }),
    ])
    // Capture the registered plugin instance and dispose it; a leaked answerer
    // would still short-circuit the waterfall into a review verdict.
    const fiber = mount(ctx)
    await fiber.dispose()
    const outcome = await ctx.waterfall(
      'approval/request',
      { agent, toolName: 'rm' },
      () => Promise.resolve<ApprovalOutcome>('unavailable'),
    )
    // The answerer is gone, so the request falls through to the fallback.
    expect(outcome).toBe('unavailable')
  }, 15_000)
})
