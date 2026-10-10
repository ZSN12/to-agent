import { describe, expect, it, vi } from 'vitest'
import { MacNativeUiFallback } from '../src/native/macos.ts'

describe('macOS native fallback boundary', () => {
  it.skipIf(process.platform !== 'darwin')('invokes osascript with argv and includes the JXA language flag', async () => {
    const run = vi.fn(async (_file: string, _args: readonly string[]) => JSON.stringify({ accessibility: true, screenRecording: true }))
    const native = new MacNativeUiFallback(42, run)
    await native.permissions()
    expect(run).toHaveBeenCalledWith('/usr/bin/osascript', expect.arrayContaining(['-l', 'JavaScript', '-e']))
    expect(run.mock.calls[0]?.[1].join(' ')).not.toContain('sh -c')
  })

  it.skipIf(process.platform !== 'darwin')('captures only the identified process window using argv', async () => {
    const run = vi.fn(async (file: string, args: readonly string[]) => {
      if (file === '/usr/bin/osascript' && args.at(-1)?.includes('CGWindowListCopyWindowInfo')) {
        return JSON.stringify({ id: 93, x: 10, y: 20, width: 800, height: 600 })
      }
      return ''
    })
    const native = new MacNativeUiFallback(42, run)
    await native.screenshot('/tmp/tw-native.png')

    expect(run).toHaveBeenCalledWith('/usr/sbin/screencapture', ['-x', '-l', '93', '/tmp/tw-native.png.retina.png'])
    expect(run).toHaveBeenCalledWith('/usr/bin/sips', ['-z', '600', '800', '/tmp/tw-native.png.retina.png', '--out', '/tmp/tw-native.png'])
  })

  it.skipIf(process.platform !== 'darwin')('guards native fills to the current process and chunks Unicode text', async () => {
    const run = vi.fn(async (_file: string, _args: readonly string[]) => '')
    const native = new MacNativeUiFallback(42, run)
    await native.fill({ x: 20, y: 30 }, '按钮 ✅')

    const expressions = run.mock.calls.map(([, args]) => args.at(-1) ?? '')
    expect(expressions).toHaveLength(4)
    expect(expressions.every(expression => expression.includes('frontmostApplication.processIdentifier'))).toBe(true)
    expect(expressions[1]).toContain('code=0')
    expect(expressions[1]).toContain('flags=1048576')
    expect(expressions[2]).toContain('code=51')
    expect(expressions[3]).toContain('CGEventKeyboardSetUnicodeString')
  })

  it('refuses to target an invalid process id', () => {
    expect(() => new MacNativeUiFallback(0, vi.fn())).toThrow(/process id/)
  })

  it.skipIf(process.platform === 'darwin')('reports unavailable permissions off macOS', async () => {
    const run = vi.fn(async () => '')
    await expect(new MacNativeUiFallback(42, run).permissions()).resolves.toEqual({
      accessibility: false,
      screenRecording: false,
    })
    expect(run).not.toHaveBeenCalled()
  })
})
