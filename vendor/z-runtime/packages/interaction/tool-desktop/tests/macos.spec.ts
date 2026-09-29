import { describe, expect, it } from 'vitest'
import { macosDriver } from '../src/macos.ts'

function collector(script: string): { calls: string[]; run: (s: string) => Promise<string> } {
  const calls: string[] = []
  return {
    calls,
    run: async (s: string) => {
      calls.push(s)
      return script
    },
  }
}

describe('macosDriver', () => {
  it('screenshot runs screencapture and parses display size', async () => {
    const c = collector('100,200')
    const driver = macosDriver(c.run)
    const plan = await driver.screenshot('/tmp/x.png')
    expect(c.calls[0]).toContain('screencapture -x \'/tmp/x.png\'')
    expect(c.calls[1]).toContain('CGDisplayPixelsWide')
    expect(plan.width).toBe(100)
    expect(plan.height).toBe(200)
  })

  it('screenshot shell-quotes a path with spaces and quotes', async () => {
    const c = collector('100,200')
    const driver = macosDriver(c.run)
    await driver.screenshot('/tmp/a b\'c.png')
    expect(c.calls[0]).toContain(`screencapture -x '/tmp/a b'\\''c.png'`)
  })

  it('screenshot coerces an empty size probe to zero', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    const plan = await driver.screenshot('/tmp/x.png')
    expect(plan.width).toBe(0)
    expect(plan.height).toBe(0)
  })

  it('cursorPosition parses coordinates', async () => {
    const c = collector('12.5,88.25')
    const driver = macosDriver(c.run)
    const pt = await driver.cursorPosition()
    expect(pt).toEqual({ x: 12.5, y: 88.25 })
  })

  it('cursorPosition returns null on unparseable output', async () => {
    const c = collector('not-a-coordinate')
    const driver = macosDriver(c.run)
    expect(await driver.cursorPosition()).toBeNull()
  })

  it('cursorPosition returns null when the bridge throws', async () => {
    const run = async () => { throw new Error('osascript missing') }
    const driver = macosDriver(run)
    expect(await driver.cursorPosition()).toBeNull()
  })

  it('frontmostBundleId trims the bundle id', async () => {
    const c = collector('com.apple.Safari\n')
    const driver = macosDriver(c.run)
    expect(await driver.frontmostBundleId()).toBe('com.apple.Safari')
  })

  it('frontmostBundleId returns null for an empty probe', async () => {
    const c = collector('   ')
    const driver = macosDriver(c.run)
    expect(await driver.frontmostBundleId()).toBeNull()
  })

  it('frontmostBundleId returns null when the bridge throws', async () => {
    const run = async () => { throw new Error('osascript missing') }
    const driver = macosDriver(run)
    expect(await driver.frontmostBundleId()).toBeNull()
  })

  it('mouse move posts a CGEvent mouse-moved event', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.mouse({ gesture: 'move', point: { x: 10, y: 20 } })
    expect(c.calls[0]).toContain('CGEventCreateMouseEvent')
    expect(c.calls[0]).toContain('kCGEventMouseMoved')
    expect(c.calls[0]).toContain('10')
  })

  it('mouse double_click posts two down/up pairs', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.mouse({ gesture: 'double_click', point: { x: 5, y: 6 } })
    expect(c.calls).toHaveLength(2)
    expect(c.calls[0]).toContain('kCGEventLeftMouseDown')
    expect(c.calls[0]).toContain('kCGEventLeftMouseUp')
  })

  it('scroll posts a scroll-wheel event with deltaY', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.mouse({ gesture: 'scroll', deltaY: -3 })
    expect(c.calls[0]).toContain('CGEventCreateScrollWheelEvent')
    expect(c.calls[0]).toContain('-3')
  })

  it('scroll defaults an undefined deltaY to zero', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.mouse({ gesture: 'scroll' })
    expect(c.calls[0]).toContain('CGEventCreateScrollWheelEvent')
    expect(c.calls[0]).toContain(',0)')
  })

  it('drag posts a left-mouse-dragged event', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.mouse({ gesture: 'drag', point: { x: 9, y: 10 } })
    expect(c.calls[0]).toContain('kCGEventLeftMouseDragged')
    expect(c.calls[0]).toContain('9')
  })

  it('ignores a drag without a target point', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.mouse({ gesture: 'drag' })
    expect(c.calls).toHaveLength(0)
  })

  it('keyboard type posts a unicode string event', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.keyboard({ gesture: 'type', text: 'hi' })
    expect(c.calls[0]).toContain('CGEventKeyboardSetUnicodeString')
  })

  it('keyboard type encodes quotes and backslashes as base64', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.keyboard({ gesture: 'type', text: "it's\\tricky" })
    expect(c.calls[0]).toContain('initWithBase64EncodedStringOptions')
    expect(c.calls[0]).not.toContain('it\\\'s')
    expect(c.calls[0]).toContain(Buffer.from("it's\\tricky", 'utf8').toString('base64'))
  })

  it('keyboard ignores a type with no text', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.keyboard({ gesture: 'type' })
    expect(c.calls).toHaveLength(0)
  })

  it('keyboard key_combo maps a known key to a virtual keycode', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.keyboard({ gesture: 'key_combo', key: 'return', modifiers: ['command'] })
    expect(c.calls[0]).toContain('36')
    // command modifier bit is 0x100000 = 1048576.
    expect(c.calls[0]).toContain('1048576')
  })

  it('keyboard key_combo combines every modifier flag', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.keyboard({ gesture: 'key_combo', key: 'a', modifiers: ['command', 'control', 'option', 'shift'] })
    const cmd = 0x100000
    const ctl = 0x40000
    const opt = 0x80000
    const sft = 0x20000
    expect(c.calls[0]).toContain(String(cmd + ctl + opt + sft))
  })

  it('keyboard key_combo without modifiers uses zero flags', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await driver.keyboard({ gesture: 'key_combo', key: 'return' })
    expect(c.calls[0]).toContain('flags=0;')
  })

  it('keyboard key_combo throws for an unsupported key', async () => {
    const c = collector('')
    const driver = macosDriver(c.run)
    await expect(driver.keyboard({ gesture: 'key_combo', key: 'zz-not-a-key' })).rejects.toThrow(
      'unsupported key',
    )
  })
})
