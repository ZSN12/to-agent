import fs from 'node:fs/promises'
import {
  isLlmPiAiNamespaceRegistered,
  pickCredentialOnlyProfiles,
  quarantineBrokenLlmPiAiSection,
  readQuarantinedLlmPiAiProviders,
} from './dsh-settings-repair.mjs'
import { profilesFromModelsDoc, taskweaverApiKeyEnvRef } from './pi-models-to-dsh-profile.mjs'
import { resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'
import { applyOpenCodexDshReasoningOverlay } from './opencodex-reasoning-overlay.mjs'

function dshValue(response, operation) {
  const result = response?.result ?? response
  if (result?.ok === false) throw new Error(result.error?.message || `${operation}失败`)
  return result?.value ?? result
}

async function readModelsDoc(modelsPath) {
  try {
    const raw = await fs.readFile(modelsPath, 'utf8')
    const doc = JSON.parse(raw)
    if (!doc.providers || typeof doc.providers !== 'object') return { providers: {} }
    return doc
  } catch (err) {
    if (err?.code === 'ENOENT') return { providers: {} }
    throw err
  }
}

async function syncProviderSecrets(api, modelsDoc, credentialStore) {
  for (const [providerId, block] of Object.entries(modelsDoc.providers ?? {})) {
    if (!block || typeof block !== 'object') continue
    const ref = taskweaverApiKeyEnvRef(providerId)
    let secret = typeof block.apiKey === 'string' ? block.apiKey.trim() : ''
    if (!secret && credentialStore) {
      const stored = await credentialStore.read(providerId)
      if (stored?.key) secret = String(stored.key).trim()
    }
    if (!secret) continue
    dshValue(await api.credentials.set({ ref, value: secret }), `同步 ${providerId} 凭据`)
  }
}

async function mergeProfilesIntoHost(api, providers) {
  const ids = Object.keys(providers)
  if (!ids.length) return
  const ops = ids.map((id) => ({
    op: 'set',
    path: ['providers', id],
    value: providers[id],
  }))
  dshValue(await api.settings.mutate({ ns: 'llm-pi-ai', ops }), '写入 TaskWeaver 模型提供方')
}

/**
 * Repair broken DSH settings, sync `taskweaver/models.json` into `llm-pi-ai`, refresh routes.
 * @param {{ hostManager: import('../agent/z-host/index.mjs').ZHostManager, userDataPath: string, credentialStore?: import('./credential-store.mjs').CredentialStore }} options
 */
export async function ensureModelsJsonSyncedToDshHost({ hostManager, userDataPath, credentialStore }) {
  if (!hostManager || !userDataPath) return { synced: false, reason: 'missing-context' }

  let restarted = false
  let { api } = await hostManager.start()
  if (!(await isLlmPiAiNamespaceRegistered(api))) {
    const quarantine = await quarantineBrokenLlmPiAiSection(userDataPath)
    if (quarantine.quarantined) {
      await hostManager.restart()
      restarted = true
      ;({ api } = await hostManager.start())
    }
  }
  if (!(await isLlmPiAiNamespaceRegistered(api))) {
    console.warn('Z Host: llm-pi-ai 设置命名空间仍未注册，跳过 models.json 同步')
    return { synced: false, reason: 'llm-pi-ai-ns-missing', restarted }
  }

  const modelsPath = resolveTaskWeaverModelsPath(userDataPath)
  const modelsDoc = applyOpenCodexDshReasoningOverlay(structuredClone(await readModelsDoc(modelsPath)))
  const jsonProviderIds = Object.keys(modelsDoc.providers ?? {}).filter((id) => {
    const block = modelsDoc.providers[id]
    if (!block || typeof block !== 'object') return false
    if (id === 'opencodex' || id === 'custom-gateway' || id.startsWith('custom-')) return true
    if (typeof block.baseUrl === 'string' && block.baseUrl.trim()) return true
    return false
  })
  const fromJson = profilesFromModelsDoc(modelsDoc, jsonProviderIds)
  const fromBackup = pickCredentialOnlyProfiles(await readQuarantinedLlmPiAiProviders(userDataPath))
  const merged = { ...fromBackup, ...fromJson }
  if (!Object.keys(merged).length) {
    return { synced: false, reason: 'no-providers', restarted }
  }

  await syncProviderSecrets(api, modelsDoc, credentialStore)
  await mergeProfilesIntoHost(api, merged)
  await hostManager.restart()
  return { synced: true, providerCount: Object.keys(merged).length, restarted: true }
}
