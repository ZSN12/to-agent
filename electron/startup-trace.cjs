const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const processStartedAt = process.hrtime.bigint()
const startupId = crypto.randomUUID()
let appRef = null

function configureStartupTrace(app) {
  appRef = app ?? null
}

function traceStartup(event, details = {}) {
  if (process.env.TASKWEAVER_STARTUP_TRACE !== '1') return false
  try {
    const tracePath = process.env.TASKWEAVER_STARTUP_TRACE_FILE
      || (appRef ? path.join(appRef.getPath('userData'), 'startup-trace.jsonl') : null)
    if (!tracePath) return false
    fs.mkdirSync(path.dirname(tracePath), { recursive: true })
    const elapsedMs = Number(process.hrtime.bigint() - processStartedAt) / 1e6
    const record = {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      startupId,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      event: String(event),
      ...(details && typeof details === 'object' ? details : {}),
    }
    fs.appendFileSync(tracePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 })
    return true
  } catch {
    // Diagnostics must never prevent the desktop app from starting.
    return false
  }
}

module.exports = { configureStartupTrace, traceStartup }
