import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDshHostManager } from '../electron/agent/dsh-host/spawn-host.mjs'
import { resolveDshRuntimeRoot } from '../electron/agent/dsh-host/resolve-runtime.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = resolveDshRuntimeRoot({
  appPath: projectRoot,
  resourcesPath: null,
  isPackaged: false,
  env: process.env,
})
const testHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dsh-host-'))
const manager = createDshHostManager({
  runtimeRoot,
  userDataPath: testHome,
  executable: process.execPath,
  environment: process.env,
  startTimeoutMs: 60_000,
})

try {
  const { api, baseUrl } = await manager.start()
  assert.match(baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/)

  const host = await api.host.describe({})
  assert.equal(host.result.ok, true)
  assert.equal(host.result.value.attachedSessions, 0)

  const authorization = await api.authorization.list({})
  assert.equal(authorization.result.ok, true, authorization.result.error?.message)
  const codexFlow = authorization.result.value.flows.find((flow) => flow.key.endsWith('/openai-codex'))
  assert.ok(codexFlow, 'openai-codex OAuth flow should be registered after TaskWeaver host patch')
  assert.ok(codexFlow.methods?.some((method) => method.id === 'oauth'), 'openai-codex should expose oauth method')

  const sessionId = `taskweaver-contract-${crypto.randomUUID()}`
  const created = await api.sessions.create({ sessionId, cwd: projectRoot, agentPreset: 'taskweaver-planner' })
  assert.equal(created.result.ok, true)
  assert.equal(created.result.value.sessionId, sessionId)

  const history = await api.sessions.history({ sessionId })
  assert.equal(history.result.ok, true)
  assert.ok(history.result.value.events.length > 0)

  const models = await api.sessions.models({ sessionId })
  assert.equal(models.result.ok, true)
  assert.equal(typeof models.result.value.current.provider, 'string')

  const controller = new AbortController()
  const stream = api.events.mux({}, controller.signal)[Symbol.asyncIterator]()
  const first = await Promise.race([
    stream.next(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('DSH mux did not publish its subscription baseline')), 5_000)),
  ])
  controller.abort()
  await stream.return?.()
  assert.equal(first.value?.payload?.type, 'session/subscribed')
  assert.equal(first.value.payload.sessionId, sessionId)
  console.log(`DSH Host smoke passed (${runtimeRoot}): boot, typed RPC, durable Session, model catalog, and mux baseline.`)
} finally {
  await manager.stop()
  await fs.rm(testHome, { recursive: true, force: true })
}
