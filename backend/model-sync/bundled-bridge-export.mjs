import fs from 'node:fs/promises'
import { TASKWEAVER_BRIDGE_API } from '../taskweaver-bridge-models.mjs'
import { loadBundledDefaultModelsDoc } from '../taskweaver-models-defaults.mjs'
import { resolveTaskWeaverModelsPath } from '../taskweaver-models-path.mjs'
import { bridgeProviderBlocksFromExport } from './bridge-catalog.mjs'
import { LOCAL_AGENT_INTEGRATIONS } from './local-agent-registry.mjs'

function modelsFromBridgeBlock(block) {
  if (!block || typeof block !== 'object' || !Array.isArray(block.models)) return []
  return block.models
    .filter((entry) => entry && typeof entry === 'object' && String(entry.id ?? '').trim())
    .map((entry) => ({ ...entry }))
}

/**
 * Synthetic `ocx export` document built from shipped defaults + on-disk bridge blocks.
 * Does not require a running OpenCodex HTTP proxy or a user-global `ocx` install.
 */
export async function buildBundledBridgeExportDoc({ appPath, userDataPath }) {
  if (!appPath) throw new Error('buildBundledBridgeExportDoc: appPath 不能为空')
  const defaultsDoc = await loadBundledDefaultModelsDoc(appPath)
  let diskDoc = { providers: {} }
  if (userDataPath) {
    try {
      const raw = await fs.readFile(resolveTaskWeaverModelsPath(userDataPath), 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed?.providers && typeof parsed.providers === 'object') diskDoc = parsed
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err
    }
  }

  const providers = {}
  for (const spec of LOCAL_AGENT_INTEGRATIONS) {
    const diskBlock = diskDoc.providers?.[spec.routeId]
    const defaultBlock = defaultsDoc.providers?.[spec.routeId]
    const block = diskBlock?.api === TASKWEAVER_BRIDGE_API
      ? diskBlock
      : (defaultBlock?.api === TASKWEAVER_BRIDGE_API ? defaultBlock : null)
    const models = modelsFromBridgeBlock(block)
    if (!models.length) continue
    const payload = { models }
    if (spec.bridgeKind === 'google-antigravity') {
      if (typeof block?.baseUrl === 'string' && block.baseUrl.trim()) {
        payload.baseUrl = block.baseUrl.trim().replace(/\/+$/, '')
      }
      if (typeof block?.project === 'string' && block.project.trim()) {
        payload.project = block.project.trim()
      }
    }
    for (const exportId of spec.exportProviderIds) {
      providers[exportId] = structuredClone(payload)
    }
  }
  return { providers }
}

export function exportDocHasBridgeAgents(exportDoc) {
  return Object.keys(bridgeProviderBlocksFromExport(exportDoc ?? {})).length > 0
}

/** Prefer live proxy catalog rows when available; keep bundled rows for missing providers. */
export function mergeBridgeExportDocs(bundled, live) {
  const base = bundled?.providers && typeof bundled.providers === 'object' ? bundled.providers : {}
  const fresh = live?.providers && typeof live.providers === 'object' ? live.providers : {}
  const providers = { ...base }
  for (const [exportId, block] of Object.entries(fresh)) {
    if (block && typeof block === 'object' && Array.isArray(block.models) && block.models.length > 0) {
      providers[exportId] = block
    }
  }
  return { providers }
}
