#!/usr/bin/env node
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import crypto from 'node:crypto'

const separator = process.argv.indexOf('--')
const options = process.argv.slice(2, separator < 0 ? undefined : separator)
const command = separator < 0 ? [] : process.argv.slice(separator + 1)
const value = (prefix, fallback) => options.find((option) => option.startsWith(prefix))?.slice(prefix.length) ?? fallback
const label = value('--label=', 'startup-probe')
const tracePath = path.resolve(value('--trace-file=', path.join(os.tmpdir(), `taskweaver-startup-${process.pid}-${Date.now()}.jsonl`)))
const cwd = value('--cwd=', process.cwd())
const waitEvent = value('--wait-event=', null)
const timeoutMs = Number(value('--timeout-ms=', '60000'))
const probeId = crypto.randomUUID()

if (!command.length || (waitEvent && (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600000))) {
  console.error('Usage: node scripts/tw-startup-probe.mjs [--label=name] [--trace-file=file] [--cwd=dir] [--wait-event=event] [--timeout-ms=60000] -- <command> [args...]')
  process.exit(2)
}

fs.mkdirSync(path.dirname(tracePath), { recursive: true })
const traceOffset = fs.existsSync(tracePath) ? fs.statSync(tracePath).size : 0
const startedAt = performance.now()
const timestamp = new Date().toISOString()
fs.appendFileSync(tracePath, `${JSON.stringify({ timestamp, pid: process.pid, startupId: probeId, elapsedMs: 0, event: 'probe:start', label, command: command[0] })}\n`)
const env = { ...process.env, TASKWEAVER_STARTUP_TRACE: '1', TASKWEAVER_STARTUP_TRACE_FILE: tracePath }
let result
let startupEventMs = null

if (!waitEvent) {
  result = spawnSync(command[0], command.slice(1), { cwd, env, stdio: 'inherit' })
} else {
  const child = spawn(command[0], command.slice(1), { cwd, env, stdio: 'inherit' })
  let childExit = null
  const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })))
  child.once('exit', (code, signal) => { childExit = { code, signal } })
  const deadline = Date.now() + timeoutMs
  let found = false
  while (Date.now() < deadline && !found && !childExit) {
    try {
      const contents = await fsp.readFile(tracePath)
      const lines = contents.subarray(traceOffset).toString('utf8').split(/\r?\n/)
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const row = JSON.parse(line)
          if (row.pid !== process.pid && row.event === waitEvent && Number.isFinite(row.elapsedMs)) {
            startupEventMs = row.elapsedMs
            found = true
            break
          }
        } catch { /* ignore incomplete append while the child is writing */ }
      }
    } catch { /* trace file may not exist until the child emits its first event */ }
    if (!found && !childExit) await delay(50)
  }
  if (found) {
    const stopped = await stopChild(child, closed)
    childExit = stopped
    result = { status: 0, signal: null }
  } else {
    if (!childExit) childExit = await stopChild(child, closed)
    result = { status: childExit?.code ?? 1, signal: childExit?.signal ?? null }
    if (!childExit) console.error(`Timed out waiting for startup event "${waitEvent}" after ${timeoutMs} ms`)
  }
}

const durationMs = Number((performance.now() - startedAt).toFixed(3))
const exitCode = result.status ?? (result.signal || result.error ? 1 : 0)
fs.appendFileSync(tracePath, `${JSON.stringify({ timestamp: new Date().toISOString(), pid: process.pid, startupId: probeId, elapsedMs: durationMs, event: 'probe:end', label, durationMs, startupEvent: waitEvent, startupEventMs, exitCode })}\n`)
console.log(JSON.stringify({ label, command, cwd, tracePath, durationMs, startupEvent: waitEvent, startupEventMs, exitCode, signal: result.signal ?? null }, null, 2))
if (result.error) console.error(result.error.message)
process.exitCode = exitCode

async function stopChild(child, closed) {
  child.kill('SIGTERM')
  const graceful = await Promise.race([closed, delay(3000).then(() => null)])
  if (graceful) return graceful
  child.kill('SIGKILL')
  return closed
}
