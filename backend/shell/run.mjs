#!/usr/bin/env node
/** CLI entry: desktop backend + Shell HTTP (Swift / WebView2 / dev browser). */
import { startDesktopBackend } from '../start-desktop-backend.mjs'
import { stopOpenCodexProxyForApp } from '../ensure-opencodex-proxy.mjs'

if (!process.env.TASKWEAVER_RESOURCES_PATH && process.env.TASKWEAVER_PACKAGED === '1') {
  console.error('[shell] TASKWEAVER_RESOURCES_PATH is required when TASKWEAVER_PACKAGED=1')
  process.exit(1)
}

if (process.env.TASKWEAVER_DEV_HTTP !== '1'
  && process.env.TASKWEAVER_PACKAGED !== '1'
  && process.env.TASKWEAVER_SHELL_SERVER !== '1') {
  console.error('[shell] HTTP backend is available to the Swift shell or dev:browser only.')
  process.exit(2)
}

const shellToken = process.env.TASKWEAVER_SHELL_TOKEN || null
const { app, http, startup } = await startDesktopBackend({ serveHttp: true })

console.log(`[TaskWeaver] shell-server: ${http.baseUrl}`)
if (process.env.TASKWEAVER_DEV_HTTP === '1') {
  const devUiQuery = new URLSearchParams({ shellApi: http.baseUrl })
  const devUiUrl = new URL(`http://127.0.0.1:5173/?${devUiQuery}`)
  if (shellToken) devUiUrl.hash = `shellToken=${encodeURIComponent(shellToken)}`
  console.log(`[TaskWeaver] shell-ui-dev: ${devUiUrl}`)
}

let shutdownPromise = null
const shutdown = () => {
  if (shutdownPromise) return shutdownPromise
  shutdownPromise = (async () => {
    const closeHttp = new Promise((resolve) => http.server.close(resolve))
    http.server.closeAllConnections?.()
    await closeHttp

    // Let an in-flight bootstrap finish before stopping Host, so it cannot spawn
    // a new child after shutdown has already returned.
    await startup.bootstrap.start().catch(() => {})
    const cleanupResults = await app.emitAndWait('before-quit')
    for (const result of cleanupResults) {
      if (result.status === 'rejected') {
        const error = result.reason
        console.error('[TaskWeaver] shutdown cleanup failed:', error instanceof Error ? error.message : String(error))
      }
    }
    try {
      await startup.hostManager.stop()
    } catch (error) {
      console.error('[TaskWeaver] Z Host shutdown failed:', error instanceof Error ? error.message : error)
    }
    try {
      await stopOpenCodexProxyForApp({ userDataPath: app.getPath('userData') })
    } catch (error) {
      console.error('[TaskWeaver] OpenCodex proxy shutdown failed:', error instanceof Error ? error.message : error)
    }
  })().finally(() => process.exit(0))
  return shutdownPromise
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
