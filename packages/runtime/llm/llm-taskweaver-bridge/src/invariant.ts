import type { Context } from '@taskweaver/cordis'
import type { InvariantInstaller } from '@taskweaver/dsh-invariants'

const PACKAGE_NAME = '@taskweaver/dsh-llm-taskweaver-bridge'

export const name = 'llm-taskweaver-bridge-invariant'
export const inject = ['invariants']

const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
