import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createZHostManager } from '../backend/agent/z-host/spawn-host.mjs'
import { ensureModelsJsonSyncedToDshHost } from '../backend/sync-models-json-to-host.mjs'

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-hot-apply-'))
const userDataPath = path.join(tmpRoot, 'userData')
const homePath = path.join(tmpRoot, 'home')
const tracePath = path.join(tmpRoot, 'trace.jsonl')

await fs.mkdir(userDataPath, { recursive: true })
await fs.mkdir(homePath, { recursive: true })

process.env.TASKWEAVER_STARTUP_TRACE = '1'
process.env.TASKWEAVER_STARTUP_TRACE_FILE = tracePath
process.env.TASKWEAVER_USER_DATA = userDataPath
process.env.TASKWEAVER_HOME = homePath

function readTraceCounts() {
  try {
    const raw = fsSync.existsSync(tracePath) ? fsSync.readFileSync(tracePath, 'utf8') : ''
    const lines = raw.split('\n').filter(Boolean)
    const events = lines.map((l) => {
      try { return JSON.parse(l) } catch { return {} }
    })
    return {
      hostStarts: events.filter((e) => e.event === 'host:start:ready').length,
      hostRestarts: events.filter((e) => e.event === 'host:restart').length,
      reasons: events.filter((e) => e.event === 'host:restart').map((e) => e.reason),
    }
  } catch {
    return { hostStarts: 0, hostRestarts: 0, reasons: [] }
  }
}

class FakeHostProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode = null
  signalCode = null

  kill(signal) {
    if (this.exitCode !== null || this.signalCode !== null) return true
    this.signalCode = signal ?? 'SIGTERM'
    this.exitCode = 0
    setImmediate(() => this.emit('close', 0, this.signalCode))
    return true
  }
}

let apiKey = 'key-initial'
const credentialStore = {
  async read(providerId) {
    if (providerId === 'mock-gateway') return { key: apiKey }
    return null
  },
}

const mockApi = {
  host: {
    async describe() {
      return { result: { ok: true, value: {} } }
    },
  },
  settings: {
    async describe() {
      return {
        result: {
          ok: true,
          value: {
            namespaces: [
              { ns: 'llm-pi-ai', writable: true, revision: 1 },
              { ns: 'llm-taskweaver-bridge', writable: true, revision: 1 },
            ],
          },
        },
      }
    },
    async mutate() {
      return { revision: 2 }
    },
  },
  credentials: {
    async set() { return {} },
    async unset() { return {} },
  },
  llm: {
    async providers() {
      return { value: { providers: [{ provider: 'mock-gateway' }] } }
    },
    async models() {
      return { value: { models: [] } }
    },
  },
}

let hostPort = 19995
const hostManager = createZHostManager({
  runtimeRoot: path.join(tmpRoot, 'runtime'),
  userDataPath,
  environment: {
    ...process.env,
    TASKWEAVER_STARTUP_TRACE: '1',
    TASKWEAVER_STARTUP_TRACE_FILE: tracePath,
    TASKWEAVER_HOME: homePath,
    TASKWEAVER_USER_DATA: userDataPath,
  },
  prepareRuntimeCwdFn: () => path.join(tmpRoot, 'runtime-cwd'),
  resolveHostLaunch: () => ({ entrypoint: path.join(tmpRoot, 'entry.js'), nodePath: null }),
  createApiClient: async () => mockApi,
  waitForSettingsReady: async () => {},
  getMcpRuntimeIntegration: async () => null,
  getWebSearchRuntimeIntegration: async () => null,
  getSystemProxyConfigFn: async () => null,
  spawnProcess() {
    const child = new FakeHostProcess()
    setImmediate(() => child.stdout.write(`z web: http://127.0.0.1:${hostPort++}\n`))
    return child
  },
})

console.log('🧪 Running Host Hot-Apply Integration Test...')

try {
  // 1. Initial Host Launch
  console.log('  - Starting Host initially...')
  const initial = await hostManager.start()
  assert.ok(initial.api, 'Host API should be available')

  // 2. Add bridge provider (Hot Apply without restart)
  console.log('  - Applying bridge provider hot-update...')
  const doc1 = {
    providers: {
      'mock-gateway': {
        name: 'Mock Gateway',
        api: 'openai-completions',
        baseUrl: 'http://127.0.0.1:9/v1',
        models: [{ id: 'mock-1', name: 'Mock Model 1' }],
      },
    },
  }
  await ensureModelsJsonSyncedToDshHost({
    hostManager,
    userDataPath,
    credentialStore,
    modelsDocOverride: doc1,
  })

  // 3. Update API Key (Hot Apply without restart)
  console.log('  - Updating API Key (hot apply)...')
  apiKey = 'key-updated-two'
  await ensureModelsJsonSyncedToDshHost({
    hostManager,
    userDataPath,
    credentialStore,
    modelsDocOverride: doc1,
  })

  // 4. Update model list (Hot Apply without restart)
  console.log('  - Updating model list (hot apply)...')
  const doc2 = {
    providers: {
      'mock-gateway': {
        name: 'Mock Gateway',
        api: 'openai-completions',
        baseUrl: 'http://127.0.0.1:9/v1',
        models: [{ id: 'mock-1', name: 'Mock Model 1' }, { id: 'mock-2', name: 'Mock Model 2' }],
      },
    },
  }
  await ensureModelsJsonSyncedToDshHost({
    hostManager,
    userDataPath,
    credentialStore,
    modelsDocOverride: doc2,
  })

  console.log('  - Verifying restart count during routine updates...')
  const countsBefore = readTraceCounts()
  assert.equal(countsBefore.hostRestarts, 0, `Expected 0 restarts during hot-apply, got ${countsBefore.hostRestarts}`)

  // 5. Change Compaction Target (Should trigger expected restart with compaction reason)
  console.log('  - Changing compaction target to verify restart trigger...')
  const statePath = path.join(userDataPath, 'taskweaver', 'host-model-sync-state.json')
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'))
  state.compactionDigest = 'stale-compaction-digest'
  await fs.writeFile(statePath, JSON.stringify(state))

  await ensureModelsJsonSyncedToDshHost({
    hostManager,
    userDataPath,
    credentialStore,
    modelsDocOverride: doc2,
  })

  const countsAfter = readTraceCounts()
  assert.equal(countsAfter.hostRestarts, 1, `Expected 1 restart for compaction change, got ${countsAfter.hostRestarts}`)
  assert.ok(countsAfter.reasons.includes('compaction'), `Expected reason 'compaction' in ${JSON.stringify(countsAfter.reasons)}`)

  console.log('✅ Host Hot-Apply Integration Test PASSED!')
} finally {
  await hostManager.stop().catch(() => {})
  await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
}
