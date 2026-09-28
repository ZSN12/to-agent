import fs from 'node:fs/promises'
import path from 'node:path'

const CUSTOM_PROVIDER_PREFIX = 'custom-'

function normalizeProviderId(raw) {
  const id = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!id) throw new Error('提供方 ID 无效')
  if (!id.startsWith(CUSTOM_PROVIDER_PREFIX)) {
    return `${CUSTOM_PROVIDER_PREFIX}${id}`
  }
  return id
}

async function readModelsDoc(modelsPath) {
  try {
    const raw = await fs.readFile(modelsPath, 'utf8')
    const doc = JSON.parse(raw)
    if (!doc.providers || typeof doc.providers !== 'object') {
      return { providers: {} }
    }
    return doc
  } catch (err) {
    if (err?.code === 'ENOENT') return { providers: {} }
    throw err
  }
}

async function writeModelsDoc(modelsPath, doc) {
  await fs.mkdir(path.dirname(modelsPath), { recursive: true })
  const temporaryPath = `${modelsPath}.${process.pid}.tmp`
  await fs.writeFile(temporaryPath, `${JSON.stringify(doc, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await fs.rename(temporaryPath, modelsPath)
  await fs.chmod(modelsPath, 0o600).catch(() => {})
}

/**
 * DSH / pi 风格：在 models.json 注册 OpenAI 兼容提供方。
 */
export function createCustomProviderService({ modelsPath, credentials, refreshRuntime }) {
  async function migrateLegacyApiKeys(doc) {
    let changed = false
    for (const [id, cfg] of Object.entries(doc.providers)) {
      if (!id.startsWith(CUSTOM_PROVIDER_PREFIX) || typeof cfg?.apiKey !== 'string' || !cfg.apiKey) continue
      // Store the old key before removing it from disk. If OS encryption is unavailable,
      // credentials.modify throws and the legacy config remains intact rather than losing access.
      await credentials.modify(id, async (existing) => existing ?? ({ type: 'api_key', key: cfg.apiKey }))
      delete cfg.apiKey
      changed = true
    }
    if (changed) await writeModelsDoc(modelsPath, doc)
    return changed
  }

  async function listCustomProviders() {
    const doc = await readModelsDoc(modelsPath)
    await migrateLegacyApiKeys(doc)
    const rows = []
    for (const [id, cfg] of Object.entries(doc.providers)) {
      if (!id.startsWith(CUSTOM_PROVIDER_PREFIX)) continue
      rows.push({
        id,
        name: cfg.name || id,
        baseUrl: cfg.baseUrl || '',
        api: cfg.api || 'openai-completions',
        models: (cfg.models || []).map((m) => ({ id: m.id, name: m.name || m.id })),
      })
    }
    return rows.sort((a, b) => a.id.localeCompare(b.id))
  }

  async function upsertCustomProvider(payload) {
    const providerId = normalizeProviderId(payload.providerId || payload.name)
    const baseUrl = String(payload.baseUrl ?? '').trim().replace(/\/+$/, '')
    if (!baseUrl) throw new Error('Base URL 不能为空')
    const apiKey = String(payload.apiKey ?? '').trim()
    const api = payload.api === 'openai-responses' ? 'openai-responses' : 'openai-completions'
    const modelId = String(payload.modelId ?? 'default').trim() || 'default'
    const modelName = String(payload.modelName ?? modelId).trim() || modelId
    const displayName = String(payload.name ?? providerId).trim() || providerId

    const doc = await readModelsDoc(modelsPath)
    await migrateLegacyApiKeys(doc)
    const previousProvider = doc.providers[providerId]
    const previousCredential = await credentials.read(providerId)
    const modelEntry = {
      id: modelId,
      name: modelName,
      api,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: payload.contextWindow ?? 128000,
      maxTokens: payload.maxTokens ?? 8192,
      compat: { supportsReasoningEffort: false },
    }
    const priorModels = Array.isArray(previousProvider?.models) ? previousProvider.models : []
    const mergedModels = [
      ...priorModels.filter((m) => m && m.id !== modelId),
      modelEntry,
    ]
    doc.providers[providerId] = {
      name: displayName,
      baseUrl,
      api,
      authHeader: true,
      models: mergedModels,
    }
    if (!apiKey && !previousCredential?.key) throw new Error('API Key 不能为空')
    try {
      if (apiKey) {
        await credentials.modify(providerId, async () => ({ type: 'api_key', key: apiKey }))
      }
      await writeModelsDoc(modelsPath, doc)
      await refreshRuntime()
    } catch (error) {
      if (previousProvider) doc.providers[providerId] = previousProvider
      else delete doc.providers[providerId]
      await writeModelsDoc(modelsPath, doc).catch(() => {})
      if (previousCredential) {
        await credentials.modify(providerId, async () => previousCredential).catch(() => {})
      } else {
        await credentials.delete(providerId).catch(() => {})
      }
      await refreshRuntime().catch(() => {})
      throw error
    }
    return { providerId, modelKey: `${providerId}/${modelId}` }
  }

  async function removeCustomProvider(providerId) {
    const id = normalizeProviderId(providerId)
    const doc = await readModelsDoc(modelsPath)
    if (!doc.providers[id]) throw new Error('未找到该自定义提供方')
    delete doc.providers[id]
    await writeModelsDoc(modelsPath, doc)
    try {
      await credentials.delete(id)
    } catch {
      // ignore
    }
    await refreshRuntime()
    return { removed: id }
  }

  async function testCustomProvider({ baseUrl, apiKey, modelId, api = 'openai-completions' }) {
    const root = String(baseUrl ?? '').trim().replace(/\/+$/, '')
    const key = String(apiKey ?? '').trim()
    if (!root || !key) throw new Error('Base URL 与 API Key 均必填')

    const modelsUrl = `${root}/models`
    const res = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      return { ok: true, method: 'GET /models', status: res.status }
    }

    const chatUrl = `${root}/chat/completions`
    const body = {
      model: modelId || 'default',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }
    const chatRes = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    })
    const text = await chatRes.text()
    if (chatRes.ok) {
      return { ok: true, method: 'POST /chat/completions', status: chatRes.status }
    }
    throw new Error(`连接失败 (${chatRes.status}): ${text.slice(0, 280)}`)
  }

  return {
    listCustomProviders,
    upsertCustomProvider,
    removeCustomProvider,
    testCustomProvider,
  }
}
