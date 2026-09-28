/**
 * 在无 Electron UI 时验证 model-service 与内置 DSH Host 的模型目录/凭据流。
 * 用法: node scripts/test-model-service.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProfileStore } from '../electron/backend/profile-store.mjs'
import { createModelService } from '../electron/backend/model-service.mjs'
import { createDshHostManager } from '../electron/agent/dsh-host/spawn-host.mjs'
import { resolveDshRuntimeRoot } from '../electron/agent/dsh-host/resolve-runtime.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = resolveDshRuntimeRoot({
  appPath: projectRoot,
  resourcesPath: null,
  isPackaged: false,
  env: process.env,
})
const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-model-test-'))
const hostManager = createDshHostManager({
  runtimeRoot,
  userDataPath: userData,
  executable: process.execPath,
  startTimeoutMs: 60_000,
})

const createService = () => createModelService({
  profileStore: createProfileStore(userData),
  priceRegistryPath: path.join(projectRoot, 'pricing/registry.json'),
  dshHostManager: hostManager,
})

let service = createService()
const PROVIDER_ID = 'deepseek-official'

try {
  await hostManager.start()
  const bundle = await service.loadModelBundle()
  assert.ok(bundle.hostReady)
  assert.ok(bundle.providerCount > 0, 'DSH Host should expose at least one provider')
  assert.equal(bundle.catalog.models.length, 0, 'catalog candidates must not appear before explicit add')

  await service.setProviderApiKey(PROVIDER_ID, 'test-model-service-key')
  await service.dispose()
  service = createService()
  const auth = await service.listProvidersAuth()
  assert.equal(auth.find((provider) => provider.id === PROVIDER_ID)?.configured, true)
  assert.equal(auth.find((provider) => provider.id === PROVIDER_ID)?.writable, true)

  const catalog = await service.listCatalog()
  assert.ok(catalog.candidateModels.some((model) => model.provider === PROVIDER_ID))
  assert.equal(catalog.models.length, 0, 'configured credentials alone must not add models')

  const selected = catalog.candidateModels.find((model) => model.provider === PROVIDER_ID)
  assert.ok(selected)
  const added = await service.addModel(selected.key)
  assert.ok(added.models.some((model) => model.key === selected.key))
  await service.removeModel(selected.key)
  const removed = await service.listCatalog()
  assert.equal(removed.models.some((model) => model.key === selected.key), false)

  await service.removeProviderCredentials(PROVIDER_ID)
  const finalAuth = await service.listProvidersAuth()
  assert.equal(finalAuth.find((provider) => provider.id === PROVIDER_ID)?.configured, false)
  console.log('model service checks passed: DSH directory, encrypted credential persistence, candidate separation, explicit add/remove and credential deletion')
} finally {
  await service.dispose()
  await hostManager.stop().catch(() => {})
  await fs.rm(userData, { recursive: true, force: true })
}
