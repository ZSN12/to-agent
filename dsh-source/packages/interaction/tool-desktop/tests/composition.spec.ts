import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import type { ShellRunResult, ShellExecSpec, ShellExecRequest } from '@deepseek-ai/dsh-shell'
import { MockAdapter, toolCallResponse, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as ToolDesktop from '../src/index.ts'

/**
 * REAL-composition guard: the agent loop + shell + approval services composed
 * on one context, with a scripted mock MODEL (the only other boundary) driving
 * the desktop tools. The shell `run` is stubbed so the OS (osascript /
 * screencapture) is never actually invoked; everything else is real.
 */
function stubShell(captured: string[]): {
  shell: {
    sandboxMode: string
    resolve(req: ShellExecRequest): ShellExecSpec
    run(spec: ShellExecSpec): Promise<ShellRunResult>
    start(): never
  }
} {
  return {
    shell: {
      sandboxMode: 'workspace-write',
      resolve(req: ShellExecRequest): ShellExecSpec {
        return {
          command: req.command,
          workdir: req.workdir ?? process.cwd(),
          timeoutMs: req.timeoutMs ?? 1000,
          stdoutMaxBytes: req.stdoutMaxBytes ?? 64 * 1024,
          sandboxPolicy: undefined,
          ...req.signal !== undefined ? { signal: req.signal } : {},
        }
      },
      async run(spec: ShellExecSpec): Promise<ShellRunResult> {
        captured.push(spec.command)
        // JXA size probe → "100,200"; frontmost-app probe → a bundle id;
        // screencapture returns nothing.
        let text = ''
        if (spec.command.includes('CGEventGetLocation')) text = '100,200'
        else if (spec.command.includes('frontmostApplication')) text = 'com.apple.Safari\n'
        return {
          exitCode: 0,
          stdout: { text, truncated: false },
          stderr: { text: '', truncated: false },
        } as ShellRunResult
      },
      start(): never {
        throw new Error('composition tests do not start background shell')
      },
    },
  }
}

async function setup(script: ConstructorParameters<typeof MockAdapter>[0]) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(ApprovalService)
  const captured: string[] = []
  const { shell } = stubShell(captured)
  ctx.provide('shell', shell)
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = ctx.agentLoop.create(SessionId('desktop'), { provider: 'mock', model: 'mock' })
  return { ctx, agent, captured, adapter }
}

describe('desktop control over the real agent stack', () => {
  it('a model screenshot call reaches the shell and logs a desktop/action audit', async () => {
    const { ctx, agent, captured, adapter } = await setup([
      toolCallResponse('c1', 'desktop_screenshot', { path: '/tmp/desktop.png' }),
      textResponse('done'),
    ])
    await ctx.plugin(ToolDesktop, {
      policy: { rules: [], default: 'allow' },
    })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'screenshot the desktop' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(captured.some(c => c.includes('screencapture'))).toBe(true)
    expect(adapter.requests.length).toBeGreaterThan(0)
    const audit = agent.session.events.find(e => e.type === 'desktop/action')
    expect(audit?.type === 'desktop/action' && audit.data.kind).toBe('screenshot')
    expect(audit?.type === 'desktop/action' && audit.data.outcome).toBe('applied')
  }, 15_000)

  it('a denied-by-policy mouse action is refused and audited as denied', async () => {
    const { ctx, agent, captured } = await setup([
      toolCallResponse('c1', 'desktop_mouse', { action: 'click', x: 10, y: 20 }),
      textResponse('done'),
    ])
    await ctx.plugin(ToolDesktop, {
      policy: { rules: [], default: 'deny' },
    })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'click there' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    // Deny-default means the action is refused without prompting.
    expect(captured.some(c => c.includes('CGEventCreateMouseEvent'))).toBe(false)
    const audit = agent.session.events.find(e => e.type === 'desktop/action')
    expect(audit?.type === 'desktop/action' && audit.data.outcome).toBe('denied')
    expect(audit?.type === 'desktop/action' && audit.data.kind).toBe('click')
  }, 15_000)

  it('an allowed keyboard call reaches the shell and logs an applied audit', async () => {
    const { ctx, agent, captured } = await setup([
      toolCallResponse('c1', 'desktop_keyboard', { action: 'type', text: 'hi' }),
      textResponse('done'),
    ])
    await ctx.plugin(ToolDesktop, {
      policy: { rules: [], default: 'allow' },
    })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'type hello' }], source: { kind: 'user' } }))
    await agent.whenIdle()
    expect(captured.some(c => c.includes('CGEventKeyboardSetUnicodeString'))).toBe(true)
    const audit = agent.session.events.find(e => e.type === 'desktop/action')
    expect(audit?.type === 'desktop/action' && audit.data.kind).toBe('type')
    expect(audit?.type === 'desktop/action' && audit.data.outcome).toBe('applied')
  }, 15_000)
})
