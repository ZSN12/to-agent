import path from 'node:path'
import fs from 'node:fs/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
import { sendToolTrace, summarizeToolInput } from './tool-trace.mjs'
import { waitForRendererPermissionPrompt } from './permission-prompt-bridge.mjs'
import { isPathInside, resolveThroughSymlinks } from './security-path.mjs'
import { checkFileMutationAllowed } from './fs-sandbox-fence.mjs'
import {
  sandboxDenialMarker,
  escalationHintMarker,
  WIDER_MODES,
  validateEscalationArgs,
  approveEscalation,
} from '../vendor/dsh-sandbox/escalation.mjs'
import { consumeOneShotSandboxMode, withSandboxEscalation } from './sandbox-escalation-runtime.mjs'

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
  const mcp = tool.startsWith('mcp__') || tool.startsWith('mcp_')
  const webSearch = tool === 'web_search'
  return {
    tool,
    candidate,
    outsideWorkspace,
    network: network || webSearch,
    destructive,
    privileged,
    mutation,
    fileAccess,
    mcp,
    webSearch,
  }
}

/** DSH auto-review 轻量版：工作区内只读类工具在 ask 模式下免弹窗。 */
function isAutoApprovedRead(details) {
  return (
    ['read', 'grep', 'find', 'ls'].includes(details.tool)
    && details.fileAccess
    && !details.outsideWorkspace
    && !details.network
    && !details.destructive
    && !details.privileged
    && !details.mutation
    && !details.mcp
    && !details.webSearch
  )
}

/** TaskWeaver permission policy. Prompts are scoped to the active desktop turn. */
export function createPermissionService({
  dialog,
  getParentWindow,
  getWorkspacePath,
  getFileSandboxPolicy,
  appState,
  rulesStore,
  onPreMutation,
  getAutoReviewReads = () => true,
  logApprovalEvent = null,
}) {
  const recordApproval = async (conversationId, type, body) => {
    if (!conversationId || !logApprovalEvent) return
    await Promise.resolve(logApprovalEvent(conversationId, type, body)).catch(() => {})
  }

  const mapUiActionToOutcome = (action) => {
    if (action === 'allow-once' || action === 'escalate-once') return 'allowed-once'
    if (action === 'allow-always') return 'allowed-always'
    if (action === 'deny') return 'rejected'
    return 'unavailable'
  }
  const emitPermissionTrace = async (active, contents, trace) => {
    sendToolTrace(contents, { type: 'tool', ...trace, conversationId: active?.conversationId ?? undefined })
    const persist = active?.conversationId && appState?.appendOutputLogForConversation
      ? appState.appendOutputLogForConversation(active.conversationId, trace)
      : appState?.appendOutputLog(trace)
    await Promise.resolve(persist).catch(() => {})
  }
  const controller = {
    withExecution(mode, webContents, fn, metadata = {}) {
      return activeExecution.run({
        mode: normalizeMode(mode),
        webContents,
        hasAutoCheckpoint: false,
        conversationId: metadata.conversationId ?? null,
      }, fn)
    },
    async authorize(event) {
      return authorizeInner(event)
    },
    async approveSandboxEscalation({ requestedMode, justification, effectiveMode, toolCallId }) {
      const active = activeExecution.getStore()
      const mode = normalizeMode(active?.mode)
      if (mode === 'full') return requestedMode === 'danger-full-access' ? 'danger-full-access' : requestedMode
      if (mode !== 'ask') {
        throw new Error('sandbox escalation requires ask permission mode when not in full access')
      }
      validateEscalationArgs(requestedMode, justification)
      const contents = active?.webContents
      if (!contents || contents.isDestroyed()) {
        throw new Error('sandbox escalation requires approval, but no approval channel is available')
      }
      return approveEscalation(
        {
          requestedMode,
          justification,
          effectiveMode: effectiveMode || 'read-only',
          subject: 'command',
        },
        {
          approver: {
            request: async (req) => {
              const uiAnswer = await waitForRendererPermissionPrompt(contents, {
                reason: `模型请求升级沙箱：${requestedMode}`,
                detail: req.reason,
                tool: 'bash',
                conversationId: active?.conversationId ?? undefined,
                sandboxEscalation: {
                  effectiveMode: effectiveMode || 'read-only',
                  targets: [requestedMode],
                },
              })
              if (uiAnswer.action === 'escalate-once') return 'allowed-once'
              if (uiAnswer.action === 'deny') return 'rejected'
              if (uiAnswer.action === 'allow-once' && uiAnswer.sandboxMode === requestedMode) return 'allowed-once'
              return 'unavailable'
            },
          },
          callId: toolCallId,
          toolName: 'bash',
        },
      )
    },
  }

  async function authorizeInner(event) {
      const active = activeExecution.getStore()
      const mode = normalizeMode(active?.mode)
      const workspacePath = await Promise.resolve(getWorkspacePath(active?.conversationId))
      const details = await classifyToolCall(event, workspacePath)

      if (details.mutation && getFileSandboxPolicy) {
        const oneShot = consumeOneShotSandboxMode()
        const basePolicy = await Promise.resolve(getFileSandboxPolicy(active?.conversationId))
        const filePolicy = oneShot
          ? { mode: oneShot === 'danger-full-access' ? 'off' : oneShot }
          : basePolicy
        const fence = await checkFileMutationAllowed(filePolicy, workspacePath, details.candidate)
        if (!fence.allowed) {
          const effective = basePolicy.mode || 'read-only'
          const targets = WIDER_MODES[effective] ?? []
          const contents = active?.webContents
          const denialDetail = `${sandboxDenialMarker(effective)}\n${escalationHintMarker('operation')}\n\n${details.candidate || ''}`

          if (targets.length && mode === 'ask' && contents && typeof contents.send === 'function') {
            const uiAnswer = await waitForRendererPermissionPrompt(contents, {
              reason: '因沙箱策略无法修改该文件',
              detail: denialDetail,
              tool: details.tool,
              conversationId: active?.conversationId ?? undefined,
              sandboxEscalation: { effectiveMode: effective, targets },
            })
            if (uiAnswer.action === 'escalate-once' && uiAnswer.sandboxMode) {
              return withSandboxEscalation(uiAnswer.sandboxMode, () => authorizeInner(event))
            }
          }

          const trace = {
            id: String(event.toolCallId ?? `${details.tool}-${Date.now()}`),
            toolName: details.tool || 'tool',
            status: 'blocked',
            inputSummary: summarizeToolInput(details.tool, event.input),
            resultSummary: `${fence.reason}\n${escalationHintMarker('operation')}`,
          }
          await emitPermissionTrace(active, active?.webContents, trace)
          return { block: true, reason: trace.resultSummary }
        }
      }

      const triggerPreMutation = async () => {
        if (details.mutation && active && !active.hasAutoCheckpoint && onPreMutation) {
          try {
            const res = await onPreMutation(workspacePath, active?.conversationId)
            if (res && res.ok === false) {
              throw new Error(res.error || '创建代码修改前快照失败')
            }
            active.hasAutoCheckpoint = true
          } catch (err) {
            const errMsg = `修改前安全快照创建失败，已阻止破坏性操作以保护代码: ${err?.message || err}`
            console.error('[TaskWeaver]', errMsg)
            throw new Error(errMsg)
          }
        }
      }

      const runPreMutationSafely = async () => {
        try {
          await triggerPreMutation()
          return { ok: true }
        } catch (err) {
          const trace = {
            id: String(event.toolCallId ?? `${details.tool}-${Date.now()}`),
            toolName: details.tool || 'tool',
            status: 'blocked',
            inputSummary: summarizeToolInput(details.tool, event.input),
            resultSummary: err.message,
          }
          await emitPermissionTrace(active, active?.webContents, trace)
          return { ok: false, block: true, reason: err.message }
        }
      }

      // 1. 优先判定细粒度规则：deny 规则具有最高优先级（即使 full 模式也严格执行），allow 规则直接放行
      if (rulesStore) {
        const matched = await rulesStore.matchRule({ tool: details.tool, input: event.input, workspacePath })
        if (matched) {
          if (matched.decision === 'deny') {
            await recordApproval(active?.conversationId, 'approval/review', {
              toolName: details.tool,
              risk: 'high',
              decision: 'deny',
              verdict: 'deny',
              reason: `rule:${matched.rule.pattern}`,
            })
            const trace = {
              id: String(event.toolCallId ?? `${details.tool}-${Date.now()}`),
              toolName: details.tool || 'tool',
              status: 'blocked',
              inputSummary: summarizeToolInput(details.tool, event.input),
              resultSummary: `命中了安全拒绝规则 [${matched.rule.pattern}]`,
            }
            await emitPermissionTrace(active, active?.webContents, trace)
            return { block: true, reason: `命中了安全拒绝规则 [${matched.rule.pattern}]` }
          }
          if (matched.decision === 'allow') {
            await recordApproval(active?.conversationId, 'approval/review', {
              toolName: details.tool,
              risk: 'low',
              decision: 'allow',
              verdict: 'allow',
              reason: `rule:${matched.rule.pattern}`,
            })
            const pre = await runPreMutationSafely()
            if (!pre.ok) return pre
            return undefined
          }
        }
      }

      if (mode === 'full') {
        const pre = await runPreMutationSafely()
        if (!pre.ok) return pre
        return undefined
      }

      const autoReview = await Promise.resolve(getAutoReviewReads())
      if (autoReview && isAutoApprovedRead(details)) {
        await recordApproval(active?.conversationId, 'approval/review', {
          toolName: details.tool,
          risk: 'low',
          decision: 'allow',
          verdict: 'allow',
          reason: 'auto-review-read',
        })
        const pre = await runPreMutationSafely()
        if (!pre.ok) return pre
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
        const pre = await runPreMutationSafely()
        if (!pre.ok) return pre
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
        await emitPermissionTrace(active, contents, trace)
        return { block: true, reason: '无法向用户显示权限确认，操作已阻止' }
      }

      const subject = details.tool === 'bash'
        ? String(event.input?.command ?? '').slice(0, 700)
        : String(details.candidate ?? '').slice(0, 500)
      const isBash = details.tool === 'bash'

      let action = 'deny'
      const approvalId = `appr-${event.toolCallId ?? Date.now()}`
      await recordApproval(active?.conversationId, 'approval/asked', {
        id: approvalId,
        toolName: details.tool,
        callId: event.toolCallId,
        reason,
      })
      if (typeof contents?.send === 'function') {
        const uiAnswer = await waitForRendererPermissionPrompt(contents, {
          reason,
          detail: subject || `工具：${details.tool}`,
          tool: details.tool,
          conversationId: active?.conversationId ?? undefined,
          allowAlways: Boolean(isBash && rulesStore),
        })
        action = uiAnswer.action
      } else if (dialog?.showMessageBox) {
        const parent = getParentWindow?.(contents)
        const buttons = isBash && rulesStore ? ['拒绝', '批准一次', '总是允许该命令'] : ['拒绝', '批准一次']
        const options = {
          type: 'warning',
          title: 'TaskWeaver 操作确认',
          message: `TaskWeaver 想要${reason}。`,
          detail: subject || `工具：${details.tool}`,
          buttons,
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        }
        const answer = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
        if (answer.response === 1) action = 'allow-once'
        else if (answer.response === 2 && isBash && rulesStore) action = 'allow-always'
        else action = 'deny'
      }

      await recordApproval(active?.conversationId, 'approval/decided', {
        id: approvalId,
        outcome: mapUiActionToOutcome(action),
      })

      if (action === 'allow-once') {
        const pre = await runPreMutationSafely()
        if (!pre.ok) return pre
        return undefined
      }
      if (action === 'allow-always' && isBash && rulesStore) {
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
        const pre = await runPreMutationSafely()
        if (!pre.ok) return pre
        return undefined
      }
      const trace = {
        id: String(event.toolCallId ?? `${details.tool}-${Date.now()}`),
        toolName: details.tool || 'tool',
        status: 'blocked',
        inputSummary: summarizeToolInput(details.tool, event.input),
        resultSummary: `用户拒绝${reason}`,
      }
      await emitPermissionTrace(active, contents, trace)
      return { block: true, reason: `用户拒绝${reason}` }
  }

  globalThis[CONTROLLER_KEY] = controller
  return controller
}

export function getActivePermissionController() {
  return globalThis[CONTROLLER_KEY]
}
