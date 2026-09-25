/**
 * 在无 Electron UI 时快速验证内置运行时与 model-service。
 * 用法: node scripts/test-model-service.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProfileStore } from '../electron/backend/profile-store.mjs'
import { createModelService } from '../electron/backend/model-service.mjs'
// 执行层经 electron/agent/agent-runtime.mjs → vendor/runtime/coding-agent

const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-model-test-'))
const prefix = 'test-encrypted:'
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`${prefix}${value}`),
  decryptString: (value) => {
    const decoded = value.toString()
    if (!decoded.startsWith(prefix)) throw new Error('invalid encrypted test payload')
    return decoded.slice(prefix.length)
  },
}
const createService = () => createModelService({
  profileStore: createProfileStore(userData),
  appDataPath: userData,
  safeStorage,
})
let service = createService()

try {
  const initial = await service.listCatalog()
  assert.equal(initial.models.length, 0, 'catalog candidates must not appear before explicit add')

  await service.setProviderApiKey('deepseek', 'test-model-service-key')
  await service.dispose()
  service = createService()
  const auth = await service.listProvidersAuth()
  assert.equal(auth.find((provider) => provider.id === 'deepseek')?.configured, true)
  assert.equal(auth.find((provider) => provider.id === 'deepseek')?.writable, true)

  const catalog = await service.listCatalog()
  assert.ok(catalog.candidateModels.some((model) => model.provider === 'deepseek'))
  assert.equal(catalog.models.length, 0, 'configured credentials alone must not add models')

  const selected = catalog.candidateModels.find((model) => model.provider === 'deepseek')
  assert.ok(selected)
  const added = await service.addModel(selected.key)
  assert.ok(added.models.some((model) => model.key === selected.key))
  await service.removeModel(selected.key)
  const removed = await service.listCatalog()
  assert.equal(removed.models.some((model) => model.key === selected.key), false)

  await service.removeProviderCredentials('deepseek')
  const finalAuth = await service.listProvidersAuth()
  assert.equal(finalAuth.find((provider) => provider.id === 'deepseek')?.configured, false)
  console.log('model service checks passed: encrypted credential restart persistence, candidate separation, explicit add/remove and credential deletion')
} finally {
  await service.dispose()
  await fs.rm(userData, { recursive: true, force: true })
}
