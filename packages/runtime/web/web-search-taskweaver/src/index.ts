import type { Context } from '@z/cordis'
import type {} from '@z/dsh-web'
import { TaskWeaverSearchProvider } from './provider.ts'

export { TaskWeaverSearchProvider } from './provider.ts'

export const name = 'web-search-taskweaver'
export const inject = ['web']

export function apply(ctx: Context): void {
  ctx.web.registerSearchProvider(new TaskWeaverSearchProvider())
}
