import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createModelService } from '../desktop/backend/model-service.mjs'
import { createProfileStore } from '../desktop/backend/profile-store.mjs'

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

try {
  const first = createService()
  await first.loadModelBundle()
  await first.dispose()

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

  await second.invalidateCatalogCache()
  const cachePath = path.join(userDataPath, 'model-catalog-cache.json')
  assert.equal(await fs.access(cachePath).then(() => true, () => false), false, 'event invalidation removes the persisted stale snapshot')
  await second.dispose()
} finally {
  await fs.rm(root, { recursive: true, force: true })
}

console.log('model service cache checks passed: stale-first refresh publishes freshness and invalidates persistent data')
