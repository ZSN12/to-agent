import { describe, expect, it, vi } from 'vitest'
import { Context } from '@taskweaver/cordis'
import AgentRegistry, { type Agent } from '@taskweaver/dsh-agent'
import OrchestrationService, {
  OrchestrationToolError,
  type OrchestrationProvider,
  type OrchestrationRequest,
} from '@taskweaver/dsh-orchestration'

function stubAgent(id: string): Agent {
  const agentId = id as Agent['id']
  return { id: agentId, session: { id: agentId, header: {} } } as unknown as Agent
}

function provider(): OrchestrationProvider & { seen: OrchestrationRequest[] } {
  const seen: OrchestrationRequest[] = []
  return {
    seen,
    async run(request) {
      seen.push(request)
      return { summary: 'done', runId: 'run-1', taskCount: 2, failedTaskCount: 0, cancelled: false }
    },
  }
}

async function setup() {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(OrchestrationService)
  return ctx
}

describe('OrchestrationService', () => {
  it('validates a live root caller and delegates to the desktop provider', async () => {
    const ctx = await setup()
    const p = provider()
    ctx.orchestration.registerProvider(p)
    const agent = stubAgent('root')
    ctx.agents.enter(agent, undefined)
    const signal = new AbortController().signal

    await expect(ctx.orchestration.run({ goal: '  implement it  ', callId: 'call-1', agent, signal }))
      .resolves.toEqual({ summary: 'done', runId: 'run-1', taskCount: 2, failedTaskCount: 0, cancelled: false })
    expect(p.seen).toEqual([{ goal: 'implement it', callId: 'call-1', agent, signal }])
  })

  it('rejects malformed goals and missing providers before dispatch', async () => {
    const ctx = await setup()
    const agent = stubAgent('root')
    ctx.agents.enter(agent, undefined)
    const run = (goal: string) => ctx.orchestration.run({ goal, callId: 'call-1', agent })

    await expect(run('  ')).rejects.toMatchObject({ code: 'EMPTY_GOAL' })
    await expect(run('x'.repeat(20_001))).rejects.toMatchObject({ code: 'GOAL_TOO_LARGE' })
    await expect(run('valid')).rejects.toMatchObject({ code: 'NO_PROVIDER' })
  })

  it('rejects stale and delegated agents before reaching the provider', async () => {
    const ctx = await setup()
    const p = { run: vi.fn(async () => ({ summary: '', runId: null, taskCount: 0, failedTaskCount: 0, cancelled: false })) }
    ctx.orchestration.registerProvider(p)
    const root = stubAgent('root')
    const child = stubAgent('child')
    ctx.agents.enter(root, undefined)
    ctx.agents.enter(child, root)

    await expect(ctx.orchestration.run({ goal: 'goal', callId: 'call-1', agent: stubAgent('root') }))
      .rejects.toMatchObject({ code: 'CALLER_NOT_LIVE' })
    await expect(ctx.orchestration.run({ goal: 'goal', callId: 'call-2', agent: child }))
      .rejects.toMatchObject({ code: 'DELEGATED_CALLER' })
    expect(p.run).not.toHaveBeenCalled()
  })

  it('does not dispatch a call whose tool signal was already aborted', async () => {
    const ctx = await setup()
    const p = { run: vi.fn(async () => ({ summary: '', runId: null, taskCount: 0, failedTaskCount: 0, cancelled: false })) }
    ctx.orchestration.registerProvider(p)
    const agent = stubAgent('root')
    ctx.agents.enter(agent, undefined)
    const controller = new AbortController()
    controller.abort()

    await expect(ctx.orchestration.run({ goal: 'goal', callId: 'call-1', agent, signal: controller.signal }))
      .rejects.toBeInstanceOf(OrchestrationToolError)
    expect(p.run).not.toHaveBeenCalled()
  })

  it('rejects a second provider and allows registration after disposal', async () => {
    const ctx = await setup()
    const dispose = ctx.orchestration.registerProvider(provider())
    expect(() => ctx.orchestration.registerProvider(provider())).toThrow(OrchestrationToolError)
    dispose()
    expect(() => ctx.orchestration.registerProvider(provider())).not.toThrow()
  })
})
