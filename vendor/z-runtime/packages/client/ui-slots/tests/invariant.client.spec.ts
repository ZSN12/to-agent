import { describe, expect, it } from 'vitest'
import { Context } from '@z/cordis'
import * as SlotsInvariant from '@z/dsh-client-ui-slots/invariant'
import InvariantRegistry from '@z/dsh-invariants'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(SlotsInvariant).await()).resolves.toBeDefined()
  })
})
