import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { scanLocalModels } from '../desktop/backend/model-sync/scan-local.mjs'
import { probeLegacyOcxProxy, hasFreshExportSnapshot } from '../desktop/backend/model-sync/background-scan-policy.mjs'
import { writeModelsJsonFromBridgeExport } from '../desktop/backend/model-sync/bridge-catalog.mjs'
import { writeExportSnapshot } from '../desktop/backend/model-sync/snapshot.mjs'

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

  const noProxy = await scanLocalModels({
    userDataPath,
    force: false,
    isExportSnapshotFresh: async () => false,
    isLegacyOcxProxyAvailable: async () => false,
    exportCatalog: async () => { throw new Error('offline background scan must not spawn ocx') },
  })
  assert.equal(noProxy.code, 'proxy-unavailable')

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

console.log('model sync background scan checks passed: 24h cache, proxy preflight, explicit refresh, unchanged export, and safe snapshot writes')
