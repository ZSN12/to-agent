/**
 * Map discovery export into `taskweaver-bridge` entries in taskweaver/models.json.
 */
import fs from 'node:fs/promises'
import { writeJsonAtomically } from '../atomic-json.mjs'
import { TASKWEAVER_BRIDGE_API } from '../taskweaver-bridge-models.mjs'
import { modelSourceNamespace } from './ocx-cli.mjs'
import { applyOpenCodexDshReasoningOverlay } from './overlay.mjs'
import { BRIDGE_EXPORT_MAPPINGS, LOCAL_AGENT_INTEGRATIONS } from './local-agent-registry.mjs'
import { taskweaverApiKeyEnvRef } from '../pi-models-to-dsh-profile.mjs'

export { BRIDGE_EXPORT_MAPPINGS, LOCAL_AGENT_INTEGRATIONS }

// Keep this list aligned with the matching wire model suffixes in the
// Node-native Antigravity adapter. Tests assert that every exposed level routes.
const ANTIGRAVITY_MODEL_REASONING = Object.freeze({
  'gemini-3.8-flash': Object.freeze({ efforts: ['low', 'medium', 'high'], default: 'medium' }),
  'gemini-3.1-pro': Object.freeze({ efforts: ['low', 'high'], default: 'high' }),
})

function copyModelEntry(entry) {
  if (!entry || typeof entry !== 'object' || entry.isTierVariant) return null
  const id = String(entry.id ?? '').trim()
  if (!id) return null
  const row = { id, name: String(entry.name ?? id) }
  if (Number.isInteger(entry.contextWindow) && entry.contextWindow > 0) row.contextWindow = entry.contextWindow
  if (Number.isInteger(entry.maxTokens) && entry.maxTokens > 0) row.maxTokens = entry.maxTokens
  if (entry.reasoning === true) row.reasoning = true
  if (Array.isArray(entry.reasoningEfforts)) row.reasoningEfforts = [...entry.reasoningEfforts]
  if (Array.isArray(entry.inputModalities)) row.inputModalities = [...entry.inputModalities]
  if (entry.antigravityEffortWireModelIds && typeof entry.antigravityEffortWireModelIds === 'object') {
    row.antigravityEffortWireModelIds = entry.antigravityEffortWireModelIds
  }
  if (typeof entry.wireModelId === 'string') row.wireModelId = entry.wireModelId
  if (entry.thinkingLevelMap && typeof entry.thinkingLevelMap === 'object') row.thinkingLevelMap = entry.thinkingLevelMap
  if (typeof entry.defaultThinkingLevel === 'string') row.defaultThinkingLevel = entry.defaultThinkingLevel
  if (entry.compat && typeof entry.compat === 'object') row.compat = entry.compat
  return row
}

function modelsFromExportBlock(block) {
  if (!block || typeof block !== 'object' || !Array.isArray(block.models)) return []
  const out = []
  const seen = new Set()
  for (const entry of block.models) {
    const row = copyModelEntry(entry)
    if (!row || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

function pickAntigravityExtras(block) {
  if (!block || typeof block !== 'object') return {}
  const extras = {}
  if (typeof block.baseUrl === 'string' && block.baseUrl.trim()) {
    extras.baseUrl = block.baseUrl.trim().replace(/\/+$/, '')
  }
  if (typeof block.project === 'string' && block.project.trim()) extras.project = block.project.trim()
  return extras
}

function withAntigravityReasoning(entry, modelId) {
  const capability = ANTIGRAVITY_MODEL_REASONING[modelId]
  if (!capability) return entry

  const efforts = capability.efforts
  const thinkingLevelMap = Object.fromEntries(efforts.map((effort) => {
    const exportedValue = entry.thinkingLevelMap?.[effort]
    return [effort, typeof exportedValue === 'string' && exportedValue.trim() ? exportedValue.trim() : effort]
  }))
  const exportedDefault = String(entry.defaultThinkingLevel ?? '').trim().toLowerCase()
  const defaultThinkingLevel = efforts.includes(exportedDefault)
    ? exportedDefault
    : capability.default

  return {
    ...entry,
    reasoning: true,
    thinkingLevelMap,
    defaultThinkingLevel,
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]))
  }
  return value
}

/**
 * @param {Record<string, unknown>} exportDoc
 * @returns {Record<string, Record<string, unknown>>}
 */
export function bridgeProviderBlocksFromExport(exportDoc) {
  const providers = exportDoc?.providers ?? {}
  const out = {}
  for (const mapping of LOCAL_AGENT_INTEGRATIONS) {
    if (mapping.bridgeKind === 'openai-compat') {
      continue
    }
    const models = []
    const extras = {}
    const exactExportIds = mapping.exportProviderIds ?? []
    const aggregateExportIds = mapping.aggregateExportProviderIds ?? []
    const seenModelIds = new Set()
    for (const exportId of [...exactExportIds, ...aggregateExportIds]) {
      const block = providers[exportId]
      if (!block || typeof block !== 'object') continue
      const isAggregateExport = aggregateExportIds.includes(exportId)
      const raw = modelsFromExportBlock(block)
      const filtered = raw.filter((entry) => {
        const ns = modelSourceNamespace(entry.id)
        if (mapping.bridgeKind === 'cursor' || mapping.routeId === 'bridge-composer') {
          // Cursor 桥仅接收以 cursor/ 为前缀或 cursor 命名空间的模型，杜绝 workbuddy/ 等混入
          return ns === 'cursor' || entry.id.startsWith('cursor/')
        }
        if (mapping.bridgeKind === 'google-antigravity' || mapping.routeId === 'bridge-antigravity') {
          // The aggregate `opencodex` block contains several vendors; only accept its
          // Antigravity namespace. The dedicated provider block may contain bare model ids.
          return isAggregateExport ? ns === 'google-antigravity'
            : ns === 'google-antigravity' || ns === 'other'
        }
        return true
      })
      for (const entry of filtered) {
        const canonicalId = entry.id.replace(/^google-antigravity\//, '')
        if (seenModelIds.has(canonicalId)) continue
        seenModelIds.add(canonicalId)
        models.push(mapping.bridgeKind === 'google-antigravity'
          ? withAntigravityReasoning(entry, canonicalId)
          : entry)
      }
      if (mapping.bridgeKind === 'google-antigravity') {
        Object.assign(extras, pickAntigravityExtras(block))
      }
    }
    if (!models.length) continue
    out[mapping.routeId] = {
      name: mapping.providerDisplayName,
      api: TASKWEAVER_BRIDGE_API,
      bridgeKind: mapping.bridgeKind,
      models,
      ...extras,
    }
  }
  return out
}

/**
 * 清洗 modelsDoc，剔除 bridge-composer 中误混入的非 cursor 模型
 * @param {Record<string, unknown>} modelsDoc
 */
export function sanitizeModelsDoc(modelsDoc) {
  if (!modelsDoc || typeof modelsDoc !== 'object') return modelsDoc
  if (!modelsDoc.providers || typeof modelsDoc.providers !== 'object') return modelsDoc
  const workbuddy = modelsDoc.providers.workbuddy
  if (workbuddy && typeof workbuddy === 'object' && !Array.isArray(workbuddy) && typeof workbuddy.apiKey === 'string') {
    delete workbuddy.apiKey
    workbuddy.apiKeyEnv = taskweaverApiKeyEnvRef('workbuddy')
  }
  const composer = modelsDoc.providers['bridge-composer']
  if (composer && Array.isArray(composer.models)) {
    composer.models = composer.models.filter((m) => {
      const id = String(m?.id ?? '')
      const ns = modelSourceNamespace(id)
      return ns === 'cursor' || id.startsWith('cursor/')
    })
  }
  return modelsDoc
}

/**
 * @param {{ providers?: Record<string, unknown> }} modelsDoc
 * @param {Record<string, Record<string, unknown>>} bridgeBlocks
 * @param {{ migrateAwayOpenCodex?: boolean }} [options]
 */
export function mergeBridgeBlocksIntoModelsDoc(modelsDoc, bridgeBlocks, options = {}) {
  const next = structuredClone(modelsDoc ?? { providers: {} })
  if (!next.providers || typeof next.providers !== 'object') next.providers = {}
  for (const [id, block] of Object.entries(bridgeBlocks ?? {})) {
    if (!block || typeof block !== 'object') continue
    next.providers[id] = block
  }
  if (options.migrateAwayOpenCodex) {
    const oc = next.providers.opencodex
    const composer = next.providers['bridge-composer']
    if (composer && oc && typeof oc === 'object') {
      delete next.providers.opencodex
    }
  }
  return sanitizeModelsDoc(next)
}

/**
 * @param {string} modelsPath
 * @param {Record<string, unknown>} exportDoc
 * @param {{ migrateAwayOpenCodex?: boolean, workbuddyBlock?: Record<string, unknown>, removeWorkBuddy?: boolean }} [options]
 */
export async function writeModelsJsonFromBridgeExport(modelsPath, exportDoc, options = {}) {
  let current = { providers: {} }
  let sanitizedExistingConfig = false
  try {
    const raw = await fs.readFile(modelsPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.providers && typeof parsed.providers === 'object') {
      const beforeSanitize = JSON.stringify(parsed)
      current = sanitizeModelsDoc(parsed)
      sanitizedExistingConfig = beforeSanitize !== JSON.stringify(current)
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  const bridgeBlocks = bridgeProviderBlocksFromExport(exportDoc)
  const merged = mergeBridgeBlocksIntoModelsDoc(current, bridgeBlocks, options)
  if (options.workbuddyBlock) {
    merged.providers.workbuddy = options.workbuddyBlock
  }
  if (options.removeWorkBuddy) delete merged.providers.workbuddy
  sanitizeModelsDoc(merged)
  const overlay = applyOpenCodexDshReasoningOverlay(merged)
  const changed = JSON.stringify(stableValue(current)) !== JSON.stringify(stableValue(overlay))
  const allProviderIds = Object.keys(bridgeBlocks)
  if (options.workbuddyBlock || overlay.providers?.workbuddy) {
    if (!allProviderIds.includes('workbuddy')) allProviderIds.push('workbuddy')
  }
  if (!changed && !sanitizedExistingConfig) {
    return { modelsDoc: current, bridgeBlocks, bridgeProviderIds: allProviderIds, changed: false }
  }
  await writeJsonAtomically(modelsPath, overlay, { mode: 0o600 })
  return { modelsDoc: overlay, bridgeBlocks, bridgeProviderIds: allProviderIds, changed: true }
}

/**
 * @param {{ providers?: Record<string, unknown> }} modelsDoc
 * @param {string[]} [providerIds]
 */
export function listModelsFromBridgeDoc(modelsDoc, providerIds) {
  const providers = modelsDoc?.providers ?? {}
  const ids = providerIds?.length
    ? providerIds
    : Object.keys(providers).filter((id) => providers[id]?.api === TASKWEAVER_BRIDGE_API)
  const rows = []
  for (const providerId of ids) {
    const block = providers[providerId]
    if (!block || block.api !== TASKWEAVER_BRIDGE_API || !Array.isArray(block.models)) continue
    for (const entry of block.models) {
      const row = copyModelEntry(entry)
      if (!row) continue
      rows.push({
        key: `${providerId}/${row.id}`,
        name: row.name,
        id: row.id,
        provider: providerId,
        source: modelSourceNamespace(row.id),
        bridgeKind: block.bridgeKind,
      })
    }
  }
  return rows
}

/** Map legacy `opencodex/<modelId>` keys to bridge route keys when present. */
export function legacyOpenCodexKeyToBridge(key) {
  const text = String(key ?? '')
  if (!text.startsWith('opencodex/')) return null
  const modelId = text.slice('opencodex/'.length)
  if (!modelId) return null
  return `bridge-composer/${modelId}`
}
