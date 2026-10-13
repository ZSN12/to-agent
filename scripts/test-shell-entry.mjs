import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createShellPlatform } from '../backend/platform/shell-platform.mjs'
import { createHostEnvironment } from '../backend/startup.mjs'
import { startDesktopBackend } from '../backend/start-desktop-backend.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const result = await build({
  entryPoints: [path.join(root, 'backend/shell/run.mjs')],
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  write: false,
  logLevel: 'silent',
})

assert.equal(result.errors.length, 0)
assert.ok(result.outputFiles.length > 0, 'Shell entry should bundle with its relative imports resolved')

const firstShellApp = createShellPlatform().app
const secondShellApp = createShellPlatform().app
const cleanupOrder = []
firstShellApp.once('before-quit', async () => {
  cleanupOrder.push('started')
  await new Promise((resolve) => setTimeout(resolve, 10))
  cleanupOrder.push('finished')
})
const cleanupResults = await firstShellApp.emitAndWait('before-quit')
assert.deepEqual(cleanupResults.map((result) => result.status), ['fulfilled'])
assert.deepEqual(cleanupOrder, ['started', 'finished'], 'shell lifecycle waits for async cleanup listeners')
assert.deepEqual(await firstShellApp.emitAndWait('before-quit'), [], 'once listeners are removed after cleanup')
assert.deepEqual(await secondShellApp.emitAndWait('before-quit'), [], 'shell app lifecycle listeners are instance scoped')
assert.deepEqual(createHostEnvironment({ PATH: '/bin', TASKWEAVER_SHELL_TOKEN: 'private' }, {
  isPackaged: true,
  resourcesPath: '/app/resources',
}), {
  PATH: '/bin',
  TASKWEAVER_PACKAGED: '1',
  TASKWEAVER_RESOURCES_PATH: '/app/resources',
}, 'the shell auth token must not propagate into the Host child environment')

function makeStartup(events) {
  let bootstrapPromise
  return {
    bootstrap: {
      start() {
        return bootstrapPromise ??= (async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          events.push('bootstrap-settled')
        })()
      },
    },
    hostManager: { async stop() { events.push('host-stopped') } },
  }
}

const previousShellServer = process.env.TASKWEAVER_SHELL_SERVER
const previousShellToken = process.env.TASKWEAVER_SHELL_TOKEN
try {
  const registrationEvents = []
  process.env.TASKWEAVER_SHELL_TOKEN = 'registration-secret'
  await assert.rejects(startDesktopBackend({
    serveHttp: false,
    createPlatform: () => createShellPlatform({ platformName: 'linux' }),
    createStartup: () => makeStartup(registrationEvents),
    registerServices: async ({ app }) => {
      assert.equal(process.env.TASKWEAVER_SHELL_TOKEN, undefined, 'backend consumes the launch token before composing services')
      app.once('before-quit', async () => {
        registrationEvents.push('cleanup-started')
        await new Promise((resolve) => setTimeout(resolve, 10))
        registrationEvents.push('cleanup-finished')
      })
      throw new Error('controlled registration failure')
    },
  }), /controlled registration failure/)
  assert.deepEqual(registrationEvents, [
    'bootstrap-settled',
    'cleanup-started',
    'cleanup-finished',
    'host-stopped',
  ], 'registration failure must settle bootstrap and lifecycle cleanup before stopping Host')

  const httpEvents = []
  process.env.TASKWEAVER_SHELL_TOKEN = 'http-server-secret'
  await assert.rejects(startDesktopBackend({
    serveHttp: true,
    createPlatform: () => createShellPlatform({ platformName: 'linux' }),
    createStartup: () => makeStartup(httpEvents),
    registerServices: async ({ app }) => {
      assert.equal(process.env.TASKWEAVER_SHELL_TOKEN, undefined)
      app.on('before-quit', async () => {
        httpEvents.push('cleanup-started')
        await new Promise((resolve) => setTimeout(resolve, 10))
        httpEvents.push('cleanup-finished')
      })
    },
    startHttpServer: async (options) => {
      assert.equal(options.authToken, 'http-server-secret', 'the secret goes only to the HTTP server')
      throw new Error('controlled HTTP bind failure')
    },
  }), /controlled HTTP bind failure/)
  assert.deepEqual(httpEvents, [
    'bootstrap-settled',
    'cleanup-started',
    'cleanup-finished',
    'host-stopped',
  ], 'HTTP bind failure must clean composed services and Host')
} finally {
  if (previousShellServer === undefined) delete process.env.TASKWEAVER_SHELL_SERVER
  else process.env.TASKWEAVER_SHELL_SERVER = previousShellServer
  if (previousShellToken === undefined) delete process.env.TASKWEAVER_SHELL_TOKEN
  else process.env.TASKWEAVER_SHELL_TOKEN = previousShellToken
}
console.log('shell entry imports resolve')
