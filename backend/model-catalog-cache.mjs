import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const CACHE_SCHEMA = 3

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function collectCredentialRefs(modelsDoc) {
  const refs = new Set()
  for (const provider of Object.values(modelsDoc?.providers ?? {})) {
    const candidates = [provider?.apiKeyEnv, provider?.options?.apiKeyEnv, provider?.settings?.apiKeyEnv]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) refs.add(candidate.trim())
    }
  }
  return [...refs].sort()
}

/**
 * Persistent cache for the startup model bundle. Cache identity contains only
 * secret *reference names*, never credential values.
 */
export function createModelCatalogCache({ userDataPath, modelsJsonPath }) {
  if (!userDataPath || !modelsJsonPath) {
    throw new Error('createModelCatalogCache: userDataPath and modelsJsonPath are required')
  }
  const cachePath = path.join(userDataPath, 'model-catalog-cache.json')

  async function identity({ appVersion, registryVersion = '', registrySource = '' }) {
    let modelsJsonHash = 'none'
    let credRefs = []
    try {
      const raw = await fs.readFile(modelsJsonPath, 'utf8')
      modelsJsonHash = sha256(raw)
      try { credRefs = collectCredentialRefs(JSON.parse(raw)) } catch { /* malformed config hashes as raw bytes */ }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    const keyInput = JSON.stringify({
      appVersion: String(appVersion ?? 'unknown'),
      schema: CACHE_SCHEMA,
      modelsJsonHash,
      credRefs,
      registryVersion: String(registryVersion),
      registrySource: String(registrySource),
    })
    return sha256(keyInput)
  }

  async function readCachedCatalog(context) {
    let cacheKey
    try {
      cacheKey = await identity(context)
      const content = await fs.readFile(cachePath, 'utf8')
      const parsed = JSON.parse(content)
      if (parsed?.schema !== CACHE_SCHEMA || parsed?.key !== cacheKey) return null
      const bundle = parsed.bundle
      if (!bundle || typeof bundle !== 'object' || !bundle.catalog || !Array.isArray(bundle.auth)) return null
      return bundle
    } catch {
      return null
    }
  }

  async function writeCachedCatalog(context, bundle) {
    const cacheKey = await identity(context)
    const directory = path.dirname(cachePath)
    const temporaryPath = `${cachePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
    try {
      await fs.mkdir(directory, { recursive: true })
      await fs.writeFile(temporaryPath, `${JSON.stringify({
        schema: CACHE_SCHEMA,
        key: cacheKey,
        updatedAt: Date.now(),
        bundle,
      })}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await fs.rename(temporaryPath, cachePath)
      await fs.chmod(cachePath, 0o600).catch(() => {})
      return true
    } catch {
      await fs.rm(temporaryPath, { force: true }).catch(() => {})
      return false
    }
  }

  async function invalidate() {
    await fs.rm(cachePath, { force: true }).catch(() => {})
  }

  return { cachePath, readCachedCatalog, writeCachedCatalog, invalidate }
}

export { collectCredentialRefs }
