import path from 'node:path'
import fs from 'node:fs/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
import { sendToolTrace, summarizeToolInput } from './tool-trace.mjs'
import { waitForRendererPermissionPrompt } from './permission-prompt-bridge.mjs'
import { isPathInside, resolveThroughSymlinks } from './security-path.mjs'

export const PERMISSION_MODES = Object.freeze(['ask', 'on-risk', 'full'])
const CONTROLLER_KEY = Symbol.for('taskweaver.permission-controller')
const activeExecution = new AsyncLocalStorage()

function normalizeMode(value) {
  return PERMISSION_MODES.includes(value) ? value : 'ask'
}

async function classifyToolCall(event, workspacePath) {
  const tool = String(event.toolName ?? '')
  const input = event.input ?? {}
  const candidate = typeof input.path === 'string'
    ? input.path
    : typeof input.file_path === 'string'
      ? input.file_path
      : typeof input.filePath === 'string'
        ? input.filePath
        : null
  let outsideWorkspace = false
  if (candidate) {
    const target = path.isAbsolute(candidate) ? candidate : path.resolve(workspacePath, candidate)
    try {
      outsideWorkspace = !isPathInside(await resolveThroughSymlinks(workspacePath), await resolveThroughSymlinks(target))
    } catch {
      // If canonicalization fails, fail closed for paths which are not lexically contained.
      outsideWorkspace = !isPathInside(workspacePath, target)
    }
  }
  const command = tool === 'bash' ? String(input.command ?? '') : ''
  const network = /\b(curl|wget|nc|ncat|ssh|scp|sftp|ftp|ping|git\s+(?:clone|fetch|pull|push)|gh\s+(?:api|repo|pr|issue)|npm\s+install|pnpm\s+(?:add|install)|yarn\s+add|bun\s+add|pip\s+install)\b|https?:\/\//i.test(command)
  const destructive = /(?:^|[;&|\s])(?:rm\s+-[^\s]*r[^\s]*(?:\s|$)|rmdir\b|mkfs\b|diskutil\b|dd\s+if=|git\s+reset\s+--hard\b|git\s+clean\s+-(?=[^\s]*[fd])[^\s]+|truncate\b|shred\b)/i.test(command)
  const privileged = /(?:^|[;&|\s])(?:sudo\b|su\s+-|doas\b|chmod\s+(?:-R\s+)?(?:777|\+s)|chown\s+-R\b)/i.test(command)
  const mutation = ['edit', 'write'].includes(tool)
  const fileAccess = ['read', 'edit', 'write', 'grep', 'find', 'ls'].includes(tool)
  const mcp = tool.startsWith('mcp_')
  return { tool, candidate, outsideWorkspace, network, destructive, privileged, mutation, fileAccess, mcp }
}

/** TaskWeaver permission policy. Prompts are scoped to the active desktop turn. */
export function createPermissionService({ dialog, getParentWindow, getWorkspacePath, appState, rulesStore, onPreMutation }) {
  const controller = {
    withExecution(mode, webContents, fn) {
      return activeExecution.run({ mode: normalizeMode(mode), webContents, hasAutoCheckpoint: false }, fn)
    },
    async authorize(event) {
      const active = activeExecution.getStore()
      const mode = normalizeMode(active?.mode)
      const workspacePath = getWorkspacePath()
      const details = await classifyToolCall(event, workspacePath)

      const triggerPreMutation = async () => {
        if (details.mutation && active && !active.hasAutoCheckpoint && onPreMutation) {
          active.hasAutoCheckpoint = true
          try {
            await onPreMutation(workspacePath)
          } catch (err) {
            console.warn('[TaskWeaver] 执行前自动快照创建警告:', err?.message || err)
          }
        }
      }

      // 1. 优先判定细粒度规则：deny 规则具有最高优先级（即使 full 模式也严格执行），allow 规则直接放行
      if (rulesStore) {
        const matched = await rulesStore.matchRule({ tool: details.tool, input: event.input, workspacePath })
        if (matched) {
          if (matched.decision === 'deny') {
            const trace = {
              id: String(event.toolCallId ?? `${details.tool}-${Date.now()}`),
              toolName: details.tool || 'tool',
              status: 'blocked',
              inputSummary: summarizeToolInput(details.tool, event.input),
              resultSummary: `命中了安全拒绝规则 [${matched.rule.pattern}]`,
            }
            sendToolTrace(active?.webContents, { type: 'tool', ...trace })
            await appState?.appendOutputLog(trace)
            return { block: true, reason: `命中了安全拒绝规则 [${matched.rule.pattern}]` }
          }
          if (matched.decision === 'allow') {
            await triggerPreMutation()
            return undefined
          }
        }
      }

      if (mode === 'full') {
        await triggerPreMutation()
        return undefined
      }

      let reason = null
      if (mode === 'ask') {
        if (details.mcp) reason = `调用外部 MCP 工具 ${details.tool}`
        else if (details.tool === 'bash') reason = '运行终端命令'
        else if (details.outsideWorkspace) reason = `${details.tool === 'read' ? '读取' : '修改'}工作区以外的文件`
      } else {
        if (details.mcp) reason = `调用外部 MCP 工具 ${details.tool}`
        else if (details.destructive) reason = '执行可能删除或重置数据的命令'
        else if (details.privileged) reason = '执行需要提升系统权限的命令'
        else if (details.network) reason = '执行可能访问网络或上传数据的命令'
        else if (details.fileAccess && details.outsideWorkspace) {
          reason = `${details.mutation ? '修改' : '读取'}工作区以外的文件`
        }
      }

      if (!reason) {
        await triggerPreMutation()
        return undefined
      }
      const contents = active?.webContents
      if (!contents || contents.isDestroyed()) {
        const trace = {
          id: String(event.toolCallId ?? `${details.tool}-${Date.now()}`),
          toolName: details.tool || 'tool',
          status: 'blocked',
          inputSummary: summarizeToolInput(details.tool, event.input),
          resultSummary: '无法向用户显示权限确认，操作已阻止',
        }
        sendToolTrace(contents, { type: 'tool', ...trace })
        await appState?.appendOutputLog(trace)
        return { block: true, reason: '无法向用户显示权限确认，操作已阻止' }
      }

      const subject = details.tool === 'bash'
        ? String(event.input?.command ?? '').slice(0, 700)
        : String(details.candidate ?? '').slice(0, 500)
      const isBash = details.tool === 'bash'
      const uiAnswer = await waitForRendererPermissionPrompt(contents, {
        reason,
        detail: subject || `工具：${details.tool}`,
        tool: details.tool,
        allowAlways: Boolean(isBash && rulesStore),
      })
      if (uiAnswer.action === 'allow-once') {
        await triggerPreMutation()
        return undefined
      }
      if (uiAnswer.action === 'allow-always' && isBash && rulesStore) {
        const cmd = String(event.input?.command ?? '').trim()
        if (cmd) {
          await rulesStore.addRule({
            tool: 'bash',
            type: 'command',
            pattern: cmd,
            decision: 'allow',
            scope: 'workspace',
            workspacePath,
            description: '用户通过 Composer 审批面板添加的始终允许命令',
          })
        }
        await triggerPreMutation()
        return undefined
      }
      const trace = {
        id: String(event.toolCallId ?? `${details.tool}-${Date.now()}`),
        toolName: details.tool || 'tool',
        status: 'blocked',
        inputSummary: summarizeToolInput(details.tool, event.input),
        resultSummary: `用户拒绝${reason}`,
      }
      sendToolTrace(contents, { type: 'tool', ...trace })
      await appState?.appendOutputLog(trace)
      return { block: true, reason: `用户拒绝${reason}` }
    },
  }
  globalThis[CONTROLLER_KEY] = controller
  return controller
}

export function getActivePermissionController() {
  return globalThis[CONTROLLER_KEY]
}
