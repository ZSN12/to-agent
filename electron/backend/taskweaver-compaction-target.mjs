import fs from 'node:fs/promises'
import path from 'node:path'

const TARGET_REL = path.join('taskweaver', 'compaction-summarization.json')

export function resolveTaskWeaverCompactionTargetPath(userDataPath) {
  return path.join(userDataPath, TARGET_REL)
}

/**
 * @param {unknown} entry
 * @returns {string | null}
 */
function pickModelIdFromEntry(entry) {
  if (!entry || typeof entry !== 'object' || !entry.id) return null
  if (entry.isTierVariant) return null
  return String(entry.id)
}

/**
 * @param {unknown[]} models
 * @param {string} providerId
 * @returns {string | null}
 */
function pickSummarizationModelId(models, providerId) {
  const ids = []
  for (const entry of models) {
    const id = pickModelIdFromEntry(entry)
    if (id) ids.push(id)
  }
  if (!ids.length) return null
  if (providerId === 'opencodex') {
    const fast = ids.find((id) => /fast/i.test(id))
    if (fast) return fast
  }
  return ids[0]
}

/**
 * @param {string} providerId
 * @param {Record<string, unknown>} block
 * @param {{ read?: (id: string) => Promise<{ key?: string } | null> }} [credentialStore]
 */
async function providerHasCredentials(providerId, block, credentialStore) {
  if (typeof block.apiKey === 'string' && block.apiKey.trim().length > 0) return true
  if (credentialStore?.read) {
    const stored = await credentialStore.read(providerId)
    if (stored?.key && String(stored.key).trim()) return true
  }
  if (typeof block.baseUrl === 'string' && block.baseUrl.trim().length > 0) return true
  return false
}

/**
 * Pick a summarization route from models.json. Prefer non-OpenCodex APIs when present
 * (cheaper / more reliable for huge replay); fall back to OpenCodex when it is the only route.
 * @param {{ providers?: Record<string, { apiKey?: string, baseUrl?: string, models?: unknown[] }> }} modelsDoc
 * @param {{ read?: (id: string) => Promise<{ key?: string } | null> }} [credentialStore]
 * @returns {Promise<{ provider: string, model: string } | null>}
 */
export async function resolveCompactionSummarizationFromModelsDoc(modelsDoc, credentialStore) {
  const providers = modelsDoc?.providers ?? {}
  const ids = Object.keys(providers).sort()
  const passOrder = [ids.filter((id) => id !== 'opencodex'), ids.filter((id) => id === 'opencodex')]
  for (const pass of passOrder) {
    for (const providerId of pass) {
      const block = providers[providerId]
      if (!block || typeof block !== 'object') continue
      if (!(await providerHasCredentials(providerId, block, credentialStore))) continue
      const models = Array.isArray(block.models) ? block.models : []
      const modelId = pickSummarizationModelId(models, providerId)
      if (!modelId) continue
      return { provider: providerId, model: modelId }
    }
  }
  return null
}

export async function writeCompactionSummarizationTarget(userDataPath, modelsDoc, credentialStore) {
  if (!userDataPath) return { written: false }
  const targetPath = resolveTaskWeaverCompactionTargetPath(userDataPath)
  // Always unlink the file so DSH uses the session's own model for compaction
  try {
    await fs.unlink(targetPath)
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  return { written: false }
}

/**
 * Env vars read by `@z/dsh-compaction-basic` when `Z_TASKWEAVER_EMBEDDED` is set.
 * @returns {Record<string, string>}
 */
export async function readCompactionSummarizationEnv(userDataPath) {
  if (!userDataPath) return {}
  const targetPath = resolveTaskWeaverCompactionTargetPath(userDataPath)
  try {
    const raw = await fs.readFile(targetPath, 'utf8')
    const doc = JSON.parse(raw)
    const provider = typeof doc.provider === 'string' ? doc.provider.trim() : ''
    const model = typeof doc.model === 'string' ? doc.model.trim() : ''
    if (!provider || !model) return {}
    return {
      TASKWEAVER_COMPACTION_SUMMARIZATION_PROVIDER: provider,
      TASKWEAVER_COMPACTION_SUMMARIZATION_MODEL: model,
    }
  } catch (err) {
    if (err?.code === 'ENOENT') return {}
    throw err
  }
}
