import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const HOOK_TIMEOUT_MS = 30_000

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

function runCommand(command, cwd, env) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr?.on('data', (chunk) => { stderr += String(chunk) })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ ok: false, timedOut: true, stdout, stderr })
    }, HOOK_TIMEOUT_MS)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, code, stdout, stderr })
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, error: error.message })
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
