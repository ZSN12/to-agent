import fs from 'node:fs/promises'
import path from 'node:path'
import { writeJsonAtomically } from './atomic-json.mjs'
import { migrateLegacyModelsJson, resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'
import { ensureTaskWeaverModelsJson } from './taskweaver-models-defaults.mjs'
import { ensureModelsJsonSyncedToDshHost } from './sync-models-json-to-host.mjs'
import { migrateLegacyOpenCodexRoutes } from './model-sync/migrate-legacy-routes.mjs'
import { bootstrapModelSyncOnAppReady, pruneLegacyOpenCodexProvider } from './model-sync/index.mjs'
import {
  assertUiVerifyMockIsolation,
  UI_VERIFY_MOCK_MODEL_KEY,
  uiVerifyMockRequested,
} from './ui-verify-mock.mjs'

/**
 * 串行化应用启动时的模型/Host 引导，避免多条 void 链竞态。
 */
export function createAppBootstrap(deps) {
  let ready = null
  let currentDeps = { ...deps }
  let resolveServices
  let rejectServices
  let servicesReadySettled = false
  const servicesReady = new Promise((resolve, reject) => {
    resolveServices = () => {
      if (servicesReadySettled) return
      servicesReadySettled = true
      resolve()
    }
    rejectServices = (error) => {
      if (servicesReadySettled) return
      servicesReadySettled = true
      reject(error)
    }
  })
  // A startup error can happen before runBootstrap reaches this gate. Attach a
  // handler now, while preserving rejection for the bootstrap's await below.
  void servicesReady.catch(() => {})
  if (hasBootstrapServices(currentDeps)) resolveServices()
  return {
    configureServices(services) {
      currentDeps = { ...currentDeps, ...services }
      if (hasBootstrapServices(currentDeps)) resolveServices()
    },
    rejectServiceConfiguration(error) {
      const reason = error instanceof Error ? error : new Error(String(error ?? '后端服务组合失败'))
      rejectServices(reason)
    },
    start() {
      if (!ready) {
        ready = runBootstrap(currentDeps, async () => {
          await servicesReady
          return currentDeps
        }).catch((error) => {
          ready = null
          throw error
        })
      }
      return ready
    },
  }
}

function hasBootstrapServices(deps) {
  return Boolean(deps.profileStore && deps.modelService && deps.credentialStore && deps.modelRegistryUpdater)
}

export { UI_VERIFY_MOCK_MODEL_KEY } from './ui-verify-mock.mjs'

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
  if (!uiVerifyMockRequested(env)) return { enabled: false }
  assertUiVerifyMockIsolation({ env, isPackaged, userDataPath })

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

async function readMigrations(userData) {
  if (!userData) return {}
  const migrationsPath = path.join(userData, 'taskweaver', 'migrations.json')
  try {
    const raw = await fs.readFile(migrationsPath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

async function markMigrationDone(userData, key) {
  if (!userData) return
  const migrationsPath = path.join(userData, 'taskweaver', 'migrations.json')
  let current = {}
  try {
    const parsed = JSON.parse(await fs.readFile(migrationsPath, 'utf8'))
    current = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {}
  current[key] = true
  await writeJsonAtomically(migrationsPath, current, { mode: 0o600 })
}

async function runBootstrap(deps, getServices) {
  const { userData, appPath, hostManager, isPackaged = false } = deps
  const ensureHostModelsSynced = deps.ensureHostModelsSynced ?? ensureModelsJsonSyncedToDshHost
  const migrations = await readMigrations(userData)
  if (!migrations.legacyModelsJson) {
    await migrateLegacyModelsJson(userData)
    await markMigrationDone(userData, 'legacyModelsJson')
  }
  await ensureTaskWeaverModelsJson({ userDataPath: userData, appPath })
  await hostManager.start()
  const {
    profileStore,
    modelService,
    credentialStore,
    modelRegistryUpdater,
  } = await getServices()
  await ensureHostModelsSynced({
    hostManager,
    userDataPath: userData,
    credentialStore,
  })
  if (!migrations.opencodexPrune) {
    const prune = await pruneLegacyOpenCodexProvider({
      userDataPath: userData,
      profileStore,
      hostManager,
      credentialStore,
      ensureModelsJsonSyncedToDshHost: ensureHostModelsSynced,
    })
    if (prune?.pruned) {
      console.info('[model-sync] 已移除遗留 opencodex 提供方（已使用内置桥）')
    }
    await markMigrationDone(userData, 'opencodexPrune')
  }
  if (!migrations.opencodexRoutes) {
    const migrateResult = await migrateLegacyOpenCodexRoutes({
      profileStore,
      modelService,
      userDataPath: userData,
      hostManager,
      credentialStore,
      ensureModelsJsonSyncedToDshHost: ensureHostModelsSynced,
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
    await markMigrationDone(userData, 'opencodexRoutes')
  }
  const bundle = await modelService.loadModelBundle()
  void bootstrapModelSyncOnAppReady({
    userDataPath: userData,
    appPath,
    catalog: bundle.catalog,
    credentialStore,
    hostManager,
    modelService,
    ensureModelsJsonSyncedToDshHost: ensureHostModelsSynced,
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
