import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createZHostManager } from '../backend/agent/z-host/spawn-host.mjs'

class FakeHostProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode = null
  signalCode = null

  constructor({ termDelayMs = 0, ignoreTerm = false, ignoreAll = false } = {}) {
    super()
    this.termDelayMs = termDelayMs
    this.ignoreTerm = ignoreTerm
    this.ignoreAll = ignoreAll
    this.killSignals = []
    this.closed = false
  }

  kill(signal) {
    if (this.exitCode !== null || this.closed) return true
    this.killSignals.push(signal)
    this.signalCode = signal
    if (this.ignoreAll || (signal === 'SIGTERM' && this.ignoreTerm)) return true
    const delay = signal === 'SIGTERM' ? this.termDelayMs : 0
    setTimeout(() => {
      if (this.closed) return
      this.closed = true
      this.emit('close', null, signal)
    }, delay)
    return true
  }
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-host-lifecycle-'))
const runtimeHome = path.join(root, 'runtime-home')
const userDataPath = path.join(root, 'user-data')
await fs.mkdir(runtimeHome, { recursive: true })
await fs.mkdir(userDataPath, { recursive: true })

function testDependencies({
  environment,
  spawnProcess,
  home = root,
  testUserDataPath = userDataPath,
  getMcpRuntimeIntegrationFn,
}) {
  return {
    runtimeRoot: path.join(root, 'runtime'),
    opencodexPackageRoot: null,
    userDataPath: testUserDataPath,
    home,
    environment,
    spawnProcess,
    prepareRuntimeCwdFn: () => path.join(root, 'runtime-cwd'),
    resolveHostLaunch: () => ({ entrypoint: path.join(root, 'host-entry.js'), nodePath: null }),
    createApiClient: async () => ({
      host: { describe: async () => ({ result: { ok: true, value: {} } }) },
      settings: { describe: async () => ({ result: { ok: true, value: { namespaces: [{ ns: 'llm-pi-ai' }] } } }) },
    }),
    waitForSettingsReady: async () => {},
    getMcpRuntimeIntegration: getMcpRuntimeIntegrationFn ?? (async () => null),
    getWebSearchRuntimeIntegration: async () => null,
    getSystemProxyConfigFn: async () => null,
  }
}

try {
  const children = []
  const childEnvironments = []
  const environment = { TASKWEAVER_HOME: runtimeHome }
  const manager = createZHostManager(testDependencies({
    environment,
    spawnProcess(_executable, _args, options) {
      childEnvironments.push(options.env)
      const child = new FakeHostProcess()
      children.push(child)
      if (children.length === 1) setImmediate(() => child.stdout.write('z web: http://127.0.0.1:19991\n'))
      return child
    },
  }))

  assert.equal(manager.state, 'stopped')
  const firstStart = manager.start()
  assert.equal(manager.state, 'starting')
  assert.strictEqual(manager.whenReady(), firstStart, 'start and whenReady share the single in-flight start')
  await firstStart
  assert.equal(childEnvironments[0].Z_HOME, undefined)
  assert.equal(childEnvironments[0].DSH_HOME, undefined)
  assert.equal(manager.state, 'ready')
  assert.equal((await manager.whenReady()).baseUrl, 'http://127.0.0.1:19991')

  const restart = manager.restart()
  assert.equal(manager.state, 'restarting')
  while (children.length < 2) await new Promise((resolve) => setImmediate(resolve))
  assert.equal(manager.state, 'restarting')
  children[1].stdout.write('z web: http://127.0.0.1:19992\n')
  await restart
  assert.equal(manager.state, 'ready')
  assert.equal((await manager.whenReady()).baseUrl, 'http://127.0.0.1:19992')
  await manager.stop()
  assert.equal(manager.state, 'stopped')

  const uiChildren = []
  let uiChildEnvironment
  const uiManager = createZHostManager(testDependencies({
    environment: { TASKWEAVER_HOME: runtimeHome, TASKWEAVER_UI_VERIFY: '1' },
    spawnProcess(_executable, _args, options) {
      uiChildEnvironment = options.env
      const child = new FakeHostProcess()
      uiChildren.push(child)
      setImmediate(() => child.stdout.write('z web: http://127.0.0.1:19993\n'))
      return child
    },
  }))
  await uiManager.start()
  assert.equal(uiChildEnvironment.Z_HOME, runtimeHome)
  assert.equal(uiChildEnvironment.DSH_HOME, runtimeHome)
  await uiManager.stop()

  const migrationHome = path.join(root, 'migration-home')
  const decoyHome = path.join(root, 'decoy-home')
  const migrationTarget = path.join(migrationHome, 'runtime')
  await fs.mkdir(path.join(migrationHome, '.dsh'), { recursive: true })
  await fs.mkdir(decoyHome, { recursive: true })
  await fs.writeFile(path.join(migrationHome, '.dsh', 'fixture.txt'), 'isolated legacy home')
  const previousHome = process.env.HOME
  try {
    process.env.HOME = decoyHome
    const migrationManager = createZHostManager(testDependencies({
      home: migrationHome,
      testUserDataPath: migrationHome,
      environment: {
        TASKWEAVER_HOME: migrationTarget,
        TASKWEAVER_KEEP_LEGACY_RUNTIME_HOME: '1',
      },
      spawnProcess() {
        const child = new FakeHostProcess()
        setImmediate(() => child.stdout.write('z web: http://127.0.0.1:19994\n'))
        return child
      },
    }))
    try {
      await migrationManager.start()
      assert.equal(await fs.readFile(path.join(migrationTarget, 'fixture.txt'), 'utf8'), 'isolated legacy home',
        'runtime-home migration must use the explicitly injected home, not the process HOME')
      assert.equal(await fs.readFile(path.join(migrationHome, '.dsh', 'fixture.txt'), 'utf8'), 'isolated legacy home',
        'the test fixture must preserve its legacy source')
    } finally {
      await migrationManager.stop()
    }
  } finally {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
  }

  let releasePreparation
  let preparationStarted = false
  let preparationFinished
  const preparationGate = new Promise((resolve) => { releasePreparation = resolve })
  const preparationDone = new Promise((resolve) => { preparationFinished = resolve })
  let lateSpawns = 0
  const stopDuringPreparation = createZHostManager(testDependencies({
    environment: { TASKWEAVER_HOME: runtimeHome, TASKWEAVER_HOST_START_TIMEOUT_MS: '1000' },
    getMcpRuntimeIntegrationFn: async () => {
      preparationStarted = true
      try { return await preparationGate } finally { preparationFinished() }
    },
    spawnProcess() {
      lateSpawns += 1
      return new FakeHostProcess()
    },
  }))
  const cancelledStart = stopDuringPreparation.start()
  while (!preparationStarted) await new Promise((resolve) => setImmediate(resolve))
  const cancelledStartResult = assert.rejects(cancelledStart, /Z Host 启动已取消/)
  await stopDuringPreparation.stop()
  await cancelledStartResult
  releasePreparation(null)
  await preparationDone
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(lateSpawns, 0, 'a cancelled pre-spawn preparation must not launch a Host later')
  assert.equal(stopDuringPreparation.state, 'stopped')

  let timedPreparationSpawns = 0
  const timeoutDuringPreparation = createZHostManager(testDependencies({
    environment: { TASKWEAVER_HOME: runtimeHome, TASKWEAVER_HOST_START_TIMEOUT_MS: '30' },
    getMcpRuntimeIntegrationFn: async () => new Promise(() => {}),
    spawnProcess() {
      timedPreparationSpawns += 1
      return new FakeHostProcess()
    },
  }))
  await assert.rejects(timeoutDuringPreparation.start(), /Z Host 在 30ms 内未就绪/)
  assert.equal(timedPreparationSpawns, 0, 'the startup deadline includes integrations that resolve before spawn')

  const restartChildren = []
  const timeoutThenRestart = createZHostManager(testDependencies({
    environment: { TASKWEAVER_HOME: runtimeHome, TASKWEAVER_HOST_START_TIMEOUT_MS: '200' },
    spawnProcess() {
      const child = new FakeHostProcess({ termDelayMs: 30 })
      restartChildren.push(child)
      if (restartChildren.length > 1) setImmediate(() => child.stdout.write('z web: http://127.0.0.1:19995\n'))
      return child
    },
  }))
  await assert.rejects(timeoutThenRestart.start(), /Z Host 在 200ms 内未就绪/)
  assert.equal(restartChildren[0].closed, true, 'a failed start settles only after the old child closes')
  const recoveredRestart = timeoutThenRestart.restart()
  while (restartChildren.length < 2) await new Promise((resolve) => setImmediate(resolve))
  assert.equal(restartChildren[0].closed, true, 'restart must not overlap an old Host still shutting down')
  await recoveredRestart
  await timeoutThenRestart.stop()

  const lingeringChildren = []
  const boundedStop = createZHostManager({
    ...testDependencies({
      environment: { TASKWEAVER_HOME: runtimeHome },
      spawnProcess() {
        const child = new FakeHostProcess({ ignoreAll: true })
        lingeringChildren.push(child)
        setImmediate(() => child.stdout.write('z web: http://127.0.0.1:19996\n'))
        return child
      },
    }),
    stopGraceMs: 10,
    killCloseTimeoutMs: 10,
  })
  await boundedStop.start()
  await assert.rejects(boundedStop.stop(), /SIGKILL 后仍未退出/)
  assert.deepEqual(lingeringChildren[0].killSignals, ['SIGTERM', 'SIGKILL'])
  lingeringChildren[0].closed = true
  lingeringChildren[0].emit('close', null, 'SIGKILL')
  await boundedStop.stop()

  let failedStarts = 0
  const failedManager = createZHostManager(testDependencies({
    environment: { TASKWEAVER_HOME: runtimeHome, TASKWEAVER_HOST_START_TIMEOUT_MS: '20' },
    spawnProcess() {
      failedStarts += 1
      const child = new FakeHostProcess()
      setImmediate(() => child.stderr.write('diagnostic tail: simulated unavailable Host\n'))
      return child
    },
  }))
  const keepAlive = setInterval(() => {}, 100)
  try {
    await assert.rejects(failedManager.start(), /20ms 内未就绪[\s\S]*simulated unavailable Host/)
  } finally {
    clearInterval(keepAlive)
  }
  assert.equal(failedManager.state, 'failed')
  await assert.rejects(failedManager.whenReady(), /simulated unavailable Host/)
  await assert.rejects(failedManager.start(), /simulated unavailable Host/)
  assert.equal(failedStarts, 1, 'automatic calls must not restart a failed Host in a loop')
  assert.match(failedManager.getDiagnostics(), /simulated unavailable Host/)

  console.log('Host lifecycle checks passed: single-flight readiness, restart state, diagnostics, and environment-configured startup timeout.')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
