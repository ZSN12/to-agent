import type { Context } from '@taskweaver/cordis'
import type {} from '@taskweaver/dsh-web'
import { TaskWeaverSearchProvider } from './provider.ts'

export { TaskWeaverSearchProvider } from './provider.ts'

export const name = 'web-search-taskweaver'
export const inject = ['web']

export function apply(ctx: Context): void {
  ctx.web.registerSearchProvider(new TaskWeaverSearchProvider())
}
