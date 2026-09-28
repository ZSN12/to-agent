import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import type { ShellRunResult, ShellExecSpec } from '@deepseek-ai/dsh-shell'
import * as ToolDesktop from '../src/index.ts'

function makeAgent() {
  const agent = {} as {
    session: { append: ReturnType<typeof vi.fn>; events: Array<{ type: string }> }
  }
  // An open turn lets the real ApprovalService dispatch approval/request.
  agent.session = { append: vi.fn(), events: [{ type: 'turn/start' }] }
  return agent
}

async function mount(config: ToolDesktop.Config): Promise<{ ctx: Context; captured: string[] }> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(ApprovalService)
  const captured: string[] = []
  ctx.provide('shell', {
    sandboxMode: 'workspace-write',
    resolve(req: { command: string; workdir?: string }): ShellExecSpec {
      return {
        command: req.command,
        workdir: req.workdir ?? process.cwd(),
        timeoutMs: 1000,
        stdoutMaxBytes: 64 * 1024,
        sandboxPolicy: undefined,
      }
    },
    async run(spec: ShellExecSpec): Promise<ShellRunResult> {
      captured.push(spec.command)
      let text = ''
      if (spec.command.includes('CGDisplayPixelsWide')) text = '100,200'
      else if (spec.command.includes('frontmostApplication')) text = 'com.apple.Safari\n'
      return { exitCode: 0, stdout: { text, truncated: false }, stderr: { text: '', truncated: false } } as ShellRunResult
    },
    start(): never { throw new Error('not used') },
  })
  await ctx.plugin(ToolDesktop, config)
  return { ctx, captured }
}

const exec = (agent: ReturnType<typeof makeAgent>) => ({
  agent,
  signal: new AbortController().signal,
})

const allowAll: ToolDesktop.Config = { policy: { rules: [], default: 'allow' }, moveDurationMs: 40 }
const denyAll: ToolDesktop.Config = {
  policy: { rules: [{ bundleId: 'com.apple.Safari', access: 'deny' }], default: 'allow' },
  moveDurationMs: 40,
}

describe('desktop tools (direct execution)', () => {
  it('desktop_screenshot captures and reports dimensions', async () => {
    const { ctx, captured } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_screenshot')!
    const value = await tool.execute({ path: '/tmp/x.png' }, exec(makeAgent()) as never)
    expect(value).toEqual({ path: '/tmp/x.png', width: 100, height: 200 })
    expect(captured.some(c => c.includes('screencapture'))).toBe(true)
  })

  it('desktop_screenshot throws without an agent context', async () => {
    const { ctx } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_screenshot')!
    await expect(tool.execute({ path: '/tmp/x.png' }, {} as never)).rejects.toThrow('agent context')
  })

  it('desktop_screenshot denies under a deny policy', async () => {
    const { ctx } = await mount(denyAll)
    const tool = ctx.tools.get('desktop_screenshot')!
    await expect(tool.execute({ path: '/tmp/x.png' }, exec(makeAgent()) as never)).rejects.toThrow('denied')
  })

  it('desktop_mouse moves, clicks, double-clicks, and scrolls', async () => {
    const { ctx, captured } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_mouse')!
    await tool.execute({ action: 'move', x: 1, y: 2 }, exec(makeAgent()) as never)
    await tool.execute({ action: 'click', x: 3, y: 4 }, exec(makeAgent()) as never)
    await tool.execute({ action: 'double_click', x: 5, y: 6 }, exec(makeAgent()) as never)
    await tool.execute({ action: 'scroll', delta_y: -2 }, exec(makeAgent()) as never)
    const jxa = captured.join('\n')
    expect(jxa).toContain('kCGEventMouseMoved')
    expect(jxa).toContain('kCGEventLeftMouseDown')
    expect(jxa).toContain('kCGEventLeftMouseUp')
    expect(jxa).toContain('CGEventCreateScrollWheelEvent')
  })

  it('desktop_mouse returns denied on a deny policy', async () => {
    const { ctx } = await mount(denyAll)
    const tool = ctx.tools.get('desktop_mouse')!
    const value = await tool.execute({ action: 'click', x: 1, y: 2 }, exec(makeAgent()) as never)
    expect(value).toMatchObject({ ok: false })
    expect((value as { reason?: string }).reason).toContain('denied')
  })

  it('desktop_mouse move without coordinates throws', async () => {
    const { ctx } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_mouse')!
    await expect(tool.execute({ action: 'move', x: 1 }, exec(makeAgent()) as never)).rejects.toThrow('requires x and y')
  })

  it('desktop_mouse scroll without delta_y throws', async () => {
    const { ctx } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_mouse')!
    await expect(tool.execute({ action: 'scroll' }, exec(makeAgent()) as never)).rejects.toThrow('requires delta_y')
  })

  it('desktop_mouse unknown action throws', async () => {
    const { ctx } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_mouse')!
    await expect(tool.execute({ action: 'teleport' }, exec(makeAgent()) as never)).rejects.toThrow('unknown action')
  })

  it('desktop_mouse throws without an agent context', async () => {
    const { ctx } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_mouse')!
    await expect(tool.execute({ action: 'click', x: 1, y: 2 }, {} as never)).rejects.toThrow('agent context')
  })

  it('desktop_keyboard types and sends key combos', async () => {
    const { ctx, captured } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_keyboard')!
    await tool.execute({ action: 'type', text: 'hello' }, exec(makeAgent()) as never)
    await tool.execute({ action: 'key_combo', key: 'return' }, exec(makeAgent()) as never)
    await tool.execute({ action: 'key_combo', key: 'c', modifiers: ['command'] }, exec(makeAgent()) as never)
    const jxa = captured.join('\n')
    expect(jxa).toContain('CGEventKeyboardSetUnicodeString')
    expect(jxa).toContain('1048576') // command flag
  })

  it('desktop_keyboard returns denied on a deny policy', async () => {
    const { ctx } = await mount(denyAll)
    const tool = ctx.tools.get('desktop_keyboard')!
    const value = await tool.execute({ action: 'type', text: 'x' }, exec(makeAgent()) as never)
    expect(value).toMatchObject({ ok: false })
    expect((value as { reason?: string }).reason).toContain('denied')
  })

  it('desktop_keyboard throws without an agent context', async () => {
    const { ctx } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_keyboard')!
    await expect(tool.execute({ action: 'type', text: 'x' }, {} as never)).rejects.toThrow('agent context')
  })

  it('desktop_keyboard type without text throws', async () => {
    const { ctx } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_keyboard')!
    await expect(tool.execute({ action: 'type' }, exec(makeAgent()) as never)).rejects.toThrow('requires text')
  })

  it('desktop_keyboard key_combo without key throws', async () => {
    const { ctx } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_keyboard')!
    await expect(tool.execute({ action: 'key_combo' }, exec(makeAgent()) as never)).rejects.toThrow('requires key')
  })

  it('desktop_keyboard unknown action throws', async () => {
    const { ctx } = await mount(allowAll)
    const tool = ctx.tools.get('desktop_keyboard')!
    await expect(tool.execute({ action: 'paste' }, exec(makeAgent()) as never)).rejects.toThrow('unknown action')
  })

  it('gateAllow routes an allow bundle through the approval waterfall', async () => {
    // frontmost app is com.apple.Safari, matched by an allow rule. With
    // gateAllow the action still reaches ctx.approval (which fails closed here).
    const { ctx, captured } = await mount({
      policy: { rules: [{ bundleId: 'com.apple.Safari', access: 'allow' }], default: 'deny' },
      gateAllow: true,
      moveDurationMs: 40,
    })
    const tool = ctx.tools.get('desktop_keyboard')!
    const value = await tool.execute({ action: 'key_combo', key: 'return' }, exec(makeAgent()) as never)
    // No answerer is mounted, so the waterfall denies.
    expect((value as { ok: boolean }).ok).toBe(false)
    expect(captured.some(c => c.includes('CGEventCreateKeyboardEvent'))).toBe(false)
  })

  it('persistApproval builds the approver with a persistent grant cache', async () => {
    const { ctx } = await mount({ policy: { rules: [], default: 'deny' }, persistApproval: true, moveDurationMs: 40 })
    const tool = ctx.tools.get('desktop_keyboard')!
    // No answerer is mounted, so the first action is denied and nothing caches;
    // this exercises the persist-enabled approver construction path.
    const value = await tool.execute({ action: 'type', text: 'x' }, exec(makeAgent()) as never)
    expect((value as { ok: boolean }).ok).toBe(false)
  })
})
