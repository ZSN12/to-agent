import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export function createModelCatalogCache(userDataPath) {
  const cachePath = path.join(userDataPath, 'model-catalog-cache.json')
  const modelsJsonPath = path.join(userDataPath, 'taskweaver', 'models.json')

  async function getCacheKey(appVersion, credRefs) {
    let modelsJsonHash = ''
    try {
      const content = await fs.readFile(modelsJsonPath, 'utf8')
      modelsJsonHash = crypto.createHash('sha256').update(content).digest('hex')
    } catch {
      modelsJsonHash = 'none'
    }
    const data = JSON.stringify({ appVersion, schema: 2, modelsJsonHash, credRefs })
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  async function readCachedCatalog({ appVersion, credRefs }) {
    try {
      const key = await getCacheKey(appVersion, credRefs)
      const content = await fs.readFile(cachePath, 'utf8')
      const parsed = JSON.parse(content)
      if (parsed.key === key) return parsed.bundle
    } catch {
      // Ignore
    }
    return null
  }

  async function writeCachedCatalog({ appVersion, credRefs }, bundle) {
    try {
      const key = await getCacheKey(appVersion, credRefs)
      const data = JSON.stringify({ key, bundle })
      const tmpPath = `${cachePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
      await fs.writeFile(tmpPath, data, 'utf8')
      await fs.rename(tmpPath, cachePath)
    } catch {
      // Ignore
    }
  }

  return { readCachedCatalog, writeCachedCatalog }
}
