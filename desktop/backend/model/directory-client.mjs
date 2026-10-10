import { dshValue } from './shared.mjs'

/** Host 目录快照（catalog / 凭据 / getDshModelConfig 共用），由 Host 事件失效。 */
export function createModelDirectoryClient({ dshHostManager }) {
  /** @type {{ value: object } | null} */
  let modelDirectoryCache = null
  /** @type {Promise<object> | null} */
  let modelDirectoryInflight = null
  let cacheGeneration = 0

  function diagnosticsError() {
    const diagnostics = String(dshHostManager?.getDiagnostics?.() ?? '').trim()
    return new Error(`Z Host 启动失败${diagnostics ? `：\n${diagnostics}` : ''}`)
  }

  async function ensureHostReady() {
    if (!dshHostManager) throw new Error('Z 模型目录未连接')
    if (dshHostManager.state === 'failed' && typeof dshHostManager.restart === 'function') {
      await dshHostManager.restart()
    }
    if (typeof dshHostManager.whenReady === 'function') return dshHostManager.whenReady()
    return dshHostManager.start()
  }

  async function fetchDshModelDirectoryOnce() {
    const ready = ensureHostReady()
    const { api } = await ready
    const [providerReply, modelReply, settingsReply] = await Promise.all([
      api.llm.providers({}),
      api.llm.models({}),
      api.settings.describe({}),
    ])
    const providerData = dshValue(providerReply, '读取 DSH 提供方')
    const modelData = dshValue(modelReply, '读取 DSH 模型目录')
    const settingsData = dshValue(settingsReply, '读取 DSH 设置')
    return {
      api,
      providers: providerData.providers ?? [],
      groups: modelData.groups ?? [],
      failures: modelData.failures ?? [],
      namespaces: settingsData.namespaces ?? [],
    }
  }

  function invalidateModelDirectoryCache() {
    cacheGeneration += 1
    modelDirectoryCache = null
    modelDirectoryInflight = null
  }

  async function fetchDshModelDirectoryWithRetry() {
    let lastError
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await fetchDshModelDirectoryOnce()
      } catch (error) {
        lastError = error
        if (dshHostManager?.state === 'failed') break
      }
    }
    if (dshHostManager?.state === 'failed') {
      const details = String(dshHostManager.getDiagnostics?.() ?? '').trim()
      if (details && !String(lastError?.message ?? '').includes(details)) {
        throw new Error(`${lastError instanceof Error ? lastError.message : String(lastError)}\n${details}`)
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  function getDshModelDirectory({ force = false } = {}) {
    if (!force) {
      if (modelDirectoryCache) {
        return Promise.resolve(modelDirectoryCache.value)
      }
      if (modelDirectoryInflight) return modelDirectoryInflight
    }
    const generation = cacheGeneration
    const pending = fetchDshModelDirectoryWithRetry().then(
      (directory) => {
        if (generation === cacheGeneration) modelDirectoryCache = { value: directory }
        if (modelDirectoryInflight === pending) modelDirectoryInflight = null
        return directory
      },
      (error) => {
        if (modelDirectoryInflight === pending) modelDirectoryInflight = null
        throw error
      },
    )
    modelDirectoryInflight = pending
    return pending
  }

  function seedModelDirectoryCache(directory) {
    cacheGeneration += 1
    modelDirectoryCache = { value: directory }
    modelDirectoryInflight = null
  }

  async function reloadDshHostAfterCredentialChange() {
    invalidateModelDirectoryCache()
    // Host credentials and settings are hot-published. The next catalog read
    // fetches the new directory without restarting the Host process.
  }

  return {
    fetchDshModelDirectoryOnce,
    getDshModelDirectory,
    invalidateModelDirectoryCache,
    seedModelDirectoryCache,
    reloadDshHostAfterCredentialChange,
  }
}
