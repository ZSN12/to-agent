import type { Context } from '@z/cordis'
import z from '@z/schemastery'
import type {} from '@z/dsh-web'
import { TaskWeaverSearchProvider } from './provider.ts'

export { TaskWeaverSearchProvider } from './provider.ts'

export const name = 'web-search-taskweaver'
export const inject = ['web']

export interface Config {
  configPathEnv?: string
}

export const Config: z<Config> = z.object({
  configPathEnv: z.string().default('TASKWEAVER_WEB_SEARCH_CONFIG_PATH'),
})

export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new TaskWeaverSearchProvider(config.configPathEnv))
}
