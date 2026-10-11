/**
 * Parse `api: taskweaver-bridge` blocks from taskweaver/models.json.
 */

export const TASKWEAVER_BRIDGE_API = 'taskweaver-bridge'

export function isTaskWeaverBridgeProviderBlock(block) {
  if (!block || typeof block !== 'object') return false
  const api = typeof block.api === 'string' ? block.api.trim() : ''
  return api === TASKWEAVER_BRIDGE_API
}

function mapModelEntry(entry) {
  if (!entry || typeof entry !== 'object' || !entry.id) return null
  const row = { id: String(entry.id), name: String(entry.name ?? entry.id) }
  if (Number.isInteger(entry.contextWindow) && entry.contextWindow > 0) row.contextWindow = entry.contextWindow
  if (Number.isInteger(entry.maxTokens) && entry.maxTokens > 0) row.maxTokens = entry.maxTokens
  if (entry.reasoning === true) row.reasoning = true
  if (entry.thinkingLevelMap && typeof entry.thinkingLevelMap === 'object') row.thinkingLevelMap = entry.thinkingLevelMap
  if (typeof entry.defaultThinkingLevel === 'string') row.defaultThinkingLevel = entry.defaultThinkingLevel
  if (entry.compat && typeof entry.compat === 'object') row.compat = entry.compat
  return row
}

export function bridgeProviderBlockToDshProfile(providerId, block) {
  if (!isTaskWeaverBridgeProviderBlock(block)) throw new Error(`提供方 ${providerId} 不是 taskweaver-bridge`)
  const bridgeKind = typeof block.bridgeKind === 'string' ? block.bridgeKind.trim() : ''
  if (!bridgeKind) throw new Error(`提供方 ${providerId} 缺少 bridgeKind`)
  const displayName = typeof block.name === 'string' && block.name.trim() ? block.name.trim() : providerId
  const models = Array.isArray(block.models) ? block.models.filter((m) => m && !m.isTierVariant).map(mapModelEntry).filter(Boolean) : []
  const profile = { bridgeKind, displayName, models }
  if (typeof block.loopbackBaseURL === 'string' && block.loopbackBaseURL.trim()) profile.loopbackBaseURL = block.loopbackBaseURL.trim().replace(/\/+$/, '')
  if (typeof block.relayBaseURL === 'string' && block.relayBaseURL.trim()) profile.relayBaseURL = block.relayBaseURL.trim().replace(/\/+$/, '')
  if (typeof block.baseUrl === 'string' && block.baseUrl.trim()) profile.baseUrl = block.baseUrl.trim().replace(/\/+$/, '')
  if (typeof block.project === 'string' && block.project.trim()) profile.project = block.project.trim()
  return profile
}

export function bridgeProfilesFromModelsDoc(modelsDoc, providerIds) {
  const providers = modelsDoc?.providers ?? {}
  const ids = providerIds?.length ? providerIds : Object.keys(providers).filter((id) => isTaskWeaverBridgeProviderBlock(providers[id]))
  const out = {}
  for (const id of ids) {
    const block = providers[id]
    if (!isTaskWeaverBridgeProviderBlock(block)) continue
    out[id] = bridgeProviderBlockToDshProfile(id, block)
  }
  return out
}

export function splitModelsDocProviders(modelsDoc) {
  const bridgeIds = []
  const piAiIds = []
  for (const [id, block] of Object.entries(modelsDoc?.providers ?? {})) {
    if (!block || typeof block !== 'object') continue
    if (isTaskWeaverBridgeProviderBlock(block)) { bridgeIds.push(id); continue }
    if (id === 'opencodex' || id === 'custom-gateway' || id.startsWith('custom-')) { piAiIds.push(id); continue }
    if (typeof block.baseUrl === 'string' && block.baseUrl.trim()) piAiIds.push(id)
  }
  return { bridgeIds, piAiIds }
}
