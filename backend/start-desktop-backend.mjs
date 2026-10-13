import { registerIpc } from './register-ipc.mjs'
import { createShellPlatform } from './platform/shell-platform.mjs'
import { startShellHttpServer } from './shell/http-server.mjs'
import { isShellBackend } from './platform/runtime-mode.mjs'
import { createBackendStartup } from './startup.mjs'

/**
 * TaskWeaver desktop backend (Node). Used by Swift/WebView2 shell, headless CLI, and scheduled jobs.
 * UI connects via Shell HTTP when {@link isShellBackend} is set.
 */
export async function startDesktopBackend({
  host = process.env.TASKWEAVER_SHELL_HOST || '127.0.0.1',
  port = Number(process.env.TASKWEAVER_SHELL_PORT || 0),
  serveHttp = process.env.TASKWEAVER_DEV_HTTP === '1',
  createPlatform = createShellPlatform,
  createStartup = createBackendStartup,
  registerServices = registerIpc,
  startHttpServer = startShellHttpServer,
} = {}) {
  process.env.TASKWEAVER_SHELL_SERVER = '1'
  const shellToken = process.env.TASKWEAVER_SHELL_TOKEN || null
  delete process.env.TASKWEAVER_SHELL_TOKEN

  const platform = createPlatform()
  const startup = createStartup({ app: platform.app })
  void startup.bootstrap.start().catch((error) => {
    console.error('应用引导失败（模型/Host 将重试）:', error instanceof Error ? error.message : error)
  })
  try {
    await registerServices({ ...platform, startup })
  } catch (error) {
    await cleanupFailedStartup(platform.app, startup)
    throw error
  }

  if (!serveHttp) return { ...platform, startup, http: null }

  let http
  try {
    const isDevelopmentHttp = process.env.TASKWEAVER_DEV_HTTP === '1'
      && process.env.TASKWEAVER_PACKAGED !== '1'
      && process.env.TASKWEAVER_PACKAGED !== 'true'
    http = await startHttpServer({
      host,
      port,
      uiRoot: process.env.TASKWEAVER_SHELL_UI_ROOT,
      authToken: shellToken,
      developmentUiPort: isDevelopmentHttp && shellToken ? 5173 : null,
    })
  } catch (error) {
    await cleanupFailedStartup(platform.app, startup)
    throw error
  }
  return { ...platform, startup, http }
}

async function cleanupFailedStartup(app, startup) {
  // Settle bootstrap before stopping Host so it cannot launch a child afterward.
  await startup.bootstrap.start().catch(() => {})
  const results = await app.emitAndWait('before-quit')
  for (const result of results) {
    if (result.status === 'rejected') {
      const error = result.reason
      console.error('[TaskWeaver] startup cleanup failed:', error instanceof Error ? error.message : String(error))
    }
  }
  try {
    await startup.hostManager.stop()
  } catch (error) {
    console.error('[TaskWeaver] Host startup cleanup failed:', error instanceof Error ? error.message : String(error))
  }
}

/** @deprecated Use startDesktopBackend */
export const startShellBackend = startDesktopBackend
