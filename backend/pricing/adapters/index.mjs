import { deepseekOfficialAdapter } from './deepseek-official.mjs'
import { dshCatalogAdapter } from './dsh-catalog.mjs'

/** 官网 adapter 优先；DSH 运行时目录作 fallback */
export const officialAdapters = [deepseekOfficialAdapter]

export const fallbackAdapters = [dshCatalogAdapter]
