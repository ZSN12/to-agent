import fs from 'node:fs/promises'
import {
  canonicalModelIdFromRoute,
  createCapabilityTierService,
  resolveCapabilityTier,
} from './capability-tiers.mjs'
import { createModelCatalogCache } from './model-catalog-cache.mjs'
import { resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'
import { TASKWEAVER_NATIVE_OAUTH } from './model/constants.mjs'
import { loadPriceRegistry, registryPriceMeta } from './price-registry.mjs'
import { isCursorFamilyModelKey } from './cursor-model-route.mjs'
import { createModelCatalog } from './model/catalog.mjs'
import { createModelCredentials } from './model/credentials.mjs'
import { createModelDirectoryClient } from './model/directory-client.mjs'
import { createModelHostSync } from './model/host-sync.mjs'
import { createModelLiveDiscovery } from './model/live-discovery.mjs'
import { createProviderCredentialHelpers } from './model/provider-credential-helpers.mjs'
import { createSerializeDshModel } from './model/serialize-model.mjs'
import startupTrace from './startup-trace.cjs'

const { traceStartup } = startupTrace

/** @typedef {'cheap' | 'balanced' | 'strong'} ModelTier */

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]))
  }
  return value
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

/**
 * 模型接入层（主进程单例）：目录与鉴权走内置运行时；档位与能力摘要走 profile-store。
 */
export function createModelService({
  profileStore,
  priceRegistryPath,
  dshHostManager = null,
  userDataPath = null,
  dshRuntimeRoot = null,
  modelRegistryUpdater = null,
  appVersion = 'unknown',
  capabilityTierService = null,
}) {
  let priceRegistry = loadPriceRegistry(priceRegistryPath)
  let catalogPriceMeta = registryPriceMeta(priceRegistry)

  function reloadPriceRegistry() {
    priceRegistry = loadPriceRegistry(priceRegistryPath)
    catalogPriceMeta = registryPriceMeta(priceRegistry)
  }

  const serializeDshModel = createSerializeDshModel({
    getPriceRegistry: () => priceRegistry,
    getCatalogPriceMeta: () => catalogPriceMeta,
  })
  const directoryClient = createModelDirectoryClient({ dshHostManager })
  const hostSync = createModelHostSync({
    modelRegistryUpdater,
    dshRuntimeRoot,
    directoryClient,
  })
  const credentialHelpers = createProviderCredentialHelpers({
    userDataPath,
    directoryClient,
  })
  const liveDiscovery = createModelLiveDiscovery({
    userDataPath,
    dshRuntimeRoot,
    serializeDshModel,
    isProviderCredentialConfigured: credentialHelpers.isProviderCredentialConfigured,
  })
  const catalog = createModelCatalog({
    dshRuntimeRoot,
    profileStore,
    modelRegistryUpdater,
    serializeDshModel,
    directoryClient,
    hostSync,
    liveDiscovery,
    applyCredentialBasedAvailability: credentialHelpers.applyCredentialBasedAvailability,
  })
  const credentials = createModelCredentials({
    userDataPath,
    profileStore,
    modelRegistryUpdater,
    directoryClient,
    hostSync,
    catalogApi: catalog,
    resolveDshCredentialRef: credentialHelpers.resolveDshCredentialRef,
    getBridgeProviderAuthorization: credentialHelpers.getBridgeProviderAuthorization,
  })

  const catalogCache = userDataPath
    ? createModelCatalogCache({
        userDataPath,
        modelsJsonPath: resolveTaskWeaverModelsPath(userDataPath),
      })
    : null
  const capabilityTiers = capabilityTierService ?? createCapabilityTierService({ userDataPath })
  const catalogSubscribers = new Set()
  let refreshBundleInFlight = null
  let lastPublishedBundle = null

  async function readCatalogCacheContext() {
    const [profiles, activeModelKey, addedModelKeys, activeThinkingLevel] = await Promise.all([
      profileStore.listProfiles(),
      profileStore.getActiveModelKey(),
      profileStore.listAddedModelKeys(),
      profileStore.getThinkingLevel(),
    ])
    let activeRegistry = { registry: null, source: 'bundled' }
    try {
      activeRegistry = await modelRegistryUpdater?.loadActiveRegistry?.() ?? activeRegistry
    } catch (error) {
      console.warn('读取缓存键中的模型注册表版本失败:', error instanceof Error ? error.message : error)
    }
    const profileFingerprint = stableStringify({
      profiles: profiles ?? {},
      activeModelKey,
      addedModelKeys: [...(addedModelKeys ?? [])].sort(),
      activeThinkingLevel,
    })
    return {
      appVersion: String(appVersion),
      profileFingerprint,
      registryVersion: activeRegistry?.registry?.registryVersion ?? '',
      registrySource: activeRegistry?.source ?? 'bundled',
      registry: activeRegistry?.registry ?? null,
      profiles: profiles ?? {},
      activeModelKey: activeModelKey ?? null,
      addedModelKeys: addedModelKeys ?? [],
      activeThinkingLevel: activeThinkingLevel ?? null,
    }
  }

  function publishCatalogBundle(bundle) {
    const fresh = { ...bundle, stale: false }
    const comparable = JSON.stringify(fresh)
    if (lastPublishedBundle && JSON.stringify(lastPublishedBundle) === comparable) return
    lastPublishedBundle = fresh
    for (const listener of catalogSubscribers) {
      try { listener(fresh) } catch (error) {
        console.warn('模型目录更新监听器失败:', error instanceof Error ? error.message : error)
      }
    }
  }

  async function decorateCatalog(catalog) {
    if (!catalog || typeof catalog !== 'object') return catalog
    const [tierState, aliases, profiles] = await Promise.all([
      capabilityTiers.getState(),
      capabilityTiers.getAliases(),
      profileStore.listProfiles(),
    ])
    const overrideCanonicalIds = new Set()
    for (const [modelKey, profile] of Object.entries(profiles ?? {})) {
      if (profile?.capabilityTierOverride === 'strong'
        || profile?.capabilityTierOverride === 'medium'
        || profile?.capabilityTierOverride === 'weak') {
        overrideCanonicalIds.add(canonicalModelIdFromRoute(modelKey, aliases))
      }
    }
    const capabilityTierStatus = {
      source: tierState.source,
      stale: tierState.stale,
      fetchedAt: tierState.fetchedAt,
      thresholdsVersion: tierState.thresholdsVersion,
      attribution: tierState.snapshot?.source?.attribution ?? null,
      sourceUrl: tierState.snapshot?.source?.url ?? null,
      changes: (tierState.changes ?? []).filter((change) => !overrideCanonicalIds.has(change.canonicalId)),
      error: tierState.error ?? null,
    }
    const decorateModel = (model) => {
      const profile = profiles?.[model.key] ?? model.profile ?? null
      return {
        ...model,
        profile,
        capabilityTier: resolveCapabilityTier(
          tierState.snapshot,
          model.key,
          aliases,
          profile?.capabilityTierOverride,
        ),
      }
    }
    return {
      ...catalog,
      models: Array.isArray(catalog.models) ? catalog.models.map(decorateModel) : [],
      candidateModels: Array.isArray(catalog.candidateModels) ? catalog.candidateModels.map(decorateModel) : [],
      capabilityTierStatus,
    }
  }

  async function decorateBundle(bundle) {
    if (!bundle || typeof bundle !== 'object') return bundle
    return { ...bundle, catalog: await decorateCatalog(bundle.catalog) }
  }

  async function refreshCapabilityTiers(options) {
    const result = await capabilityTiers.refresh(options)
    if (result.updated && lastPublishedBundle) {
      const refreshedBundle = await decorateBundle(lastPublishedBundle)
      publishCatalogBundle(refreshedBundle)
    }
    return result
  }

  async function buildSnapshotBundle(context) {
    const registry = context.registry
    if (!registry?.providers || !registry?.models) return null

    let configuredProviderIds = []
    try {
      if (!userDataPath) throw new Error('userData path unavailable')
      const modelsDoc = JSON.parse(await fs.readFile(resolveTaskWeaverModelsPath(userDataPath), 'utf8'))
      configuredProviderIds = Object.keys(modelsDoc?.providers ?? {})
    } catch {
      // A first launch may not have written its user config yet. Bundled model
      // registry entries still provide a useful, explicitly stale snapshot.
    }

    const profiles = context.profiles
    const availableKeys = new Set()
    const providerIds = new Set([
      ...Object.keys(registry.providers),
      ...configuredProviderIds,
      ...Object.values(registry.models).map((model) => model.provider).filter(Boolean),
    ])
    const providerById = new Map([...providerIds].map((id) => {
      const provider = registry.providers[id] ?? {}
      return [id, { id, name: provider.name || id, active: false }]
    }))
    const candidateModels = Object.entries(registry.models)
      .filter(([key, model]) => key.includes('/') && model && typeof model === 'object')
      .map(([key, entry]) => {
        const [providerId, ...modelId] = key.split('/')
        const provider = providerById.get(providerId) ?? { id: providerId, name: providerId, active: false }
        providerById.set(providerId, provider)
        return serializeDshModel(
          provider,
          { id: entry.id || modelId.join('/'), name: entry.name || entry.id || modelId.join('/') },
          availableKeys,
          profiles[key] ?? null,
          entry,
          context.registrySource === 'remote' ? 'remote' : 'bundled',
          registry.registryVersion ?? null,
          false,
        )
      })
    const candidateByKey = new Map(candidateModels.map((model) => [model.key, model]))
    const models = context.addedModelKeys.map((key) => {
      const cached = candidateByKey.get(key)
      if (cached) return { ...cached, available: false, routeRegistered: false }
      const slash = key.indexOf('/')
      const providerId = slash > 0 ? key.slice(0, slash) : ''
      const id = slash > 0 ? key.slice(slash + 1) : key
      const provider = providerById.get(providerId) ?? { id: providerId, name: providerId, active: false }
      providerById.set(providerId, provider)
      return serializeDshModel(provider, { id, name: id }, availableKeys, profiles[key] ?? null, null, 'user', null, false)
    })
    const providers = [...providerById.keys()].sort()
    const auth = providers.map((id) => {
      const provider = providerById.get(id)
      const nativeOAuth = TASKWEAVER_NATIVE_OAUTH[id]
      return {
        id,
        name: provider?.name || id,
        configured: false,
        authType: null,
        writable: true,
        source: null,
        authorizationMethods: nativeOAuth ? [{ id: 'oauth', label: nativeOAuth.label }] : [],
        authorizationKey: nativeOAuth ? `llm-pi-ai/${id}` : null,
        authorizationInFlight: false,
      }
    })
    const activeModel = models.find((item) => item.key === context.activeModelKey)
    const catalogBundle = {
      catalog: {
        models,
        candidateModels,
        providers,
        activeModelKey: context.activeModelKey,
        activeThinkingLevel: context.activeThinkingLevel
          ?? activeModel?.defaultThinkingLevel
          ?? (isCursorFamilyModelKey(context.activeModelKey) ? 'low' : 'medium'),
      },
      auth,
      hostReady: false,
      providerCount: auth.length,
    }
    return catalogBundle
  }

  async function refreshCatalogBundle() {
    if (refreshBundleInFlight) return refreshBundleInFlight
    const pending = credentials.loadModelBundle({ force: true }).then(async (bundle) => {
      const fresh = { ...bundle, stale: false }
      const decorated = await decorateBundle(fresh)
      publishCatalogBundle(decorated)
      void readCatalogCacheContext()
        .then((ctx) => catalogCache?.writeCachedCatalog(ctx, fresh))
        .catch((error) => console.warn('写模型目录缓存失败（不影响使用）:', error instanceof Error ? error.message : error))
      return decorated
    }).finally(() => {
      if (refreshBundleInFlight === pending) refreshBundleInFlight = null
    })
    refreshBundleInFlight = pending
    return pending
  }

  function subscribeCatalogUpdated(listener) {
    if (typeof listener !== 'function') throw new TypeError('catalog update listener must be a function')
    catalogSubscribers.add(listener)
    return () => catalogSubscribers.delete(listener)
  }

  async function dispose() {
    credentials.disposeOAuth()
    await credentials.cancelProviderAuthorization().catch(() => {})
  }

  return {
    async getModelContextWindow(modelKey) {
      const key = String(modelKey ?? '')
      if (!key) return null
      const result = await catalog.listCatalog()
      const models = [...(result.models ?? []), ...(result.candidateModels ?? [])]
      const match = models.find((item) => item?.key === key)
      const contextWindow = Number(match?.contextWindow)
      return Number.isFinite(contextWindow) && contextWindow > 0 ? Math.floor(contextWindow) : null
    },
    async listCatalog(options) {
      return decorateCatalog(await catalog.listCatalog(options))
    },
    async refreshCatalog(options) {
      void refreshCapabilityTiers().catch((error) => {
        console.warn('后台刷新能力档位失败:', error instanceof Error ? error.message : error)
      })
      if (options?.liveDiscovery === true) return decorateCatalog(await catalog.refreshCatalog(options))
      return (await refreshCatalogBundle()).catalog
    },
    async discoverProviderModels(options) {
      const startedAt = Date.now()
      traceStartup('live-discovery:start', { providerId: options?.providerId ?? null })
      try {
        const result = await catalog.discoverProviderModels(options)
        traceStartup('live-discovery:end', {
          providerId: options?.providerId ?? null,
          durationMs: Date.now() - startedAt,
        })
        return result
      } catch (error) {
        traceStartup('live-discovery:failed', {
          providerId: options?.providerId ?? null,
          durationMs: Date.now() - startedAt,
        })
        throw error
      }
    },
    async loadModelBundle({ staleWhileRevalidate = false, refreshAfter = null, force = false } = {}) {
      // Refresh runs in the background; a missing network source never blocks
      // the bundled or cached capability tiers from being displayed at startup.
      void refreshCapabilityTiers().catch((error) => {
        console.warn('后台刷新能力档位失败:', error instanceof Error ? error.message : error)
      })
      if (force) {
        if (refreshAfter) await refreshAfter
        return refreshCatalogBundle()
      }
      if (staleWhileRevalidate && lastPublishedBundle?.stale === false) {
        Promise.resolve(refreshAfter)
          .then(() => refreshCatalogBundle())
          .catch((error) => console.warn('后台刷新模型目录失败:', error instanceof Error ? error.message : error))
        return { ...lastPublishedBundle, hostReady: Boolean(dshHostManager?.getApi?.()) }
      }
      if (staleWhileRevalidate) {
        const context = await readCatalogCacheContext()
        const cached = await catalogCache?.readCachedCatalog(context)
        if (cached) {
          traceStartup('models:catalog-cache-hit')
          const catalogData = cached.catalog ?? {}
          const candidateModels = Array.isArray(catalogData.candidateModels) ? catalogData.candidateModels : []
          const candidateByKey = new Map(candidateModels.map((item) => [item.key, item]))
          const existingByKey = new Map(Array.isArray(catalogData.models) ? catalogData.models.map((item) => [item.key, item]) : [])

          const providerById = new Map()
          for (const p of catalogData.providers ?? []) {
            const id = typeof p === 'string' ? p : p?.id
            if (id) providerById.set(id, { id, name: p?.name || id, active: false })
          }

          const addedKeys = Array.isArray(context.addedModelKeys) ? context.addedModelKeys : []
          const availableKeys = new Set(
            candidateModels.filter((m) => m?.available).map((m) => m.key),
          )

          const models = addedKeys.map((key) => {
            const existing = existingByKey.get(key)
            if (existing) return existing
            const cachedCandidate = candidateByKey.get(key)
            if (cachedCandidate) return { ...cachedCandidate, available: false, routeRegistered: false }
            const slash = key.indexOf('/')
            const providerId = slash > 0 ? key.slice(0, slash) : ''
            const id = slash > 0 ? key.slice(slash + 1) : key
            const provider = providerById.get(providerId) ?? { id: providerId, name: providerId, active: false }
            providerById.set(providerId, provider)
            return serializeDshModel(
              provider,
              { id, name: id },
              availableKeys,
              context.profiles?.[key] ?? null,
              null,
              'user',
              null,
              false,
            )
          })

          const activeModelKey = context.activeModelKey ?? catalogData.activeModelKey ?? null
          const activeModel = models.find((item) => item.key === activeModelKey)
          const activeThinkingLevel = context.activeThinkingLevel
            ?? catalogData.activeThinkingLevel
            ?? activeModel?.defaultThinkingLevel
            ?? (isCursorFamilyModelKey(activeModelKey) ? 'low' : 'medium')

          const reconciledBundle = {
            ...cached,
            catalog: {
              ...catalogData,
              models,
              activeModelKey,
              activeThinkingLevel,
            },
            stale: true,
          }

          // Keep stale=true in the comparison baseline so revalidation emits an
          // update even when its catalog content is byte-for-byte identical.
          const decorated = await decorateBundle(reconciledBundle)
          lastPublishedBundle = decorated
          Promise.resolve(refreshAfter)
            .then(() => refreshCatalogBundle())
            .catch((error) => console.warn('后台刷新模型目录失败:', error instanceof Error ? error.message : error))
          return { ...decorated, hostReady: Boolean(dshHostManager?.getApi?.()), stale: true }
        }

        let snapshot = null
        try { snapshot = await buildSnapshotBundle(context) } catch (error) {
          console.warn('构造模型目录冷启动快照失败:', error instanceof Error ? error.message : error)
        }
        if (snapshot) {
          traceStartup('models:catalog-snapshot-hit')
          const decorated = await decorateBundle({ ...snapshot, stale: true })
          lastPublishedBundle = decorated
          Promise.resolve(refreshAfter)
            .then(() => refreshCatalogBundle())
            .catch((error) => console.warn('后台刷新模型目录失败:', error instanceof Error ? error.message : error))
          return decorated
        }

        if (refreshAfter) await refreshAfter
      }
      const bundle = await credentials.loadModelBundle()
      const fresh = { ...bundle, stale: false }
      const decorated = await decorateBundle(fresh)
      // A renderer may be holding the stale startup snapshot; this load is the
      // fresh state it is waiting for, and a later identical revalidation is
      // deduplicated against it.
      publishCatalogBundle(decorated)
      void readCatalogCacheContext()
        .then((ctx) => catalogCache?.writeCachedCatalog(ctx, fresh))
        .catch((error) => console.warn('写模型目录缓存失败（不影响使用）:', error instanceof Error ? error.message : error))
      return decorated
    },
    refreshCatalogBundle,
    invalidateCatalogCache: async ({ removePersistent = true } = {}) => {
      if (removePersistent) await catalogCache?.invalidate()
      directoryClient.invalidateModelDirectoryCache()
    },
    subscribeCatalogUpdated,
    listProvidersAuth: credentials.listProvidersAuth,
    startProviderAuthorization: credentials.startProviderAuthorization,
    submitOAuthCode: credentials.submitOAuthCode,
    submitAuthorizationPrompt: credentials.submitAuthorizationPrompt,
    cancelProviderAuthorization: credentials.cancelProviderAuthorization,
    logoutProvider: credentials.logoutProvider,
    setProviderApiKey: credentials.setProviderApiKey,
    getSemanticSearchSettings: credentials.getSemanticSearchSettings,
    saveSemanticSearchSettings: credentials.saveSemanticSearchSettings,
    addModel: credentials.addModel,
    removeModel: credentials.removeModel,
    removeProviderCredentials: credentials.removeProviderCredentials,
    async getThinkingLevel() {
      const explicit = await profileStore.getThinkingLevel()
      if (explicit) return explicit
      const catalogResult = await catalog.listCatalog()
      const activeModel = catalogResult.models.find((item) => item.key === catalogResult.activeModelKey)
      if (activeModel?.defaultThinkingLevel) return activeModel.defaultThinkingLevel
      return isCursorFamilyModelKey(catalogResult.activeModelKey) ? 'low' : 'medium'
    },
    async setThinkingLevel(level) {
      return profileStore.setThinkingLevel(level)
    },
    resolveModel: credentials.resolveModel,
    getDshModelConfig: credentials.getDshModelConfig,
    getDshModelDirectory: directoryClient.getDshModelDirectory,
    validateRegistryMapping: catalog.validateRegistryMapping,
    refreshCapabilityTiers,
    getCapabilityTierState: capabilityTiers.getState,
    dispose,
    reloadPriceRegistry,
  }
}
