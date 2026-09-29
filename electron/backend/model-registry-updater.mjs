import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_MANIFEST_URL = 'https://github.com/ZSN12/to-agent/releases/download/model-registry/model-registry-manifest.v1.json'
const DEFAULT_PUBLIC_KEY_DER = 'MCowBQYDK2VwAyEAc87j6GsYFzP7eMeknLr4ZfWorGnzlAKez+aRCS0bnbI='

function versionParts(value) {
  return String(value ?? '0').split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0)
}

function versionAtLeast(current, minimum) {
  const a = versionParts(current)
  const b = versionParts(minimum)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return true
    if (a[index] < b[index]) return false
  }
  return true
}

function validateRegistry(registry) {
  if (!registry || typeof registry !== 'object') throw new Error('模型目录不是有效 JSON 对象')
  if (registry.schemaVersion !== 1) throw new Error(`不支持的模型目录 Schema：${registry.schemaVersion}`)
  for (const key of ['registryVersion', 'generatedAt', 'expiresAt']) {
    if (typeof registry[key] !== 'string' || !registry[key]) throw new Error(`模型目录缺少 ${key}`)
  }
  if (!registry.providers || Array.isArray(registry.providers) || typeof registry.providers !== 'object') {
    throw new Error('模型目录 providers 格式无效')
  }
  if (!registry.models || Array.isArray(registry.models) || typeof registry.models !== 'object') {
    throw new Error('模型目录 models 格式无效')
  }
  for (const [key, model] of Object.entries(registry.models)) {
    if (!key.includes('/') || !model || typeof model !== 'object') throw new Error(`模型条目无效：${key}`)
    const [provider, ...id] = key.split('/')
    if ((model.provider && model.provider !== provider) || (model.id && model.id !== id.join('/'))) {
      throw new Error(`模型主键与字段不一致：${key}`)
    }
  }
  return registry
}

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'))
}

async function atomicWrite(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  await fsp.writeFile(temporary, content)
  await fsp.rename(temporary, file)
}

function catalogChanges(previous, next) {
  const before = new Set(Object.keys(previous?.models ?? {}))
  const after = new Set(Object.keys(next?.models ?? {}))
  const added = [...after].filter((key) => !before.has(key))
  const removed = [...before].filter((key) => !after.has(key))
  const changed = [...after].filter((key) => before.has(key)
    && JSON.stringify(previous.models[key]) !== JSON.stringify(next.models[key]))
  return { added, deprecated: removed, changed }
}

export function createModelRegistryUpdater({
  userDataPath,
  bundledRegistryPath,
  currentAppVersion,
  runtimeLockPath,
  fetchImpl = globalThis.fetch,
  manifestUrl = process.env.TASKWEAVER_MODEL_REGISTRY_MANIFEST_URL || DEFAULT_MANIFEST_URL,
  publicKeyDer = process.env.TASKWEAVER_MODEL_REGISTRY_PUBLIC_KEY || DEFAULT_PUBLIC_KEY_DER,
  now = () => Date.now(),
  validateMapping = null,
  onStatus = () => {},
}) {
  if (!userDataPath || !bundledRegistryPath) throw new Error('模型目录更新器缺少路径配置')
  const directory = path.join(userDataPath, 'model-registry')
  const activePath = path.join(directory, 'active.json')
  const previousPath = path.join(directory, 'previous.json')
  const statusPath = path.join(directory, 'status.json')
  let inFlight = null
  let mappingValidator = validateMapping
  let currentStatus = {
    state: 'idle',
    currentVersion: null,
    previousVersion: null,
    source: 'bundled',
    lastCheckedAt: null,
    updatedAt: null,
    error: null,
    changes: { added: [], deprecated: [], changed: [] },
    runtime: null,
  }

  async function loadRuntime() {
    try { return await readJson(runtimeLockPath) } catch { return null }
  }

  async function loadRegistryFile(file) {
    return validateRegistry(await readJson(file))
  }

  async function loadActiveRegistry() {
    try {
      const registry = await loadRegistryFile(activePath)
      return { registry, source: 'remote' }
    } catch {
      return { registry: await loadRegistryFile(bundledRegistryPath), source: 'bundled' }
    }
  }

  async function persistStatus(patch) {
    currentStatus = { ...currentStatus, ...patch }
    await atomicWrite(statusPath, `${JSON.stringify(currentStatus, null, 2)}\n`).catch(() => {})
    onStatus({ ...currentStatus })
    return { ...currentStatus }
  }

  async function hydrateStatus() {
    try { currentStatus = { ...currentStatus, ...(await readJson(statusPath)) } } catch { /* first launch */ }
    const { registry, source } = await loadActiveRegistry()
    let previousVersion = null
    try { previousVersion = (await loadRegistryFile(previousPath)).registryVersion } catch { /* none */ }
    currentStatus = {
      ...currentStatus,
      currentVersion: registry.registryVersion,
      previousVersion,
      source,
      runtime: await loadRuntime(),
    }
    return { ...currentStatus }
  }

  async function getStatus() {
    if (!currentStatus.currentVersion) await hydrateStatus()
    return { ...currentStatus }
  }

  async function downloadJson(url) {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' } })
    if (!response?.ok) throw new Error(`下载失败（HTTP ${response?.status ?? 'unknown'}）`)
    return Buffer.from(await response.arrayBuffer())
  }

  async function performCheck(force) {
    const status = await getStatus()
    const lastCheck = Date.parse(status.lastCheckedAt || '')
    if (!force && Number.isFinite(lastCheck) && now() - lastCheck < DAY_MS) {
      return persistStatus({ state: 'cached', error: null })
    }
    await persistStatus({ state: 'checking', error: null })
    const checkedAt = new Date(now()).toISOString()
    try {
      const manifestBytes = await downloadJson(manifestUrl)
      const manifest = JSON.parse(manifestBytes.toString('utf8'))
      if (manifest.schemaVersion !== 1 || !manifest.registryUrl || !manifest.sha256 || !manifest.signature) {
        throw new Error('远程模型目录 manifest 格式无效')
      }
      const registryBytes = await downloadJson(new URL(manifest.registryUrl, manifestUrl).toString())
      const hash = createHash('sha256').update(registryBytes).digest('hex')
      if (hash !== String(manifest.sha256).toLowerCase()) throw new Error('模型目录内容哈希校验失败')
      const key = createPublicKey({ key: Buffer.from(publicKeyDer, 'base64'), format: 'der', type: 'spki' })
      if (!verifySignature(null, registryBytes, key, Buffer.from(manifest.signature, 'base64'))) {
        throw new Error('模型目录签名校验失败')
      }
      const registry = validateRegistry(JSON.parse(registryBytes.toString('utf8')))
      if (Date.parse(registry.expiresAt) <= now()) throw new Error('模型目录已经过期')
      const runtime = await loadRuntime()
      if (!versionAtLeast(currentAppVersion, registry.minimumTaskWeaverVersion)) {
        throw new Error(`模型目录需要 TaskWeaver ${registry.minimumTaskWeaverVersion} 或更高版本`)
      }
      if (registry.minimumDshRuntimeVersion
        && !versionAtLeast(runtime?.dsh?.version, registry.minimumDshRuntimeVersion)) {
        throw new Error(`模型目录需要 DSH Runtime ${registry.minimumDshRuntimeVersion} 或更高版本`)
      }
      const current = await loadActiveRegistry()
      if (registry.registryVersion === current.registry.registryVersion) {
        return persistStatus({ state: 'up-to-date', lastCheckedAt: checkedAt, error: null })
      }
      const changes = catalogChanges(current.registry, registry)
      // Keep a validated effective snapshot, not potentially corrupt bytes
      // found at activePath, so a failed update always rolls back to usable data.
      await atomicWrite(previousPath, `${JSON.stringify(current.registry, null, 2)}\n`)
      await atomicWrite(activePath, registryBytes)
      try {
        if (mappingValidator) await mappingValidator(registry)
      } catch (error) {
        const previous = await fsp.readFile(previousPath)
        await atomicWrite(activePath, previous)
        throw new Error(`新目录无法映射到当前 DSH Runtime，已自动回滚：${error instanceof Error ? error.message : error}`)
      }
      return persistStatus({
        state: 'updated',
        currentVersion: registry.registryVersion,
        previousVersion: current.registry.registryVersion,
        source: 'remote',
        lastCheckedAt: checkedAt,
        updatedAt: checkedAt,
        changes,
        error: null,
      })
    } catch (error) {
      return persistStatus({
        state: 'failed',
        lastCheckedAt: checkedAt,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function checkForUpdates({ force = false } = {}) {
    if (!inFlight) inFlight = performCheck(Boolean(force)).finally(() => { inFlight = null })
    return inFlight
  }

  async function rollbackRegistry() {
    if (!fs.existsSync(previousPath)) throw new Error('没有可回滚的模型目录版本')
    const current = await loadActiveRegistry()
    const previous = await loadRegistryFile(previousPath)
    // Validate before touching either file. A runtime that cannot map the
    // previous registry must not leave the on-disk active pointer half-swapped.
    if (mappingValidator) await mappingValidator(previous)
    const activeExisted = fs.existsSync(activePath)
    const previousExisted = fs.existsSync(previousPath)
    const activeBytes = activeExisted ? await fsp.readFile(activePath) : null
    const previousBytes = previousExisted ? await fsp.readFile(previousPath) : null
    try {
      await atomicWrite(activePath, `${JSON.stringify(previous, null, 2)}\n`)
      await atomicWrite(previousPath, `${JSON.stringify(current.registry, null, 2)}\n`)
    } catch (error) {
      // Best-effort transaction recovery if the second rename fails.
      if (activeBytes) await atomicWrite(activePath, activeBytes).catch(() => {})
      else await fsp.unlink(activePath).catch(() => {})
      if (previousBytes) await atomicWrite(previousPath, previousBytes).catch(() => {})
      else await fsp.unlink(previousPath).catch(() => {})
      throw error
    }
    return persistStatus({
      state: 'rolled-back',
      currentVersion: previous.registryVersion,
      previousVersion: current.registry.registryVersion,
      source: 'remote',
      updatedAt: new Date(now()).toISOString(),
      error: null,
      changes: catalogChanges(current.registry, previous),
    })
  }

  return {
    loadActiveRegistry,
    getStatus,
    checkForUpdates,
    rollbackRegistry,
    hydrateStatus,
    setMappingValidator(validator) { mappingValidator = validator },
  }
}

export { validateRegistry, versionAtLeast, catalogChanges }
