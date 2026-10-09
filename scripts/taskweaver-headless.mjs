#!/usr/bin/env node
/**
 * 无头单轮：复用 run-agent-read-smoke 管线；--fixture 可离线验证 CLI 协议。
 *
 *   node scripts/taskweaver-headless.mjs --text "只读列出根目录" [--preset taskweaver-readonly] [--json-summary]
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const USAGE = `Usage: node scripts/taskweaver-headless.mjs --text "<prompt>" [options]

Headless wrapper around run-agent-read-smoke.mjs --local (see docs/taskweaver-headless.md).

Options:
  --text <prompt>       User message for this turn (required)
  --preset <name>       Agent preset (default in smoke: taskweaver-readonly)
  --workspace <path>    Workspace directory to bind the headless session to
  --json-summary        After run, print one JSON summary line on stdout
  --fixture             Emit deterministic smoke events without starting Host/model
  --help                Show this help

Passthrough to smoke: --model, --thinking, --idle-timeout, --context-budget
`

const argv = process.argv.slice(2)

if (argv.includes('--help') || argv.includes('-h')) {
  console.error(USAGE)
  process.exit(0)
}

const jsonSummary = argv.includes('--json-summary')
const passthrough = argv.filter((a) => a !== '--json-summary')

if (!passthrough.includes('--text')) {
  console.error(USAGE.trim())
  process.exit(1)
}

const smokeScript = path.join(root, 'scripts/run-agent-read-smoke.mjs')
const childArgs = [smokeScript, '--local', ...passthrough]

function parseSmokeLine(line) {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function buildSummary(exitCode, lastCompleted, lastFailed) {
  if (lastCompleted) {
    return {
      wrapper: 'taskweaver-headless',
      ok: exitCode === 0,
      exitCode,
      fixture: lastCompleted.fixture === true,
      elapsedMs: lastCompleted.elapsedMs ?? null,
      agentPreset: lastCompleted.agentPreset ?? null,
      reportPath: lastCompleted.reportPath ?? null,
      text: lastCompleted.text ?? null,
      error: null,
    }
  }
  if (lastFailed) {
    return {
      wrapper: 'taskweaver-headless',
      ok: false,
      exitCode,
      fixture: lastFailed.fixture === true,
      elapsedMs: null,
      agentPreset: null,
      reportPath: lastFailed.reportDir ?? null,
      text: null,
      error: lastFailed.error ?? 'unknown',
    }
  }
  return {
    wrapper: 'taskweaver-headless',
    ok: false,
    exitCode,
    fixture: false,
    elapsedMs: null,
    agentPreset: null,
    reportPath: null,
    text: null,
    error: 'no smoke status line captured',
  }
}

if (!jsonSummary) {
  const child = spawn(process.execPath, childArgs, { cwd: root, stdio: 'inherit', env: process.env })
  child.on('exit', (code) => process.exit(code ?? 1))
} else {
  const child = spawn(process.execPath, childArgs, { cwd: root, stdio: ['inherit', 'pipe', 'pipe'], env: process.env })
  let lastCompleted = null
  let lastFailed = null
  let stdoutBuf = ''

  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString()
    const parts = stdoutBuf.split('\n')
    stdoutBuf = parts.pop() ?? ''
    for (const line of parts) {
      if (!line.trim()) continue
      process.stdout.write(`${line}\n`)
      const obj = parseSmokeLine(line)
      if (obj?.status === 'completed') lastCompleted = obj
    }
  })

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    process.stderr.write(text)
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      const obj = parseSmokeLine(line)
      if (obj?.status === 'failed') lastFailed = obj
    }
  })

  child.on('exit', (code) => {
    if (stdoutBuf.trim()) {
      process.stdout.write(stdoutBuf.endsWith('\n') ? stdoutBuf : `${stdoutBuf}\n`)
      const obj = parseSmokeLine(stdoutBuf.trim())
      if (obj?.status === 'completed') lastCompleted = obj
    }
    const exitCode = code ?? 1
    const summary = buildSummary(exitCode, lastCompleted, lastFailed)
    console.log(JSON.stringify(summary))
    process.exit(summary.ok ? exitCode : (exitCode || 1))
  })
}
