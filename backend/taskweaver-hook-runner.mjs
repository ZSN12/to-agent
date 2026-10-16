import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
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

function normalizeToolHookList(config, directKey, claudeKey) {
  const direct = Array.isArray(config?.[directKey]) ? config[directKey] : []
  const claude = Array.isArray(config?.hooks?.[claudeKey]) ? config.hooks[claudeKey] : []
  const normalized = []
  for (const entry of direct) {
    if (entry && typeof entry.command === 'string' && entry.command.trim()) {
      normalized.push({
        command: entry.command.trim(),
        ...(typeof entry.matcher === 'string' ? { matcher: entry.matcher } : {}),
        ...(entry.failClosed === true ? { failClosed: true } : {}),
      })
    }
  }
  for (const group of claude) {
    if (!group || typeof group !== 'object') continue
    const matcher = typeof group.matcher === 'string' ? group.matcher : ''
    for (const hook of Array.isArray(group.hooks) ? group.hooks : []) {
      if (hook?.type && hook.type !== 'command') continue
      if (typeof hook?.command !== 'string' || !hook.command.trim()) continue
      normalized.push({ command: hook.command.trim(), ...(matcher ? { matcher } : {}) })
    }
  }
  return normalized
}

function allHooks(config) {
  return [
    ...normalizeHookList(config?.beforeTurn),
    ...normalizeHookList(config?.afterTurn),
    ...normalizeToolHookList(config, 'preToolUse', 'PreToolUse'),
    ...normalizeToolHookList(config, 'postToolUse', 'PostToolUse'),
  ]
}

/**
 * @param {string} userDataPath
 * @param {string | null} workspacePath
 * @param {{ workspaceTrusted?: boolean }} [options]
 */
export async function loadTaskweaverHooks(userDataPath, workspacePath, options = {}) {
  const workspaceTrusted = options.workspaceTrusted === true
  const globalPath = path.join(userDataPath, 'taskweaver-hooks.json')
  const workspacePathFile = workspacePath && workspaceTrusted
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
    preToolUse: [
      ...normalizeToolHookList(globalHooks, 'preToolUse', 'PreToolUse'),
      ...normalizeToolHookList(workspaceHooks, 'preToolUse', 'PreToolUse'),
    ],
    postToolUse: [
      ...normalizeToolHookList(globalHooks, 'postToolUse', 'PostToolUse'),
      ...normalizeToolHookList(workspaceHooks, 'postToolUse', 'PostToolUse'),
    ],
  }
}

function hashWorkspaceHooksFile(parsed) {
  return crypto.createHash('sha256').update(JSON.stringify(parsed ?? {})).digest('hex')
}

/**
 * 工作区 hooks 内容变更后需用户确认一次（hash 存于 userData/hook-approvals.json）。
 * @returns {Promise<boolean>} 是否允许加载工作区 hooks
 */
export async function ensureWorkspaceHooksApproved(userDataPath, workspacePath, { dialog, parentWindow, isPackaged = false } = {}) {
  if (!workspacePath || !userDataPath) return false
  const hooksFile = path.join(workspacePath, '.taskweaver', 'hooks.json')
  const workspaceHooks = await readHookFile(hooksFile)
  if (!workspaceHooks) return true
  const commands = allHooks(workspaceHooks)
  if (!commands.length) return true

  const hash = hashWorkspaceHooksFile(workspaceHooks)
  const approvalsPath = path.join(userDataPath, 'hook-approvals.json')
  let approvals = {}
  try {
    approvals = JSON.parse(await fs.readFile(approvalsPath, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const key = path.resolve(workspacePath)
  if (approvals[key]?.hash === hash) return true

  if (process.env.TASKWEAVER_AUTO_APPROVE_HOOKS === '1' && !isPackaged) {
    approvals[key] = { hash, approvedAt: Date.now() }
    await fs.mkdir(path.dirname(approvalsPath), { recursive: true })
    await fs.writeFile(approvalsPath, `${JSON.stringify(approvals, null, 2)}\n`, 'utf8')
    return true
  }

  const detail = commands.map((entry, index) => `${index + 1}. ${entry.command}`).join('\n')
  if (!dialog?.showMessageBox) return false
  const answer = parentWindow
    ? await dialog.showMessageBox(parentWindow, {
      type: 'warning',
      title: '工作区 hooks 需要确认',
      message: '该工作区配置了 TaskWeaver hooks，执行前需要您确认。',
      detail,
      buttons: ['拒绝', '允许并记住'],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    })
    : await dialog.showMessageBox({
      type: 'warning',
      title: '工作区 hooks 需要确认',
      message: '该工作区配置了 TaskWeaver hooks，执行前需要您确认。',
      detail,
      buttons: ['拒绝', '允许并记住'],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    })
  if (answer.response !== 1) return false
  approvals[key] = { hash, approvedAt: Date.now() }
  await fs.mkdir(path.dirname(approvalsPath), { recursive: true })
  await fs.writeFile(approvalsPath, `${JSON.stringify(approvals, null, 2)}\n`, 'utf8')
  return true
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

function runCommand(command, cwd, env, stdin = '') {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      detached: process.platform !== 'win32',
      windowsHide: true,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
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
    child.stdin?.on('error', () => {})
    child.stdin?.end(stdin)
    child.on('close', (code, signal) => {
      finish({ ok: !timedOut && code === 0, code, signal, ...(timedOut ? { timedOut: true } : {}) })
    })
    child.on('error', (error) => {
      finish({ ok: false, error: error.message, ...(timedOut ? { timedOut: true } : {}) })
    })
  })
}

/**
 * @param {'beforeTurn' | 'afterTurn' | 'preToolUse' | 'postToolUse'} phase
 * @param {Awaited<ReturnType<typeof loadTaskweaverHooks>>} hooks
 * @param {{ workspacePath?: string | null, conversationId?: string, text?: string, executionMode?: string, toolName?: string, toolCallId?: string, input?: unknown, result?: unknown }} context
 */
export async function runTaskweaverHooks(phase, hooks, context) {
  const list = phase === 'beforeTurn' ? hooks.beforeTurn : hooks.afterTurn
  const selected = phase === 'preToolUse' ? hooks.preToolUse
    : phase === 'postToolUse' ? hooks.postToolUse
      : list
  if (!selected?.length) return { ran: 0, failures: [], blocked: false }
  const cwd = context.workspacePath && context.workspacePath.trim()
    ? context.workspacePath
    : process.cwd()
  const env = {
    TASKWEAVER_HOOK_PHASE: phase,
    TASKWEAVER_CONVERSATION_ID: context.conversationId ?? '',
    TASKWEAVER_PROMPT: context.text ?? '',
    TASKWEAVER_EXECUTION_MODE: context.executionMode ?? '',
  }
  const matchingHooks = selected.filter((entry) => matchesToolMatcher(entry.matcher, context.toolName))
  if (!matchingHooks.length) return { ran: 0, failures: [], blocked: false }
  const hookInput = JSON.stringify({
    hook_event_name: phase === 'preToolUse' ? 'PreToolUse' : phase === 'postToolUse' ? 'PostToolUse' : phase,
    session_id: context.conversationId ?? '',
    cwd,
    ...(context.toolName ? { tool_name: context.toolName } : {}),
    ...(context.toolCallId ? { tool_call_id: context.toolCallId } : {}),
    ...(Object.hasOwn(context, 'input') ? { tool_input: context.input } : {}),
    ...(Object.hasOwn(context, 'result') ? { tool_response: context.result } : {}),
  })
  const failures = []
  let ran = 0
  for (const entry of matchingHooks) {
    ran += 1
    const result = await runCommand(entry.command.trim(), cwd, env, hookInput)
    let response = null
    try {
      const trimmed = result.stdout.trim()
      if (trimmed.startsWith('{')) response = JSON.parse(trimmed)
    } catch { /* Plain text output is diagnostic only. */ }
    const blocked = phase === 'preToolUse' && (
      response?.decision === 'block'
      || result.code === 2
      || (entry.failClosed === true && !result.ok)
    )
    if (!result.ok) {
      failures.push({
        command: entry.command,
        ...result,
      })
    }
    if (blocked) {
      return {
        ran,
        failures,
        blocked: true,
        reason: typeof response?.reason === 'string' && response.reason.trim()
          ? response.reason.trim()
          : (result.stderr || result.stdout || 'PreToolUse hook 拒绝了该工具调用').trim(),
      }
    }
  }
  return { ran, failures, blocked: false }
}

function matchesToolMatcher(matcher, toolName) {
  if (typeof matcher !== 'string' || !matcher.trim() || matcher.trim() === '*') return true
  if (typeof toolName !== 'string' || !toolName) return false
  // The supported Claude Code subset is exact tool names and `|` alternatives.
  return matcher.split('|').some((candidate) => candidate.trim().toLowerCase() === toolName.toLowerCase())
}
