import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createModelCatalogCache } from '../electron/backend/model-catalog-cache.mjs'

async function run() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agy-cache-test-'))
  const cache = createModelCatalogCache(tmpDir)

  // prepare dummy models.json so getCacheKey doesn't say 'none'
  await fs.mkdir(path.join(tmpDir, 'taskweaver'))
  await fs.writeFile(path.join(tmpDir, 'taskweaver', 'models.json'), '{"models":[]}')

  const context = { appVersion: '1.0.0', credRefs: [] }
  const bundle = { models: [{ id: 'gpt-4' }] }

  // Read empty
  const empty = await cache.readCachedCatalog(context)
  if (empty !== null) throw new Error('Expected null for empty cache')

  // Write
  await cache.writeCachedCatalog(context, bundle)
  
  // Read valid
  const hit = await cache.readCachedCatalog(context)
  if (!hit || hit.models[0].id !== 'gpt-4') throw new Error('Cache hit failed')

  // Invalidation via models.json change
  await fs.writeFile(path.join(tmpDir, 'taskweaver', 'models.json'), '{"models":[{"id":"new"}]}')
  const miss = await cache.readCachedCatalog(context)
  if (miss !== null) throw new Error('Cache should be invalidated due to models.json change')

  // Invalidation via context change
  await cache.writeCachedCatalog(context, bundle)
  const hitAgain = await cache.readCachedCatalog(context)
  if (!hitAgain) throw new Error('Cache hit failed after rewrite')

  const missContext = await cache.readCachedCatalog({ appVersion: '1.0.1', credRefs: [] })
  if (missContext !== null) throw new Error('Cache should be invalidated due to context change')

  console.log('✅ model-catalog-cache tests passed')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
