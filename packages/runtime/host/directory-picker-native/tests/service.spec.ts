/** Registration/capability behavior of the native backend (the seam's cordis half). */

import { describe, expect, it } from 'vitest'
import { Context } from '@taskweaver/cordis'
import NativeDirectoryPicker from '../src/index.ts'

describe('NativeDirectoryPicker', () => {
  it('registers the native picker service and leaves with its fiber', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(NativeDirectoryPicker)
    await fiber.await()
    const picker = ctx.get('directoryPicker')
    expect(picker).toBeInstanceOf(NativeDirectoryPicker)
    expect(picker!.pick).toBeTypeOf('function')
    await fiber.dispose()
    expect(ctx.get('directoryPicker')).toBeUndefined()
  })
})
