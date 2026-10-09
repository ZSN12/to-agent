import type { Context } from '@z/cordis'
import type { InvariantInstaller } from '@z/dsh-invariants'
export const name = 'tool-fs-semantic-search-invariant'
export const inject = ['invariants']
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register('@z/dsh-tool-fs-semantic-search', install))
