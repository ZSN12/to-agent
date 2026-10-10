import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createModelCatalogCache, collectCredentialRefs } from '../desktop/backend/model-catalog-cache.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-model-cache-'))
const userDataPath = path.join(root, 'user-data')
const modelsJsonPath = path.join(userDataPath, 'taskweaver', 'models.json')
const cache = createModelCatalogCache({ userDataPath, modelsJsonPath })
const context = { appVersion: '1.2.3', profileFingerprint: 'profiles-a', registryVersion: 'registry-a', registrySource: 'bundled' }
const bundle = {
  catalog: { models: [], candidateModels: [], providers: ['openai'], activeModelKey: null },
  auth: [{ id: 'openai', configured: true }],
  hostReady: true,
  providerCount: 1,
}

await fs.mkdir(path.dirname(modelsJsonPath), { recursive: true })
await fs.writeFile(modelsJsonPath, JSON.stringify({
  providers: { openai: { apiKeyEnv: 'TASKWEAVER_OPENAI_KEY' } },
}))
assert.deepEqual(collectCredentialRefs({
  providers: { a: { apiKeyEnv: 'Z_KEY' }, b: { options: { apiKeyEnv: 'B_KEY' } }, c: { settings: { apiKeyEnv: 'C_KEY' } } },
}), ['B_KEY', 'C_KEY', 'Z_KEY'])

assert.equal(await cache.readCachedCatalog(context), null, 'cache starts cold')
assert.equal(await cache.writeCachedCatalog(context, bundle), true)
assert.deepEqual(await cache.readCachedCatalog(context), bundle)
assert.equal(await cache.readCachedCatalog({ ...context, appVersion: '1.2.4' }), null, 'app version invalidates cache')
assert.equal(await cache.readCachedCatalog({ ...context, profileFingerprint: 'profiles-b' }), null, 'profile changes invalidate cache')
assert.equal(await cache.readCachedCatalog({ ...context, registryVersion: 'registry-b' }), null, 'registry changes invalidate cache')
assert.equal(await cache.readCachedCatalog({ ...context, registrySource: 'remote' }), null, 'registry source changes invalidate cache')

await fs.writeFile(modelsJsonPath, JSON.stringify({
  providers: { openai: { apiKeyEnv: 'TASKWEAVER_OPENAI_ROTATED' } },
}))
assert.equal(await cache.readCachedCatalog(context), null, 'model config and credential refs invalidate cache')
const cacheText = await fs.readFile(cache.cachePath, 'utf8')
assert.equal(cacheText.includes('TASKWEAVER_OPENAI_KEY'), false, 'cache never stores credential reference names')
assert.equal(cacheText.includes('apiKey'), false, 'cache never stores API key fields')
assert.deepEqual((await fs.readdir(userDataPath)).filter((name) => name.endsWith('.tmp')), [], 'atomic write leaves no temp file')
assert.equal((await fs.stat(cache.cachePath)).mode & 0o777, 0o600, 'cache permissions are user-only')

await fs.writeFile(cache.cachePath, '{not json')
assert.equal(await cache.readCachedCatalog(context), null, 'corrupt cache is a cold miss')
await cache.invalidate()
assert.equal(await fs.access(cache.cachePath).then(() => true, () => false), false, 'invalidate removes persisted cache')
await fs.rm(root, { recursive: true, force: true })
console.log('model catalog cache checks passed')
