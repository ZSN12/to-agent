import { describe, expect, it, vi } from 'vitest'
import { MacNativeUiFallback } from '../src/native/macos.ts'

describe('macOS native fallback boundary', () => {
  it('invokes osascript with argv and includes the JXA language flag', async () => {
    const run = vi.fn(async (_file: string, _args: readonly string[]) => JSON.stringify({ accessibility: true, screenRecording: true }))
    const native = new MacNativeUiFallback(42, run)
    await native.permissions()
    expect(run).toHaveBeenCalledWith('/usr/bin/osascript', expect.arrayContaining(['-l', 'JavaScript', '-e']))
    expect(run.mock.calls[0]?.[1].join(' ')).not.toContain('sh -c')
  })

  it('refuses to target an invalid process id', () => {
    expect(() => new MacNativeUiFallback(0, vi.fn())).toThrow(/process id/)
  })
})
