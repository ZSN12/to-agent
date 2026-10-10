/** Contract behavior the seam itself owns: registration identity and typed failures. */

import { describe, expect, it } from 'vitest'
import { Context } from '@taskweaver/cordis'
import { DirectoryPicker } from '../src/index.ts'

/** Minimal concrete backend: all a subclass owes the abstract class is `pick()`. */
class StubPicker extends DirectoryPicker {
  pick(): Promise<string | null> {
    return Promise.resolve(null)
  }
}

describe('DirectoryPicker seam', () => {
  it('registers a subclass as ctx.directoryPicker and leaves with its fiber', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(StubPicker)
    await fiber.await()
    expect(ctx.get('directoryPicker')).toBeInstanceOf(StubPicker)
    await expect(ctx.get('directoryPicker')!.pick(new AbortController().signal)).resolves.toBeNull()
    await fiber.dispose()
    expect(ctx.get('directoryPicker')).toBeUndefined()
  })
})
