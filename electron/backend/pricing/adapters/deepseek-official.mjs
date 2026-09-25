import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_URL = 'https://api-docs.deepseek.com/quick_start/pricing'
const MAPPING_PATH = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..'),
  'pricing',
  'adapters',
  'deepseek.mapping.json',
)

/** @typedef {import('../types.mjs').PriceEntry} PriceEntry */

function loadMapping() {
  return JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'))
}

function parseUsd(cell) {
  const m = String(cell).match(/\$([0-9.]+)/)
  return m ? Number(m[1]) : null
}

/**
 * 解析 DeepSeek 官方定价页 HTML 表格（peak 用 OFF-PEAK 价，偏保守估算）。
 * @param {string} html
 */
export function parseDeepseekPricingHtml(html) {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0]
  if (!table) throw new Error('DeepSeek 定价页未找到 table')

  const inputMissOff = table.match(
    /CACHE MISS[\s\S]*?OFF-PEAK<\/td><td>\$([0-9.]+)<\/td><td>\$([0-9.]+)<\/td>/i,
  )
  const inputHitOff = table.match(
    /CACHE HIT[\s\S]*?OFF-PEAK<\/td><td>\$([0-9.]+)<\/td><td>\$([0-9.]+)<\/td>/i,
  )
  const outputOff = table.match(
    /1M OUTPUT TOKENS[\s\S]*?OFF-PEAK<\/td><td>\$([0-9.]+)<\/td><td>\$([0-9.]+)<\/td>/i,
  )
  if (!inputMissOff || !outputOff) {
    throw new Error('DeepSeek 定价表结构已变化，无法解析 INPUT/OUTPUT')
  }

  const flash = {
    input: Number(inputMissOff[1]),
    output: Number(outputOff[1]),
    cacheRead: inputHitOff ? Number(inputHitOff[1]) : null,
  }
  const pro = {
    input: Number(inputMissOff[2]),
    output: Number(outputOff[2]),
    cacheRead: inputHitOff ? Number(inputHitOff[2]) : null,
  }
  return { flash, pro }
}

function toEntry({ input, output, cacheRead }) {
  return {
    input_per_million: input,
    output_per_million: output,
    cache_read_per_million: cacheRead,
    cache_write_per_million: null,
    currency: 'USD',
    source: 'adapter:deepseek-official',
    source_url: SOURCE_URL,
    confidence: 'high',
  }
}

/**
 * @param {{ fetchHtml?: () => Promise<string>, fixturePath?: string }} [options]
 * @returns {Promise<Record<string, PriceEntry>>}
 */
export async function fetchDeepseekOfficialPrices(options = {}) {
  const mapping = loadMapping()
  let html
  if (options.fixturePath) {
    html = fs.readFileSync(options.fixturePath, 'utf8')
  } else if (options.fetchHtml) {
    html = await options.fetchHtml()
  } else {
    const res = await fetch(SOURCE_URL, {
      headers: { 'user-agent': 'TaskWeaver-pricing-sync/1.0' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`DeepSeek 定价页 HTTP ${res.status}`)
    html = await res.text()
  }

  const { flash, pro } = parseDeepseekPricingHtml(html)
  const models = {}
  models[mapping.columns.flash] = toEntry(flash)
  models[mapping.columns.pro] = toEntry(pro)
  for (const [legacyKey, targetKey] of Object.entries(mapping.legacy_aliases ?? {})) {
    if (models[targetKey]) models[legacyKey] = { ...models[targetKey], note: `alias-of:${targetKey}` }
  }
  return models
}

export const deepseekOfficialAdapter = {
  id: 'deepseek-official',
  officialUrls: [SOURCE_URL],
  fetchPrices: fetchDeepseekOfficialPrices,
}
