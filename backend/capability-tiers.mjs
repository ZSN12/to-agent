import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CAPABILITY_TIERS = Object.freeze(['strong', 'medium', 'weak'])
export const CAPABILITY_TIER_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
export const CAPABILITY_TIER_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
export const CAPABILITY_TIER_FETCH_TIMEOUT_MS = 5_000

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DEFAULT_BUNDLED_SNAPSHOT_PATH = path.join(PROJECT_ROOT, 'pricing', 'capability-tiers.json')
const DEFAULT_ALIASES_PATH = path.join(PROJECT_ROOT, 'pricing', 'model-aliases.json')
const DEFAULT_SNAPSHOT_URL = 'https://raw.githubusercontent.com/ZSN12/to-agent/main/pricing/capability-tiers.json'
const TIER_RANK = Object.freeze({ weak: 0, medium: 1, strong: 2 })

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function readCapabilityTierOverride(value) {
  return value === 'strong' || value === 'medium' || value === 'weak' ? value : null
}

export function canonicalModelIdFromRoute(routeKey, aliases = {}) {
  if (typeof routeKey !== 'string') return ''
  const routeAliases = isRecord(aliases.routeAliases) ? aliases.routeAliases : {}
  const explicitAlias = routeAliases[routeKey]
  if (typeof explicitAlias === 'string' && explicitAlias.includes('/')) {
    return explicitAlias.trim().toLowerCase()
  }
  const slash = routeKey.indexOf('/')
  if (slash <= 0 || slash === routeKey.length - 1) return routeKey.trim().toLowerCase()
  const provider = routeKey.slice(0, slash).trim().toLowerCase()
  const modelId = routeKey.slice(slash + 1).trim().toLowerCase()
  const providerAliases = isRecord(aliases.providerAliases) ? aliases.providerAliases : {}
  const normalizedProvider = providerAliases[provider]

  if (normalizedProvider === 'nested') {
    const nestedSlash = modelId.indexOf('/')
    return nestedSlash > 0
      ? `${modelId.slice(0, nestedSlash)}/${modelId.slice(nestedSlash + 1)}`
      : `${provider}/${modelId}`
  }

  if (normalizedProvider === 'bedrock') {
    const parts = modelId.split('.').filter(Boolean)
    while (parts.length > 2 && /^(?:apac|us|eu|au|jp|global|us-gov)$/i.test(parts[0])) parts.shift()
    if (parts.length > 1) return `${parts.shift()}/${parts.join('.')}`
    return `${provider}/${modelId}`
  }

  return `${normalizedProvider || provider}/${modelId}`
}

export function validateCapabilityTierSnapshot(snapshot) {
  if (!isRecord(snapshot) || snapshot.schemaVersion !== 1 || typeof snapshot.thresholdsVersion !== 'string') {
    throw new Error('能力档位快照格式无效')
  }
  if (!isRecord(snapshot.models)) throw new Error('能力档位快照缺少 models')
  for (const [canonicalId, model] of Object.entries(snapshot.models)) {
    if (!canonicalId || !isRecord(model)) throw new Error('能力档位快照包含无效模型记录')
    if (model.canonicalId !== canonicalId) throw new Error(`能力档位 canonicalId 不匹配：${canonicalId}`)
    if (!CAPABILITY_TIERS.includes(model.tier)) throw new Error(`能力档位无效：${canonicalId}`)
    if (model.status !== 'rated' && model.status !== 'single-board' && model.status !== 'unrated') {
      throw new Error(`能力档位状态无效：${canonicalId}`)
    }
    if (typeof model.fetchedAt !== 'string' || !model.fetchedAt) {
      throw new Error(`能力档位缺少 fetchedAt：${canonicalId}`)
    }
  }
  return snapshot
}

function dateValue(value) {
  const timestamp = Date.parse(value ?? '')
  return Number.isFinite(timestamp) ? timestamp : null
}

function isStale(snapshot, now) {
  const capturedAt = dateValue(snapshot?.fetchedAt) ?? dateValue(snapshot?.generatedAt)
  return capturedAt === null || now - capturedAt > CAPABILITY_TIER_STALE_AFTER_MS
}

function tierChanges(previous, next) {
  if (!previous || !next) return []
  const changes = []
  for (const canonicalId of Object.keys(next.models ?? {}).sort()) {
    const before = previous.models?.[canonicalId]
    const after = next.models[canonicalId]
    if (!before || !after || before.tier === after.tier) continue
    changes.push({ canonicalId, before: before.tier, after: after.tier })
  }
  return changes
}

function normalizedRemoteUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * Loads the current snapshot cache first, then the bundled snapshot. Refreshes
 * are single-flight, seven-day throttled, time-bounded and never required for
 * the caller to read a tier.
 */
export function createCapabilityTierService({
  userDataPath,
  bundledSnapshotPath = DEFAULT_BUNDLED_SNAPSHOT_PATH,
  aliasesPath = DEFAULT_ALIASES_PATH,
  snapshotUrl = process.env.TASKWEAVER_CAPABILITY_TIERS_URL || DEFAULT_SNAPSHOT_URL,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  refreshIntervalMs = CAPABILITY_TIER_REFRESH_INTERVAL_MS,
  timeoutMs = CAPABILITY_TIER_FETCH_TIMEOUT_MS,
} = {}) {
  const cachePath = userDataPath
    ? path.join(userDataPath, 'taskweaver', 'capability-tiers-cache.json')
    : null
  const remoteUrl = normalizedRemoteUrl(snapshotUrl)
  let aliasesPromise = null
  let refreshInFlight = null
  let lastAttemptAt = null
  let lastChanges = []
  let memorySnapshot = null

  async function readJson(filePath) {
    if (!filePath) return null
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8'))
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn(`读取能力档位数据失败（${path.basename(filePath)}）:`, error instanceof Error ? error.message : error)
      }
      return null
    }
  }

  async function loadAliases() {
    if (!aliasesPromise) {
      aliasesPromise = readJson(aliasesPath).then((value) => isRecord(value) ? value : {})
    }
    return aliasesPromise
  }

  async function getState() {
    const cachedValue = await readJson(cachePath)
    const bundledValue = await readJson(bundledSnapshotPath)
    let snapshot = null
    let source = 'bundled'
    try {
      if (cachedValue) {
        snapshot = validateCapabilityTierSnapshot(cachedValue)
        source = 'cache'
      }
    } catch (error) {
      console.warn('忽略无效的缓存能力档位快照:', error instanceof Error ? error.message : error)
    }
    if (!snapshot && memorySnapshot) {
      try {
        snapshot = validateCapabilityTierSnapshot(memorySnapshot)
        source = cachePath ? 'cache' : 'remote'
      } catch {
        memorySnapshot = null
      }
    }
    if (!snapshot && bundledValue) {
      try {
        snapshot = validateCapabilityTierSnapshot(bundledValue)
        source = 'bundled'
      } catch (error) {
        console.warn('忽略无效的打包能力档位快照:', error instanceof Error ? error.message : error)
      }
    }
    return {
      snapshot,
      source: snapshot ? source : 'unavailable',
      stale: snapshot ? isStale(snapshot, now()) : true,
      changes: lastChanges,
      fetchedAt: snapshot?.fetchedAt ?? null,
      thresholdsVersion: snapshot?.thresholdsVersion ?? null,
    }
  }

  async function writeCache(snapshot) {
    if (!cachePath) return
    await fs.mkdir(path.dirname(cachePath), { recursive: true })
    const temporaryPath = `${cachePath}.${process.pid}.tmp`
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
      await fs.rename(temporaryPath, cachePath)
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => {})
    }
  }

  async function refresh({ force = false } = {}) {
    if (refreshInFlight) return refreshInFlight
    const pending = (async () => {
      const current = await getState()
      const currentAt = now()
      const cacheAge = current.snapshot
        ? currentAt - (dateValue(current.snapshot.fetchedAt) ?? dateValue(current.snapshot.generatedAt) ?? 0)
        : Number.POSITIVE_INFINITY
      if (!force && lastAttemptAt !== null && currentAt - lastAttemptAt < refreshIntervalMs) return current
      if (!force && cacheAge < refreshIntervalMs) return current
      lastAttemptAt = currentAt
      if (!remoteUrl || typeof fetchImpl !== 'function') return { ...current, error: '未配置能力档位快照更新源' }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      timeout.unref?.()
      try {
        const response = await fetchImpl(remoteUrl, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response?.ok) throw new Error(`HTTP ${response?.status ?? '请求失败'}`)
        const snapshot = validateCapabilityTierSnapshot(await response.json())
        const previous = current.snapshot
        const changes = tierChanges(previous, snapshot)
        await writeCache(snapshot)
        memorySnapshot = snapshot
        lastChanges = changes
        return {
          snapshot,
          source: cachePath ? 'cache' : 'remote',
          stale: isStale(snapshot, now()),
          changes,
          fetchedAt: snapshot.fetchedAt ?? null,
          thresholdsVersion: snapshot.thresholdsVersion,
          updated: JSON.stringify(previous) !== JSON.stringify(snapshot),
        }
      } catch (error) {
        return {
          ...current,
          error: error instanceof Error ? error.message : String(error),
        }
      } finally {
        clearTimeout(timeout)
      }
    })().finally(() => {
      if (refreshInFlight === pending) refreshInFlight = null
    })
    refreshInFlight = pending
    return pending
  }

  async function getAliases() {
    return loadAliases()
  }

  return {
    cachePath,
    getState,
    getAliases,
    refresh,
    canonicalModelId(routeKey) {
      // The app's alias file is read once and reused by model serializers.
      return loadAliases().then((aliases) => canonicalModelIdFromRoute(routeKey, aliases))
    },
  }
}

export function resolveCapabilityTier(snapshot, routeKey, aliases, override = null) {
  const canonicalId = canonicalModelIdFromRoute(routeKey, aliases)
  const snapshotEntry = snapshot?.models?.[canonicalId]
  const validOverride = readCapabilityTierOverride(override)
  const record = snapshotEntry ?? {
    canonicalId,
    tier: 'medium',
    status: 'unrated',
    board: null,
    rating: null,
    matchedName: null,
    votes: null,
    publishDate: null,
    thresholdsVersion: snapshot?.thresholdsVersion ?? null,
    boards: {},
  }
  return {
    ...record,
    canonicalId,
    defaultTier: record.tier,
    tier: validOverride ?? record.tier,
    source: validOverride ? 'user' : (record.status === 'unrated' ? 'unrated' : 'lmarena'),
    overridden: Boolean(validOverride),
  }
}

export function capabilityTierSnapshotIsStale(snapshot, now = Date.now()) {
  return isStale(snapshot, now)
}
