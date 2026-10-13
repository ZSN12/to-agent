import assert from 'node:assert/strict'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createShellPlatform } from '../backend/platform/shell-platform.mjs'
import { createShellDevUiEntryUrl } from '../backend/shell/dev-ui-url.mjs'
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

const devUiEntryUrl = createShellDevUiEntryUrl('http://127.0.0.1:31981')
assert.equal(devUiEntryUrl.href, 'http://127.0.0.1:31981/__taskweaver/dev-ui')
assert.equal(devUiEntryUrl.hash, '', 'the developer entry URL must not contain a bearer token')

const bootstrapBuild = await build({
  entryPoints: [path.join(root, 'src/shell/bootstrap.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  write: false,
  logLevel: 'silent',
})
const initialShellUrl = 'http://127.0.0.1:5173/?shellApi=http%3A%2F%2F127.0.0.1%3A31981&keep=yes&shellToken=query-token-secret#tab=chat&shellToken=fragment-token-secret'
const historyState = { route: 'startup' }
const historyUpdates = []
const browserLocation = {
  href: initialShellUrl,
  get search() { return new URL(this.href).search },
  get hash() { return new URL(this.href).hash },
}
const browserWindow = {
  location: browserLocation,
  history: {
    state: historyState,
    replaceState(state, title, nextUrl) {
      historyUpdates.push({ state, title, nextUrl })
      browserLocation.href = new URL(nextUrl, browserLocation.href).toString()
    },
  },
}
const shellFetchCalls = []
const bootstrapModule = { exports: {} }
vm.runInNewContext(bootstrapBuild.outputFiles[0].text, {
  module: bootstrapModule,
  exports: bootstrapModule.exports,
  window: browserWindow,
  document: { querySelector: () => null },
  fetch: async (url, options) => {
    shellFetchCalls.push({ url, options })
    return { ok: true, json: async () => ({ ok: true, data: {} }) }
  },
  URL,
  URLSearchParams,
  AbortController,
})
bootstrapModule.exports.installNativeShellBridge()
await browserWindow.taskweaver.app.getState()
assert.equal(historyUpdates.length, 1, 'bootstrap should replace the initial token-bearing browser history entry')
assert.equal(historyUpdates[0].state, historyState, 'URL cleanup should preserve existing history state')
assert.ok(!browserLocation.href.includes('query-token-secret'))
assert.ok(!browserLocation.href.includes('fragment-token-secret'))
assert.equal(new URL(browserLocation.href).hash, '#tab=chat', 'unrelated fragment state should be preserved')
assert.equal(shellFetchCalls[0].options.headers['X-TaskWeaver-Shell-Token'], 'fragment-token-secret')

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
const previousDevHttp = process.env.TASKWEAVER_DEV_HTTP
const previousPackaged = process.env.TASKWEAVER_PACKAGED
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
  process.env.TASKWEAVER_DEV_HTTP = '1'
  delete process.env.TASKWEAVER_PACKAGED
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
      assert.equal(options.developmentUiPort, 5173, 'the browser development redirect is enabled in dev:browser mode')
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
  if (previousDevHttp === undefined) delete process.env.TASKWEAVER_DEV_HTTP
  else process.env.TASKWEAVER_DEV_HTTP = previousDevHttp
  if (previousPackaged === undefined) delete process.env.TASKWEAVER_PACKAGED
  else process.env.TASKWEAVER_PACKAGED = previousPackaged
}
console.log('shell entry imports resolve')
