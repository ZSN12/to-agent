import { isCursorFamilyModelKey } from '../cursor-model-route.mjs'
import {
  findSettingsNamespace,
  providerSettings,
  registryModels,
  schemaValuesAtPath,
} from './shared.mjs'
import { piAiProviderModels } from './pi-ai-bundled.mjs'

/** 目录 → TaskWeaver catalog（含 registry 候选与 live discovery）。 */
export function createModelCatalog({
  dshRuntimeRoot,
  profileStore,
  modelRegistryUpdater,
  serializeDshModel,
  directoryClient,
  hostSync,
  liveDiscovery,
  applyCredentialBasedAvailability,
}) {
  const { applyRegistryAdditions } = hostSync
  const { mergeLiveProviderModels } = liveDiscovery
  const { getDshModelDirectory, fetchDshModelDirectoryOnce, invalidateModelDirectoryCache, seedModelDirectoryCache } = directoryClient

  async function buildCatalogFromDirectory(directory, { liveDiscovery = false } = {}) {
  const migratedFromAutoRoute = await profileStore.migrateLegacyAutoRouteActiveKey()
  const [profiles, activeModelKey, addedModelKeys, activeThinkingLevel] = await Promise.all([
    profileStore.listProfiles(),
    profileStore.getActiveModelKey(),
    profileStore.listAddedModelKeys(),
    profileStore.getThinkingLevel(),
  ])
  const activeRegistry = modelRegistryUpdater
    ? await modelRegistryUpdater.loadActiveRegistry()
    : { registry: null, source: 'bundled' }
  const registryByKey = new Map(registryModels(activeRegistry.registry).map((model) => [model.key, model]))
  const registryVersion = activeRegistry.registry?.registryVersion ?? null
  const persistedAdditionKeys = new Set(directory.providers.flatMap((providerRow) => {
    const value = providerSettings(directory, providerRow).value
    return (Array.isArray(value?.modelAdditions) ? value.modelAdditions : [])
      .flatMap((model) => model?.id ? [`${providerRow.provider}/${model.id}`] : [])
  }))
  const providerById = new Map(directory.providers.map((provider) => [provider.provider, {
    id: provider.provider,
    name: provider.displayName || provider.provider,
    active: Boolean(provider.active),
  }]))
  for (const group of directory.groups) {
    if (!providerById.has(group.id)) providerById.set(group.id, { id: group.id, name: group.name || group.id, active: true })
  }
  const availableKeys = new Set()
  const candidateModels = directory.groups.flatMap((group) => {
    const provider = providerById.get(group.id) ?? { id: group.id, name: group.name || group.id, active: true }
    return group.models.map((model) => {
      const key = `${group.id}/${model.id}`
      if (provider.active) availableKeys.add(key)
      const registryEntry = registryByKey.get(key) ?? null
      return serializeDshModel(
        provider,
        model,
        availableKeys,
        profiles[key] ?? null,
        registryEntry,
        registryEntry ? 'remote' : (persistedAdditionKeys.has(key) ? 'remote' : 'bundled'),
        registryEntry ? registryVersion : null,
      )
    })
  })
  // Groups are the DSH Host's routable model catalog. Re-serialize after all
  // route keys are known so each row has its final availability flag.
  const catalogByKey = new Map(candidateModels.map((model) => [model.key, model]))
  for (const model of candidateModels) model.available = availableKeys.has(model.key)
  if (liveDiscovery) {
    await mergeLiveProviderModels(
      directory,
      candidateModels,
      availableKeys,
      providerById,
      profiles,
      registryByKey,
      registryVersion,
      addedModelKeys,
    )
    for (const model of candidateModels) catalogByKey.set(model.key, model)
  }
  // Signed registry rows are visible in the picker even when the bundled
  // DSH catalog does not know them yet. The exact selection is written into
  // DSH modelAdditions only when the user adds it, then confirmed through
  // llm.models before it becomes an available TaskWeaver model.
  const providerRowsById = new Map((directory.providers ?? []).map((row) => [row.provider, row]))
  for (const entry of registryModels(activeRegistry.registry)) {
    if (catalogByKey.has(entry.key) || entry.deprecated) continue
    const providerRow = providerRowsById.get(entry.provider)
    if (!providerRow || providerRow.settingsNs !== 'llm-pi-ai') continue
    const configuredApi = providerSettings(directory, providerRow).value?.api
    if (typeof configuredApi === 'string' && configuredApi && entry.api !== configuredApi) continue
    const provider = providerById.get(entry.provider) ?? { id: entry.provider, name: entry.provider, active: false }
    const model = serializeDshModel(
      provider,
      { id: entry.id, name: entry.name || entry.id },
      availableKeys,
      profiles[entry.key] ?? null,
      entry,
      'remote',
      registryVersion,
      false,
    )
    candidateModels.push(model)
    catalogByKey.set(entry.key, model)
  }
  await applyCredentialBasedAvailability(directory, providerById, availableKeys, candidateModels, addedModelKeys)
  const models = addedModelKeys.map((key) => {
    const fromCatalog = catalogByKey.get(key)
    if (fromCatalog) {
      fromCatalog.available = availableKeys.has(key)
      return fromCatalog
    }
    const slash = key.indexOf('/')
    const provider = slash > 0 ? key.slice(0, slash) : ''
    const id = slash > 0 ? key.slice(slash + 1) : key
    const registryEntry = registryByKey.get(key) ?? null
    const model = serializeDshModel(
      providerById.get(provider) ?? { id: provider },
      { id, name: id },
      availableKeys,
      profiles[key] ?? null,
      registryEntry,
      registryEntry ? 'remote' : 'user',
      registryEntry ? registryVersion : null,
      false,
    )
    if (!registryEntry && persistedAdditionKeys.has(key)) model.verificationStatus = 'unverified'
    model.available = availableKeys.has(key)
    return model
  })

  const activeModel = models.find((item) => item.key === activeModelKey)
  const resolvedThinkingLevel = activeThinkingLevel
    ?? activeModel?.defaultThinkingLevel
    ?? (isCursorFamilyModelKey(activeModelKey) ? 'low' : 'medium')

  return {
    models,
    candidateModels,
    providers: [...providerById.keys()].sort(),
    activeModelKey,
    activeThinkingLevel: resolvedThinkingLevel,
    primaryModelReselectRequired: migratedFromAutoRoute,
  }
  }

  async function reconcileDirectoryRoutesForAddedModels(directory) {
  if (!modelRegistryUpdater || !directory?.api) return directory
  const addedModelKeys = await profileStore.listAddedModelKeys()
  if (!addedModelKeys.length) return directory
  const routed = new Set(
    (directory.groups ?? []).flatMap((group) => (group.models ?? []).map((model) => `${group.id}/${model.id}`)),
  )
  const missing = addedModelKeys.filter((key) => !routed.has(key))
  if (!missing.length) return directory
  try {
    const refreshed = await applyRegistryAdditions(directory, null, missing)
    invalidateModelDirectoryCache()
    seedModelDirectoryCache(refreshed)
    return refreshed
  } catch (error) {
    console.warn(
      '已添加模型自动注入 Z Host 路由失败:',
      error instanceof Error ? error.message : error,
    )
    return directory
  }
  }

  async function listCatalog() {
  const directory = await reconcileDirectoryRoutesForAddedModels(await getDshModelDirectory())
  return buildCatalogFromDirectory(directory, { liveDiscovery: true })
  }

  async function refreshCatalog() {
  const directory = await reconcileDirectoryRoutesForAddedModels(
    await getDshModelDirectory({ force: true }),
  )
  return buildCatalogFromDirectory(directory, { liveDiscovery: true })
  }

  async function validateRegistryMapping(registry) {
  const directory = await fetchDshModelDirectoryOnce()
  const providerRows = new Map((directory.providers ?? []).map((item) => [item.provider, item]))
  const groups = new Map((directory.groups ?? []).map((group) => [group.id, group]))
  const namespace = findSettingsNamespace(directory.namespaces, 'llm-pi-ai')
  const models = registryModels(registry).filter((model) => !model.deprecated)
  const unsupportedProviders = new Set()
  const unsupportedMappings = []
  for (const model of models) {
    const provider = providerRows.get(model.provider)
    const group = groups.get(model.provider)
    if (!provider) {
      unsupportedProviders.add(model.provider)
      continue
    }
    const alreadyRoutable = (group?.models ?? []).some((item) => item.id === model.id)
    if (alreadyRoutable) continue
    const runtimeProviderModels = provider.settingsNs === 'llm-pi-ai'
      ? piAiProviderModels(dshRuntimeRoot, model.provider)
      : null
    const knownRuntimeApis = runtimeProviderModels
      ? Object.entries(runtimeProviderModels)
        .filter(([, entries]) => entries && Object.hasOwn(entries, model.id))
        .map(([api]) => api)
      : []
    if (knownRuntimeApis.length) {
      if (model.api && !knownRuntimeApis.includes(model.api)) {
        unsupportedMappings.push(`${model.key}（协议与 Runtime 内置模型目录不一致）`)
      }
      continue
    }
    const registryProvider = registry.providers?.[model.provider]
    if (provider.settingsNs !== 'llm-pi-ai' || !namespace || namespace.writable === false) {
      unsupportedMappings.push(`${model.key}（运行时不支持在线添加模型）`)
      continue
    }
    const protocols = Array.isArray(registryProvider?.protocols) ? registryProvider.protocols : []
    const supportedProtocols = schemaValuesAtPath(namespace.schema, ['providers', model.provider, 'api'])
    if (!protocols.length || protocols.some((protocol) => !supportedProtocols.includes(protocol))) {
      unsupportedMappings.push(`${model.key}（提供方协议与当前 Runtime 不兼容）`)
      continue
    }
    if (!model.api || !protocols.includes(model.api) || !supportedProtocols.includes(model.api)) {
      unsupportedMappings.push(`${model.key}（缺少受支持的模型协议）`)
    }
  }
  if (unsupportedProviders.size) {
    throw new Error(`当前 Z Host 未注册提供方：${[...unsupportedProviders].join(', ')}`)
  }
  if (unsupportedMappings.length) {
    throw new Error(`当前 Z Host 无法映射模型目录：${unsupportedMappings.slice(0, 8).join('；')}${unsupportedMappings.length > 8 ? '；…' : ''}`)
  }
  return true
  }

  return {
    buildCatalogFromDirectory,
    reconcileDirectoryRoutesForAddedModels,
    listCatalog,
    refreshCatalog,
    validateRegistryMapping,
  }
}
