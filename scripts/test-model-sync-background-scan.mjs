import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { scanLocalModels } from '../backend/model-sync/scan-local.mjs'
import { probeLegacyOcxProxy, hasFreshExportSnapshot } from '../backend/model-sync/background-scan-policy.mjs'
import { writeModelsJsonFromBridgeExport } from '../backend/model-sync/bridge-catalog.mjs'
import { writeExportSnapshot } from '../backend/model-sync/snapshot.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-background-bridge-scan-'))
const userDataPath = path.join(root, 'user-data')
const exportDoc = {
  providers: {
    opencodex: { models: [{ id: 'cursor/composer-2.5', name: 'Composer 2.5' }] },
  },
}

try {
  assert.equal(await hasFreshExportSnapshot(userDataPath), false, 'missing snapshot is stale')
  await writeExportSnapshot(userDataPath, exportDoc)
  const snapshotPath = path.join(userDataPath, 'opencodex-export.json')
  const snapshotStat = await fs.stat(snapshotPath)
  assert.equal(await hasFreshExportSnapshot(userDataPath, { now: snapshotStat.mtimeMs + 1 }), true,
    'recent export snapshot suppresses startup refresh')
  assert.equal(await hasFreshExportSnapshot(userDataPath, { now: snapshotStat.mtimeMs + 24 * 60 * 60 * 1000 + 1 }), false,
    'snapshot expires after 24 hours')
  assert.equal(snapshotStat.mode & 0o777, 0o600, 'export snapshot is user-only')

  const traceFile = path.join(root, 'startup-trace.jsonl')
  process.env.TASKWEAVER_STARTUP_TRACE = '1'
  process.env.TASKWEAVER_STARTUP_TRACE_FILE = traceFile

  async function readTraceEvents() {
    try {
      const raw = await fs.readFile(traceFile, 'utf8')
      return raw.trim().split('\n').filter(Boolean).map(JSON.parse)
    } catch {
      return []
    }
  }

  async function resetTrace() {
    await fs.rm(traceFile, { force: true }).catch(() => {})
  }

  await resetTrace()
  let freshProbeCalls = 0
  const fresh = await scanLocalModels({
    userDataPath,
    force: false,
    isExportSnapshotFresh: async () => true,
    isLegacyOcxProxyAvailable: async () => { freshProbeCalls += 1; return true },
    exportCatalog: async () => { throw new Error('fresh snapshot must not export') },
  })
  assert.equal(fresh.code, 'snapshot-fresh')
  assert.equal(freshProbeCalls, 0, 'fresh cache skips even the legacy proxy probe')
  const freshTraceEvents = await readTraceEvents()
  assert.equal(
    freshTraceEvents.some((e) => typeof e.event === 'string' && e.event.startsWith('ocx:')),
    false,
    'fresh cache background scan must not produce any ocx: trace events',
  )

  await resetTrace()
  const noProxy = await scanLocalModels({
    userDataPath,
    force: false,
    isExportSnapshotFresh: async () => false,
    isLegacyOcxProxyAvailable: async () => false,
    exportCatalog: async () => { throw new Error('offline background scan must not spawn ocx') },
  })
  assert.equal(noProxy.code, 'proxy-unavailable')
  const noProxyTraceEvents = await readTraceEvents()
  assert.equal(
    noProxyTraceEvents.some((e) => typeof e.event === 'string' && e.event.startsWith('ocx:')),
    false,
    'proxy-unavailable background scan must not produce any ocx: trace events',
  )

  // 验证 force: true 绕过快照新鲜度与代理探测两道门控
  let forceBypassedProbeCalls = 0
  let forceBypassedFreshCalls = 0
  const forceBypassed = await scanLocalModels({
    userDataPath,
    force: true,
    isExportSnapshotFresh: async () => { forceBypassedFreshCalls += 1; return true },
    isLegacyOcxProxyAvailable: async () => { forceBypassedProbeCalls += 1; return false },
    exportCatalog: async () => exportDoc,
    fetchLogins: async () => ({ cursor: true }),
    writeModelsDoc: async () => ({
      modelsDoc: { providers: { 'bridge-composer': { api: 'taskweaver-bridge', models: exportDoc.providers.opencodex.models } } },
      bridgeProviderIds: ['bridge-composer'],
      changed: false,
    }),
    saveExportSnapshot: async () => {},
    commitHost: async () => {},
    modelService: { async listCatalog() { return { models: [] } } },
    enrichModels: async () => [{ key: 'bridge-composer/cursor/composer-2.5' }],
  })
  assert.equal(forceBypassed.ok, true)
  assert.equal(forceBypassed.code, 'synced')
  assert.equal(forceBypassedFreshCalls, 0, 'force: true must bypass isExportSnapshotFresh check')
  assert.equal(forceBypassedProbeCalls, 0, 'force: true must bypass isLegacyOcxProxyAvailable check')

  let loginAttemptFinished = false
  const loginStartFailure = await scanLocalModels({
    userDataPath,
    force: true,
    loginPolicy: 'open-browser',
    exportCatalog: async () => exportDoc,
    fetchLogins: async () => ({ cursor: false }),
    startProviderLogin: async () => {
      await Promise.resolve()
      loginAttemptFinished = true
      throw new Error('simulated login spawn failure')
    },
  })
  assert.equal(loginAttemptFinished, true, 'scan must await login startup before returning')
  assert.equal(loginStartFailure.ok, false)
  assert.equal(loginStartFailure.code, 'cursor-composer-login-start-failed')
  assert.match(loginStartFailure.error, /simulated login spawn failure/)

  // 验证 export 与 status 并行执行及 trace 时间区间重叠
  await resetTrace()
  let exportActive = false
  let concurrencyObserved = false

  const parallelScan = await scanLocalModels({
    userDataPath,
    force: true,
    exportCatalog: async () => {
      exportActive = true
      await new Promise((resolve) => setTimeout(resolve, 30))
      exportActive = false
      return exportDoc
    },
    fetchLogins: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      if (exportActive) concurrencyObserved = true
      await new Promise((resolve) => setTimeout(resolve, 30))
      return { cursor: true }
    },
    writeModelsDoc: async () => ({
      modelsDoc: { providers: { 'bridge-composer': { api: 'taskweaver-bridge', models: exportDoc.providers.opencodex.models } } },
      bridgeProviderIds: ['bridge-composer'],
      changed: false,
    }),
    saveExportSnapshot: async () => {},
    commitHost: async () => {},
    modelService: { async listCatalog() { return { models: [] } } },
    enrichModels: async () => [{ key: 'bridge-composer/cursor/composer-2.5' }],
  })
  assert.equal(parallelScan.ok, true)
  assert.equal(concurrencyObserved, true, 'exportCatalog and fetchLogins must run concurrently in Promise.all')

  const parallelEvents = await readTraceEvents()
  const expStart = parallelEvents.find((e) => e.event === 'ocx:export-start')
  const expEnd = parallelEvents.find((e) => e.event === 'ocx:export-end')
  const stStart = parallelEvents.find((e) => e.event === 'ocx:status-start')
  const stEnd = parallelEvents.find((e) => e.event === 'ocx:status-end')

  assert.ok(expStart && expEnd, 'must emit ocx:export-start and ocx:export-end')
  assert.ok(stStart && stEnd, 'must emit ocx:status-start and ocx:status-end')

  // 验证时间区间有重叠：[expStart, expEnd] 与 [stStart, stEnd] 重叠
  const overlap = Math.max(expStart.elapsedMs, stStart.elapsedMs) < Math.min(expEnd.elapsedMs, stEnd.elapsedMs)
  assert.equal(overlap, true, 'ocx:export and ocx:status trace intervals must overlap')

  // 验证失败场景的 trace (ocx:export-failed, ocx:status-failed)
  await resetTrace()
  const failedExportScan = await scanLocalModels({
    userDataPath,
    force: true,
    exportCatalog: async () => { throw new Error('simulated export failure') },
    fetchLogins: async () => ({ cursor: true }),
  })
  assert.equal(failedExportScan.ok, false)
  const failedExportEvents = await readTraceEvents()
  assert.ok(
    failedExportEvents.some((e) => e.event === 'ocx:export-failed'),
    'must emit ocx:export-failed on export failure',
  )

  await resetTrace()
  await assert.rejects(
    async () => {
      await scanLocalModels({
        userDataPath,
        force: true,
        exportCatalog: async () => exportDoc,
        fetchLogins: async () => { throw new Error('simulated status failure') },
      })
    },
    /simulated status failure/,
    'must rethrow status failure',
  )
  const failedStatusEvents = await readTraceEvents()
  assert.ok(
    failedStatusEvents.some((e) => e.event === 'ocx:status-failed'),
    'must emit ocx:status-failed on status failure',
  )

  let exports = 0
  let saves = 0
  let commits = 0
  const unchanged = await scanLocalModels({
    userDataPath,
    force: true,
    isExportSnapshotFresh: async () => false,
    isLegacyOcxProxyAvailable: async () => false,
    exportCatalog: async () => { exports += 1; return exportDoc },
    fetchLogins: async () => ({ cursor: true }),
    writeModelsDoc: async () => ({
      modelsDoc: { providers: { 'bridge-composer': { api: 'taskweaver-bridge', models: exportDoc.providers.opencodex.models } } },
      bridgeProviderIds: ['bridge-composer'],
      changed: false,
    }),
    saveExportSnapshot: async () => { saves += 1 },
    commitHost: async () => { commits += 1; throw new Error('unchanged export must not sync Host') },
    modelService: { async listCatalog() { return { models: [] } } },
    enrichModels: async () => [{ key: 'bridge-composer/cursor/composer-2.5' }],
  })
  assert.equal(unchanged.ok, true)
  assert.equal(unchanged.code, 'synced')
  assert.deepEqual(unchanged.models, [{ key: 'bridge-composer/cursor/composer-2.5' }])
  assert.equal(exports, 1, 'manual scan bypasses background cache policy')
  assert.equal(saves, 1, 'unchanged export refreshes its age marker')
  assert.equal(commits, 0, 'unchanged export does not resync models or Host')

  const modelsPath = path.join(root, 'taskweaver', 'models.json')
  const firstWrite = await writeModelsJsonFromBridgeExport(modelsPath, exportDoc)
  assert.equal(firstWrite.changed, true)
  const beforeSecondWrite = (await fs.stat(modelsPath)).mtimeMs
  const secondWrite = await writeModelsJsonFromBridgeExport(modelsPath, exportDoc)
  assert.equal(secondWrite.changed, false, 'equal export is not rewritten')
  assert.equal((await fs.stat(modelsPath)).mtimeMs, beforeSecondWrite)

  const reachable = await probeLegacyOcxProxy({
    timeoutMs: 100,
    connect() {
      const socket = new EventEmitter()
      socket.destroy = () => {}
      setImmediate(() => socket.emit('connect'))
      return socket
    },
  })
  const unavailable = await probeLegacyOcxProxy({
    timeoutMs: 100,
    connect() {
      const socket = new EventEmitter()
      socket.destroy = () => {}
      setImmediate(() => socket.emit('error', new Error('refused')))
      return socket
    },
  })
  assert.equal(reachable, true)
  assert.equal(unavailable, false)
} finally {
  await fs.rm(root, { recursive: true, force: true })
}

console.log('model sync background scan checks passed: 24h cache, proxy preflight, parallel export & status, trace overlap, force: true bypass, unchanged export, and safe snapshot writes')
