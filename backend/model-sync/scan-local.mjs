import fs from 'node:fs/promises'
import { fetchOpenCodexProviderLogins } from '../opencodex-service.mjs'
import { resolveTaskWeaverModelsPath } from '../taskweaver-models-path.mjs'
import { splitModelsDocProviders } from '../taskweaver-bridge-models.mjs'
import { exportAntigravityCatalogFromOcx, exportFromOcx, startOcxProviderLogin } from './ocx-cli.mjs'
import {
  buildBundledBridgeExportDoc,
  exportDocHasBridgeAgents,
  mergeBridgeExportDocs,
} from './bundled-bridge-export.mjs'
import { commitToHost } from './commit-to-host.mjs'
import { writeExportSnapshot } from './snapshot.mjs'
import { hasFreshExportSnapshot, probeLegacyOcxProxy } from './background-scan-policy.mjs'
import startupTrace from '../startup-trace.cjs'
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
import { scanWorkBuddy, workBuddyCredentialFromModels } from './workbuddy-scan.mjs'
import { isWorkBuddyInstallation } from './workbuddy-installation.mjs'
import { taskweaverApiKeyEnvRef } from '../pi-models-to-dsh-profile.mjs'

const { traceStartup } = startupTrace

async function readExistingWorkBuddyProvider(modelsPath) {
  try {
    const doc = JSON.parse(await fs.readFile(modelsPath, 'utf8'))
    const block = doc?.providers?.workbuddy
    return block && typeof block === 'object' && !Array.isArray(block) ? block : null
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function readWorkBuddyCredential(credentialStore) {
  if (typeof credentialStore?.read !== 'function') return null
  try {
    return await credentialStore.read('workbuddy')
  } catch {
    return null
  }
}

async function storeWorkBuddyCredential(credentialStore, key, { replaceExisting = false } = {}) {
  if (!credentialStore) return false
  try {
    const existing = await readWorkBuddyCredential(credentialStore)
    if (existing?.key && (!replaceExisting || existing.key === key || !key)) return true
    if (key && typeof credentialStore.modify === 'function') {
      await credentialStore.modify('workbuddy', async (current) => (
        current?.key === key ? current : { type: 'api_key', key }
      ))
      return true
    }
    if (key && typeof credentialStore.set === 'function') {
      await credentialStore.set('workbuddy', { type: 'api_key', key })
      return true
    }
    return false
  } catch (err) {
    console.warn('[model-sync] 保存 WorkBuddy 凭据失败（已忽略）:', err?.message ?? err)
    return false
  }
}

function mergeDiscoveredWorkBuddyModels(existingBlock, discoveredBlock) {
  if (!Array.isArray(existingBlock?.models) || !Array.isArray(discoveredBlock?.models)) return null
  const modelIds = new Set(existingBlock.models
    .map((model) => String(model?.id ?? '').trim())
    .filter(Boolean))
  const additions = discoveredBlock.models.filter((model) => {
    const id = String(model?.id ?? '').trim()
    if (!id || modelIds.has(id)) return false
    modelIds.add(id)
    return true
  })
  return {
    block: additions.length
      ? { ...existingBlock, models: [...existingBlock.models, ...additions] }
      : existingBlock,
    addedModelCount: additions.length,
  }
}

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
  exportAntigravityCatalog = exportAntigravityCatalogFromOcx,
  antigravityOAuthCredentials,
  buildBundledExport = buildBundledBridgeExportDoc,
  fetchLogins = fetchOpenCodexProviderLogins,
  writeModelsDoc = writeModelsJsonFromBridgeExport,
  saveExportSnapshot = writeExportSnapshot,
  commitHost = commitToHost,
  workbuddyPath,
  scanWb = scanWorkBuddy,
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
  // 并行执行 ocx export、ocx status 检查，以及准备内置桥目录与 WorkBuddy 扫描
  const bundledExportTask = (async () => {
    if (!appPath) return { ok: true, doc: { providers: {} } }
    traceStartup('bridge:export-bundled-start')
    try {
      const doc = await buildBundledExport({ appPath, userDataPath })
      traceStartup('bridge:export-bundled-end')
      return { ok: true, doc }
    } catch (err) {
      traceStartup('bridge:export-failed')
      return { ok: false, error: err }
    }
  })()

  const exportTask = (async () => {
    traceStartup('ocx:export-start')
    try {
      const live = await exportCatalog({ userDataPath, hostManager })
      traceStartup('ocx:export-end')
      return { ok: true, live }
    } catch (err) {
      traceStartup('ocx:export-failed', { error: err?.message ?? String(err) })
      traceStartup('ocx:export-skipped')
      return { ok: false, error: err }
    }
  })()

  const antigravityTask = (async () => {
    traceStartup('antigravity:catalog-start')
    try {
      const live = await exportAntigravityCatalog({ userDataPath, antigravityOAuthCredentials })
      traceStartup('antigravity:catalog-end', {
        modelCount: live.providers['google-antigravity'].models.length,
      })
      return { ok: true, live }
    } catch (err) {
      traceStartup('antigravity:catalog-failed', { error: err?.message ?? String(err) })
      return { ok: false, error: err }
    }
  })()

  const loginsTask = (async () => {
    traceStartup('ocx:status-start')
    try {
      const logins = await fetchLogins(userDataPath)
      traceStartup('ocx:status-end')
      return logins
    } catch (err) {
      traceStartup('ocx:status-failed', { error: err?.message ?? String(err) })
      throw err
    }
  })()

  const workbuddyTask = (async () => {
    try {
      return await scanWb({ customPath: workbuddyPath })
    } catch {
      return { block: null, models: [], raw: [], isAvailable: false }
    }
  })()

  const [bundledResult, exportResult, antigravityResult, logins, wbResult] = await Promise.all([
    bundledExportTask,
    exportTask,
    antigravityTask,
    loginsTask,
    workbuddyTask,
  ])

  if (!bundledResult.ok) {
    return {
      ok: false,
      code: 'export-failed',
      error: bundledResult.error instanceof Error ? bundledResult.error.message : String(bundledResult.error),
    }
  }

  let exportDoc = bundledResult.doc ?? { providers: {} }
  if (exportResult.ok) {
    exportDoc = mergeBridgeExportDocs(exportDoc, exportResult.live)
  } else {
    if (!exportDocHasBridgeAgents(exportDoc)) {
      const raw = exportResult.error instanceof Error ? exportResult.error.message : String(exportResult.error)
      return {
        ok: false,
        code: 'export-failed',
        error: `内置桥目录为空，且无法刷新在线模型列表：${raw}`,
      }
    }
    console.warn(
      '[model-sync] 使用内置桥目录完成扫描（未连接可选 OpenCodex 刷新通道）：',
      exportResult.error instanceof Error ? exportResult.error.message : exportResult.error,
    )
  }

  const discoveryWarnings = []
  if (wbResult?.warning) discoveryWarnings.push(wbResult.warning)
  if (wbResult?.installations?.length && !wbResult.block) {
    const names = wbResult.installations.map((app) => app.name).filter(Boolean)
    if (names.length) {
      discoveryWarnings.push(
        `检测到 ${names.join('、')}，但没有找到可接入的本机模型配置。请先在 WorkBuddy 中登录并加载模型。`,
      )
    }
  }
  if (antigravityResult.ok) {
    exportDoc = mergeBridgeExportDocs(exportDoc, antigravityResult.live)
  } else if (logins['google-antigravity'] === true) {
    const detail = antigravityResult.error instanceof Error
      ? antigravityResult.error.message
      : String(antigravityResult.error)
    discoveryWarnings.push(`Google Antigravity 已登录，但在线模型目录扫描失败：${detail}`)
  }

  const existingWorkBuddyBlock = await readExistingWorkBuddyProvider(modelsPath)
  const scannedCredential = workBuddyCredentialFromModels(wbResult?.raw)
  const scannedWorkBuddyKey = wbResult?.block ? scannedCredential.key : ''
  const legacyWorkBuddyKey = String(existingWorkBuddyBlock?.apiKey ?? '').trim()
  const storedWorkBuddyCredential = await readWorkBuddyCredential(credentialStore)
  const workBuddyManagedLocally = existingWorkBuddyBlock?.taskweaverSource === 'workbuddy-local'
  const shouldImportScannedWorkBuddy = Boolean(wbResult?.block && (!existingWorkBuddyBlock || workBuddyManagedLocally))
  const workBuddyCredentialConflict = Boolean(
    shouldImportScannedWorkBuddy
      && !workBuddyManagedLocally
      && scannedWorkBuddyKey
      && storedWorkBuddyCredential?.key
      && storedWorkBuddyCredential.key !== scannedWorkBuddyKey,
  )
  const workBuddyCredentialMissing = Boolean(
    shouldImportScannedWorkBuddy
      && !workBuddyManagedLocally
      && !scannedWorkBuddyKey
      && !legacyWorkBuddyKey,
  )
  if (workBuddyCredentialConflict) {
    discoveryWarnings.push('TaskWeaver 已保存另一组 WorkBuddy 凭据；为避免覆盖，未自动导入本机配置。')
  } else if (workBuddyCredentialMissing) {
    discoveryWarnings.push('WorkBuddy 模型没有可安全导入的 API Key，已跳过自动接入。')
  }
  const workBuddyCredentialChanged = Boolean(
    scannedWorkBuddyKey
      && workBuddyManagedLocally
      && storedWorkBuddyCredential?.key !== scannedWorkBuddyKey,
  )
  const canStoreWorkBuddyCredential = !workBuddyCredentialConflict && !workBuddyCredentialMissing
  const workbuddyCredentialAvailable = canStoreWorkBuddyCredential && (await storeWorkBuddyCredential(
    credentialStore,
    (shouldImportScannedWorkBuddy ? scannedWorkBuddyKey : '') || legacyWorkBuddyKey,
    { replaceExisting: Boolean(scannedWorkBuddyKey && workBuddyManagedLocally) },
  ) || (!credentialStore && Boolean(existingWorkBuddyBlock?.apiKeyEnv && !scannedWorkBuddyKey && !legacyWorkBuddyKey)))
  const candidateWorkBuddyBlock = wbResult?.warning
    ? existingWorkBuddyBlock
    : (shouldImportScannedWorkBuddy ? wbResult.block : existingWorkBuddyBlock)
  const shouldWriteWorkBuddyBlock = Boolean(shouldImportScannedWorkBuddy || workBuddyManagedLocally)
  const workbuddyBlock = candidateWorkBuddyBlock && shouldWriteWorkBuddyBlock && workbuddyCredentialAvailable
    ? {
        ...candidateWorkBuddyBlock,
        apiKeyEnv: taskweaverApiKeyEnvRef('workbuddy'),
        ...(shouldImportScannedWorkBuddy ? { taskweaverSource: 'workbuddy-local' } : {}),
      }
    : null
  if (workbuddyBlock) delete workbuddyBlock.apiKey
  else if (candidateWorkBuddyBlock && shouldWriteWorkBuddyBlock) {
    discoveryWarnings.push('WorkBuddy 凭据无法安全保存，已跳过 WorkBuddy 提供方。')
  }

  const missingLogin = firstMissingLoginForExport(exportDoc, logins, loginPolicy)
  if (missingLogin) {
    const { loginProvider, label, agentId } = missingLogin
    if (loginPolicy === 'open-browser' && startLogin) {
      try {
        await startLogin(loginProvider, { userDataPath })
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        return {
          ok: false,
          code: `${agentId}-login-start-failed`,
          error: `无法启动 ${label} 登录：${detail}`,
          localAgents: discoverAgentsFromExport(exportDoc, logins),
          discoveryWarnings,
        }
      }
      const cursorLoginStarted = loginProvider === 'cursor'
      const antigravityLoginStarted = loginProvider === 'google-antigravity'
      return {
        ok: false,
        code: `${agentId}-login-required`,
        cursorLoginStarted,
        antigravityLoginStarted,
        error: `需要登录 ${label}：已在浏览器打开授权页。完成登录后请再次「扫描本地官方 Agent」。`,
        localAgents: discoverAgentsFromExport(exportDoc, logins),
        discoveryWarnings,
      }
    }
    return {
      ok: false,
      code: `${agentId}-login-required`,
      error: `${label} 未登录，请在设置中完成授权后重试。`,
      localAgents: discoverAgentsFromExport(exportDoc, logins),
      discoveryWarnings,
    }
  }

  const { modelsDoc, bridgeProviderIds, changed } = await writeModelsDoc(modelsPath, exportDoc, {
    migrateAwayOpenCodex,
    workbuddyBlock,
    removeWorkBuddy: Boolean(workBuddyManagedLocally && candidateWorkBuddyBlock && !workbuddyCredentialAvailable),
  })

  const allProviderIds = Array.from(new Set([
    ...bridgeProviderIds,
    ...(workbuddyBlock || modelsDoc?.providers?.workbuddy ? ['workbuddy'] : []),
  ]))

  if (!allProviderIds.length) {
    return {
      ok: false,
      code: 'no-local-agents',
      error: '未发现可集成的本地官方 Agent 模型。请先在本机登录 Cursor 或 Antigravity 订阅后重试扫描。',
      localAgents: discoverAgentsFromExport(exportDoc, logins),
      discoveryWarnings,
    }
  }

  let models
  if (changed === false && !workBuddyCredentialChanged) {
    await saveExportSnapshot(userDataPath, exportDoc)
    models = enrichModels
      ? await enrichModels(modelsDoc, bridgeProviderIds, exportDoc, wbResult)
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
        ? () => enrichModels(modelsDoc, bridgeProviderIds, exportDoc, wbResult)
        : undefined,
    })
  }

  return {
    ok: true,
    code: 'synced',
    bridgeProviderIds: allProviderIds,
    modelsDoc,
    exportDoc,
    models,
    proxyUrl: null,
    localAgents: discoverAgentsFromModelsDoc(modelsDoc, logins),
    discoveryWarnings,
  }
}

/** @deprecated */
export const runBridgeCatalogSync = scanLocalModels

export async function enrichScannedBridgeModels(modelService, modelsDoc, bridgeProviderIds, _exportDoc, wbResult) {
  const catalog = await modelService.listCatalog()
  const added = new Set((catalog?.models ?? []).map((row) => row.key))
  const rows = listModelsFromBridgeDoc(modelsDoc, bridgeProviderIds).map((row) => {
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

  const wbModels = wbResult?.models || []
  if (wbModels.length) {
    for (const m of wbModels) {
      rows.push({
        ...m,
        alreadyAdded: added.has(m.key),
      })
    }
  } else if (modelsDoc?.providers?.workbuddy?.models) {
    const wbBlock = modelsDoc.providers.workbuddy
    for (const m of wbBlock.models) {
      const key = `workbuddy/${m.id}`
      rows.push({
        key,
        name: m.name || m.id,
        id: m.id,
        provider: 'workbuddy',
        source: 'workbuddy',
        available: true,
        alreadyAdded: added.has(key),
        url: m.baseURL || m.url || wbBlock.baseUrl,
        apiKeyEnv: taskweaverApiKeyEnvRef('workbuddy'),
        supportsImages: Array.isArray(m.input) && m.input.includes('image'),
        supportsReasoning: Boolean(m.reasoning),
        maxInputTokens: m.contextWindow || 200000,
        maxOutputTokens: m.maxTokens || 65536,
      })
    }
  }

  return rows
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
      ...(sync.discoveryWarnings?.length ? { discoveryWarnings: sync.discoveryWarnings } : {}),
    }
  }
  return {
    models: sync.models ?? [],
    proxyUrl: null,
    providerIds: sync.bridgeProviderIds ?? [],
    syncedAt,
    bridgeMode: true,
    ...(localAgents ? { localAgents } : {}),
    ...(sync.discoveryWarnings?.length ? { discoveryWarnings: sync.discoveryWarnings } : {}),
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

const workBuddySyncQueues = new Map()

/**
 * Discover WorkBuddy independently of Cursor/Antigravity and register its
 * local model routes. Used at startup and when the user adds a newly discovered
 * WorkBuddy model. Credentials remain in the encrypted credential store; this
 * only makes the models available to choose. Calls for the same user data
 * directory are serialized so concurrent syncs cannot overwrite models.json
 * from the same stale read.
 */
export function bootstrapWorkBuddyOnAppReady(options) {
  const queueKey = String(options?.userDataPath ?? '')
  const previous = workBuddySyncQueues.get(queueKey) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(() => syncWorkBuddyProvider(options))
  workBuddySyncQueues.set(queueKey, current)
  const release = () => {
    if (workBuddySyncQueues.get(queueKey) === current) workBuddySyncQueues.delete(queueKey)
  }
  current.then(release, release)
  return current
}

async function syncWorkBuddyProvider({
  userDataPath,
  credentialStore,
  hostManager,
  modelService,
  ensureModelsJsonSyncedToDshHost,
  workbuddyPath,
  scanWb = scanWorkBuddy,
  writeModelsDoc = writeModelsJsonFromBridgeExport,
}) {
  if (process.env.TASKWEAVER_UI_VERIFY === '1') {
    return { refreshed: false, reason: 'ui-verify' }
  }
  try {
    const wb = await scanWb({
      customPath: workbuddyPath,
      probe: false,
      discoverCatalog: true,
      timeoutMs: 800,
    })
    const installedApps = (wb?.installations ?? [])
      .filter(isWorkBuddyInstallation)
      .map(({ name, bundleIdentifier }) => ({ name, bundleIdentifier }))
    if (wb?.warning) return { refreshed: false, reason: 'unsupported-config', warning: wb.warning, installedApps }
    if (!wb?.block) {
      return {
        refreshed: false,
        reason: 'not-found',
        installedApps,
        ...(installedApps.length
          ? { warning: `检测到 ${installedApps.map((app) => app.name).join('、')}，但没有找到可接入的本机模型配置。请先在 WorkBuddy 中登录并加载模型。` }
          : {}),
      }
    }

    const modelsPath = resolveTaskWeaverModelsPath(userDataPath)
    const existingBlock = await readExistingWorkBuddyProvider(modelsPath)
    const credential = workBuddyCredentialFromModels(wb.raw)
    const legacyKey = String(existingBlock?.apiKey ?? '').trim()
    const currentCredential = await readWorkBuddyCredential(credentialStore)
    const workBuddyManagedLocally = existingBlock?.taskweaverSource === 'workbuddy-local'

    let workbuddyBlock
    let addedModelCount = 0
    let shouldWriteWorkBuddyBlock = false
    let credentialChanged = false

    if (existingBlock && !workBuddyManagedLocally) {
      const expectedCredentialRef = taskweaverApiKeyEnvRef('workbuddy')
      const configuredCredentialRef = String(existingBlock.apiKeyEnv ?? '').trim()
      if (
        (configuredCredentialRef && configuredCredentialRef !== expectedCredentialRef)
        || (existingBlock.api && existingBlock.api !== 'openai-completions')
        || !Array.isArray(existingBlock.models)
      ) {
        return {
          refreshed: false,
          reason: 'user-configured',
          warning: 'TaskWeaver 中已有自定义 WorkBuddy 提供方设置；为避免覆盖，请先在模型设置中确认凭据与路由。',
          installedApps,
        }
      }
      if (!credential.key) {
        return {
          refreshed: false,
          reason: 'credential-missing',
          warning: 'WorkBuddy 模型没有可安全匹配的 API Key；为保护现有提供方配置，未合并模型。',
          installedApps,
        }
      }
      // A user-owned provider with no TaskWeaver WorkBuddy credential binding
      // is outside the auto-merge path, even if another credential happens to
      // be stored under the same provider id.
      if (configuredCredentialRef !== expectedCredentialRef && !legacyKey) {
        return {
          refreshed: false,
          reason: 'user-configured',
          warning: 'TaskWeaver 中已有自定义 WorkBuddy 提供方设置；当前没有可安全复用的凭据绑定，因此未自动合并。',
          installedApps,
        }
      }
      if (
        (legacyKey && legacyKey !== credential.key)
        || (currentCredential?.key && currentCredential.key !== credential.key)
      ) {
        return {
          refreshed: false,
          reason: 'credential-conflict',
          warning: 'TaskWeaver 与 WorkBuddy 使用不同凭据；为保护现有提供方配置，未合并模型。',
          installedApps,
        }
      }
      // Merge only when the existing route already points at TaskWeaver's
      // WorkBuddy credential, or still contains the same legacy key. This
      // preserves custom routes and avoids attaching credentials to an
      // unrelated provider that happens to share the same provider id.
      const merged = mergeDiscoveredWorkBuddyModels(existingBlock, wb.block)
      if (!merged) {
        return {
          refreshed: false,
          reason: 'user-configured',
          warning: 'TaskWeaver 中已有自定义 WorkBuddy 提供方设置；模型清单格式无法安全合并。',
          installedApps,
        }
      }
      addedModelCount = merged.addedModelCount
      if (!addedModelCount) {
        return {
          refreshed: false,
          reason: 'unchanged',
          modelCount: existingBlock.models.length,
          addedModelCount: 0,
          installedApps,
        }
      }
      if (!await storeWorkBuddyCredential(credentialStore, credential.key)) {
        return {
          refreshed: false,
          reason: 'credential-store-unavailable',
          warning: '发现 WorkBuddy 新模型，但无法将凭据安全保存到本机凭据存储，因此没有合并。',
          installedApps,
        }
      }
      workbuddyBlock = {
        ...merged.block,
        apiKeyEnv: expectedCredentialRef,
      }
      delete workbuddyBlock.apiKey
      shouldWriteWorkBuddyBlock = true
    } else {
      if (!workBuddyManagedLocally && !credential.key && !legacyKey) {
        return {
          refreshed: false,
          reason: 'credential-missing',
          warning: '发现 WorkBuddy 模型，但配置中没有 API Key；未自动导入。',
          installedApps,
        }
      }
      if (
        !workBuddyManagedLocally
        && credential.key
        && currentCredential?.key
        && currentCredential.key !== credential.key
      ) {
        return {
          refreshed: false,
          reason: 'credential-conflict',
          warning: 'TaskWeaver 已保存另一组 WorkBuddy 凭据；为避免覆盖，未自动导入本机配置。',
          installedApps,
        }
      }
      const nextCredentialKey = credential.key || legacyKey
      credentialChanged = Boolean(
        nextCredentialKey
          && workBuddyManagedLocally
          && currentCredential?.key !== nextCredentialKey,
      )
      const savedCredential = await storeWorkBuddyCredential(
        credentialStore,
        nextCredentialKey,
        { replaceExisting: Boolean(credential.key && workBuddyManagedLocally) },
      )
      if (!savedCredential) {
        return {
          refreshed: false,
          reason: 'credential-store-unavailable',
          warning: '发现 WorkBuddy 模型，但无法将 API Key 安全保存到本机凭据存储，因此没有导入。',
          installedApps,
        }
      }

      workbuddyBlock = {
        ...wb.block,
        taskweaverSource: 'workbuddy-local',
        apiKeyEnv: taskweaverApiKeyEnvRef('workbuddy'),
      }
      delete workbuddyBlock.apiKey
      addedModelCount = workbuddyBlock.models.length
      shouldWriteWorkBuddyBlock = true
    }

    if (!shouldWriteWorkBuddyBlock || !workbuddyBlock) {
      return { refreshed: false, reason: 'unchanged', installedApps }
    }
    const { modelsDoc, changed } = await writeModelsDoc(modelsPath, { providers: {} }, { workbuddyBlock })
    if (!changed && !credentialChanged) {
      return {
        refreshed: false,
        reason: 'unchanged',
        modelCount: workbuddyBlock.models.length,
        addedModelCount: 0,
        installedApps,
      }
    }
    if (typeof ensureModelsJsonSyncedToDshHost !== 'function') {
      return {
        refreshed: false,
        reason: 'host-sync-unavailable',
        modelCount: workbuddyBlock.models.length,
        addedModelCount,
        installedApps,
      }
    }

    const hostSync = await ensureModelsJsonSyncedToDshHost({
      hostManager,
      userDataPath,
      credentialStore,
      modelsDocOverride: modelsDoc,
    })
    if (hostSync?.reason?.includes('-ns-missing')) {
      return {
        refreshed: false,
        reason: hostSync.reason,
        modelCount: workbuddyBlock.models.length,
        addedModelCount,
        installedApps,
      }
    }
    if (typeof modelService?.refreshCatalog === 'function') await modelService.refreshCatalog()
    return {
      refreshed: Boolean(hostSync?.synced),
      reason: hostSync?.reason ?? 'synced',
      modelCount: workbuddyBlock.models.length,
      addedModelCount,
      installedApps,
    }
  } catch (error) {
    return {
      refreshed: false,
      reason: 'sync-failed',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** @deprecated */
export const bootstrapBridgeOnAppReady = bootstrapModelSyncOnAppReady
