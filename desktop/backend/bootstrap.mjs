import path from 'node:path'
import { migrateLegacyModelsJson, resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'
import { ensureTaskWeaverModelsJson } from './taskweaver-models-defaults.mjs'
import { ensureModelsJsonSyncedToDshHost } from './sync-models-json-to-host.mjs'
import { migrateLegacyOpenCodexRoutes } from './model-sync/migrate-legacy-routes.mjs'
import { bootstrapModelSyncOnAppReady, pruneLegacyOpenCodexProvider } from './model-sync/index.mjs'

/**
 * 串行化应用启动时的模型/Host 引导，避免多条 void 链竞态。
 */
export function createAppBootstrap(deps) {
  let ready = null
  return {
    start() {
      if (!ready) {
        ready = runBootstrap(deps).catch((error) => {
          ready = null
          throw error
        })
      }
      return ready
    },
  }
}

export const UI_VERIFY_MOCK_MODEL_KEY = 'bridge-composer/cursor/composer-2.5-fast'

/**
 * Select the credential-free bridge fixture only in the isolated development
 * Electron instance launched by the trusted UI verification driver.
 */
export async function activateUiVerifyMockModel({
  env = process.env,
  isPackaged = false,
  userDataPath,
  profileStore,
  modelService,
}) {
  if (env.TASKWEAVER_E2E !== '1' || env.TASKWEAVER_UI_VERIFY !== '1'
    || env.TASKWEAVER_UI_VERIFY_MOCK !== '1') return { enabled: false }
  if (isPackaged || env.TASKWEAVER_PACKAGED === '1' || env.TASKWEAVER_PACKAGED === 'true') {
    throw new Error('UI verification mock model is available only in the unpackaged development app')
  }
  const isolatedUserData = env.TASKWEAVER_USER_DATA
  if (typeof isolatedUserData !== 'string' || !path.isAbsolute(isolatedUserData)
    || !userDataPath || path.resolve(isolatedUserData) !== path.resolve(userDataPath)) {
    throw new Error('UI verification mock model requires its exact isolated Electron userData directory')
  }
  const isolatedRuntimeHome = path.join(path.resolve(userDataPath), 'runtime-home')
  if (typeof env.TASKWEAVER_HOME !== 'string' || !path.isAbsolute(env.TASKWEAVER_HOME)
    || path.resolve(env.TASKWEAVER_HOME) !== isolatedRuntimeHome) {
    throw new Error('UI verification mock model requires its exact isolated TASKWEAVER_HOME directory')
  }

  const bundle = await modelService.loadModelBundle()
  const fixture = bundle.catalog?.candidateModels?.find((model) => model.key === UI_VERIFY_MOCK_MODEL_KEY)
  if (!fixture?.routeRegistered) {
    throw new Error(`UI verification bridge fixture is not registered: ${UI_VERIFY_MOCK_MODEL_KEY}`)
  }
  const added = await profileStore.listAddedModelKeys()
  if (!added.includes(UI_VERIFY_MOCK_MODEL_KEY)) await profileStore.addModel(UI_VERIFY_MOCK_MODEL_KEY)
  await profileStore.setActiveModelKey(UI_VERIFY_MOCK_MODEL_KEY)
  return { enabled: true, modelKey: UI_VERIFY_MOCK_MODEL_KEY }
}

async function runBootstrap({
  userData,
  appPath,
  hostManager,
  profileStore,
  modelService,
  credentialStore,
  modelRegistryUpdater,
  isPackaged = false,
}) {
  await migrateLegacyModelsJson(userData)
  await ensureTaskWeaverModelsJson({ userDataPath: userData, appPath })
  await hostManager.start()
  await ensureModelsJsonSyncedToDshHost({
    hostManager,
    userDataPath: userData,
    credentialStore,
  })
  const prune = await pruneLegacyOpenCodexProvider({
    userDataPath: userData,
    profileStore,
    hostManager,
    credentialStore,
    ensureModelsJsonSyncedToDshHost,
  })
  if (prune?.pruned) {
    console.info('[model-sync] 已移除遗留 opencodex 提供方（已使用内置桥）')
  }
  const migrateResult = await migrateLegacyOpenCodexRoutes({
    profileStore,
    modelService,
    userDataPath: userData,
    hostManager,
    credentialStore,
    ensureModelsJsonSyncedToDshHost,
  })
  if (migrateResult.changed && migrateResult.migrated.length) {
    console.info(
      '[model-sync] 已迁移遗留 opencodex 模型键',
      migrateResult.migrated.map((row) => `${row.from} → ${row.to}`).join(', '),
    )
  }
  if (migrateResult.prune?.pruned) {
    console.info('[model-sync] 已移除遗留 opencodex 提供方（已使用内置桥）')
  }
  const bundle = await modelService.loadModelBundle()
  void bootstrapModelSyncOnAppReady({
    userDataPath: userData,
    appPath,
    catalog: bundle.catalog,
    credentialStore,
    hostManager,
    modelService,
    ensureModelsJsonSyncedToDshHost,
  }).then((bridgeBoot) => {
    if (bridgeBoot?.refreshed) {
      console.info('[model-sync] 已静默刷新内置模型桥', bridgeBoot.bridgeProviderIds?.join(', ') ?? '')
    } else if (bridgeBoot?.reason && bridgeBoot.reason !== 'not-configured') {
      console.info(`[model-sync] 启动时跳过本地模型扫描：${bridgeBoot.reason}`)
    }
  }).catch((error) => console.warn('启动时本地模型扫描失败:', error instanceof Error ? error.message : error))
  const uiVerifyFixture = await activateUiVerifyMockModel({
    env: process.env,
    isPackaged,
    userDataPath: userData,
    profileStore,
    modelService,
  })
  if (uiVerifyFixture.enabled) {
    console.info(`[ui-verify] 使用隔离 mock 模型 ${uiVerifyFixture.modelKey}`)
  }
  void modelRegistryUpdater.hydrateStatus()
    .then(() => modelRegistryUpdater.checkForUpdates({ force: false }))
    .then((status) => {
      if (status.state === 'updated' || status.state === 'rolled-back') return modelService.refreshCatalog()
      return null
    })
    .catch((error) => console.warn('模型目录后台更新失败:', error instanceof Error ? error.message : error))
  return { modelsPath: resolveTaskWeaverModelsPath(userData) }
}
