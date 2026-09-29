import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZHostManager } from '../electron/agent/z-host/index.mjs'
import { resolveTaskWeaverRuntimeRoot } from '../electron/agent/z-host/index.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = resolveTaskWeaverRuntimeRoot({
  appPath: projectRoot,
  resourcesPath: null,
  isPackaged: false,
  env: process.env,
})
const testHome = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dsh-deploy-'))
const manager = createZHostManager({
  runtimeRoot,
  userDataPath: testHome,
  executable: process.execPath,
  environment: process.env,
  startTimeoutMs: 90_000,
})

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

try {
  const { api, baseUrl } = await manager.start()
  assert.match(baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/)
  const port = Number(new URL(baseUrl).port)
  assert.ok(await portFree(port) === false, 'Host 应占用端口')

  const host = await api.host.describe({})
  assert.equal(host.result.ok, true)

  const sessionId = `taskweaver-deploy-${crypto.randomUUID()}`
  const created = await api.sessions.create({
    sessionId,
    cwd: projectRoot,
    agentPreset: 'taskweaver-planner',
  })
  assert.equal(created.result.ok, true)

  const history = await api.sessions.history({ sessionId })
  assert.equal(history.result.ok, true)

  const models = await api.sessions.models({ sessionId })
  assert.equal(models.result.ok, true)

  const controller = new AbortController()
  const stream = api.events.mux({}, controller.signal)[Symbol.asyncIterator]()
  const first = await Promise.race([
    stream.next(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('mux timeout')), 8_000)),
  ])
  controller.abort()
  await stream.return?.()
  assert.equal(first.value?.payload?.type, 'session/subscribed')

  await manager.stop()
  assert.ok(await portFree(port), '停止后端口应释放')
  console.log(`DSH deployed runtime smoke passed (${runtimeRoot})`)
} finally {
  await manager.stop().catch(() => {})
  await fs.rm(testHome, { recursive: true, force: true })
}
