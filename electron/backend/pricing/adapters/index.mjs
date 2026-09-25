import { deepseekOfficialAdapter } from './deepseek-official.mjs'
import { piCatalogAdapter } from './pi-catalog.mjs'

/** 官网 adapter 优先；runtime-catalog 作全量 fallback */
export const officialAdapters = [deepseekOfficialAdapter]

export const fallbackAdapters = [piCatalogAdapter]
