/**
 * Drop legacy `opencodex` (10100 proxy) from models.json + Z Host when built-in bridge is in use.
 */
import fs from 'node:fs/promises'
import { resolveTaskWeaverModelsPath } from '../taskweaver-models-path.mjs'
import { modelsDocHasBridgeProvider } from '../taskweaver-models-defaults.mjs'
import { taskweaverApiKeyEnvRef } from '../pi-models-to-dsh-profile.mjs'

function dshValue(response, operation) {
  const result = response?.result ?? response
  if (result?.ok === false) throw new Error(result.error?.message || `${operation}失败`)
  return result?.value ?? result
}

export async function profileStillUsesLegacyOpenCodex(profileStore) {
  if (!profileStore) return false
  const added = await profileStore.listAddedModelKeys()
  if (added.some((key) => String(key).startsWith('opencodex/'))) return true
  const active = await profileStore.getActiveModelKey()
  return Boolean(active && String(active).startsWith('opencodex/'))
}

/**
 * @param {{
 *   userDataPath: string,
 *   profileStore?: import('../profile-store.mjs').ProfileStore,
 *   hostManager: import('../../agent/z-host/index.mjs').ZHostManager,
 *   credentialStore?: import('../credential-store.mjs').CredentialStore,
 *   ensureModelsJsonSyncedToDshHost?: typeof import('../sync-models-json-to-host.mjs').ensureModelsJsonSyncedToDshHost,
 * }} options
 */
export async function pruneLegacyOpenCodexProvider({
  userDataPath,
  profileStore,
  hostManager,
  credentialStore,
  ensureModelsJsonSyncedToDshHost,
}) {
  if (!userDataPath || !hostManager) return { pruned: false, reason: 'missing-context' }

  const modelsPath = resolveTaskWeaverModelsPath(userDataPath)
  let doc
  try {
    const raw = await fs.readFile(modelsPath, 'utf8')
    doc = JSON.parse(raw)
  } catch (err) {
    if (err?.code === 'ENOENT') return { pruned: false, reason: 'no-models-json' }
    throw err
  }

  if (!doc.providers?.opencodex) return { pruned: false, reason: 'no-opencodex-block' }
  if (!modelsDocHasBridgeProvider(doc)) return { pruned: false, reason: 'no-bridge' }
  if (await profileStillUsesLegacyOpenCodex(profileStore)) {
    return { pruned: false, reason: 'profile-still-legacy' }
  }

  delete doc.providers.opencodex
  await fs.writeFile(modelsPath, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 })

  if (credentialStore) {
    try {
      await credentialStore.delete('opencodex')
    } catch {
      // no stored key
    }
  }

  const { api } = await hostManager.start()
  try {
    dshValue(
      await api.settings.mutate({
        ns: 'llm-pi-ai',
        ops: [{ op: 'delete', path: ['providers', 'opencodex'] }],
      }),
      '移除遗留 opencodex 提供方',
    )
  } catch (error) {
    console.warn(
      '[model-sync] 从 Host 删除 opencodex 提供方失败（可能已不存在）:',
      error instanceof Error ? error.message : error,
    )
  }

  try {
    dshValue(await api.credentials.unset({ ref: taskweaverApiKeyEnvRef('opencodex') }), '移除 opencodex 凭据')
  } catch {
    // ref may be absent
  }

  if (ensureModelsJsonSyncedToDshHost) {
    await ensureModelsJsonSyncedToDshHost({
      hostManager,
      userDataPath,
      credentialStore,
      modelsDocOverride: doc,
    })
  } else {
    await hostManager.restart?.()
  }

  return { pruned: true, reason: 'ok' }
}
