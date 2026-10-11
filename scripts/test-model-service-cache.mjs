import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createModelService } from '../backend/model-service.mjs'
import { createProfileStore } from '../backend/profile-store.mjs'
import { createModelCatalogCache } from '../backend/model-catalog-cache.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-model-service-cache-'))
const userDataPath = path.join(root, 'user-data')
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const api = {
  llm: {
    async providers() { return { providers: [] } },
    async models() { return { groups: [], failures: [] } },
  },
  settings: { async describe() { return { namespaces: [] } } },
}
const hostManager = {
  async start() { return { api } },
  getApi() { return api },
}

const createService = () => createModelService({
  profileStore: createProfileStore(userDataPath),
  priceRegistryPath: path.join(projectRoot, 'pricing/registry.json'),
  dshHostManager: hostManager,
  userDataPath,
  appVersion: 'test-version',
})

async function waitForFile(filePath, timeoutMs = 2000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      await fs.access(filePath)
      return true
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  return false
}

try {
  const cachePath = path.join(userDataPath, 'model-catalog-cache.json')

  // 1. 首次启动并落盘缓存
  const first = createService()
  await first.loadModelBundle()
  await waitForFile(cachePath)
  await first.dispose()

  // 2. 正常 SWR 缓存命中与刷新测试
  const second = createService()
  const updatedBundle = new Promise((resolve) => second.subscribeCatalogUpdated(resolve))
  const cached = await second.loadModelBundle({ staleWhileRevalidate: true })
  assert.equal(cached.stale, true, 'cached bundle is returned as stale')
  let timeout
  const fresh = await Promise.race([
    updatedBundle,
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('fresh catalog update was not published')), 2_000) }),
  ]).finally(() => clearTimeout(timeout))
  assert.equal(fresh.stale, false, 'revalidation clears stale state even when catalog data is unchanged')
  assert.equal(fresh.hostReady, true)
  await second.dispose()

  // 3. 切换激活模型后缓存仍然命中，且返回新激活的模型
  const profileStore = createProfileStore(userDataPath)
  await profileStore.addModel('mock-provider/new-active-model')
  await profileStore.setActiveModelKey('mock-provider/new-active-model')

  const third = createService()
  const cachedAfterSwitch = await third.loadModelBundle({ staleWhileRevalidate: true })
  assert.equal(cachedAfterSwitch.stale, true, '切换模型后缓存仍然命中')
  assert.equal(cachedAfterSwitch.catalog.activeModelKey, 'mock-provider/new-active-model', '缓存结果叠加了新的激活模型')
  await third.dispose()

  // 4. 修改 models.json 后缓存未命中
  const modelsJsonPath = path.join(userDataPath, 'taskweaver', 'models.json')
  await fs.mkdir(path.dirname(modelsJsonPath), { recursive: true })
  await fs.writeFile(modelsJsonPath, JSON.stringify({
    providers: { custom: { apiKeyEnv: 'CHANGED_CUSTOM_KEY' } },
  }))
  const catalogCache = createModelCatalogCache({ userDataPath, modelsJsonPath })
  const context = { appVersion: 'test-version', registryVersion: '', registrySource: 'bundled' }
  assert.equal(await catalogCache.readCachedCatalog(context), null, '修改 models.json 后底层缓存未命中')

  // 5. 写缓存抛错时不影响 catalogUpdated 推送
  const fifth = createService()
  await fs.rm(cachePath, { recursive: true, force: true })
  await fs.mkdir(cachePath) // 成为目录导致原子 rename 报错

  let published = null
  fifth.subscribeCatalogUpdated((bundle) => {
    published = bundle
  })
  const refreshed = await fifth.refreshCatalogBundle()
  assert.ok(refreshed, '写缓存失败时 refreshCatalogBundle 正常完成')
  assert.ok(published, '写缓存失败时不阻碍 catalogUpdated 推送')
  await fifth.dispose()
  await fs.rm(cachePath, { recursive: true, force: true })

  // 6. 验证 invalidateCatalogCache 正常移除持久化文件
  const sixth = createService()
  await sixth.loadModelBundle()
  await waitForFile(cachePath)
  // 等待可能正在进行的后台写缓存操作完成
  await new Promise((r) => setTimeout(r, 100))
  await sixth.invalidateCatalogCache()
  assert.equal(await fs.access(cachePath).then(() => true, () => false), false, 'event invalidation removes the persisted stale snapshot')
  await sixth.dispose()
} finally {
  for (let i = 0; i < 10; i++) {
    try {
      await fs.rm(root, { recursive: true, force: true })
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}

console.log('model service cache checks passed: SWR hits with state reconciliation, models.json invalidation, and resilient async cache writes')
