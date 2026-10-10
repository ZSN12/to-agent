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

  async function requestCustomProvider({ baseUrl, apiKey, modelId, api = 'openai-completions', toolCall = false }) {
    const root = String(baseUrl ?? '').trim().replace(/\/+$/, '')
    const key = String(apiKey ?? '').trim()
    if (!root || !key) throw new Error('Base URL 与 API Key 均必填')
    const useResponses = api === 'openai-responses'
    const endpoint = `${root}/${useResponses ? 'responses' : 'chat/completions'}`
    const probeTool = {
      type: 'function',
      name: 'taskweaver_probe',
      description: 'A harmless capability check. Do not perform any external action.',
      parameters: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      },
    }
    const body = useResponses
      ? {
        model: modelId || 'default',
        input: toolCall
          ? 'Call taskweaver_probe exactly once with {"ok":true}. This is only a capability test.'
          : 'Reply with OK.',
        max_output_tokens: toolCall ? 64 : 16,
        ...(toolCall ? { tools: [probeTool], tool_choice: 'required' } : {}),
      }
      : {
        model: modelId || 'default',
        messages: [{ role: 'user', content: toolCall
          ? 'Call taskweaver_probe exactly once with {"ok":true}. This is only a capability test.'
          : 'Reply with OK.' }],
        max_tokens: toolCall ? 64 : 16,
        ...(toolCall ? {
          tools: [{ type: 'function', function: {
            name: probeTool.name,
            description: probeTool.description,
            parameters: probeTool.parameters,
          } }],
          tool_choice: 'required',
        } : {}),
      }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(toolCall ? 30000 : 20000),
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`请求失败 (${response.status}): ${text.slice(0, 280)}`)
    }
    let result
    try { result = JSON.parse(text) } catch { throw new Error('接口返回成功，但响应不是有效 JSON') }

    const method = `POST /${useResponses ? 'responses' : 'chat/completions'}`
    if (toolCall) {
      const called = useResponses
        ? (result.output ?? []).some((item) => item?.type === 'function_call' && item.name === probeTool.name)
        : (result.choices?.[0]?.message?.tool_calls ?? []).some((item) => item?.function?.name === probeTool.name)
      return { ok: true, supported: called, method, status: response.status }
    }

    const hasOutput = useResponses
      ? (typeof result.output_text === 'string' && result.output_text.length > 0)
        || (result.output ?? []).some((item) => item?.type === 'message')
      : typeof result.choices?.[0]?.message?.content === 'string'
        || (result.choices?.[0]?.message?.tool_calls?.length ?? 0) > 0
    if (!hasOutput) throw new Error('接口返回成功，但没有可识别的模型输出')
    return { ok: true, method, status: response.status }
  }

  async function testCustomProvider(payload) {
    return requestCustomProvider(payload)
  }

  async function testCustomProviderToolCall(payload) {
    return requestCustomProvider({ ...payload, toolCall: true })
  }

  async function probeModels({ providerId, baseUrl, apiKey }) {
    let root = String(baseUrl ?? '').trim().replace(/\/+$/, '')
    let key = String(apiKey ?? '').trim()
    let existingModels = []

    const doc = await readModelsDoc(modelsPath)
    if (providerId) {
      const normalizedId = normalizeProviderId(providerId)
      const providerConfig = doc.providers[normalizedId]
      if (providerConfig) {
        if (!root && providerConfig.baseUrl) root = providerConfig.baseUrl.trim().replace(/\/+$/, '')
        existingModels = (providerConfig.models || []).map((m) => m.id)
      }
      if (!key) {
        const cred = await credentials.read(normalizedId)
        if (cred?.key) key = cred.key
      }
    }

    if (!root) throw new Error('缺少 API 地址，无法探测模型')
    if (!key) throw new Error('缺少 API Key 凭据，无法验证并探测模型')

    // 智能尝试 /models 与 /v1/models
    let modelsRaw = null
    const candidateUrls = []
    if (root.endsWith('/v1')) {
      candidateUrls.push(`${root}/models`)
      candidateUrls.push(`${root.slice(0, -3)}/models`)
    } else {
      candidateUrls.push(`${root}/v1/models`)
      candidateUrls.push(`${root}/models`)
    }

    let lastError = null
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${key}`,
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
          signal: AbortSignal.timeout(15000),
        })
        if (res.ok) {
          const json = await res.json()
          if (Array.isArray(json)) {
            modelsRaw = json
            break
          } else if (Array.isArray(json?.data)) {
            modelsRaw = json.data
            break
          } else if (Array.isArray(json?.models)) {
            modelsRaw = json.models
            break
          }
        } else {
          lastError = new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`)
        }
      } catch (err) {
        lastError = err
      }
    }

    if (!modelsRaw) {
      throw new Error(`探测模型列表失败：${lastError?.message || '未能从 API 获取模型列表'}`)
    }

    const existingSet = new Set(existingModels)
    const resultModels = modelsRaw
      .map((item) => {
        const id = String(item.id || item.name || '').trim()
        if (!id) return null
        const name = String(item.name || id).trim()
        const lower = id.toLowerCase()

        let contextWindow = item.context_length || item.context_window || item.max_context_length
        if (!contextWindow) {
          if (lower.includes('1m') || lower.includes('1000k')) contextWindow = 1000000
          else if (lower.includes('200k') || lower.includes('claude-3') || lower.includes('claude-sonnet') || lower.includes('claude-opus')) contextWindow = 200000
          else if (lower.includes('128k') || lower.includes('gpt-4o') || lower.includes('deepseek') || lower.includes('qwen')) contextWindow = 128000
          else if (lower.includes('32k') || lower.includes('glm-4')) contextWindow = 32768
          else contextWindow = 128000
        }

        const reasoning = Boolean(
          lower.includes('r1') ||
          lower.includes('o1') ||
          lower.includes('o3') ||
          lower.includes('reasoner') ||
          lower.includes('thinking')
        )

        return {
          id,
          name,
          contextWindow: Number(contextWindow) || 128000,
          reasoning,
          installed: existingSet.has(id),
        }
      })
      .filter(Boolean)

    resultModels.sort((a, b) => {
      if (a.installed !== b.installed) return a.installed ? 1 : -1
      return a.id.localeCompare(b.id)
    })

    return {
      ok: true,
      providerId: providerId || 'custom-gateway',
      total: resultModels.length,
      newCount: resultModels.filter((m) => !m.installed).length,
      models: resultModels,
    }
  }

  async function batchAddCustomModels({ providerId, models }) {
    const id = normalizeProviderId(providerId)
    if (!Array.isArray(models) || models.length === 0) throw new Error('未选择要添加的模型')

    const doc = await readModelsDoc(modelsPath)
    await migrateLegacyApiKeys(doc)
    const provider = doc.providers[id]
    if (!provider) throw new Error(`未找到自定义提供方 ${id}`)

    const priorModels = Array.isArray(provider.models) ? provider.models : []
    const priorMap = new Map(priorModels.map((m) => [m.id, m]))

    for (const m of models) {
      const mid = String(m.id).trim()
      if (!mid) continue
      const existing = priorMap.get(mid)
      const modelEntry = {
        id: mid,
        name: String(m.name || mid).trim(),
        api: provider.api || 'openai-completions',
        reasoning: Boolean(m.reasoning),
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.contextWindow || 128000,
        maxTokens: m.maxTokens || 8192,
        compat: { supportsReasoningEffort: Boolean(m.reasoning) },
      }
      priorMap.set(mid, { ...(existing || {}), ...modelEntry })
    }

    provider.models = Array.from(priorMap.values())
    await writeModelsDoc(modelsPath, doc)
    await refreshRuntime()

    const addedKeys = models.map((m) => `${id}/${m.id}`)
    return { ok: true, addedCount: models.length, addedKeys }
  }

  return {
    listCustomProviders,
    upsertCustomProvider,
    removeCustomProvider,
    testCustomProvider,
    testCustomProviderToolCall,
    probeModels,
    batchAddCustomModels,
  }
}
