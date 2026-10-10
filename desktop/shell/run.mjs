#!/usr/bin/env node
/** CLI entry: desktop backend + Shell HTTP (Swift / WebView2 / dev browser). */
import { startDesktopBackend } from '../backend/start-desktop-backend.mjs'

if (!process.env.TASKWEAVER_RESOURCES_PATH && process.env.TASKWEAVER_PACKAGED === '1') {
  console.error('[shell] TASKWEAVER_RESOURCES_PATH is required when TASKWEAVER_PACKAGED=1')
  process.exit(1)
}

const { http } = await startDesktopBackend()

console.log(`[TaskWeaver] shell-server: ${http.baseUrl}`)
console.log(`[TaskWeaver] shell-ui-dev: http://127.0.0.1:5173/?shellApi=${encodeURIComponent(http.baseUrl)}`)

const shutdown = () => {
  http.server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
