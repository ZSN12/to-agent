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
  serveHttp = true,
} = {}) {
  process.env.TASKWEAVER_SHELL_SERVER = '1'

  const platform = createShellPlatform()
  const startup = createBackendStartup({ app: platform.app })
  void startup.bootstrap.start().catch((error) => {
    console.error('应用引导失败（模型/Host 将重试）:', error instanceof Error ? error.message : error)
  })
  await registerIpc({ ...platform, startup })

  if (!serveHttp) return { ...platform, startup, http: null }

  const http = await startShellHttpServer({ host, port })
  return { ...platform, startup, http }
}

/** @deprecated Use startDesktopBackend */
export const startShellBackend = startDesktopBackend
