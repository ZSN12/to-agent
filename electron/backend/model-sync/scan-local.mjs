import fs from 'node:fs/promises'
import { fetchOpenCodexProviderLogins } from '../opencodex-service.mjs'
import { resolveTaskWeaverModelsPath } from '../taskweaver-models-path.mjs'
import { splitModelsDocProviders } from '../taskweaver-bridge-models.mjs'
import { exportFromOcx, startOcxProviderLogin } from './ocx-cli.mjs'
import { commitToHost } from './commit-to-host.mjs'
import {
  bridgeProviderBlocksFromExport,
  legacyOpenCodexKeyToBridge,
  listModelsFromBridgeDoc,
  writeModelsJsonFromBridgeExport,
} from './bridge-catalog.mjs'
import {
  discoverAgentsFromExport,
  discoverAgentsFromModelsDoc,
  firstMissingLoginForExport,
} from './discover-local-agents.mjs'

export { startOcxProviderLogin as startProviderLogin }

export async function getBridgeLoginStatus() {
  return fetchOpenCodexProviderLogins()
}

export async function readBridgeStatusFromDisk(modelsPath, logins = {}) {
  let doc = { providers: {} }
  try {
    const raw = await fs.readFile(modelsPath, 'utf8')
    doc = JSON.parse(raw)
  } catch {
    // missing
  }
  const { bridgeIds, piAiIds } = splitModelsDocProviders(doc)
  const localAgents = discoverAgentsFromModelsDoc(doc, logins)
  return {
    bridgeProviderIds: bridgeIds,
    piAiProviderIds: piAiIds,
    legacyOpenCodex: Boolean(doc.providers?.opencodex),
    bridgeModelCount: listModelsFromBridgeDoc(doc, bridgeIds).length,
    localAgents,
  }
}

/**
 * Refresh built-in bridge catalog via `ocx export` (no 10100 proxy).
 */
export async function scanLocalModels({
  userDataPath,
  credentialStore,
  hostManager,
  modelService,
  ensureModelsJsonSyncedToDshHost,
  enrichModels,
  loginPolicy = 'fail',
  startProviderLogin: startLogin = startOcxProviderLogin,
  migrateAwayOpenCodex = true,
}) {
  const modelsPath = resolveTaskWeaverModelsPath(userDataPath)
  let exportDoc
  try {
    exportDoc = await exportFromOcx()
  } catch (err) {
    return { ok: false, code: 'export-failed', error: err instanceof Error ? err.message : String(err) }
  }

  const logins = await fetchOpenCodexProviderLogins()
  const missingLogin = firstMissingLoginForExport(exportDoc, logins, loginPolicy)
  if (missingLogin) {
    const { loginProvider, label, agentId } = missingLogin
    if (loginPolicy === 'open-browser' && startLogin) {
      startLogin(loginProvider)
      const cursorLoginStarted = loginProvider === 'cursor'
      const antigravityLoginStarted = loginProvider === 'google-antigravity'
      return {
        ok: false,
        code: `${agentId}-login-required`,
        cursorLoginStarted,
        antigravityLoginStarted,
        error: `需要登录 ${label}：已在浏览器打开授权页。完成登录后请再次「扫描本地官方 Agent」。`,
        localAgents: discoverAgentsFromExport(exportDoc, logins),
      }
    }
    return {
      ok: false,
      code: `${agentId}-login-required`,
      error: `${label} 未登录，请在设置中完成授权后重试。`,
      localAgents: discoverAgentsFromExport(exportDoc, logins),
    }
  }

  const { modelsDoc, bridgeProviderIds } = await writeModelsJsonFromBridgeExport(modelsPath, exportDoc, {
    migrateAwayOpenCodex,
  })

  if (!bridgeProviderIds.length) {
    return {
      ok: false,
      code: 'no-local-agents',
      error: '未发现可集成的本地官方 Agent 模型。请先在本机登录 Cursor 或 Antigravity 订阅后重试扫描。',
      localAgents: discoverAgentsFromExport(exportDoc, logins),
    }
  }

  const models = await commitToHost({
    userDataPath,
    credentialStore,
    hostManager,
    modelService,
    ensureModelsJsonSyncedToDshHost,
    exportDoc,
    enrichModels: enrichModels
      ? () => enrichModels(modelsDoc, bridgeProviderIds, exportDoc)
      : undefined,
  })

  return {
    ok: true,
    code: 'synced',
    bridgeProviderIds,
    modelsDoc,
    exportDoc,
    models,
    proxyUrl: null,
    localAgents: discoverAgentsFromModelsDoc(modelsDoc, logins),
  }
}

/** @deprecated */
export const runBridgeCatalogSync = scanLocalModels

export async function enrichScannedBridgeModels(modelService, modelsDoc, bridgeProviderIds) {
  const catalog = await modelService.listCatalog()
  const added = new Set((catalog?.models ?? []).map((row) => row.key))
  return listModelsFromBridgeDoc(modelsDoc, bridgeProviderIds).map((row) => {
    const legacy = legacyOpenCodexKeyToBridge(`opencodex/${row.id}`)
    return {
      key: row.key,
      name: row.name,
      id: row.id,
      provider: row.provider,
      source: row.source,
      available: true,
      alreadyAdded: added.has(row.key) || (legacy ? added.has(legacy) : false),
    }
  })
}

export function formatScanLocalIpcResult(sync) {
  const syncedAt = new Date().toISOString()
  const localAgents = sync.localAgents ?? undefined
  if (!sync.ok) {
    return {
      models: [],
      proxyUrl: null,
      providerIds: sync.bridgeProviderIds ?? [],
      syncedAt,
      error: sync.error,
      cursorLoginStarted: sync.cursorLoginStarted === true,
      antigravityLoginStarted: sync.antigravityLoginStarted === true,
      bridgeMode: true,
      ...(localAgents ? { localAgents } : {}),
    }
  }
  return {
    models: sync.models ?? [],
    proxyUrl: null,
    providerIds: sync.bridgeProviderIds ?? [],
    syncedAt,
    bridgeMode: true,
    ...(localAgents ? { localAgents } : {}),
  }
}

export async function bootstrapModelSyncOnAppReady({
  userDataPath,
  catalog,
  credentialStore,
  hostManager,
  modelService,
  ensureModelsJsonSyncedToDshHost,
}) {
  const usesBridge = (catalog?.models ?? []).some((row) => String(row?.key ?? '').startsWith('bridge-'))
  let configured = usesBridge
  try {
    const raw = await fs.readFile(`${userDataPath}/opencodex-export.json`, 'utf8')
    const doc = JSON.parse(raw)
    if (Object.keys(bridgeProviderBlocksFromExport(doc)).length) configured = true
  } catch {
    // no snapshot
  }
  if (!configured) return { refreshed: false, reason: 'not-configured' }

  const sync = await scanLocalModels({
    userDataPath,
    credentialStore,
    hostManager,
    modelService,
    ensureModelsJsonSyncedToDshHost,
    loginPolicy: 'fail',
    migrateAwayOpenCodex: true,
  })
  if (sync.ok) {
    return { refreshed: true, reason: 'ok', bridgeProviderIds: sync.bridgeProviderIds }
  }
  return { refreshed: false, reason: sync.code ?? 'sync-failed' }
}

/** @deprecated */
export const bootstrapBridgeOnAppReady = bootstrapModelSyncOnAppReady
