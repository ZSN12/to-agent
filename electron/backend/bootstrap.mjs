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

async function runBootstrap({
  userData,
  appPath,
  hostManager,
  profileStore,
  modelService,
  credentialStore,
  modelRegistryUpdater,
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
  const bridgeBoot = await bootstrapModelSyncOnAppReady({
    userDataPath: userData,
    catalog: bundle.catalog,
    credentialStore,
    hostManager,
    modelService,
    ensureModelsJsonSyncedToDshHost,
  })
  if (bridgeBoot?.refreshed) {
    console.info('[model-sync] 已静默刷新内置模型桥', bridgeBoot.bridgeProviderIds?.join(', ') ?? '')
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
