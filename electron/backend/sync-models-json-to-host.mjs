import fs from 'node:fs/promises'
import {
  isLlmPiAiNamespaceRegistered,
  pickCredentialOnlyProfiles,
  quarantineBrokenLlmPiAiSection,
  readQuarantinedLlmPiAiProviders,
  isLlmTaskweaverBridgeNamespaceRegistered,
  quarantineBrokenLlmTaskweaverBridgeSection,
  readQuarantinedLlmTaskweaverBridgeProviders,
} from './dsh-settings-repair.mjs'
import { profilesFromModelsDoc, taskweaverApiKeyEnvRef } from './pi-models-to-dsh-profile.mjs'
import { bridgeProfilesFromModelsDoc, splitModelsDocProviders } from './taskweaver-bridge-models.mjs'
import { resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'
import { applyOpenCodexDshReasoningOverlay } from './model-sync/overlay.mjs'
import { writeCompactionSummarizationTarget } from './taskweaver-compaction-target.mjs'

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

async function mergeBridgeProfilesIntoHost(api, providers) {
  const ids = Object.keys(providers)
  if (!ids.length) return
  const ops = ids.map((id) => ({ op: 'set', path: ['providers', id], value: providers[id] }))
  dshValue(await api.settings.mutate({ ns: 'llm-taskweaver-bridge', ops }), '写入 TaskWeaver bridge 提供方')
}

/**
 * Repair broken DSH settings, dual-write `taskweaver/models.json` into `llm-pi-ai` and `llm-taskweaver-bridge`.
 * @param {{ hostManager: import('../agent/z-host/index.mjs').ZHostManager, userDataPath: string, credentialStore?: import('./credential-store.mjs').CredentialStore, modelsDocOverride?: { providers?: Record<string, unknown> } }} options
 */
export async function ensureModelsJsonSyncedToDshHost({ hostManager, userDataPath, credentialStore, modelsDocOverride }) {
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
  const sourceModelsDoc = modelsDocOverride ?? await readModelsDoc(modelsPath)
  const modelsDoc = applyOpenCodexDshReasoningOverlay(structuredClone(sourceModelsDoc))
  await writeCompactionSummarizationTarget(userDataPath, modelsDoc, credentialStore)
  const { bridgeIds, piAiIds } = splitModelsDocProviders(modelsDoc)
  const bridgeFromJson = bridgeIds.length
    ? bridgeProfilesFromModelsDoc(modelsDoc, bridgeIds)
    : {}
  const piFromJson = piAiIds.length
    ? profilesFromModelsDoc(modelsDoc, piAiIds)
    : {}
  const piFromBackup = pickCredentialOnlyProfiles(await readQuarantinedLlmPiAiProviders(userDataPath))
  const bridgeFromBackup = await readQuarantinedLlmTaskweaverBridgeProviders(userDataPath)
  const mergedPi = { ...piFromBackup, ...piFromJson }
  const mergedBridge = { ...bridgeFromBackup, ...bridgeFromJson }
  if (!Object.keys(mergedPi).length && !Object.keys(mergedBridge).length) {
    return { synced: false, reason: 'no-providers', restarted }
  }

  if (Object.keys(mergedBridge).length) {
    if (!(await isLlmTaskweaverBridgeNamespaceRegistered(api))) {
      const q = await quarantineBrokenLlmTaskweaverBridgeSection(userDataPath)
      if (q.quarantined) {
        await hostManager.restart()
        restarted = true
        ;({ api } = await hostManager.start())
      }
    }
    if (!(await isLlmTaskweaverBridgeNamespaceRegistered(api))) {
      console.warn('Z Host: llm-taskweaver-bridge 设置命名空间仍未注册，跳过 bridge 提供方同步')
      return { synced: false, reason: 'llm-taskweaver-bridge-ns-missing', restarted }
    }
  }

  await syncProviderSecrets(api, modelsDoc, credentialStore)
  if (Object.keys(mergedPi).length) await mergeProfilesIntoHost(api, mergedPi)
  if (Object.keys(mergedBridge).length) await mergeBridgeProfilesIntoHost(api, mergedBridge)
  await hostManager.restart()
  return {
    synced: true,
    providerCount: Object.keys(mergedPi).length + Object.keys(mergedBridge).length,
    bridgeProviderCount: Object.keys(mergedBridge).length,
    piProviderCount: Object.keys(mergedPi).length,
    restarted: true,
  }
}
