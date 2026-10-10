import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
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
import {
  readCompactionSummarizationEnv,
  writeCompactionSummarizationTarget,
} from './taskweaver-compaction-target.mjs'

const SYNC_STATE_SCHEMA = 1

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]))
  }
  return value
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

function digest(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex')
}

async function readSyncState(filePath) {
  try {
    const state = JSON.parse(await fs.readFile(filePath, 'utf8'))
    return state?.schema === SYNC_STATE_SCHEMA ? state : null
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    console.warn('读取 Host 模型同步状态失败，将重新同步:', error instanceof Error ? error.message : error)
    return null
  }
}

async function writeSyncState(filePath, state) {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(temporaryPath, `${JSON.stringify({ schema: SYNC_STATE_SCHEMA, ...state })}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    await fs.rename(temporaryPath, filePath)
    await fs.chmod(filePath, 0o600).catch(() => {})
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

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

async function resolveProviderSecrets(modelsDoc, credentialStore) {
  const resolved = []
  for (const [providerId, block] of Object.entries(modelsDoc.providers ?? {})) {
    if (!block || typeof block !== 'object') continue
    const ref = taskweaverApiKeyEnvRef(providerId)
    let secret = typeof block.apiKey === 'string' ? block.apiKey.trim() : ''
    if (!secret && credentialStore) {
      const stored = await credentialStore.read(providerId)
      if (stored?.key) secret = String(stored.key).trim()
    }
    if (secret) resolved.push({ providerId, ref, secret, fingerprint: digest(secret) })
  }
  return resolved
}

async function syncProviderSecrets(api, secrets) {
  for (const { providerId, ref, secret } of secrets) {
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
  let forceSync = false
  let { api } = await hostManager.start()
  if (!(await isLlmPiAiNamespaceRegistered(api))) {
    const quarantine = await quarantineBrokenLlmPiAiSection(userDataPath)
    if (quarantine.quarantined) {
      await hostManager.restart()
      restarted = true
      forceSync = true
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
  const compactionBeforeSync = await readCompactionSummarizationEnv(userDataPath)
  await writeCompactionSummarizationTarget(userDataPath, modelsDoc, credentialStore)
  const compactionAfterSync = await readCompactionSummarizationEnv(userDataPath)
  const statePath = path.join(userDataPath, 'taskweaver', 'host-model-sync-state.json')
  const previousState = await readSyncState(statePath)
  const compactionDigest = digest(compactionAfterSync)
  const previousCompactionDigest = previousState?.compactionDigest ?? digest(compactionBeforeSync)
  const compactionChanged = previousCompactionDigest !== compactionDigest
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
    if (compactionChanged) {
      await hostManager.restart()
      restarted = true
    }
    if (compactionChanged) await writeSyncState(statePath, {
      digest: digest({ mergedPi, mergedBridge, compaction: compactionAfterSync }),
      profileDigest: digest({ mergedPi, mergedBridge }),
      secretDigest: digest([]),
      secretRefs: [],
      compactionDigest,
    })
    return { synced: false, reason: 'no-providers', restarted }
  }

  if (Object.keys(mergedBridge).length) {
    if (!(await isLlmTaskweaverBridgeNamespaceRegistered(api))) {
      const q = await quarantineBrokenLlmTaskweaverBridgeSection(userDataPath)
      if (q.quarantined) {
        await hostManager.restart()
        restarted = true
        forceSync = true
        ;({ api } = await hostManager.start())
      }
    }
    if (!(await isLlmTaskweaverBridgeNamespaceRegistered(api))) {
      console.warn('Z Host: llm-taskweaver-bridge 设置命名空间仍未注册，跳过 bridge 提供方同步')
      return { synced: false, reason: 'llm-taskweaver-bridge-ns-missing', restarted }
    }
  }

  const secrets = await resolveProviderSecrets(modelsDoc, credentialStore)
  const profileDigest = digest({ mergedPi, mergedBridge })
  const secretDigest = digest(secrets.map(({ ref, fingerprint }) => ({ ref, fingerprint })))
  const syncDigest = digest({ profileDigest, secretDigest, compaction: compactionAfterSync })
  const profilesChanged = forceSync || previousState?.profileDigest !== profileDigest
  const secretsChanged = forceSync || previousState?.secretDigest !== secretDigest
  const changed = profilesChanged || secretsChanged

  if (!changed && !compactionChanged) {
    return {
      synced: false,
      reason: 'unchanged',
      providerCount: Object.keys(mergedPi).length + Object.keys(mergedBridge).length,
      bridgeProviderCount: Object.keys(mergedBridge).length,
      piProviderCount: Object.keys(mergedPi).length,
      restarted,
    }
  }

  if (secretsChanged) {
    const currentRefs = new Set(secrets.map(({ ref }) => ref))
    for (const ref of previousState?.secretRefs ?? []) {
      if (currentRefs.has(ref)) continue
      try { dshValue(await api.credentials.unset({ ref }), '移除已撤销的 TaskWeaver 模型凭据') } catch (error) {
        console.warn(`移除 ${ref} 失败:`, error instanceof Error ? error.message : error)
      }
    }
    await syncProviderSecrets(api, secrets)
  }
  if (profilesChanged && Object.keys(mergedPi).length) await mergeProfilesIntoHost(api, mergedPi)
  if (profilesChanged && Object.keys(mergedBridge).length) await mergeBridgeProfilesIntoHost(api, mergedBridge)
  if (compactionChanged) {
    await hostManager.restart()
    restarted = true
  }
  await writeSyncState(statePath, {
    digest: syncDigest,
    profileDigest,
    secretDigest,
    secretRefs: secrets.map(({ ref }) => ref).sort(),
    compactionDigest,
  })
  return {
    synced: changed,
    reason: changed ? 'updated' : 'unchanged',
    providerCount: Object.keys(mergedPi).length + Object.keys(mergedBridge).length,
    bridgeProviderCount: Object.keys(mergedBridge).length,
    piProviderCount: Object.keys(mergedPi).length,
    restarted,
  }
}
