import fs from 'node:fs/promises'
import { fetchOpenCodexProviderLogins } from '../opencodex-service.mjs'
import { resolveTaskWeaverModelsPath } from '../taskweaver-models-path.mjs'
import { splitModelsDocProviders } from '../taskweaver-bridge-models.mjs'
import { exportFromOcx, startOcxProviderLogin } from './ocx-cli.mjs'
import {
  buildBundledBridgeExportDoc,
  exportDocHasBridgeAgents,
  mergeBridgeExportDocs,
} from './bundled-bridge-export.mjs'
import { commitToHost } from './commit-to-host.mjs'
import { writeExportSnapshot } from './snapshot.mjs'
import { hasFreshExportSnapshot, probeLegacyOcxProxy } from './background-scan-policy.mjs'
import startupTrace from '../../startup-trace.cjs'
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

const { traceStartup } = startupTrace

export { startOcxProviderLogin as startProviderLogin }

export async function getBridgeLoginStatus(userDataPath) {
  return fetchOpenCodexProviderLogins(userDataPath)
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
 * Refresh built-in bridge catalog: shipped defaults first, optional live `ocx export`.
 */
export async function scanLocalModels({
  userDataPath,
  appPath,
  credentialStore,
  hostManager,
  modelService,
  ensureModelsJsonSyncedToDshHost,
  enrichModels,
  loginPolicy = 'fail',
  startProviderLogin: startLogin = startOcxProviderLogin,
  migrateAwayOpenCodex = true,
  force = true,
  now = Date.now,
  isExportSnapshotFresh = hasFreshExportSnapshot,
  isLegacyOcxProxyAvailable = probeLegacyOcxProxy,
  exportCatalog = exportFromOcx,
  buildBundledExport = buildBundledBridgeExportDoc,
  fetchLogins = fetchOpenCodexProviderLogins,
  writeModelsDoc = writeModelsJsonFromBridgeExport,
  saveExportSnapshot = writeExportSnapshot,
  commitHost = commitToHost,
}) {
  const modelsPath = resolveTaskWeaverModelsPath(userDataPath)
  if (!force) {
    if (await isExportSnapshotFresh(userDataPath, { now: now() })) {
      return { ok: true, code: 'snapshot-fresh', skipped: true, bridgeProviderIds: [] }
    }
    // UI verification is deliberately offline with respect to the user's
    // installed Cursor/Antigravity proxy. This keeps launch traces deterministic
    // and prevents an isolated smoke run from reading external app state.
    if (process.env.TASKWEAVER_UI_VERIFY === '1') {
      return { ok: true, code: 'ui-verify', skipped: true, bridgeProviderIds: [] }
    }
    if (!await isLegacyOcxProxyAvailable()) {
      return { ok: true, code: 'proxy-unavailable', skipped: true, bridgeProviderIds: [] }
    }
  }
  let exportDoc
  try {
    if (!appPath) throw new Error('扫描本地 Agent 需要应用路径以读取内置桥目录。')
    traceStartup('bridge:export-bundled-start')
    exportDoc = await buildBundledExport({ appPath, userDataPath })
    traceStartup('bridge:export-bundled-end')
    try {
      traceStartup('ocx:export-start')
      const live = await exportCatalog({ userDataPath, hostManager })
      exportDoc = mergeBridgeExportDocs(exportDoc, live)
      traceStartup('ocx:export-end')
    } catch (err) {
      traceStartup('ocx:export-skipped')
      if (!exportDocHasBridgeAgents(exportDoc)) {
        const raw = err instanceof Error ? err.message : String(err)
        return {
          ok: false,
          code: 'export-failed',
          error: `内置桥目录为空，且无法刷新在线模型列表：${raw}`,
        }
      }
      console.warn(
        '[model-sync] 使用内置桥目录完成扫描（未连接可选 OpenCodex 刷新通道）：',
        err instanceof Error ? err.message : err,
      )
    }
  } catch (err) {
    traceStartup('bridge:export-failed')
    return {
      ok: false,
      code: 'export-failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const logins = await fetchLogins(userDataPath)
  const missingLogin = firstMissingLoginForExport(exportDoc, logins, loginPolicy)
  if (missingLogin) {
    const { loginProvider, label, agentId } = missingLogin
    if (loginPolicy === 'open-browser' && startLogin) {
      startLogin(loginProvider, { userDataPath })
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

  const { modelsDoc, bridgeProviderIds, changed } = await writeModelsDoc(modelsPath, exportDoc, {
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

  let models
  if (changed === false) {
    await saveExportSnapshot(userDataPath, exportDoc)
    models = enrichModels
      ? await enrichModels(modelsDoc, bridgeProviderIds, exportDoc)
      : await modelService.listCatalog()
  } else {
    models = await commitHost({
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
  }

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
  appPath,
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
    appPath,
    credentialStore,
    hostManager,
    modelService,
    ensureModelsJsonSyncedToDshHost,
    loginPolicy: 'fail',
    migrateAwayOpenCodex: true,
    force: false,
  })
  if (sync.ok) {
    return { refreshed: true, reason: 'ok', bridgeProviderIds: sync.bridgeProviderIds }
  }
  return { refreshed: false, reason: sync.code ?? 'sync-failed' }
}

/** @deprecated */
export const bootstrapBridgeOnAppReady = bootstrapModelSyncOnAppReady
