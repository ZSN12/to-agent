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
import startupTrace from '../../startup-trace.cjs'

const { traceStartup } = startupTrace

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   userDataPath: string,
 *   appBootstrap: { start: () => Promise<unknown> },
 *   modelService: ReturnType<typeof import('../model-service.mjs').createModelService>,
 *   modelRegistryUpdater: ReturnType<typeof import('../model-registry-updater.mjs').createModelRegistryUpdater>,
 *   credentialStore: ReturnType<typeof import('../credential-store.mjs').createCredentialStore>,
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
    userDataPath,
    appBootstrap,
    modelService,
    modelRegistryUpdater,
    credentialStore,
    hostManager,
    profileStore,
    pricingSync,
    usageStore,
    appPreferences,
    chat,
    getUiConversationId,
    customProviderService,
  } = ctx

  ipcHandle(ipcMain, 'models:loadBundle', async () => {
    traceStartup('models:loadBundle-start')
    await appBootstrap.start()
    const bundle = await modelService.loadModelBundle()
    traceStartup('models:loadBundle-end', { providerCount: bundle?.providerCount ?? null })
    return bundle
  })
  ipcHandle(ipcMain, 'models:list', async (event) => {
    return modelService.listCatalog({
      onUpdate: (latest) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('models:catalogUpdated', latest)
          }
        } catch {
          // ignore
        }
      }
    })
  })
  ipcHandle(ipcMain, 'models:refresh', async () => modelService.refreshCatalog())
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

  async function invokeScanLocalModels() {
    const sync = await scanLocalModels({
      userDataPath,
      credentialStore,
      hostManager,
      modelService,
      ensureModelsJsonSyncedToDshHost,
      enrichModels: (modelsDoc, bridgeProviderIds) =>
        enrichScannedBridgeModels(modelService, modelsDoc, bridgeProviderIds),
      loginPolicy: 'open-browser',
      startProviderLogin: startOcxProviderLogin,
    })
    return formatScanLocalIpcResult(sync)
  }

  ipcHandle(ipcMain, 'bridge:getStatus', async () => {
    const modelsPath = resolveTaskWeaverModelsPath(userDataPath)
    const logins = await getBridgeLoginStatus()
    const disk = await readBridgeStatusFromDisk(modelsPath, logins)
    return {
      logins,
      ...disk,
      discoveryAdapter: 'ocx-export',
    }
  })
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
    const provider = kind === 'google-antigravity' ? 'google-antigravity' : 'cursor'
    startOcxProviderLogin(provider)
    return {
      ok: true,
      provider,
      message: provider === 'cursor'
        ? '已在系统浏览器打开 Cursor 登录；完成后点击「扫描本地官方 Agent」。'
        : '已在系统浏览器打开 Antigravity 登录；完成后点击「扫描本地官方 Agent」。',
    }
  })
  ipcHandle(ipcMain, 'models:scanLocal', async () => {
    try {
      return await invokeScanLocalModels()
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
  ipcHandle(ipcMain, 'models:getBusyEnterMode', () => profileStore.getBusyEnterMode())
  ipcHandle(ipcMain, 'models:setBusyEnterMode', (_event, mode) => profileStore.setBusyEnterMode(mode))

  const openUsageService = createOpenUsageService({
    resolveBaseUrl: async () => (await appPreferences.get()).openUsageBaseUrl,
  })
  ipcHandle(ipcMain, 'usage:getStats', () => usageStore.getStats())
  ipcHandle(ipcMain, 'usage:getReport', (_event, query) => usageStore.getReport(query))
  ipcHandle(ipcMain, 'usage:clear', () => usageStore.clear())
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
          const { shell } = await import('electron')
          await shell.openExternal(statusInfo.url)
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
