#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import { emitLifecycleAndWait } from './app-lifecycle.mjs'
import { guardStdout, createStdioJsonRpcServer } from './rpc/stdio-server.mjs'
import { createRpcRouter } from './rpc/router.mjs'
import { createRpcPlatform } from './platform/rpc-platform.mjs'
import { createTestPlatform } from './platform/test-platform.mjs'
import { registerIpc } from './register-ipc.mjs'
import { createBackendStartup } from './startup.mjs'

// Guard stdout immediately so console.* is diverted to stderr
guardStdout()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function computeContractHash() {
  const schemaPath = path.join(rootDir, 'contract', 'contract.schema.json')
  if (fs.existsSync(schemaPath)) {
    try {
      const content = fs.readFileSync(schemaPath, 'utf8')
      return crypto.createHash('sha256').update(content).digest('hex')
    } catch {}
  }
  return 'dev-contract-hash'
}

export async function startAppServer(argv = process.argv.slice(2), {
  registerServices = registerIpc,
  exitProcess = process.exit,
  createStartup = createBackendStartup,
} = {}) {
  const platformArg = argv.find((a) => a.startsWith('--platform='))?.split('=')[1] || 'rpc'
  const isSelfTest = argv.includes('--self-test')

  const router = createRpcRouter()
  const contractHash = computeContractHash()
  const stdioServer = createStdioJsonRpcServer({
    router,
    contractHash,
    backendVersion: process.env.TASKWEAVER_APP_VERSION || '1.2.1',
  })

  // Select platform implementation
  let platform
  if (platformArg === 'test') {
    const testUserData = process.env.TASKWEAVER_USER_DATA
      ? path.resolve(process.env.TASKWEAVER_USER_DATA)
      : null
    platform = createTestPlatform({
      paths: {
        ...(testUserData ? {
          userData: testUserData,
          documents: path.join(testUserData, 'Documents'),
          logs: path.join(testUserData, 'Logs'),
        } : {}),
        ...(process.env.TASKWEAVER_APP_ROOT ? { appRoot: path.resolve(process.env.TASKWEAVER_APP_ROOT) } : {}),
      },
      app: {
        isPackaged: process.env.TASKWEAVER_PACKAGED === '1' || process.env.TASKWEAVER_PACKAGED === 'true',
      },
    })
  } else {
    platform = createRpcPlatform({ stdioServer })
  }

  // IPC handlers expect Electron's WebContents event target. In RPC mode this
  // sender forwards those events as JSON-RPC notifications and tracks host
  // teardown so session-scoped listeners (for example terminals) are cleaned.
  const eventSender = platform.events.createSender()
  stdioServer.once('shutdown', () => eventSender.destroy())

  // Create an Electron-compatible adapter around router so wireBackendIpc can register all channels
  const ipcAdapter = {
    handle: (channel, handler) => {
      router.handle(channel, async (...dispatchArgs) => {
        // RpcRouter appends request context after all original channel args.
        // Keep Electron IPC's event + positional argument contract intact and
        // expose cancellation through the event's explicit requestContext.
        const requestContext = dispatchArgs.pop()
        const dummyEvent = {
          sender: eventSender,
          senderFrame: { url: 'taskweaver://app' },
          requestContext,
        }
        return handler(dummyEvent, ...dispatchArgs)
      })
    },
  }

  // App / window adapters for composeBackendServices and wireBackendIpc
  const appEvents = new EventEmitter()
  const appAdapter = {
    isPackaged: platform.app.isPackaged,
    getName: () => 'TaskWeaver',
    getVersion: () => platform.app.version,
    getAppPath: () => platform.paths.appRoot,
    on: (evt, fn) => appEvents.on(evt, fn),
    once: (evt, fn) => appEvents.once(evt, fn),
    emit: (evt, ...args) => appEvents.emit(evt, ...args),
    emitAndWait: (evt, ...args) => emitLifecycleAndWait(appEvents, evt, ...args),
    getPath: (name) => {
      switch (name) {
        case 'userData': return platform.paths.userData
        case 'documents': return platform.paths.documents
        case 'logs': return platform.paths.logs
        default: return platform.paths.userData
      }
    },
  }

  const startup = createStartup({ app: appAdapter })
  // Start the one shared bootstrap before service composition. Its dependency
  // providers are filled by compose as soon as their stores are ready.
  void startup.bootstrap.start().catch((error) => {
    console.error('应用引导失败（模型/Host 将重试）:', error instanceof Error ? error.message : error)
  })

  const dialogAdapter = {
    showMessageBox: (win, opts) => platform.ui.showMessageBox(opts ?? win),
    showOpenDialog: async (win, opts) => {
      const o = opts ?? win ?? {}
      if (o.properties?.includes('openDirectory')) {
        const dir = await platform.ui.pickDirectory(o)
        return { canceled: !dir, filePaths: dir ? [dir] : [] }
      }
      const files = await platform.ui.pickFiles(o)
      return { canceled: !files || files.length === 0, filePaths: files || [] }
    },
    showSaveDialog: async (win, opts) => {
      const filePath = await platform.ui.showSaveDialog(opts ?? win)
      return { canceled: !filePath, filePath }
    },
  }

  const browserWindowAdapter = {
    getAllWindows: () => [{
      isDestroyed: () => false,
      webContents: {
        send: (channel, payload) => platform.events.emit(channel, payload),
        isDestroyed: () => false,
      },
    }],
    getFocusedWindow: () => browserWindowAdapter.getAllWindows()[0],
  }

  // Compose all backend services and register channels
  let services
  try {
    services = await registerServices({
      ipcMain: ipcAdapter,
      app: appAdapter,
      dialog: dialogAdapter,
      BrowserWindow: browserWindowAdapter,
      safeStorage: { isEncryptionAvailable: () => false }, // Secrets now route through Platform
      secrets: platform.secrets,
      net: { fetch: platform.fetch },
      shell: platform.shell,
      startup,
    })
  } catch (error) {
    startup.fail?.(error)
    await startup.bootstrap.start().catch(() => {})
    await logLifecycleCleanup(await appAdapter.emitAndWait('before-quit'), 'startup failure')
    try {
      await startup.hostManager.stop?.()
    } catch (cleanupError) {
      console.error('[TaskWeaver Backend] startup cleanup:', cleanupError instanceof Error ? cleanupError.message : String(cleanupError))
    }
    throw error
  }

  if (isSelfTest) {
    let state
    try {
      if (platformArg === 'test') console.error('[TaskWeaver Backend] ready on test platform')
      state = await runAppServerSelfTest(router)
    } finally {
      // The self-test dispatches in-process through the same router and IPC
      // adapter, so it does not need to attach stdin or emit JSON-RPC frames.
      // Invoke app lifecycle cleanup before stopping the chat/Host service.
      await logLifecycleCleanup(await appAdapter.emitAndWait('before-quit'), 'self-test')
      try {
        await services?.chatService?.stop?.()
      } catch (error) {
        console.error('[TaskWeaver Backend] self-test cleanup:', error instanceof Error ? error.message : String(error))
      }
      try {
        services?.terminalService?.dispose?.()
      } catch (error) {
        console.error('[TaskWeaver Backend] self-test terminal cleanup:', error instanceof Error ? error.message : String(error))
      }
      try {
        await startup.hostManager.stop?.()
      } catch (error) {
        console.error('[TaskWeaver Backend] self-test Host cleanup:', error instanceof Error ? error.message : String(error))
      }
      stdioServer.shutdown()
    }
    console.error('[TaskWeaver Backend] self-test passed: app:getState returned initialized state')
    exitProcess(0)
    return { platform, router, stdioServer, services, selfTestState: state }
  }

  stdioServer.start()
  console.error('[TaskWeaver Backend] ready on stdio JSON-RPC')

  let shutdownPromise = null
  const shutdownHandler = () => {
    if (shutdownPromise) return shutdownPromise
    shutdownPromise = Promise.resolve().then(async () => {
      console.error('[TaskWeaver Backend] shutting down...')
      stdioServer.shutdown()
      // Bootstrap may still be starting Host. Wait for its settled state before
      // cleanup so it cannot spawn a new child after HostManager.stop().
      await startup.bootstrap.start().catch(() => {})
      await logLifecycleCleanup(await appAdapter.emitAndWait('before-quit'), 'shutdown')
      try {
        await startup?.hostManager?.stop?.()
      } catch (error) {
        console.error('[TaskWeaver Backend] Host shutdown:', error instanceof Error ? error.message : String(error))
      }
      exitProcess(0)
    })
    return shutdownPromise
  }

  process.on('SIGTERM', shutdownHandler)
  process.on('SIGINT', shutdownHandler)
  process.on('disconnect', shutdownHandler)
  stdioServer.on('shutdown', shutdownHandler)

  return { platform, router, stdioServer, services }
}

async function logLifecycleCleanup(results, phase) {
  for (const result of results) {
    if (result.status === 'rejected') {
      const error = result.reason
      console.error(`[TaskWeaver Backend] ${phase} cleanup:`, error instanceof Error ? error.message : String(error))
    }
  }
}

/**
 * Verify the app service through its registered IPC route and response envelope.
 * S2's written `app:getInfo` name is not present in the current contract; use the
 * existing read-only `app:getState` service until a contract change is approved.
 * @param {{ dispatch: (method: string, params?: unknown[]) => Promise<unknown> }} router
 */
export async function runAppServerSelfTest(router) {
  if (!router || typeof router.dispatch !== 'function') {
    throw new TypeError('self-test requires an RPC router with dispatch()')
  }

  let response
  try {
    response = await router.dispatch('app:getState', [])
  } catch (error) {
    throw new Error('self-test IPC app:getState dispatch failed: ' + (error instanceof Error ? error.message : String(error)), { cause: error })
  }

  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('self-test IPC app:getState returned a non-object response')
  }
  if (response.ok !== true) {
    const detail = typeof response.error === 'string' ? response.error : 'IPC response was not successful'
    throw new Error('self-test IPC app:getState failed: ' + detail)
  }

  const state = response.data
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('self-test IPC app:getState returned no state object')
  }
  const valid = typeof state.currentThreadId === 'string' && state.currentThreadId.length > 0
    && typeof state.threadTitle === 'string'
    && ['readonly', 'ask', 'on-risk', 'full'].includes(state.permissionMode)
    && Array.isArray(state.messages)
    && Array.isArray(state.tasks)
    && Array.isArray(state.outputLogs)
    && Array.isArray(state.threads)
  if (!valid) {
    throw new Error('self-test IPC app:getState returned malformed initialized state')
  }
  return state
}

// Auto-run when executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startAppServer().catch((err) => {
    console.error('[TaskWeaver Backend Fatal]', err)
    process.exit(1)
  })
}
