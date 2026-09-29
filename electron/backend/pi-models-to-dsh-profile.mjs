/**
 * Map pi `models.json` provider blocks to DSH `llm-pi-ai.providers.<id>` profiles.
 */

export function taskweaverApiKeyEnvRef(providerId) {
  return `TASKWEAVER_${String(providerId).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_API_KEY`
}

function mapModelEntry(entry) {
  if (!entry || typeof entry !== 'object' || !entry.id) return null
  const row = {
    id: String(entry.id),
    name: String(entry.name ?? entry.id),
  }
  if (Number.isInteger(entry.contextWindow) && entry.contextWindow > 0) {
    row.contextWindow = entry.contextWindow
  }
  if (Number.isInteger(entry.maxTokens) && entry.maxTokens > 0) {
    row.maxTokens = entry.maxTokens
  }
  if (entry.reasoning === true && entry.thinkingLevelMap && typeof entry.thinkingLevelMap === 'object') {
    const efforts = {}
    for (const [level, wire] of Object.entries(entry.thinkingLevelMap)) {
      if (wire === null || wire === undefined || wire === '') {
        if (level === 'off') efforts.off = null
        continue
      }
      efforts[level] = String(wire)
    }
    if (Object.keys(efforts).length) row.reasoningEfforts = efforts
  } else if (entry.reasoning === false) {
    row.reasoningEfforts = false
  }
  if (entry.compat && typeof entry.compat === 'object') {
    row.compat = entry.compat
  }
  return row
}

/**
 * @param {string} providerId
 * @param {Record<string, unknown>} block
 */
export function piProviderBlockToDshProfile(providerId, block) {
  if (!block || typeof block !== 'object') {
    throw new Error(`提供方 ${providerId} 配置无效`)
  }
  const baseUrl = typeof block.baseUrl === 'string' ? block.baseUrl.trim() : ''
  const api = typeof block.api === 'string' ? block.api.trim() : ''
  const displayName = typeof block.name === 'string' && block.name.trim()
    ? block.name.trim()
    : providerId
  const models = Array.isArray(block.models)
    ? block.models.filter((m) => m && !m.isTierVariant).map(mapModelEntry).filter(Boolean)
    : []

  const profile = {
    displayName,
    apiKeyEnv: taskweaverApiKeyEnvRef(providerId),
  }
  if (api) profile.api = api
  if (baseUrl) profile.baseURL = baseUrl.replace(/\/+$/, '')
  if (block.compat && typeof block.compat === 'object') {
    profile.compat = block.compat
  }
  if (models.length) profile.models = models
  return profile
}

/**
 * @param {{ providers?: Record<string, unknown> }} modelsDoc
 * @param {string[]} [providerIds] subset; default all keys in doc
 */
export function profilesFromModelsDoc(modelsDoc, providerIds) {
  const providers = modelsDoc?.providers ?? {}
  const ids = providerIds?.length ? providerIds : Object.keys(providers)
  const out = {}
  for (const id of ids) {
    const block = providers[id]
    if (!block || typeof block !== 'object') continue
    out[id] = piProviderBlockToDshProfile(id, block)
  }
  return out
}
