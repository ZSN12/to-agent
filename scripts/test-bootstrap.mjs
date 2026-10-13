#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { writeJsonAtomically } from '../backend/atomic-json.mjs'
import { createAppBootstrap } from '../backend/bootstrap.mjs'

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-test-bootstrap-'))
const userData = path.join(tmpRoot, 'user-data')
const appPath = path.join(tmpRoot, 'app')
const defaultsDir = path.join(appPath, 'registry')

try {
  await fs.mkdir(userData, { recursive: true })
  await fs.mkdir(path.join(userData, 'taskweaver'), { recursive: true })
  await fs.writeFile(path.join(userData, 'taskweaver', 'migrations.json'), '{"otherMigration":true}\n')
  await fs.mkdir(defaultsDir, { recursive: true })
  await fs.writeFile(
    path.join(defaultsDir, 'taskweaver-models.defaults.json'),
    JSON.stringify({ providers: {} }, null, 2),
    'utf8',
  )

  let startCalls = 0
  let hostRunning = false
  const createMockHostManager = () => ({
    start: async () => {
      if (!hostRunning) {
        startCalls += 1
        hostRunning = true
      }
      return { api: null }
    },
    restart: async () => { hostRunning = false },
    stop: async () => { hostRunning = false },
  })

  const bootstrap = createAppBootstrap({
    userData,
    appPath,
    ensureHostModelsSynced: async () => ({ synced: false, reason: 'fixture' }),
    hostManager: createMockHostManager(),
    profileStore: {
      listAddedModelKeys: async () => [],
      getActiveModelKey: async () => null,
      migrateOpenCodexRoutesToBridge: async () => ({ changed: false, migrated: [] }),
    },
    modelService: {
      loadModelBundle: async () => ({ catalog: { models: [] } }),
      refreshCatalog: async () => null,
    },
    credentialStore: {
      read: async () => null,
    },
    modelRegistryUpdater: {
      hydrateStatus: async () => {},
      checkForUpdates: async () => ({ state: 'idle' }),
    },
  })

  // 1. 并发调用 bootstrap.start() 返回同一个 promise，且只启动一次 Host
  const p1 = bootstrap.start()
  const p2 = bootstrap.start()
  assert.equal(p1, p2, 'bootstrap.start should return the exact same promise for concurrent calls')
  await p1
  assert.equal(startCalls, 1, 'bootstrap.start should invoke host start exactly once for concurrent callers')

  // 2. 检查 migrations.json 已被成功写入
  const migrationsPath = path.join(userData, 'taskweaver', 'migrations.json')
  const migrationsRaw = await fs.readFile(migrationsPath, 'utf8')
  const migrations = JSON.parse(migrationsRaw)
  assert.equal(migrations.legacyModelsJson, true, 'legacyModelsJson marked done in migrations.json')
  assert.equal(migrations.opencodexPrune, true, 'opencodexPrune marked done in migrations.json')
  assert.equal(migrations.opencodexRoutes, true, 'opencodexRoutes marked done in migrations.json')
  assert.equal(migrations.otherMigration, true, 'atomic marker updates preserve existing migration entries')
  assert.deepEqual((await fs.readdir(path.dirname(migrationsPath))).sort(), ['migrations.json', 'models.json'], 'atomic writes leave no temporary files')

  // 3. 再次单独启动新的 bootstrap 实例，由于 migrations 标记存在，不再重复执行迁移
  await fs.writeFile(path.join(userData, 'taskweaver', 'models.json'), JSON.stringify({
    providers: {
      opencodex: { baseUrl: 'http://127.0.0.1:10100/v1' },
      'taskweaver-bridge': { api: 'taskweaver-bridge', bridgeKind: 'cursor' },
    },
  }, null, 2))
  const secondBootstrap = createAppBootstrap({
    userData,
    appPath,
    ensureHostModelsSynced: async () => ({ synced: false, reason: 'fixture' }),
    hostManager: {
      start: async () => {
        startCalls += 1
        return { api: null }
      },
    },
    profileStore: {
      listAddedModelKeys: async () => { throw new Error('prune should be skipped when its marker exists') },
      getActiveModelKey: async () => { throw new Error('prune should be skipped when its marker exists') },
      migrateOpenCodexRoutesToBridge: async () => {
        throw new Error('should not be called when migration is already marked done')
      },
    },
    modelService: {
      loadModelBundle: async () => ({ catalog: { models: [] } }),
      refreshCatalog: async () => null,
    },
    credentialStore: {
      read: async () => null,
    },
    modelRegistryUpdater: {
      hydrateStatus: async () => {},
      checkForUpdates: async () => ({ state: 'idle' }),
    },
  })

  await secondBootstrap.start()

  // 4. An early start can launch Host before compose has supplied model services.
  const deferredUserData = path.join(tmpRoot, 'deferred-user-data')
  let signalHostStarted
  const hostStarted = new Promise((resolve) => { signalHostStarted = resolve })
  const deferredBootstrap = createAppBootstrap({
    userData: deferredUserData,
    appPath,
    ensureHostModelsSynced: async () => ({ synced: false, reason: 'fixture' }),
    hostManager: {
      start: async () => { signalHostStarted(); return { api: null } },
    },
  })
  const deferredStart = deferredBootstrap.start()
  await hostStarted
  let deferredResolved = false
  void deferredStart.then(() => { deferredResolved = true })
  await Promise.resolve()
  assert.equal(deferredResolved, false, 'bootstrap waits for service dependencies after the early Host start')
  deferredBootstrap.configureServices({
    profileStore: {
      listAddedModelKeys: async () => [],
      getActiveModelKey: async () => null,
      migrateOpenCodexRoutesToBridge: async () => ({ changed: false, migrated: [] }),
    },
    modelService: {
      loadModelBundle: async () => ({ catalog: { models: [] } }),
      refreshCatalog: async () => null,
    },
    credentialStore: { read: async () => null },
    modelRegistryUpdater: { hydrateStatus: async () => {}, checkForUpdates: async () => ({ state: 'idle' }) },
  })
  await deferredStart

  // 5. Dependencies may be replaced before start even when an initial set is complete.
  let replacementModelServiceUsed = false
  const replaceBeforeStart = createAppBootstrap({
    userData: path.join(tmpRoot, 'replace-before-start-user-data'),
    appPath,
    ensureHostModelsSynced: async () => ({ synced: false, reason: 'fixture' }),
    hostManager: { start: async () => ({ api: null }) },
    profileStore: {
      listAddedModelKeys: async () => [],
      getActiveModelKey: async () => null,
      migrateOpenCodexRoutesToBridge: async () => ({ changed: false, migrated: [] }),
    },
    modelService: { loadModelBundle: async () => ({ catalog: { models: [] } }), refreshCatalog: async () => null },
    credentialStore: { read: async () => null },
    modelRegistryUpdater: { hydrateStatus: async () => {}, checkForUpdates: async () => ({ state: 'idle' }) },
  })
  replaceBeforeStart.configureServices({
    modelService: {
      loadModelBundle: async () => {
        replacementModelServiceUsed = true
        return { catalog: { models: [] } }
      },
      refreshCatalog: async () => null,
    },
  })
  await replaceBeforeStart.start()
  assert.equal(replacementModelServiceUsed, true, 'configureServices before start merges into the resolved dependency set')

  // 6. Failed Host starts clear the single-flight promise so a later start retries.
  let failureAttempts = 0
  const retryBootstrap = createAppBootstrap({
    userData: path.join(tmpRoot, 'retry-user-data'),
    appPath,
    ensureHostModelsSynced: async () => ({ synced: false, reason: 'fixture' }),
    hostManager: {
      start: async () => {
        failureAttempts += 1
        if (failureAttempts === 1) throw new Error('mock Host startup failure')
        return { api: null }
      },
    },
    profileStore: {
      listAddedModelKeys: async () => [],
      getActiveModelKey: async () => null,
      migrateOpenCodexRoutesToBridge: async () => ({ changed: false, migrated: [] }),
    },
    modelService: {
      loadModelBundle: async () => ({ catalog: { models: [] } }),
      refreshCatalog: async () => null,
    },
    credentialStore: { read: async () => null },
    modelRegistryUpdater: { hydrateStatus: async () => {}, checkForUpdates: async () => ({ state: 'idle' }) },
  })
  await assert.rejects(retryBootstrap.start(), /mock Host startup failure/)
  await retryBootstrap.start()
  assert.equal(failureAttempts, 2, 'a failed Host start is retried by the next bootstrap.start() call')

  // 7. A compose failure rejects the deferred dependency gate instead of hanging startup.
  const failedCompose = createAppBootstrap({
    userData: path.join(tmpRoot, 'failed-compose-user-data'),
    appPath,
    ensureHostModelsSynced: async () => ({ synced: false, reason: 'fixture' }),
    hostManager: { start: async () => ({ api: null }) },
  })
  const failedComposeStart = failedCompose.start()
  failedCompose.rejectServiceConfiguration(new Error('mock compose failure'))
  await assert.rejects(failedComposeStart, /mock compose failure/)

  // 8. Atomic JSON replacement keeps the old document and removes its temp file on rename failure.
  const atomicProbe = path.join(tmpRoot, 'atomic-probe.json')
  await fs.writeFile(atomicProbe, '{"version":"old"}\n')
  const failingFsOperations = {
    mkdir: (...args) => fs.mkdir(...args),
    writeFile: (...args) => fs.writeFile(...args),
    rename: async () => { throw new Error('mock rename failure') },
    rm: (...args) => fs.rm(...args),
  }
  await assert.rejects(
    writeJsonAtomically(atomicProbe, { version: 'new' }, { fsOperations: failingFsOperations }),
    /mock rename failure/,
  )
  assert.equal(await fs.readFile(atomicProbe, 'utf8'), '{"version":"old"}\n', 'failed rename leaves the prior JSON intact')
  assert.deepEqual((await fs.readdir(tmpRoot)).filter((entry) => entry.endsWith('.tmp')), [], 'failed atomic replacement cleans its temporary file')

  console.log('test-bootstrap: ok (single-flight, deferred setup, retries, atomic failure boundary, and migration markers)')
} finally {
  await fs.rm(tmpRoot, { recursive: true, force: true })
}
