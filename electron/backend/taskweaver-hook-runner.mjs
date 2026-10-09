import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const HOOK_TIMEOUT_MS = 30_000
const HOOK_KILL_GRACE_MS = 2_000
const HOOK_CAPTURE_LIMIT_BYTES = 64 * 1024

async function readHookFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function normalizeHookList(value) {
  if (!Array.isArray(value)) return []
  return value.filter((entry) => entry && typeof entry.command === 'string' && entry.command.trim())
}

/**
 * @param {string} userDataPath
 * @param {string | null} workspacePath
 */
export async function loadTaskweaverHooks(userDataPath, workspacePath) {
  const globalPath = path.join(userDataPath, 'taskweaver-hooks.json')
  const workspacePathFile = workspacePath
    ? path.join(workspacePath, '.taskweaver', 'hooks.json')
    : null
  const [globalHooks, workspaceHooks] = await Promise.all([
    readHookFile(globalPath),
    workspacePathFile ? readHookFile(workspacePathFile) : null,
  ])
  return {
    beforeTurn: [
      ...normalizeHookList(globalHooks?.beforeTurn),
      ...normalizeHookList(workspaceHooks?.beforeTurn),
    ],
    afterTurn: [
      ...normalizeHookList(globalHooks?.afterTurn),
      ...normalizeHookList(workspaceHooks?.afterTurn),
    ],
  }
}

function appendBounded(current, chunk) {
  const combined = Buffer.concat([Buffer.from(current), Buffer.from(chunk)])
  if (combined.length <= HOOK_CAPTURE_LIMIT_BYTES) {
    return { value: combined.toString('utf8'), truncated: false }
  }
  return {
    value: combined.subarray(0, HOOK_CAPTURE_LIMIT_BYTES).toString('utf8'),
    truncated: true,
  }
}

function signalProcessTree(child, signal) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    const args = ['/pid', String(child.pid), '/T']
    if (signal === 'SIGKILL') args.push('/F')
    const killer = spawn('taskkill', args, {
      windowsHide: true,
      stdio: 'ignore',
    })
    killer.on('error', () => {
      try { child.kill(signal) } catch { /* Child already exited. */ }
    })
    killer.on('close', (code) => {
      if (code !== 0) {
        try { child.kill(signal) } catch { /* Child already exited. */ }
      }
    })
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH' && error?.code !== 'EPERM') return
    try { child.kill(signal) } catch { /* Child already exited. */ }
  }
}

function runCommand(command, cwd, env) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      detached: process.platform !== 'win32',
      windowsHide: true,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let stdoutTruncated = false
    let stderrTruncated = false
    let timedOut = false
    let settled = false
    let timer = null
    let killTimer = null
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      resolve({
        ...result,
        stdout,
        stderr,
        ...(stdoutTruncated ? { stdoutTruncated: true } : {}),
        ...(stderrTruncated ? { stderrTruncated: true } : {}),
      })
    }
    timer = setTimeout(() => {
      timedOut = true
      signalProcessTree(child, 'SIGTERM')
      killTimer = setTimeout(() => signalProcessTree(child, 'SIGKILL'), HOOK_KILL_GRACE_MS)
    }, HOOK_TIMEOUT_MS)
    child.stdout?.on('data', (chunk) => {
      const result = appendBounded(stdout, chunk)
      stdout = result.value
      stdoutTruncated ||= result.truncated
    })
    child.stderr?.on('data', (chunk) => {
      const result = appendBounded(stderr, chunk)
      stderr = result.value
      stderrTruncated ||= result.truncated
    })
    child.on('close', (code, signal) => {
      finish({ ok: !timedOut && code === 0, code, signal, ...(timedOut ? { timedOut: true } : {}) })
    })
    child.on('error', (error) => {
      finish({ ok: false, error: error.message, ...(timedOut ? { timedOut: true } : {}) })
    })
  })
}

/**
 * @param {'beforeTurn' | 'afterTurn'} phase
 * @param {Awaited<ReturnType<typeof loadTaskweaverHooks>>} hooks
 * @param {{ workspacePath?: string | null, conversationId?: string, text?: string, executionMode?: string }} context
 */
export async function runTaskweaverHooks(phase, hooks, context) {
  const list = phase === 'beforeTurn' ? hooks.beforeTurn : hooks.afterTurn
  if (!list.length) return { ran: 0, failures: [] }
  const cwd = context.workspacePath && context.workspacePath.trim()
    ? context.workspacePath
    : process.cwd()
  const env = {
    TASKWEAVER_HOOK_PHASE: phase,
    TASKWEAVER_CONVERSATION_ID: context.conversationId ?? '',
    TASKWEAVER_PROMPT: context.text ?? '',
    TASKWEAVER_EXECUTION_MODE: context.executionMode ?? '',
  }
  const failures = []
  let ran = 0
  for (const entry of list) {
    ran += 1
    const result = await runCommand(entry.command.trim(), cwd, env)
    if (!result.ok) {
      failures.push({
        command: entry.command,
        ...result,
      })
      if (entry.failClosed === true) break
    }
  }
  return { ran, failures }
}
