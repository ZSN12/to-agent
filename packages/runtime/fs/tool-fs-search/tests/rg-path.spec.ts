/**
 * Failure-path tests for the lazy packaged-ripgrep resolution. The success
 * path (the real `@vscode/ripgrep` module) is exercised throughout
 * tools.spec.ts; here the module is mocked to throw at evaluation, proving a
 * missing or corrupt platform package (`--omit=optional`, partial install)
 * surfaces as a per-call `SEARCH_FAILED` — not a composition-load failure.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@z/cordis'
import { CallId } from '@z/dsh-llm'
import type { ToolExecution } from '@z/dsh-tools'
import { resolveRgPath, runRipgrep } from '@z/dsh-tool-fs-search'

// Any access throws a fresh error — a missing platform package should be
// reported per call, without caching the rejected resolution promise.
vi.mock('@vscode/ripgrep', () => new Proxy({}, {
  get() {
    throw new Error('platform package @vscode/ripgrep-win32-x64 is not installed')
  },
}))

describe('lazy packaged-ripgrep resolution', () => {
  it('surfaces failures per call without memoizing the rejected promise', async () => {
    const firstFailure = await resolveRgPath().catch((error: unknown) => error)
    const secondFailure = await resolveRgPath().catch((error: unknown) => error)
    expect(firstFailure).toBeInstanceOf(Error)
    expect(secondFailure).toBeInstanceOf(Error)
    expect(secondFailure).not.toBe(firstFailure)

    const controller = new AbortController()
    const exec = { signal: controller.signal, name: 'glob', callId: CallId('missing-platform-package') } as unknown as ToolExecution

    await expect(runRipgrep(new Context(), exec, 'glob', ['--files'], 1_000_000, 3_000, 64 * 1024))
      .rejects.toMatchObject({ name: 'SearchError', code: 'SEARCH_FAILED' })
  })

  it('keeps failing every subsequent call (the resolution is memoized)', async () => {
    await expect(resolveRgPath()).rejects.toThrow(/platform package/)
    await expect(resolveRgPath()).rejects.toThrow(/platform package/)
  })
})
