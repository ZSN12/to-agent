import fs from 'node:fs'
import path from 'node:path'
import { loadPriceRegistry, registryPriceMeta } from './price-registry.mjs'
import { runPricingSync } from './pricing/run-sync.mjs'

const SYNC_INTERVAL_MS = 48 * 60 * 60 * 1000
const STALE_MS = 48 * 60 * 60 * 1000

/**
 * @param {{ userDataPath: string, bundledRegistryPath: string, onStatus?: (status: object) => void }} options
 */
export function createPricingSyncService({ userDataPath, bundledRegistryPath, onStatus }) {
  const userRegistryPath = path.join(userDataPath, 'taskweaver', 'pricing-registry.json')
  let timer = null
  let lastResult = null

  function resolveReadPath() {
    if (fs.existsSync(userRegistryPath)) return userRegistryPath
    return bundledRegistryPath
  }

  function getStatus() {
    const registry = loadPriceRegistry(resolveReadPath())
    const meta = registryPriceMeta(registry)
    return {
      registryPath: resolveReadPath(),
      synced_at: meta.synced_at,
      stale_days: meta.stale_days,
      stale: meta.stale,
      model_count: Object.keys(registry.models ?? {}).length,
      last_run: registry.last_run ?? lastResult ?? null,
    }
  }

  async function syncNow({ dryRun = false } = {}) {
    const result = await runPricingSync({
      registryPath: userRegistryPath,
      dryRun,
      allowNetwork: true,
    })
    if (!dryRun) {
      lastResult = { ...result, at: new Date().toISOString() }
      onStatus?.(getStatus())
    }
    return result
  }

  function shouldSyncOnStart() {
    const registry = loadPriceRegistry(resolveReadPath())
    const syncedAt = registry?.synced_at
    if (!syncedAt) return true
    const ts = Date.parse(syncedAt)
    if (Number.isNaN(ts)) return true
    return Date.now() - ts > STALE_MS
  }

  function start() {
    if (!fs.existsSync(path.dirname(userRegistryPath))) {
      fs.mkdirSync(path.dirname(userRegistryPath), { recursive: true })
    }
    if (!fs.existsSync(userRegistryPath) && fs.existsSync(bundledRegistryPath)) {
      fs.copyFileSync(bundledRegistryPath, userRegistryPath)
    }
    if (shouldSyncOnStart()) {
      void syncNow().catch((error) => {
        console.warn('[pricing-sync] startup sync failed:', error?.message ?? error)
      })
    }
    if (timer) return
    timer = setInterval(() => {
      void syncNow().catch((error) => {
        console.warn('[pricing-sync] scheduled sync failed:', error?.message ?? error)
      })
    }, SYNC_INTERVAL_MS)
    if (typeof timer.unref === 'function') timer.unref()
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }

  return {
    userRegistryPath,
    resolveReadPath,
    getStatus,
    syncNow,
    start,
    stop,
  }
}
