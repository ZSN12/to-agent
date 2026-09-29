import { describe, expect, it } from 'vitest'
import { Context } from '@z/cordis'
import InvariantRegistry from '@z/dsh-invariants'
import * as UserIdInvariant from '@z/dsh-anonymous-user-id/invariant'

describe('invariant companion', () => {
  it('registers the package ownership with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(UserIdInvariant).await()).resolves.toBeDefined()
  })
})
