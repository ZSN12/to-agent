import { describe, expect, it } from 'vitest'
import { Context } from '@taskweaver/cordis'
import { CallId } from '@taskweaver/dsh-llm'
import AgentRegistry, { type Agent } from '@taskweaver/dsh-agent'
import SystemPrompt from '@taskweaver/dsh-system-prompt'
import ToolRuntime from '@taskweaver/dsh-tools'
import OrchestrationService, { type OrchestrationRequest } from '@taskweaver/dsh-orchestration'
import * as toolOrchestrate from '@taskweaver/dsh-tool-orchestrate'

const testToolSignal = new AbortController().signal

function stubAgent(id: string): Agent {
  const agentId = id as Agent['id']
  return { id: agentId, session: { id: agentId, header: {} } } as unknown as Agent
}

async function setup() {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(OrchestrationService)
  await ctx.plugin(toolOrchestrate)
  return ctx
}

describe('orchestrate tool', () => {
  it('registers one model-facing tool and returns the DAG summary', async () => {
    const ctx = await setup()
    const seen: OrchestrationRequest[] = []
    ctx.orchestration.registerProvider({
      async run(request) {
        seen.push(request)
        return {
          summary: '完成两项任务', runId: 'run-1', taskCount: 2, failedTaskCount: 0, cancelled: false,
          taskStatuses: [
            { id: 'T1', title: '实现功能', status: '已完成' },
            { id: 'T2', title: '补充测试', status: '已完成' },
          ],
          changedFiles: ['src/feature.ts', 'src/feature.test.ts'],
        }
      },
    })
    const agent = stubAgent('root')
    ctx.agents.enter(agent, undefined)
    const controller = new AbortController()

    const result = await ctx.tools.execute({
      callId: CallId('orchestrate-1'), name: 'orchestrate',
      arguments: { goal: '完成用户目标', context: '已确认入口在 src/main.ts', readOnly: false },
      agent, signal: controller.signal,
    })

    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected orchestrate success')
    expect(result.value).toEqual({
      summary: '完成两项任务', task_count: 2, failed_task_count: 0, cancelled: false,
      task_statuses: [
        { id: 'T1', title: '实现功能', status: '已完成' },
        { id: 'T2', title: '补充测试', status: '已完成' },
      ],
      changed_files: ['src/feature.ts', 'src/feature.test.ts'],
    })
    expect(result.content).toEqual([{ type: 'text', text: '完成两项任务\n\n子任务状态：\n- 实现功能：已完成\n- 补充测试：已完成\n\n改动文件：\n- src/feature.ts\n- src/feature.test.ts' }])
    expect(seen).toEqual([{
      goal: '完成用户目标', context: '已确认入口在 src/main.ts', readOnly: false,
      callId: 'orchestrate-1', agent, signal: controller.signal,
    }])
    expect(ctx.tools.schemas().map(tool => tool.name)).toContain('orchestrate')
  })

  it('returns a structured error when the provider is not mounted', async () => {
    const ctx = await setup()
    const agent = stubAgent('root')
    ctx.agents.enter(agent, undefined)

    const result = await ctx.tools.execute({
      callId: CallId('orchestrate-2'), name: 'orchestrate',
      arguments: { goal: '完成用户目标' }, agent, signal: testToolSignal,
    })

    expect(result).toMatchObject({
      isError: true,
      error: { info: { name: 'OrchestrationToolError', code: 'NO_PROVIDER' } },
    })
  })
})
