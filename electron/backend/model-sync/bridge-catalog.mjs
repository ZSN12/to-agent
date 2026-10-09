/**
 * Map discovery export into `taskweaver-bridge` entries in taskweaver/models.json.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { TASKWEAVER_BRIDGE_API } from '../taskweaver-bridge-models.mjs'
import { modelSourceNamespace } from './ocx-cli.mjs'
import { applyOpenCodexDshReasoningOverlay } from './overlay.mjs'
import { BRIDGE_EXPORT_MAPPINGS, LOCAL_AGENT_INTEGRATIONS } from './local-agent-registry.mjs'

export { BRIDGE_EXPORT_MAPPINGS, LOCAL_AGENT_INTEGRATIONS }

function copyModelEntry(entry) {
  if (!entry || typeof entry !== 'object' || entry.isTierVariant) return null
  const id = String(entry.id ?? '').trim()
  if (!id) return null
  const row = { id, name: String(entry.name ?? id) }
  if (Number.isInteger(entry.contextWindow) && entry.contextWindow > 0) row.contextWindow = entry.contextWindow
  if (Number.isInteger(entry.maxTokens) && entry.maxTokens > 0) row.maxTokens = entry.maxTokens
  if (entry.reasoning === true) row.reasoning = true
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

/**
 * @param {Record<string, unknown>} exportDoc
 * @returns {Record<string, Record<string, unknown>>}
 */
export function bridgeProviderBlocksFromExport(exportDoc) {
  const providers = exportDoc?.providers ?? {}
  const out = {}
  for (const mapping of LOCAL_AGENT_INTEGRATIONS) {
    const models = []
    const extras = {}
    for (const exportId of mapping.exportProviderIds) {
      const block = providers[exportId]
      if (!block || typeof block !== 'object') continue
      models.push(...modelsFromExportBlock(block))
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
  return next
}

/**
 * @param {string} modelsPath
 * @param {Record<string, unknown>} exportDoc
 * @param {{ migrateAwayOpenCodex?: boolean }} [options]
 */
export async function writeModelsJsonFromBridgeExport(modelsPath, exportDoc, options = {}) {
  let current = { providers: {} }
  try {
    const raw = await fs.readFile(modelsPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.providers && typeof parsed.providers === 'object') current = parsed
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  const bridgeBlocks = bridgeProviderBlocksFromExport(exportDoc)
  const merged = mergeBridgeBlocksIntoModelsDoc(current, bridgeBlocks, options)
  const overlay = applyOpenCodexDshReasoningOverlay(merged)
  await fs.mkdir(path.dirname(modelsPath), { recursive: true })
  await fs.writeFile(modelsPath, `${JSON.stringify(overlay, null, 2)}\n`, { mode: 0o600 })
  return { modelsDoc: overlay, bridgeBlocks, bridgeProviderIds: Object.keys(bridgeBlocks) }
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
