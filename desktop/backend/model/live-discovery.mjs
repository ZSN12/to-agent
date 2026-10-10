import {
  discoverModelsFromProviderApi,
  resolveProviderLiveDiscoveryConfig,
} from '../provider-live-discovery.mjs'
import { resolveRuntimeHome } from '../dsh-pi-ai-credentials.mjs'
import { dshValue, providerSettings, shouldLiveDiscoverProvider } from './shared.mjs'

const DEFAULT_DISCOVERY_TIMEOUT_MS = 3_000
const DEFAULT_DISCOVERY_CACHE_TTL_MS = 6 * 60 * 60 * 1_000

/** 按需调用提供方模型列表；常规目录读取不触发网络发现。 */
export function createModelLiveDiscovery({
  userDataPath,
  dshRuntimeRoot,
  serializeDshModel,
  isProviderCredentialConfigured,
  now = Date.now,
  discoveryTimeoutMs = DEFAULT_DISCOVERY_TIMEOUT_MS,
  cacheTtlMs = DEFAULT_DISCOVERY_CACHE_TTL_MS,
}) {
  const cache = new Map()
  const inFlight = new Map()

  async function discoverProvider(directory, providerRow, { force = false, signal } = {}) {
    const settings = providerSettings(directory, providerRow)
    const config = resolveProviderLiveDiscoveryConfig(dshRuntimeRoot, providerRow, settings)
    if (!config) return []

    const cacheKey = `${config.provider}\u0000${config.baseURL}\u0000${config.api}`
    const cached = cache.get(cacheKey)
    if (!force && cached && cached.expiresAt > now()) return cached.models.map((row) => ({ ...row }))
    if (!force && inFlight.has(cacheKey)) return inFlight.get(cacheKey)

    const pending = (async () => {
      const requestSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(discoveryTimeoutMs)])
        : AbortSignal.timeout(discoveryTimeoutMs)
      let mayDiscover = providerRow.active
      if (!mayDiscover) {
        try {
          mayDiscover = await isProviderCredentialConfigured(directory, providerRow)
        } catch {
          mayDiscover = false
        }
      }
      if (!mayDiscover) return []

      const ref = typeof settings.value?.apiKeyEnv === 'string' ? settings.value.apiKeyEnv.trim() : ''
      if (!ref) return []
      const response = dshValue(
        await directory.api.credentials.describe({ refs: [ref] }, requestSignal),
        '读取 DSH 凭据状态',
      )
      const credentials = response.credentials ?? {}
      if (!credentials[ref]?.configured) return []

      const models = await discoverModelsFromProviderApi({
        api: directory.api,
        dshValue,
        dshHome: resolveRuntimeHome(userDataPath),
        dshRuntimeRoot,
        providerRow,
        providerSettings: settings,
        credentialsDescribe: credentials,
        signal: requestSignal,
      })
      const safeModels = models.map((row) => ({ ...row }))
      cache.set(cacheKey, { models: safeModels, expiresAt: now() + cacheTtlMs })
      return safeModels.map((row) => ({ ...row }))
    })()

    inFlight.set(cacheKey, pending)
    try {
      return await pending
    } finally {
      if (inFlight.get(cacheKey) === pending) inFlight.delete(cacheKey)
    }
  }

  async function discoverProviderModels(directory, providerId, options = {}) {
    const providerRow = (directory.providers ?? []).find((row) => row.provider === providerId)
    if (!providerRow) throw new Error(`找不到提供方 ${providerId}`)
    return discoverProvider(directory, providerRow, options)
  }

  async function mergeLiveProviderModels(
    directory,
    candidateModels,
    availableKeys,
    providerById,
    profiles,
    registryByKey = new Map(),
    registryVersion = null,
    addedModelKeys = [],
  ) {
    if (!userDataPath || !dshRuntimeRoot) return
    const rows = (directory.providers ?? []).filter((row) =>
      shouldLiveDiscoverProvider(row.provider, addedModelKeys))
    const results = await Promise.allSettled(rows.map((row) => discoverProvider(directory, row)))
    const failures = []
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index]
      const providerRow = rows[index]
      if (result.status === 'rejected') {
        failures.push({ provider: providerRow.provider, error: result.reason })
        continue
      }
      const discovered = result.value
      if (!discovered.length) continue
      const knownIds = new Set(candidateModels
        .filter((model) => model.provider === providerRow.provider)
        .map((model) => model.id))
      const provider = providerById.get(providerRow.provider) ?? {
        id: providerRow.provider,
        name: providerRow.displayName || providerRow.provider,
        active: true,
      }
      for (const row of discovered) {
        if (!row?.id || knownIds.has(row.id)) continue
        knownIds.add(row.id)
        const key = `${providerRow.provider}/${row.id}`
        if (provider.active) availableKeys.add(key)
        candidateModels.push(serializeDshModel(
          provider,
          { id: row.id, name: row.name || row.id },
          availableKeys,
          profiles[key] ?? null,
          registryByKey.get(key) ?? null,
          registryByKey.has(key) ? 'remote' : 'live',
          registryByKey.has(key) ? registryVersion : null,
          false,
        ))
      }
    }
    if (failures.length) {
      console.warn('部分提供方 API 模型发现失败:', failures.map((failure) =>
        `${failure.provider}: ${failure.error instanceof Error ? failure.error.message : failure.error}`,
      ).join('; '))
    }
  }

  return { mergeLiveProviderModels, discoverProviderModels }
}
