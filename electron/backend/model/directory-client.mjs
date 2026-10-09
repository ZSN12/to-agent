import { MODEL_DIRECTORY_TTL_MS } from './constants.mjs'
import { dshValue, sleep } from './shared.mjs'

/** Host 目录拉取与 TTL 缓存（catalog / 凭据 / getDshModelConfig 共用）。 */
export function createModelDirectoryClient({ dshHostManager }) {
  /** @type {{ value: object, expiresAt: number } | null} */
  let modelDirectoryCache = null
  /** @type {Promise<object> | null} */
  let modelDirectoryInflight = null

  async function fetchDshModelDirectoryOnce() {
    if (!dshHostManager) throw new Error('Z 模型目录未连接')
    const { api } = await dshHostManager.start()
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
    modelDirectoryCache = null
    modelDirectoryInflight = null
  }

  async function fetchDshModelDirectoryWithRetry() {
    let lastError
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const directory = await fetchDshModelDirectoryOnce()
        if (attempt > 0 && (directory.providers.length || directory.groups.length)) {
          console.info(`DSH 模型目录在第 ${attempt + 1} 次尝试后可用`)
        }
        return directory
      } catch (error) {
        lastError = error
        if (attempt < 5) await sleep(400 * (attempt + 1))
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  function getDshModelDirectory({ force = false } = {}) {
    if (!force) {
      if (modelDirectoryCache && Date.now() < modelDirectoryCache.expiresAt) {
        return Promise.resolve(modelDirectoryCache.value)
      }
      if (modelDirectoryInflight) return modelDirectoryInflight
    }
    const pending = fetchDshModelDirectoryWithRetry().then(
      (directory) => {
        modelDirectoryCache = { value: directory, expiresAt: Date.now() + MODEL_DIRECTORY_TTL_MS }
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
    modelDirectoryCache = { value: directory, expiresAt: Date.now() + MODEL_DIRECTORY_TTL_MS }
  }

  async function reloadDshHostAfterCredentialChange() {
    invalidateModelDirectoryCache()
    if (!dshHostManager) return
    try {
      await dshHostManager.stop()
      await dshHostManager.start()
    } catch (error) {
      console.warn('DSH Host 凭据变更后重载失败:', error instanceof Error ? error.message : error)
    }
  }

  return {
    fetchDshModelDirectoryOnce,
    getDshModelDirectory,
    invalidateModelDirectoryCache,
    seedModelDirectoryCache,
    reloadDshHostAfterCredentialChange,
  }
}
