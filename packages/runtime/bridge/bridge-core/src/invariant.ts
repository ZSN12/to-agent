import type { Context } from '@taskweaver/cordis'
import type { InvariantInstaller } from '@taskweaver/dsh-invariants'

const PACKAGE_NAME = '@taskweaver/dsh-bridge-core'

export const name = 'bridge-core-invariant'
export const inject = ['invariants']

const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
