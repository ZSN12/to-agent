import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { createDesktopService } from '../src/desktop.ts'
import type { Approver } from '../src/desktop.ts'
import type { DesktopDriver } from '../src/macos.ts'
import type { MouseActionPlan, KeyboardActionPlan } from '../src/types.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createApprover } from '../src/approval.ts'
import type { ApprovalDispatcher } from '../src/approval.ts'

const appendMock = vi.fn<(type: string, data: Record<string, unknown>) => unknown>()
const agent = {
  session: { append: appendMock },
} as unknown as Agent

beforeEach(() => {
  appendMock.mockClear()
})

type MockDriver = DesktopDriver & {
  mouse: Mock<(plan: MouseActionPlan) => Promise<void>>
  keyboard: Mock<(plan: KeyboardActionPlan) => Promise<void>>
}

function mockDriver(over: Partial<DesktopDriver> = {}): MockDriver {
  const mouse = vi.fn(async (_plan: MouseActionPlan): Promise<void> => {})
  const keyboard = vi.fn(async (_plan: KeyboardActionPlan): Promise<void> => {})
  return {
    screenshot: vi.fn(async (path: string) => ({ path, width: 1920, height: 1080 })),
    cursorPosition: vi.fn(async () => ({ x: 0, y: 0 })),
    frontmostBundleId: vi.fn(async () => 'com.apple.Safari'),
    mouse,
    keyboard,
    ...over,
  } as MockDriver
}

function gate(allowed: boolean): Approver {
  return async (_agent, bundleId, action) => {
    void bundleId
    void action
    return allowed ? { ok: true } : { ok: false, reason: 'denied' }
  }
}

describe('createDesktopService', () => {
  it('moves the cursor through a humanized path', async () => {
    const driver = mockDriver()
    const service = createDesktopService(driver, gate(true), agent, 200, 7)
    const out = await service.move({ x: 100, y: 100 })
    expect(out.kind).toBe('ok')
    // A 200ms move yields ~20 steps.
    expect(driver.mouse.mock.calls.length).toBeGreaterThanOrEqual(20)
    expect((driver.mouse.mock.calls[0]![0] as { gesture: string }).gesture).toBe('move')
    expect(appendMock).toHaveBeenCalledWith('desktop/action', expect.objectContaining({ outcome: 'applied' }))
  })

  it('denies a move and audits it when the gate denies', async () => {
    const driver = mockDriver()
    const service = createDesktopService(driver, gate(false), agent, 200, 7)
    const out = await service.move({ x: 100, y: 100 })
    expect(out.kind).toBe('denied')
    expect(driver.mouse).not.toHaveBeenCalled()
    expect(appendMock).toHaveBeenCalledWith('desktop/action', expect.objectContaining({ outcome: 'denied' }))
  })

  it('denies click, scroll, type, and key_combo and audits each', async () => {
    const driver = mockDriver()
    const service = createDesktopService(driver, gate(false), agent, 50, 1)
    expect((await service.click({ x: 1, y: 2 })).kind).toBe('denied')
    expect((await service.scroll(1)).kind).toBe('denied')
    expect((await service.type('x')).kind).toBe('denied')
    expect((await service.keyCombo('c')).kind).toBe('denied')
    const kinds = appendMock.mock.calls
      .map(c => (c[1] as { kind: string }).kind)
      .filter(k => k !== 'move')
    expect(kinds.sort()).toEqual(['click', 'key_combo', 'scroll', 'type'])
  })

  it('denies a screenshot and audits it when the gate denies', async () => {
    const driver = mockDriver()
    const service = createDesktopService(driver, gate(false), agent, 50, 1)
    await expect(service.screenshot('/tmp/x.png')).rejects.toThrow('denied')
    expect(appendMock).toHaveBeenCalledWith('desktop/action', expect.objectContaining({ kind: 'screenshot', outcome: 'denied' }))
  })

  it('omits bundleId from the audit when no frontmost app exists', async () => {
    const driver = mockDriver({ frontmostBundleId: vi.fn(async () => null) })
    const service = createDesktopService(driver, gate(false), agent, 50, 1)
    await service.move({ x: 1, y: 2 })
    expect(appendMock).toHaveBeenCalledWith(
      'desktop/action',
      expect.objectContaining({ kind: 'move', outcome: 'denied' }),
    )
    const event = appendMock.mock.calls[0]![1] as { kind: string; outcome: string }
    expect('bundleId' in event).toBe(false)
  })

  it('falls back to a single-step move when the cursor position is unknown', async () => {
    const driver = mockDriver({ cursorPosition: vi.fn(async () => null) })
    const service = createDesktopService(driver, gate(true), agent, 50, 1)
    const out = await service.move({ x: 40, y: 50 })
    expect(out.kind).toBe('ok')
    // Only the direct target point is posted.
    expect(driver.mouse).toHaveBeenCalledTimes(1)
    expect(driver.mouse.mock.calls[0]![0]).toEqual({ gesture: 'move', point: { x: 40, y: 50 } })
  })

  it('clicks at a point (single and double)', async () => {
    const driver = mockDriver()
    const service = createDesktopService(driver, gate(true), agent, 50, 1)
    await service.click({ x: 50, y: 60 })
    await service.click({ x: 70, y: 80 }, true)
    const gestures = driver.mouse.mock.calls.map(c => (c[0] as { gesture: string }).gesture)
    expect(gestures).toContain('click')
    expect(gestures).toContain('double_click')
  })

  it('scrolls by deltaY', async () => {
    const driver = mockDriver()
    const service = createDesktopService(driver, gate(true), agent, 50, 1)
    const out = await service.scroll(-3)
    expect(out.kind).toBe('ok')
    expect(driver.mouse).toHaveBeenCalledWith({ gesture: 'scroll', deltaY: -3 })
  })

  it('types text and sends key combos', async () => {
    const driver = mockDriver()
    const service = createDesktopService(driver, gate(true), agent, 50, 1)
    await service.type('hello')
    await service.keyCombo('c', ['command'])
    expect(driver.keyboard).toHaveBeenCalledWith({ gesture: 'type', text: 'hello' })
    expect(driver.keyboard).toHaveBeenCalledWith({ gesture: 'key_combo', key: 'c', modifiers: ['command'] })
  })

  it('threads the real approver through policy + approval', async () => {
    const driver = mockDriver()
    const disp = { async request() { return 'allowed-once' as const } } as unknown as ApprovalDispatcher
    const approve = createApprover({ policy: { rules: [], default: 'deny' }, approval: disp })
    const service = createDesktopService(driver, approve, agent, 50, 1)
    const out = await service.scroll(1)
    expect(out.kind).toBe('ok')
  })

  it('exposes the cursor position and frontmost bundle id', async () => {
    const driver = mockDriver()
    const service = createDesktopService(driver, gate(true), agent, 50, 1)
    expect(await service.cursorPosition()).toEqual({ x: 0, y: 0 })
    expect(await service.frontmostBundleId()).toBe('com.apple.Safari')
  })
})
