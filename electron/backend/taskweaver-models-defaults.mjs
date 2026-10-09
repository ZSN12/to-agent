import fs from 'node:fs/promises'
import path from 'node:path'
import { isTaskWeaverBridgeProviderBlock } from './taskweaver-bridge-models.mjs'
import { resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'

const DEFAULTS_REL = path.join('registry', 'taskweaver-models.defaults.json')

export function resolveBundledModelsDefaultsPath(appPath) {
  return path.join(appPath, DEFAULTS_REL)
}

export async function loadBundledDefaultModelsDoc(appPath) {
  const defaultsPath = resolveBundledModelsDefaultsPath(appPath)
  const raw = await fs.readFile(defaultsPath, 'utf8')
  const doc = JSON.parse(raw)
  if (!doc.providers || typeof doc.providers !== 'object') {
    throw new Error(`无效的默认 models 文档：${defaultsPath}`)
  }
  return doc
}

/**
 * Add bundled default provider blocks when missing (additive; never overwrites user entries).
 */
export function mergeMissingDefaultProviders(modelsDoc, defaultsDoc) {
  const out = structuredClone(modelsDoc ?? { providers: {} })
  if (!out.providers || typeof out.providers !== 'object') out.providers = {}
  for (const [id, block] of Object.entries(defaultsDoc?.providers ?? {})) {
    if (!block || typeof block !== 'object') continue
    if (out.providers[id]) continue
    out.providers[id] = structuredClone(block)
  }
  return out
}

export function modelsDocHasBridgeProvider(modelsDoc) {
  return Object.values(modelsDoc?.providers ?? {}).some((block) => isTaskWeaverBridgeProviderBlock(block))
}

/**
 * Ensure `taskweaver/models.json` exists and includes bundled defaults (e.g. bridge-composer).
 * @returns {{ created: boolean, updated: boolean, modelsPath: string, addedProviderIds: string[] }}
 */
export async function ensureTaskWeaverModelsJson({ userDataPath, appPath }) {
  if (!userDataPath || !appPath) {
    throw new Error('ensureTaskWeaverModelsJson: userDataPath 与 appPath 不能为空')
  }
  const modelsPath = resolveTaskWeaverModelsPath(userDataPath)
  const defaultsDoc = await loadBundledDefaultModelsDoc(appPath)
  let existing = { providers: {} }
  let created = false
  try {
    const raw = await fs.readFile(modelsPath, 'utf8')
    existing = JSON.parse(raw)
    if (!existing.providers || typeof existing.providers !== 'object') existing = { providers: {} }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
    created = true
  }

  const beforeIds = new Set(Object.keys(existing.providers ?? {}))
  const merged = mergeMissingDefaultProviders(existing, defaultsDoc)
  const addedProviderIds = Object.keys(merged.providers).filter((id) => !beforeIds.has(id))
  const updated = addedProviderIds.length > 0

  if (created || updated) {
    await fs.mkdir(path.dirname(modelsPath), { recursive: true })
    await fs.writeFile(modelsPath, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 })
  }

  return { created, updated, modelsPath, addedProviderIds }
}
