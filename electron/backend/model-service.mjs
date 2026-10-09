import { loadPriceRegistry, registryPriceMeta } from './price-registry.mjs'
import { isCursorFamilyModelKey } from './cursor-model-route.mjs'
import { createModelCatalog } from './model/catalog.mjs'
import { createModelCredentials } from './model/credentials.mjs'
import { createModelDirectoryClient } from './model/directory-client.mjs'
import { createModelHostSync } from './model/host-sync.mjs'
import { createModelLiveDiscovery } from './model/live-discovery.mjs'
import { createProviderCredentialHelpers } from './model/provider-credential-helpers.mjs'
import { createSerializeDshModel } from './model/serialize-model.mjs'

/** @typedef {'cheap' | 'balanced' | 'strong'} ModelTier */

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
  })

  async function dispose() {
    credentials.disposeOAuth()
    await credentials.cancelProviderAuthorization().catch(() => {})
  }

  return {
    listCatalog: catalog.listCatalog,
    refreshCatalog: catalog.refreshCatalog,
    loadModelBundle: credentials.loadModelBundle,
    listProvidersAuth: credentials.listProvidersAuth,
    startProviderAuthorization: credentials.startProviderAuthorization,
    submitOAuthCode: credentials.submitOAuthCode,
    submitAuthorizationPrompt: credentials.submitAuthorizationPrompt,
    cancelProviderAuthorization: credentials.cancelProviderAuthorization,
    logoutProvider: credentials.logoutProvider,
    setProviderApiKey: credentials.setProviderApiKey,
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
    dispose,
    reloadPriceRegistry,
  }
}
