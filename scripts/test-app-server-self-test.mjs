import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ipcHandle } from '../backend/ipc-utils.mjs'

const savedConsole = {
  log: console.log,
  info: console.info,
  debug: console.debug,
}
const { startAppServer, runAppServerSelfTest } = await import('../backend/app-server.mjs')
Object.assign(console, savedConsole)

const validState = {
  currentThreadId: 'self-test-thread',
  threadTitle: '新对话',
  permissionMode: 'ask',
  messages: [],
  tasks: [],
  outputLogs: [],
  threads: [],
}

let dispatchedMethod = null
const validRouter = {
  async dispatch(method, params) {
    dispatchedMethod = { method, params }
    return { ok: true, data: validState }
  },
}
assert.equal(await runAppServerSelfTest(validRouter), validState)
assert.deepEqual(dispatchedMethod, { method: 'app:getState', params: [] })

await assert.rejects(runAppServerSelfTest(null), /requires an RPC router/)
await assert.rejects(runAppServerSelfTest({ dispatch: async () => null }), /non-object response/)
await assert.rejects(runAppServerSelfTest({ dispatch: async () => ({ ok: false, error: 'handler failed' }) }), /app:getState failed: handler failed/)
await assert.rejects(runAppServerSelfTest({ dispatch: async () => ({ ok: true, data: null }) }), /no state object/)
await assert.rejects(runAppServerSelfTest({ dispatch: async () => ({ ok: true, data: { ...validState, currentThreadId: null } }) }), /malformed initialized state/)
await assert.rejects(runAppServerSelfTest({ dispatch: async () => { throw new Error('route missing') } }), /dispatch failed: route missing/)

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-app-server-self-test-'))
const previousEnv = {
  userData: process.env.TASKWEAVER_USER_DATA,
  appRoot: process.env.TASKWEAVER_APP_ROOT,
  packaged: process.env.TASKWEAVER_PACKAGED,
}
process.env.TASKWEAVER_USER_DATA = path.join(tempRoot, 'user-data')
process.env.TASKWEAVER_APP_ROOT = path.join(tempRoot, 'app-root')
delete process.env.TASKWEAVER_PACKAGED

let stopCount = 0
let disposeCount = 0
let exitCode = null
let appPaths
const startupEvents = []
const createMockStartup = () => ({
  hostManager: { async stop() { startupEvents.push('host-stop') } },
  bootstrap: { start() { startupEvents.push('bootstrap-start'); return Promise.resolve() } },
  fail(error) { startupEvents.push(`startup-failed:${error.message}`) },
})
try {
  const started = await startAppServer(['--platform=test', '--self-test'], {
    createStartup: createMockStartup,
    registerServices: async ({ ipcMain, app, startup }) => {
      assert.ok(startup, 'startup coordinator is passed to the service registrar')
      assert.deepEqual(startupEvents, ['bootstrap-start'], 'bootstrap starts before service composition')
      startupEvents.push('compose')
      appPaths = {
        userData: app.getPath('userData'),
        documents: app.getPath('documents'),
        logs: app.getPath('logs'),
        appRoot: app.getAppPath(),
      }
      ipcHandle(ipcMain, 'app:getState', async () => validState)
      return {
        chatService: { async stop() { stopCount += 1 } },
        terminalService: { dispose() { disposeCount += 1 } },
      }
    },
    exitProcess(code) { exitCode = code },
  })

  assert.equal(exitCode, 0, 'a valid service and IPC self-test exits successfully')
  assert.equal(started.selfTestState.currentThreadId, validState.currentThreadId)
  assert.deepEqual(appPaths, {
    userData: path.join(tempRoot, 'user-data'),
    documents: path.join(tempRoot, 'user-data', 'Documents'),
    logs: path.join(tempRoot, 'user-data', 'Logs'),
    appRoot: path.join(tempRoot, 'app-root'),
  }, 'test platform paths must honor isolated startup environment')
  assert.equal(stopCount, 1, 'self-test shuts down the chat/Host service')
  assert.equal(disposeCount, 1, 'self-test disposes terminal resources')
  assert.deepEqual(startupEvents, ['bootstrap-start', 'compose', 'host-stop'], 'self-test stops the early Host coordinator')

  exitCode = null
  await assert.rejects(startAppServer(['--platform=test', '--self-test'], {
    createStartup: createMockStartup,
    registerServices: async ({ ipcMain }) => {
      ipcHandle(ipcMain, 'app:getState', async () => { throw new Error('state service unavailable') })
      return { chatService: { async stop() {} } }
    },
    exitProcess(code) { exitCode = code },
  }), /app:getState failed: state service unavailable/)
  assert.equal(exitCode, null, 'a failed IPC self-test must not exit with success')

  await assert.rejects(startAppServer(['--platform=test'], {
    createStartup: createMockStartup,
    registerServices: async () => { throw new Error('mock compose failure') },
    exitProcess(code) { exitCode = code },
  }), /mock compose failure/)
  assert.ok(startupEvents.includes('startup-failed:mock compose failure'), 'composition failures reject pending startup dependencies')
  assert.equal(exitCode, null, 'a composition failure is returned to the caller without a success exit')
} finally {
  for (const [key, value] of [
    ['TASKWEAVER_USER_DATA', previousEnv.userData],
    ['TASKWEAVER_APP_ROOT', previousEnv.appRoot],
    ['TASKWEAVER_PACKAGED', previousEnv.packaged],
  ]) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await fs.rm(tempRoot, { recursive: true, force: true })
}

process.stdout.write('test-app-server-self-test: ok (registered app:getState route, response boundaries, isolated paths, cleanup, failure exit)\n')
