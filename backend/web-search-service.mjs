import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createJsonStore } from './json-store.mjs'
import { WEB_SEARCH_DEFAULT_RESULTS } from './config.mjs'
import { formatKeychainRef, isKeychainRef, parseKeychainRef } from './secret-store.mjs'
import { isShellBackend } from './platform/runtime-mode.mjs'

const ENCRYPTED_KEY_PREFIX = 'enc:safe-storage:'
const SHELL_FILE_KEY_PREFIX = 'enc:shell-file:'
const DEFAULT = { enabled: false, apiKeyEncrypted: '', endpoint: '', maxResults: WEB_SEARCH_DEFAULT_RESULTS }
const RUNTIME_ENV = {
  enabled: 'TASKWEAVER_WEB_SEARCH_ENABLED',
  endpoint: 'TASKWEAVER_WEB_SEARCH_ENDPOINT',
  maxResults: 'TASKWEAVER_WEB_SEARCH_MAX_RESULTS',
  apiKey: 'TASKWEAVER_WEB_SEARCH_API_KEY_SECRET',
}

function formatSearchResult(query, result) {
  const sources = Array.isArray(result?.sources) ? result.sources : []
  const content = typeof result?.content === 'string' ? result.content.trim() : ''
  if (sources.length === 0 && !content) {
    return `未找到与「${query}」相关的公开检索结果，请尝试更换关键词。`
  }

  const lines = [`### 检索结果：「${query}」\n`]
  if (content) lines.push(content, '')
  sources.forEach((source, index) => {
    const title = source.title?.trim() || `结果 ${index + 1}`
    lines.push(`**${index + 1}. [${title}](${source.url})**`)
    if (source.snippet) lines.push(source.snippet.trim())
    if (source.publishedAt) lines.push(`发布时间：${source.publishedAt}`)
    lines.push('')
  })
  if (result?.truncated) lines.push('（结果已按数量上限截断。）')
  return lines.join('\n').trim()
}

/** Settings and safe credential storage for the Host-owned web-search provider. */
export function createWebSearchService({
  userData,
  safeStorage,
  secrets = null,
  searchWithHost,
  assertRuntimeConfigChangeSafe,
  onRuntimeConfigChanged,
}) {
  const store = createJsonStore(path.join(userData, 'taskweaver-web-search.json'), DEFAULT)

  async function encryptApiKey(value) {
    if (secrets) {
      const account = `websearch:apiKey:${randomUUID()}`
      await secrets.set(account, String(value))
      return formatKeychainRef(account)
    }
    if (isShellBackend()) {
      return `${SHELL_FILE_KEY_PREFIX}${Buffer.from(String(value), 'utf8').toString('base64')}`
    }
    if (!safeStorage?.isEncryptionAvailable?.()) {
      throw new Error('系统安全存储不可用，已拒绝保存网页搜索 API Key。')
    }
    try {
      return `${ENCRYPTED_KEY_PREFIX}${safeStorage.encryptString(value).toString('base64')}`
    } catch {
      throw new Error('系统安全存储加密网页搜索 API Key 失败，已拒绝保存。')
    }
  }

  async function decryptApiKey(value) {
    if (typeof value !== 'string' || !value) return ''
    if (isKeychainRef(value)) {
      if (!secrets) throw new Error('网页搜索 API Key 引用了系统钥匙串，但当前平台没有安全存储服务。')
      const secret = await secrets.get(parseKeychainRef(value))
      if (typeof secret !== 'string') throw new Error('Keychain 中缺少网页搜索 API Key；请重新保存密钥。')
      return secret
    }
    if (value.startsWith(SHELL_FILE_KEY_PREFIX)) {
      return Buffer.from(value.slice(SHELL_FILE_KEY_PREFIX.length), 'base64').toString('utf8')
    }
    if (!value.startsWith(ENCRYPTED_KEY_PREFIX)) {
      throw new Error('网页搜索 API Key 未加密，已拒绝使用。')
    }
    if (isShellBackend()) {
      throw new Error('网页搜索 API Key 为 Electron 钥匙串格式，Shell 后端无法解密；请重新保存密钥。')
    }
    if (!safeStorage?.isEncryptionAvailable?.()) {
      throw new Error('系统安全存储不可用，无法读取网页搜索 API Key。')
    }
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(ENCRYPTED_KEY_PREFIX.length), 'base64'))
    } catch {
      throw new Error('无法解密网页搜索 API Key。')
    }
  }

  let migrationPromise = null
  async function readStoredConfig() {
    let config = await store.read()
    const legacyShellKey = typeof config?.apiKeyEncrypted === 'string'
      && config.apiKeyEncrypted.startsWith(SHELL_FILE_KEY_PREFIX)
    if (Object.hasOwn(config ?? {}, 'apiKey') || (secrets && legacyShellKey)) {
      migrationPromise ??= store.update((latest) => {
        return migrateWebSearchConfig(latest)
      }).finally(() => { migrationPromise = null })
      await migrationPromise
      config = await store.read()
    }
    return { ...DEFAULT, ...config }
  }

  async function migrateWebSearchConfig(latest) {
    const migrated = { ...DEFAULT, ...latest }
    const oldKey = typeof latest?.apiKey === 'string' ? latest.apiKey.trim() : ''
    if (oldKey && !migrated.apiKeyEncrypted) {
      if (secrets || safeStorage?.isEncryptionAvailable?.()) migrated.apiKeyEncrypted = await encryptApiKey(oldKey)
      else {
        migrated.apiKeyEncrypted = ''
        migrated.enabled = false
        console.warn('[web-search] 已清除无法安全迁移的历史明文 API Key。')
      }
    }
    if (secrets && typeof migrated.apiKeyEncrypted === 'string'
      && migrated.apiKeyEncrypted.startsWith(SHELL_FILE_KEY_PREFIX)) {
      const oldShellKey = Buffer.from(migrated.apiKeyEncrypted.slice(SHELL_FILE_KEY_PREFIX.length), 'base64').toString('utf8')
      migrated.apiKeyEncrypted = await encryptApiKey(oldShellKey)
    }
    delete migrated.apiKey
    return migrated
  }

  async function notifyRuntimeConfigChanged() {
    await onRuntimeConfigChanged?.()
  }

  return {
    async getConfig() {
      const raw = await readStoredConfig()
      return {
        enabled: raw.enabled === true,
        hasKey: Boolean(raw.apiKeyEncrypted),
        endpoint: raw.endpoint || '',
        maxResults: Number.isFinite(raw.maxResults) ? raw.maxResults : WEB_SEARCH_DEFAULT_RESULTS,
      }
    },
    async setConfig(patch) {
      const prev = await readStoredConfig()
      let nextKey = prev.apiKeyEncrypted ?? ''
      let newlyStoredKeyRef = null
      if (patch.clearKey === true) {
        nextKey = ''
      } else if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
        const requestedKey = patch.apiKey.trim()
        let currentKey = null
        if (nextKey) {
          try {
            currentKey = await decryptApiKey(nextKey)
          } catch {
            // A replacement key can repair a key that can no longer be decrypted.
          }
        }
        if (requestedKey !== currentKey) {
          nextKey = await encryptApiKey(requestedKey)
          if (isKeychainRef(nextKey)) newlyStoredKeyRef = nextKey
        }
      }

      const next = {
        enabled: patch.enabled !== undefined ? patch.enabled === true : prev.enabled ?? false,
        apiKeyEncrypted: nextKey,
        endpoint: typeof patch.endpoint === 'string' ? patch.endpoint.trim() : prev.endpoint ?? '',
        maxResults: Number.isFinite(patch.maxResults)
          ? Math.min(20, Math.max(1, patch.maxResults))
          : prev.maxResults ?? WEB_SEARCH_DEFAULT_RESULTS,
      }

      const changed = next.enabled !== (prev.enabled === true)
        || next.apiKeyEncrypted !== (prev.apiKeyEncrypted ?? '')
        || next.endpoint !== (prev.endpoint || '')
        || next.maxResults !== (Number.isFinite(prev.maxResults) ? prev.maxResults : WEB_SEARCH_DEFAULT_RESULTS)
      if (!changed) {
        return {
          enabled: next.enabled,
          hasKey: Boolean(next.apiKeyEncrypted),
          endpoint: next.endpoint,
          maxResults: next.maxResults,
        }
      }

      try {
        await assertRuntimeConfigChangeSafe?.()
        await store.write(next)
      } catch (error) {
        if (newlyStoredKeyRef && secrets) await secrets.delete(parseKeychainRef(newlyStoredKeyRef)).catch(() => {})
        throw error
      }
      if (isKeychainRef(prev.apiKeyEncrypted) && prev.apiKeyEncrypted !== nextKey && secrets) {
        await secrets.delete(parseKeychainRef(prev.apiKeyEncrypted)).catch(() => {})
      }
      await notifyRuntimeConfigChanged()
      return {
        enabled: next.enabled,
        hasKey: Boolean(next.apiKeyEncrypted),
        endpoint: next.endpoint,
        maxResults: next.maxResults,
      }
    },
    async testSearch(query = 'test') {
      const cfg = await readStoredConfig()
      const trimmedQuery = String(query ?? '').trim()
      if (!trimmedQuery) return { ok: false, error: 'query 不能为空' }
      if (typeof searchWithHost !== 'function') {
        return { ok: false, error: 'Host 网页搜索服务尚未连接。' }
      }

      try {
        const result = await searchWithHost({
          query: trimmedQuery,
          maxResults: Number.isFinite(cfg.maxResults) ? cfg.maxResults : WEB_SEARCH_DEFAULT_RESULTS,
        })
        return { ok: true, text: formatSearchResult(trimmedQuery, result) }
      } catch (err) {
        let secret = ''
        try { secret = await decryptApiKey(cfg.apiKeyEncrypted) } catch { /* Keep the provider error when saved credentials are unavailable. */ }
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: (secret ? message.split(secret).join('[redacted]') : message).slice(0, 1_000) }
      }
    },
    async prepareRuntimeIntegration() {
      const config = await readStoredConfig()
      let enabled = config.enabled === true
      const environment = {
        [RUNTIME_ENV.enabled]: enabled ? 'true' : 'false',
        [RUNTIME_ENV.endpoint]: String(config.endpoint ?? ''),
        [RUNTIME_ENV.maxResults]: String(Number.isFinite(config.maxResults) ? config.maxResults : WEB_SEARCH_DEFAULT_RESULTS),
      }
      if (enabled && config.apiKeyEncrypted) {
        try {
          const key = await decryptApiKey(config.apiKeyEncrypted)
          if (key) environment[RUNTIME_ENV.apiKey] = key
        } catch (error) {
          // Host startup (including after Codex OAuth) must not fail because an
          // optional web-search key was encrypted with an unavailable keychain.
          enabled = false
          environment[RUNTIME_ENV.enabled] = 'false'
          console.warn(
            '[web-search] 无法向 Z Host 注入网页搜索密钥，已临时关闭网页搜索：',
            error instanceof Error ? error.message : error,
          )
        }
      }
      return { environment }
    },
  }
}
