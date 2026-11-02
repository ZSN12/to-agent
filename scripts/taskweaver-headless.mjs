#!/usr/bin/env node
/**
 * 无头单轮：复用 run-agent-read-smoke 管线；--fixture 可离线验证 CLI 协议。
 *
 *   node scripts/taskweaver-headless.mjs --text "只读列出根目录" [--preset taskweaver-readonly] [--json-summary]
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveHostNodeExecutable } from '../backend/agent/z-host/resolve-host-executable.mjs'
import { superviseHeadlessChild } from './headless-supervisor.mjs'
import { DEFAULT_HEADLESS_TASK_TIMEOUT_MS, parseHeadlessTaskTimeout } from './headless-run-options.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function hostNodeExecutable() {
  return resolveHostNodeExecutable({
    env: process.env,
    resourcesPath: process.env.TASKWEAVER_RESOURCES_PATH,
    isPackaged: process.env.TASKWEAVER_PACKAGED === '1',
  }).executable
}

const USAGE = `Usage: node scripts/taskweaver-headless.mjs --text "<prompt>" [options]

Headless wrapper around run-agent-read-smoke.mjs --local (see docs/taskweaver-headless.md).

Options:
  --text <prompt>       User message for this turn (required)
  --preset <name>       Agent preset (default in smoke: taskweaver-readonly)
  --workspace <path>    Workspace directory to bind the headless session to
  --permission-mode <mode>  readonly, ask (default), or on-risk; full is unavailable
  --json-summary        After run, print one JSON summary line on stdout
  --report-dir <path>   Store the per-run report in this directory
  --fixture             Emit deterministic smoke events without starting Host/model
  --evaluation-mode <mode>  single, dag-fixed, or dag-routed evaluation execution
  --task-timeout <ms>   Total task deadline (default ${DEFAULT_HEADLESS_TASK_TIMEOUT_MS}ms, max 3600000ms)
  --eval-secure          Do not copy stored credentials; require dedicated TASKWEAVER_USER_DATA
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

let taskTimeoutMs
try {
  taskTimeoutMs = parseHeadlessTaskTimeout(argv)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

if (!passthrough.includes('--text')) {
  console.error(USAGE.trim())
  process.exit(1)
}

const smokeScript = path.join(root, 'scripts/diagnose/run-agent-read-smoke.mjs')
const childArgs = [smokeScript, '--local', ...passthrough]

const exitCode = await superviseHeadlessChild({
  executable: hostNodeExecutable(),
  args: childArgs,
  cwd: root,
  env: process.env,
  jsonSummary,
  timeoutMs: taskTimeoutMs,
})
process.exitCode = exitCode
