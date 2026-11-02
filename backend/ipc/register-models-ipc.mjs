import { ipcHandle } from '../ipc-utils.mjs'
import { humanizeBridgeTransportError } from '../cursor-tool-guidance.mjs'
import {
  loadRoutingPortfolio,
  saveRoutingPortfolio,
  resetRoutingPortfolioToBundled,
} from '../routing-portfolio-service.mjs'
import { createOpenUsageService } from '../openusage-service.mjs'
import {
  enrichScannedBridgeModels,
  formatScanLocalIpcResult,
  getBridgeLoginStatus,
  readBridgeStatusFromDisk,
  scanLocalModels,
  startOcxProviderLogin,
} from '../model-sync/index.mjs'
import { migrateLegacyOpenCodexRoutes } from '../model-sync/migrate-legacy-routes.mjs'
import { resolveTaskWeaverModelsPath } from '../taskweaver-models-path.mjs'
import { ensureModelsJsonSyncedToDshHost } from '../sync-models-json-to-host.mjs'
import { createDiscoverProviderModelsHandler } from '../model/discover-provider-models-ipc.mjs'
import {
  getAntigravityOAuthCredentials,
  getAntigravityOAuthStatus,
  saveAntigravityOAuthCredentials,
} from '../model-sync/antigravity-oauth-settings.mjs'
import startupTrace from '../startup-trace.cjs'

const { traceStartup } = startupTrace

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   BrowserWindow: typeof import('electron').BrowserWindow,
 *   shell?: { openExternal?: (url: string) => Promise<void> },
 *   userDataPath: string,
 *   appPath: string,
 *   appBootstrap: { start: () => Promise<unknown> },
 *   startHostModelCatalogEvents?: () => Promise<unknown>,
 *   modelService: ReturnType<typeof import('../model-service.mjs').createModelService>,
 *   modelRegistryUpdater: ReturnType<typeof import('../model-registry-updater.mjs').createModelRegistryUpdater>,
 *   credentialStore: ReturnType<typeof import('../credential-store.mjs').createCredentialStore>,
 *   secrets?: { get: (key: string) => Promise<string | null>, set: (key: string, value: string) => Promise<void> },
 *   hostManager: { isRunning: () => boolean },
 *   profileStore: ReturnType<typeof import('../profile-store.mjs').createProfileStore>,
 *   pricingSync: ReturnType<typeof import('../pricing-sync-service.mjs').createPricingSyncService>,
 *   usageStore: ReturnType<typeof import('../usage-store.mjs').createUsageStore>,
 *   appPreferences: { get: () => Promise<{ openUsageBaseUrl?: string }> },
 *   chat: { applyComposerModel: (conversationId: string, key: string) => Promise<unknown> },
 *   getUiConversationId: () => string | null,
 *   customProviderService: ReturnType<typeof import('../custom-provider-service.mjs').createCustomProviderService>,
 * }} ctx
 */
export function registerModelsIpc(ctx) {
  const {
    ipcMain,
    BrowserWindow,
    shell,
    userDataPath,
    appPath,
    appBootstrap,
    startHostModelCatalogEvents,
    modelService,
    modelRegistryUpdater,
    credentialStore,
    secrets,
    hostManager,
    profileStore,
    pricingSync,
    usageStore,
    appPreferences,
    chat,
    getUiConversationId,
    customProviderService,
  } = ctx

  modelService.subscribeCatalogUpdated?.((bundle) => {
    for (const window of BrowserWindow?.getAllWindows?.() ?? []) {
      try {
        if (!window.isDestroyed()) window.webContents.send('models:catalogUpdated', bundle)
      } catch {
        // A window may close between enumeration and delivery.
      }
    }
  })

  let misroutedModelMigrationPromise = null
  function migrateMisroutedLocalAgentModels() {
    if (typeof profileStore?.migrateMisroutedLocalAgentModels !== 'function') {
      return Promise.resolve({ changed: false, migrated: [] })
    }
    if (!misroutedModelMigrationPromise) {
      misroutedModelMigrationPromise = profileStore.migrateMisroutedLocalAgentModels().catch((error) => {
        misroutedModelMigrationPromise = null
        throw error
      })
    }
    return misroutedModelMigrationPromise
  }

  async function migrateModelsBeforeCatalogRead() {
    try {
      await migrateMisroutedLocalAgentModels()
    } catch (error) {
      console.warn('修复本地 Agent 模型来源失败:', error instanceof Error ? error.message : error)
    }
  }

  ipcHandle(ipcMain, 'models:loadBundle', async (_event, options) => {
    await migrateModelsBeforeCatalogRead()
    traceStartup('models:loadBundle-start')
    const bootstrap = appBootstrap.start()
    void bootstrap.then(() => startHostModelCatalogEvents?.()).catch(() => {})
    const bundle = await modelService.loadModelBundle({
      staleWhileRevalidate: options?.force !== true,
      refreshAfter: bootstrap,
      force: options?.force === true,
    })
    if (!bundle?.stale) await bootstrap
    traceStartup('models:loadBundle-end', {
      providerCount: bundle?.providerCount ?? null,
      stale: bundle?.stale === true,
    })
    return bundle
  })
  ipcHandle(ipcMain, 'models:list', async () => {
    await migrateModelsBeforeCatalogRead()
    return modelService.listCatalog()
  })
  ipcHandle(ipcMain, 'models:refresh', async () => {
    await migrateModelsBeforeCatalogRead()
    return modelService.refreshCatalog()
  })
  ipcHandle(ipcMain, 'models:getUpdateStatus', () => modelRegistryUpdater.getStatus())
  ipcHandle(ipcMain, 'models:checkForUpdates', async (_event, options) => {
    const status = await modelRegistryUpdater.checkForUpdates({ force: options?.force === true })
    if (status.state === 'updated' || status.state === 'rolled-back') await modelService.refreshCatalog()
    return status
  })
  ipcHandle(ipcMain, 'models:rollbackRegistry', async () => {
    const status = await modelRegistryUpdater.rollbackRegistry()
    await modelService.refreshCatalog()
    return status
  })

  const startProviderLogin = async (provider, loginOptions = {}) => {
    if (typeof shell?.openExternal !== 'function') {
      throw new Error('当前桌面 Shell 未提供安全的外部浏览器打开能力。')
    }
    const options = { ...loginOptions }
    if (provider === 'google-antigravity') {
      const credentials = await getAntigravityOAuthCredentials(secrets)
      if (!credentials) {
        throw new Error('请先配置 Google Antigravity OAuth Client ID 和 Client Secret，再点击授权。')
      }
      options.antigravityOAuthCredentials = credentials
    }
    return startOcxProviderLogin(provider, {
      ...options,
      openExternal: (url) => shell.openExternal(url),
    })
  }

  async function invokeScanLocalModels(options = {}) {
    const antigravityOAuthCredentials = await getAntigravityOAuthCredentials(secrets)
    const sync = await scanLocalModels({
      userDataPath,
      appPath,
      credentialStore,
      hostManager,
      antigravityOAuthCredentials,
      modelService,
      ensureModelsJsonSyncedToDshHost,
      enrichModels: (modelsDoc, bridgeProviderIds, exportDoc, wbResult) =>
        enrichScannedBridgeModels(modelService, modelsDoc, bridgeProviderIds, exportDoc, wbResult),
      loginPolicy: 'open-browser',
      startProviderLogin,
      force: options?.force ?? true,
    })
    if (sync.ok) {
      try {
        const migration = await migrateMisroutedLocalAgentModels()
        if (migration.changed) {
          await modelService.refreshCatalog()
          const addedKeys = new Set(await profileStore.listAddedModelKeys())
          sync.models = (sync.models ?? []).map((model) => ({
            ...model,
            alreadyAdded: addedKeys.has(model.key),
          }))
        }
      } catch (error) {
        console.warn('修复本地 Agent 模型来源失败:', error instanceof Error ? error.message : error)
        sync.discoveryWarnings = [
          ...(sync.discoveryWarnings ?? []),
          '扫描成功，但旧版模型来源迁移失败；重启应用后可自动重试。',
        ]
      }
    }
    return formatScanLocalIpcResult(sync)
  }

  ipcHandle(ipcMain, 'bridge:getStatus', async () => {
    const modelsPath = resolveTaskWeaverModelsPath(userDataPath)
    const logins = await getBridgeLoginStatus(userDataPath)
    const disk = await readBridgeStatusFromDisk(modelsPath, logins)
    const antigravityOAuth = await getAntigravityOAuthStatus(secrets)
    return {
      logins,
      ...disk,
      antigravityOAuthConfigured: antigravityOAuth.configured,
      antigravityOAuthIsDefault: antigravityOAuth.isDefault,
      antigravityOAuthCustomConfigured: antigravityOAuth.hasCustomCredentials,
      discoveryAdapter: 'ocx-export',
    }
  })
  ipcHandle(ipcMain, 'bridge:saveAntigravityOAuthCredentials', async (_event, input) =>
    saveAntigravityOAuthCredentials(secrets, input),
  )
  ipcHandle(ipcMain, 'models:migrateLegacyOpenCodexRoutes', async () => {
    const result = await migrateLegacyOpenCodexRoutes({
      profileStore,
      modelService,
      userDataPath,
      hostManager,
      credentialStore,
      ensureModelsJsonSyncedToDshHost,
    })
    if (result.prune?.pruned) await modelService.refreshCatalog()
    return result
  })

  ipcHandle(ipcMain, 'bridge:login', async (_event, kind) => {
    if (kind !== 'cursor' && kind !== 'google-antigravity') {
      throw new Error('不支持此本地官方 Agent 登录方式。')
    }
    const provider = kind
    const result = await startProviderLogin(provider, { userDataPath })
    return {
      ok: true,
      provider,
      message: result.message ?? '登录流程已启动；完成授权后刷新状态。',
    }
  })
  ipcHandle(ipcMain, 'models:scanLocal', async (_event, options) => {
    try {
      return await invokeScanLocalModels({ force: options?.force ?? true })
    } catch (err) {
      console.error('刷新内置模型桥失败:', err)
      const raw = err instanceof Error ? err.message : String(err)
      return {
        models: [],
        proxyUrl: null,
        providerIds: [],
        syncedAt: new Date().toISOString(),
        error: humanizeBridgeTransportError(raw, 'bridge-composer/cursor/composer-2.5'),
        bridgeMode: true,
      }
    }
  })
  ipcHandle(ipcMain, 'pricing:getStatus', () => pricingSync.getStatus())
  ipcHandle(ipcMain, 'pricing:sync', async () => {
    const result = await pricingSync.syncNow()
    modelService.reloadPriceRegistry()
    return { ...result, status: pricingSync.getStatus() }
  })
  ipcHandle(ipcMain, 'models:providersAuth', () => modelService.listProvidersAuth())
  ipcHandle(ipcMain, 'models:getSemanticSearchSettings', () => modelService.getSemanticSearchSettings())
  ipcHandle(ipcMain, 'models:saveSemanticSearchSettings', (_event, patch) =>
    modelService.saveSemanticSearchSettings(patch ?? {}),
  )
  ipcHandle(ipcMain, 'models:setProviderApiKey', async (_event, providerId, apiKey) =>
    modelService.setProviderApiKey(providerId, apiKey),
  )
  ipcHandle(ipcMain, 'models:add', async (_event, modelKey) => modelService.addModel(modelKey))
  ipcHandle(ipcMain, 'models:remove', async (_event, modelKey) => modelService.removeModel(modelKey))
  ipcHandle(ipcMain, 'models:removeProviderCredentials', async (_event, providerId) =>
    modelService.removeProviderCredentials(providerId),
  )
  ipcHandle(ipcMain, 'models:setActive', async (_event, modelKey) => {
    const key = await profileStore.setActiveModelKey(modelKey)
    const uiConversationId = getUiConversationId()
    if (uiConversationId) await chat.applyComposerModel(uiConversationId, key)
    return key
  })
  ipcHandle(ipcMain, 'models:getThinkingLevel', () => modelService.getThinkingLevel())
  ipcHandle(ipcMain, 'models:setThinkingLevel', async (_event, level) => {
    const res = await modelService.setThinkingLevel(level)
    const activeKey = await profileStore.getActiveModelKey()
    const uiConversationId = getUiConversationId()
    if (uiConversationId && activeKey) await chat.applyComposerModel(uiConversationId, activeKey)
    return res
  })

  const openUsageService = createOpenUsageService({
    resolveBaseUrl: async () => (await appPreferences.get()).openUsageBaseUrl,
  })
  ipcHandle(ipcMain, 'usage:getStats', () => usageStore.getStats())
  ipcHandle(ipcMain, 'usage:getReport', (_event, query) => usageStore.getReport(query))
  ipcHandle(ipcMain, 'usage:clear', () => usageStore.clear())
  ipcHandle(ipcMain, 'usage:setEnabled', (_event, enabled) => usageStore.setEnabled(enabled))
  ipcHandle(ipcMain, 'openusage:getLimits', (_event, options) => openUsageService.getLimits(options))
  ipcHandle(ipcMain, 'models:upsertProfile', async (_event, modelKey, patch) =>
    profileStore.upsertProfile(modelKey, patch),
  )
  ipcHandle(ipcMain, 'portfolio:get', () => loadRoutingPortfolio({ userDataPath }))
  ipcHandle(ipcMain, 'portfolio:save', (_event, portfolio) => saveRoutingPortfolio(portfolio, { userDataPath }))
  ipcHandle(ipcMain, 'portfolio:resetToBundled', async () => resetRoutingPortfolioToBundled({ userDataPath }))
  ipcHandle(ipcMain, 'models:startOAuth', async (event, providerId = 'openai-codex') => {
    await modelService.startProviderAuthorization(providerId, async (statusInfo) => {
      if (statusInfo?.url) {
        try {
          const { execFile } = await import('node:child_process')
          if (process.platform === 'darwin') execFile('open', [statusInfo.url])
        } catch (err) {
          console.error('打开外部链接失败:', err)
        }
      }
      try {
        event.sender.send('models:oauthStatus', statusInfo)
      } catch (err) {
        console.error('发送 OAuth 状态失败:', err)
      }
    })
    return modelService.listCatalog()
  })
  ipcHandle(ipcMain, 'models:cancelOAuth', async () => {
    await modelService.cancelProviderAuthorization()
    return true
  })
  ipcHandle(ipcMain, 'models:submitOAuthCode', async (_event, code) => {
    await modelService.submitOAuthCode(code)
    return true
  })
  ipcHandle(ipcMain, 'models:logoutOAuth', async (_event, providerId) => modelService.logoutProvider(providerId))

  ipcHandle(ipcMain, 'models:listCustomProviders', () => customProviderService.listCustomProviders())
  ipcHandle(ipcMain, 'models:upsertCustomProvider', async (_event, payload) => {
    const result = await customProviderService.upsertCustomProvider(payload ?? {})
    const catalog = await modelService.listCatalog()
    return { ...result, catalog }
  })
  ipcHandle(ipcMain, 'models:removeCustomProvider', async (_event, providerId) => {
    await customProviderService.removeCustomProvider(providerId)
    return modelService.listCatalog()
  })
  ipcHandle(ipcMain, 'models:testCustomProvider', (_event, payload) =>
    customProviderService.testCustomProvider(payload ?? {}),
  )
  ipcHandle(ipcMain, 'models:testCustomProviderToolCall', (_event, payload) =>
    customProviderService.testCustomProviderToolCall(payload ?? {}),
  )
  ipcHandle(ipcMain, 'models:probeProviderModels', (_event, payload) =>
    customProviderService.probeModels(payload ?? {}),
  )
  ipcHandle(ipcMain, 'models:discoverProviderModels', createDiscoverProviderModelsHandler({ modelService }))
  ipcHandle(ipcMain, 'models:batchAddCustomModels', async (_event, payload) => {
    const result = await customProviderService.batchAddCustomModels(payload ?? {})
    if (Array.isArray(result.addedKeys)) {
      for (const key of result.addedKeys) {
        await profileStore.addModel(key).catch(() => {})
      }
    }
    const catalog = await modelService.listCatalog()
    return { ...result, catalog }
  })
}
