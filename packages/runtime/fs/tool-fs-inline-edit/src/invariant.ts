import type { Context } from '@taskweaver/cordis'
import type { InvariantInstaller } from '@taskweaver/dsh-invariants'
export const name = 'tool-fs-inline-edit-invariant'
export const inject = ['invariants']
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register('@taskweaver/dsh-tool-fs-inline-edit', install))
