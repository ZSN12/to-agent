import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_REGISTRY_PATH = path.join(REPO_ROOT, 'pricing', 'registry.json')
const STALE_AFTER_MS = 48 * 60 * 60 * 1000

export function resolveRegistryPath(customPath) {
  return customPath || DEFAULT_REGISTRY_PATH
}

export function loadPriceRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  if (!fs.existsSync(registryPath)) {
    return { version: 1, synced_at: null, models: {} }
  }
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf8'))
  } catch {
    return { version: 1, synced_at: null, models: {} }
  }
}

function staleDays(syncedAt) {
  if (!syncedAt) return null
  const ts = Date.parse(syncedAt)
  if (Number.isNaN(ts)) return null
  return Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)))
}

export function registryPriceMeta(registry) {
  const syncedAt = registry?.synced_at ?? null
  const days = staleDays(syncedAt)
  return {
    synced_at: syncedAt,
    stale_days: days,
    stale: days != null && days * 24 * 60 * 60 * 1000 > STALE_AFTER_MS,
    source: 'taskweaver-registry',
  }
}

export function mergeRegistryCost(modelKey, piCost, registry) {
  const entry = registry?.models?.[modelKey]
  if (!entry) {
    return { cost: piCost, priceMeta: null }
  }
  const cost = {
    input: entry.input_per_million ?? piCost.input,
    output: entry.output_per_million ?? piCost.output,
    cacheRead: entry.cache_read_per_million ?? piCost.cacheRead,
    cacheWrite: entry.cache_write_per_million ?? piCost.cacheWrite,
  }
  const meta = {
    ...registryPriceMeta(registry),
    confidence: entry.confidence ?? 'high',
    currency: entry.currency ?? 'USD',
    adapter: entry.source ?? null,
  }
  return { cost, priceMeta: meta }
}
