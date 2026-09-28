import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { extractFileDiff, summarizeToolInput, summarizeToolResult } from './tool-trace.mjs'
import { applySkillInstructions } from './skill-prompt.mjs'
import {
  dshAgentPresetForPermissionMode,
  dshPermissionPresetForMode,
  normalizePermissionMode,
  resolveDshApprovalBridgeAction,
} from './dsh-permission-map.mjs'
import {
  DSH_APPROVAL_PROMPT_TIMEOUT_MS,
  DSH_APPROVAL_PROMPT_GRACE_PERIOD_MS,
  DSH_MAX_RECONNECT_ATTEMPTS,
  DSH_INITIAL_RECONNECT_DELAY_MS,
  DSH_MAX_RECONNECT_DELAY_MS,
  DSH_EVENT_CHANNEL_OPEN_TIMEOUT_MS,
} from './config.mjs'

function rpcValue(response, operation) {
  const result = response?.result ?? response
  if (result?.ok === false) {
    const error = result.error ?? {}
    throw new Error(error.message || `${operation} failed`)
  }
  return result?.value ?? result
}

function textFromMessage(message) {
  if (!message || typeof message !== 'object') return ''
  if (typeof message.text === 'string') return message.text
  if (!Array.isArray(message.content)) return ''
  return message.content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
}

/** Bump when the legacy transcript block format changes (triggers re-injection). */
export const LEGACY_CONTEXT_VERSION = 1

const LEGACY_CONTEXT_BEGIN = '<<<TASKWEAVER_LEGACY_HISTORY_CONTEXT>>>'
const LEGACY_CONTEXT_END = '<<<END_TASKWEAVER_LEGACY_HISTORY_CONTEXT>>>'

const LEGACY_CONTEXT_FOOTER = [
  '【系统说明：以上为 TaskWeaver 旧版 UI 存档的历史对话摘要，不是 DSH 原生会话事件，也不代表已执行的工具调用。】',
  '请静默吸收上述上下文；本条仅为一次性迁移注入，不要基于其发起工具调用或长回复。',
].join('\n')

function authorLabel(author) {
  if (author === 'user') return '用户'
  if (author === 'orchestrator') return '编排器'
  return '助手'
}

function lineFromLegacyMessage(message) {
  if (!message || typeof message !== 'object') return ''
  const parts = []
  const stamp = message.time || (message.timestamp ? new Date(message.timestamp).toISOString() : '')
  const header = `[${authorLabel(message.author)}${stamp ? ` @ ${stamp}` : ''}]`
  if (message.compaction?.summary) {
    parts.push(`${header} [上下文压缩摘要] ${String(message.compaction.summary).trim()}`)
    return parts.join('\n')
  }
  const text = String(message.text ?? '').trim()
  const thinking = String(message.thinking ?? '').trim()
  if (!text && !thinking) return ''
  if (text) parts.push(`${header}\n${text}`)
  else parts.push(header)
  if (thinking) parts.push(`（思考过程摘要）\n${thinking}`)
  if (message.interrupted) parts.push('（该轮已在 UI 中标记为中断）')
  return parts.join('\n')
}

/** Formats thread-store messages as a single labeled legacy context block for one DSH prompt. */
export function formatLegacyHistoryContext(messages) {
  const list = Array.isArray(messages) ? messages : []
  const body = list.map(lineFromLegacyMessage).filter(Boolean).join('\n\n')
  if (!body) return ''
  return [
    LEGACY_CONTEXT_BEGIN,
    '【历史上下文 — TaskWeaver 线程存档，仅供模型理解背景】',
    body,
    LEGACY_CONTEXT_FOOTER,
    LEGACY_CONTEXT_END,
  ].join('\n\n')
}

function usageFromMessage(message) {
  const usage = message?.usage
  if (!usage || typeof usage !== 'object') return null
  const cost = typeof usage.cost === 'number' ? usage.cost : usage.cost?.total
  return {
    inputTokens: Number(usage.input ?? 0) || 0,
    outputTokens: Number(usage.output ?? 0) || 0,
    cacheReadTokens: Number(usage.cacheRead ?? 0) || 0,
    cacheWriteTokens: Number(usage.cacheWrite ?? 0) || 0,
    costUsd: Number(cost ?? 0) || 0,
    contextTokens: Number(usage.contextTokens ?? usage.totalTokens ?? 0) || null,
    contextWindow: Number(usage.contextWindow ?? 0) || null,
  }
}

async function readMap(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' && parsed.sessions && typeof parsed.sessions === 'object'
      ? parsed.sessions
      : {}
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw new Error(`读取 DSH 会话映射失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Bridges TaskWeaver's conversation contract to DSH's typed session API. */
export function createDshChatService({
  hostManager,
  userDataPath,
  getWorkspacePath,
  profileStore,
  modelService,
  getLegacyTranscript,
  getPermissionMode = async () => 'ask',
}) {
  const mapPath = path.join(userDataPath, 'taskweaver', 'dsh-session-map.json')
  const sessions = new Map()
  const pendingApprovals = new Map()
  const liveUsage = new Map()
  const stats = new Map()
  const queueSnapshots = new Map()
  const running = new Map()
  const migrationTurnWaiters = new Map()
  let mapLoad = null
  let persistenceQueue = Promise.resolve()
  let muxAbort = null
  let muxTask = null
  let readyPromise = null
  let stopped = false
  let reconnectAttempt = 0

  const loadSessions = () => {
    if (!mapLoad) mapLoad = readMap(mapPath).then((entries) => {
      for (const [conversationId, entry] of Object.entries(entries)) {
        if (typeof entry?.sessionId === 'string' && typeof entry?.cwd === 'string') sessions.set(conversationId, entry)
      }
    })
    return mapLoad
  }

  function persistSessions() {
    const write = persistenceQueue.then(async () => {
      await fs.mkdir(path.dirname(mapPath), { recursive: true })
      const tmp = `${mapPath}.${process.pid}.${crypto.randomUUID()}.tmp`
      const data = Object.fromEntries(sessions.entries())
      await fs.writeFile(tmp, `${JSON.stringify({ version: 1, sessions: data }, null, 2)}\n`, { mode: 0o600 })
      await fs.rename(tmp, mapPath)
    })
    persistenceQueue = write.catch(() => {})
    return write
  }

  function emit(conversationId, webContents, event) {
    if (!webContents || webContents.isDestroyed?.()) return
    try { webContents.send('chat:stream', { ...event, conversationId }) } catch { /* renderer may be closing */ }
  }

  function registerPendingApproval(id, entry) {
    pendingApprovals.set(id, entry)
    // Add failsafe timeout cleanup to prevent memory leaks
    // This runs only if settleApproval was never called
    const cleanupTimeoutId = setTimeout(() => {
      if (pendingApprovals.has(id)) {
        console.error(`Approval ${id} 未在超时时间内处理，强制清理以防止内存泄漏`)
        pendingApprovals.delete(id)
        if (entry?.timeoutId) clearTimeout(entry.timeoutId)
      }
    }, DSH_APPROVAL_PROMPT_TIMEOUT_MS + DSH_APPROVAL_PROMPT_GRACE_PERIOD_MS)
    cleanupTimeoutId.unref?.()
  }

  async function sendApprovalOutcome(pending, allowed) {
    const api = await ensureReady()
    await api.respond({
      type: 'client-response',
      rpcId: pending.rpcId,
      result: {
        ok: true,
        value: {
          sessionId: pending.sessionId,
          approvalId: pending.approvalId,
          outcome: allowed ? 'allowed-once' : 'rejected',
        },
      },
    })
  }

  function clearApprovalTimer(pending) {
    if (pending?.timeoutId) clearTimeout(pending.timeoutId)
  }

  async function settleApproval(id, response, { skipMapDelete = false } = {}) {
    const pending = pendingApprovals.get(id)
    if (!pending) return false
    if (!skipMapDelete) pendingApprovals.delete(id)
    clearApprovalTimer(pending)
    const allowed = response?.action !== 'deny'
    await sendApprovalOutcome(pending, allowed)
    return true
  }

  async function rejectPendingApprovals({ conversationId = null, reason = 'context-changed' } = {}) {
    const targets = [...pendingApprovals.entries()].filter(([, entry]) =>
      !conversationId || entry.conversationId === conversationId,
    )
    for (const [id] of targets) {
      await settleApproval(id, { action: 'deny', reason }).catch(() => {})
    }
    return targets.length
  }

  function emitPermission(conversationId, webContents, frame, permissionMode) {
    const id = `dsh-approval-${frame.sessionId}-${frame.approvalId}`
    const bridgeAction = resolveDshApprovalBridgeAction(permissionMode, frame)
    if (bridgeAction === 'allow') {
      registerPendingApproval(id, {
        rpcId: frame.rpcId,
        sessionId: frame.sessionId,
        approvalId: frame.approvalId,
        conversationId,
      })
      void settleApproval(id, { action: 'allow-once' })
      return
    }
    if (!webContents || webContents.isDestroyed?.()) {
      registerPendingApproval(id, {
        rpcId: frame.rpcId,
        sessionId: frame.sessionId,
        approvalId: frame.approvalId,
        conversationId,
      })
      void settleApproval(id, { action: 'deny' })
      return
    }
    const timeoutId = setTimeout(() => {
      void settleApproval(id, { action: 'deny', reason: 'timeout' })
    }, DSH_APPROVAL_PROMPT_TIMEOUT_MS)
    timeoutId.unref?.()
    registerPendingApproval(id, {
      rpcId: frame.rpcId,
      sessionId: frame.sessionId,
      approvalId: frame.approvalId,
      conversationId,
      timeoutId,
    })
    try {
      webContents.send('permission:prompt', {
        id,
        conversationId,
        tool: frame.toolName || 'DSH 工具',
        reason: frame.reason || '该操作需要权限确认。',
        detail: frame.reason || 'DSH 请求执行需要授权的操作。',
        allowAlways: false,
      })
    } catch {
      void settleApproval(id, { action: 'deny' })
    }
  }

  async function handleEnvelope(api, envelope) {
    const frame = envelope?.payload
    if (!frame) return
    if (frame.type === 'approval/requested') {
      const sessionMatch = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)
      const sessionKey = sessionMatch?.[0]
      const conversationId = sessionMatch?.[1]?.ownerConversationId || sessionKey
      const id = `dsh-approval-${frame.sessionId}-${frame.approvalId}`
      const permissionMode = normalizePermissionMode(
        conversationId ? await Promise.resolve(getPermissionMode(conversationId)) : 'ask',
      )
      if (!conversationId) {
        registerPendingApproval(id, {
          rpcId: envelope.rpcId,
          sessionId: frame.sessionId,
          approvalId: frame.approvalId,
          conversationId: null,
        })
        await settleApproval(id, { action: 'deny' })
        return
      }
      const turn = running.get(sessionKey)
      emitPermission(
        turn?.eventConversationId ?? conversationId,
        turn?.webContents,
        { ...frame, rpcId: envelope.rpcId },
        permissionMode,
      )
      return
    }
    if (frame.type === 'session/queue') {
      const conversationId = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)?.[0]
      if (conversationId) queueSnapshots.set(conversationId, frame.items ?? [])
      return
    }
    if (frame.type !== 'session/event') return
    const event = frame.event
    if (event?.type === 'turn/end') {
      const migrationDone = migrationTurnWaiters.get(frame.sessionId)
      if (migrationDone) {
        migrationTurnWaiters.delete(frame.sessionId)
        migrationDone()
        return
      }
    }
    const conversationId = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)?.[0]
    if (!conversationId) return
    const turn = running.get(conversationId)
    if (!turn) return
    if (event?.type === 'assistant/chunk') {
      const chunk = event.data?.chunk
      if (chunk?.type === 'text-delta' && chunk.text) {
        turn.text += chunk.text
        if (!turn.silentText) emit(turn.eventConversationId ?? conversationId, turn.webContents, { type: 'delta', delta: chunk.text, full: turn.text })
      } else if (chunk?.type === 'reasoning-delta' && chunk.text) {
        turn.thinking += chunk.text
        if (!turn.silentText) emit(turn.eventConversationId ?? conversationId, turn.webContents, { type: 'thinking_delta', delta: chunk.text, fullThinking: turn.thinking })
      }
      return
    }
    if (event?.type === 'assistant/message') {
      const message = event.data?.message
      const finalText = textFromMessage(message)
      if (finalText && finalText.length >= turn.text.length) turn.text = finalText
      const usage = usageFromMessage(message)
      if (usage) {
        turn.usage = {
          ...usage,
          inputTokens: (turn.usage?.inputTokens ?? 0) + usage.inputTokens,
          outputTokens: (turn.usage?.outputTokens ?? 0) + usage.outputTokens,
          cacheReadTokens: (turn.usage?.cacheReadTokens ?? 0) + usage.cacheReadTokens,
          cacheWriteTokens: (turn.usage?.cacheWriteTokens ?? 0) + usage.cacheWriteTokens,
          costUsd: (turn.usage?.costUsd ?? 0) + usage.costUsd,
        }
      }
      return
    }
    if (event?.type === 'tool/call') {
      turn.toolCalls += 1
      const input = (() => {
        try { return JSON.parse(event.data?.arguments || '{}') } catch { return {} }
      })()
      const callId = event.data?.callId
      const toolName = event.data?.name || 'tool'
      turn.toolCallsById.set(callId, { toolName, input, startedAt: event.time || Date.now() })
      emit(turn.eventConversationId ?? conversationId, turn.webContents, {
        type: 'tool',
        id: callId,
        toolName,
        status: 'running',
        inputSummary: summarizeToolInput(toolName, input),
        startedAt: event.time || Date.now(),
        ...(turn.taskId ? { taskId: turn.taskId } : {}),
      })
      return
    }
    if (event?.type === 'tool/result') {
      turn.toolResults += 1
      const message = event.data?.message
      const callId = message?.source?.callId
      const call = turn.toolCallsById.get(callId)
      const result = message?.content
        ? { content: message.content, isError: Boolean(message.isError), details: message.details }
        : { content: [] }
      if (call) {
        emit(turn.eventConversationId ?? conversationId, turn.webContents, {
          type: 'tool',
          id: callId,
          toolName: call.toolName,
          status: event.data?.error || message?.isError ? 'error' : 'done',
          inputSummary: summarizeToolInput(call.toolName, call.input),
          resultSummary: summarizeToolResult(result, Boolean(event.data?.error || message?.isError)),
          durationMs: Math.max(0, (event.time || Date.now()) - call.startedAt),
          fileDiff: extractFileDiff(call.toolName, call.input, result),
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
        turn.toolCallsById.delete(callId)
      }
      return
    }
    if (event?.type === 'turn/end') {
      const reason = event.data?.reason?.kind
      const cancelled = reason === 'aborted' || reason === 'cancelled' || reason === 'interrupted'
      const elapsedMs = Math.max(0, Date.now() - turn.startedAt)
      const result = {
        text: turn.text,
        thinking: turn.thinking,
        usage: {
          inputTokens: turn.usage?.inputTokens ?? 0,
          outputTokens: turn.usage?.outputTokens ?? 0,
          cacheReadTokens: turn.usage?.cacheReadTokens ?? 0,
          cacheWriteTokens: turn.usage?.cacheWriteTokens ?? 0,
          costUsd: turn.usage?.costUsd ?? 0,
          elapsedMs,
          tokensPerSecond: elapsedMs > 0 ? Math.round((turn.usage?.outputTokens ?? 0) * 1000 / elapsedMs) : 0,
          contextTokens: turn.usage?.contextTokens ?? null,
          contextWindow: turn.usage?.contextWindow ?? null,
          contextPercent: turn.usage?.contextTokens && turn.usage?.contextWindow
            ? Math.round(turn.usage.contextTokens / turn.usage.contextWindow * 100)
            : null,
        },
        cancelled,
      }
      liveUsage.set(conversationId, result.usage)
      const priorStats = stats.get(conversationId) ?? {
        userMessages: 0,
        assistantMessages: 0,
        toolCalls: 0,
        toolResults: 0,
        toolCallsById: new Map(),
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        cost: 0,
      }
      priorStats.assistantMessages += result.text ? 1 : 0
      priorStats.toolCalls += turn.toolCalls
      priorStats.toolResults += turn.toolResults
      priorStats.tokens.input += result.usage.inputTokens
      priorStats.tokens.output += result.usage.outputTokens
      priorStats.tokens.cacheRead += result.usage.cacheReadTokens
      priorStats.tokens.cacheWrite += result.usage.cacheWriteTokens
      priorStats.tokens.total = priorStats.tokens.input + priorStats.tokens.output + priorStats.tokens.cacheRead + priorStats.tokens.cacheWrite
      priorStats.cost += result.usage.costUsd
      priorStats.contextTokens = result.usage.contextTokens
      priorStats.contextWindow = result.usage.contextWindow
      priorStats.contextPercent = result.usage.contextPercent
      stats.set(conversationId, priorStats)
      if (turn.emitLifecycle !== false) {
        emit(turn.eventConversationId ?? conversationId, turn.webContents, {
          type: 'done',
          full: result.text,
          fullThinking: result.thinking,
          thinkingDurationMs: 0,
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
      }
      running.delete(conversationId)
      turn.resolve(result)
    }
  }

  async function startMuxStream(api) {
    muxAbort = new AbortController()
    const activeSignal = muxAbort.signal
    let markMuxOpen
    let rejectMuxOpen
    const muxOpened = new Promise((resolve, reject) => {
      markMuxOpen = resolve
      rejectMuxOpen = reject
    })
    const openTimer = setTimeout(() => rejectMuxOpen(new Error('DSH 事件通道连接超时')), 8_000)
    openTimer.unref?.()
    muxTask = (async () => {
      try {
        for await (const envelope of api.events.mux({}, activeSignal, markMuxOpen)) {
          markMuxOpen()
          await handleEnvelope(api, envelope)
        }
        if (!activeSignal.aborted) throw new Error('DSH 事件流意外关闭')
      } catch (error) {
        rejectMuxOpen(error)
        if (!activeSignal.aborted && !stopped) {
          const message = `DSH 事件流中断：${error instanceof Error ? error.message : String(error)}`
          for (const [conversationId, turn] of running) {
            emit(conversationId, turn.webContents, { type: 'error', message })
            running.delete(conversationId)
            turn.reject(new Error(message))
          }
          muxTask = null
          muxAbort = null
          await scheduleReconnect(api)
        }
      } finally {
        clearTimeout(openTimer)
      }
    })()
    await muxOpened
    reconnectAttempt = 0
  }

  async function scheduleReconnect(api) {
    if (stopped || reconnectAttempt >= DSH_MAX_RECONNECT_ATTEMPTS) {
      if (reconnectAttempt >= DSH_MAX_RECONNECT_ATTEMPTS) {
        console.error(`DSH 事件流重连已达到最大尝试次数 (${DSH_MAX_RECONNECT_ATTEMPTS})，停止重连`)
      }
      return
    }
    reconnectAttempt += 1
    const delay = Math.min(
      DSH_INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempt - 1),
      DSH_MAX_RECONNECT_DELAY_MS
    )
    console.warn(`DSH 事件流将在 ${delay}ms 后进行第 ${reconnectAttempt} 次重连...`)
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, delay)
      timer.unref?.()
    })
    if (stopped) return
    try {
      console.log(`正在重连 DSH 事件流 (尝试 ${reconnectAttempt}/${DSH_MAX_RECONNECT_ATTEMPTS})...`)
      await startMuxStream(api)
      console.log('DSH 事件流重连成功')
      const activeSessions = [...sessions.entries()]
      if (activeSessions.length > 0) {
        console.log(`正在恢复 ${activeSessions.length} 个活跃会话的监听器...`)
      }
    } catch (error) {
      console.error(`DSH 事件流重连失败：${error instanceof Error ? error.message : String(error)}`)
      if (!stopped && reconnectAttempt < DSH_MAX_RECONNECT_ATTEMPTS) {
        await scheduleReconnect(api)
      }
    }
  }

  async function ensureReady() {
    if (stopped) throw new Error('DSH 后端已关闭')
    if (readyPromise) return readyPromise
    readyPromise = (async () => {
      const { api } = await hostManager.start()
      if (!muxTask) {
        await startMuxStream(api)
      }
      return api
    })().catch((error) => {
      readyPromise = null
      throw error
    })
    return readyPromise
  }

  async function ensureSession(api, conversationId, { cwdOverride, agentPreset, permissionMode, ownerConversationId } = {}) {
    await loadSessions()
    let entry = sessions.get(conversationId)
    const requestedCwd = cwdOverride || getWorkspacePath() || process.cwd()
    const mode = normalizePermissionMode(permissionMode ?? await Promise.resolve(getPermissionMode(conversationId)))
    const resolvedPreset = agentPreset || dshAgentPresetForPermissionMode(mode)
    if (entry && entry.cwd !== requestedCwd) {
      throw new Error('此对话绑定的工作区与当前工作区不同。为保持 DSH 会话上下文一致，请在原工作区继续，或新建对话。')
    }
    if (!entry) {
      const sessionId = `tw-${conversationId}`
      const created = rpcValue(await api.sessions.create({
        sessionId,
        cwd: requestedCwd,
        agentPreset: resolvedPreset,
      }), '创建 DSH 会话')
      entry = {
        sessionId: created.sessionId || sessionId,
        cwd: requestedCwd,
        agentPreset: created.agentPreset || resolvedPreset,
        ownerConversationId: ownerConversationId || conversationId,
        permissionModeAtCreate: mode,
      }
      sessions.set(conversationId, entry)
      await persistSessions()
    } else {
      if (!entry.ownerConversationId) {
        entry.ownerConversationId = ownerConversationId || conversationId
        sessions.set(conversationId, entry)
        await persistSessions()
      }
      // `create` with an explicit id is DSH's attach/resume path for persisted sessions.
      rpcValue(await api.sessions.create({
        sessionId: entry.sessionId,
        cwd: entry.cwd,
        ...(entry.agentPreset ? { agentPreset: entry.agentPreset } : {}),
      }), '恢复 DSH 会话')
    }
    return entry
  }

  async function markLegacyMigration(entry, sessionKey) {
    entry.legacyContextVersion = LEGACY_CONTEXT_VERSION
    entry.migratedAt = new Date().toISOString()
    sessions.set(sessionKey, entry)
    await persistSessions()
  }

  async function waitForMigrationTurn(sessionId) {
    if (migrationTurnWaiters.has(sessionId)) {
      await new Promise((resolve) => {
        const prior = migrationTurnWaiters.get(sessionId)
        migrationTurnWaiters.set(sessionId, () => {
          prior?.()
          resolve()
        })
      })
      return
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        migrationTurnWaiters.delete(sessionId)
        reject(new Error('DSH 历史上下文迁移等待超时'))
      }, 120_000)
      timer.unref?.()
      migrationTurnWaiters.set(sessionId, () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  async function ensureLegacyContextMigrated(api, sessionKey, conversationId, entry, legacyTranscript) {
    if (entry.legacyContextVersion === LEGACY_CONTEXT_VERSION) return
    if (sessionKey !== conversationId) {
      await markLegacyMigration(entry, sessionKey)
      return
    }
    let messages = Array.isArray(legacyTranscript) ? legacyTranscript : []
    if (!Array.isArray(legacyTranscript) && typeof getLegacyTranscript === 'function') {
      try {
        const transcript = await getLegacyTranscript(conversationId)
        messages = Array.isArray(transcript) ? transcript : []
      } catch {
        messages = []
      }
    }
    const block = formatLegacyHistoryContext(messages)
    if (!block) {
      await markLegacyMigration(entry, sessionKey)
      return
    }
    rpcValue(await api.sessions.prompt({
      sessionId: entry.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: block }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }), '迁移历史上下文')
    await waitForMigrationTurn(entry.sessionId)
    await markLegacyMigration(entry, sessionKey)
  }

  async function ensurePermissionModeApplied(api, sessionKey, entry, mode) {
    const normalizedMode = normalizePermissionMode(mode)
    if (entry.lastAppliedPermissionMode === normalizedMode) return
    const preset = dshPermissionPresetForMode(normalizedMode)
    const response = rpcValue(await api.sessions.prompt({
      sessionId: entry.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: `/permission ${preset}` }],
      clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }), '应用 DSH 权限模式')
    if (response.command?.kind !== 'success') {
      throw new Error('DSH 未确认应用权限模式；为避免以错误权限执行，本次消息已阻止。请检查 DSH 权限命令是否可用。')
    }
    entry.lastAppliedPermissionMode = normalizedMode
    sessions.set(sessionKey, entry)
    await persistSessions()
  }

  async function configureModel(api, modelKey) {
    const config = await modelService.getDshModelConfig(modelKey)
    const providerList = rpcValue(await api.llm.providers({}), '读取 DSH 提供方目录')
    const route = providerList.providers?.find((item) => item.provider === config.provider)
    if (!route?.active) throw new Error(`DSH 当前没有启用模型提供方 ${config.provider}；请先检查 DSH 模型设置。`)
    const auth = await modelService.listProvidersAuth()
    if (!auth.some((item) => item.id === config.provider && item.configured)) {
      throw new Error(`模型提供方 ${config.provider} 尚未完成 API Key 或官方订阅授权。请先在模型设置中连接账号。`)
    }
    return config
  }

  async function send({
    text,
    modelKey,
    conversationId,
    webContents,
    behavior = 'followUp',
    sessionKey = conversationId,
    eventConversationId = conversationId,
    cwdOverride,
    agentPreset = 'code',
    skill = null,
    legacyTranscript,
    taskId,
    silentText = false,
    emitLifecycle = true,
  }) {
    if (!text || typeof text !== 'string') throw new Error('消息不能为空')
    if (!conversationId) throw new Error('当前对话标识无效')
    if (!sessionKey) throw new Error('DSH 会话标识无效')
    if (running.has(sessionKey)) throw new Error('当前 DSH 会话仍在运行，请停止或等待完成')
    const api = await ensureReady()
    const permissionMode = normalizePermissionMode(await Promise.resolve(getPermissionMode(conversationId)))
    const entry = await ensureSession(api, sessionKey, {
      cwdOverride,
      agentPreset,
      permissionMode,
      ownerConversationId: conversationId,
    })
    await ensurePermissionModeApplied(api, sessionKey, entry, permissionMode)
    if (!modelKey) throw new Error('请先选择已配置的模型')
    const config = await configureModel(api, modelKey)
    const thinkingLevel = await profileStore?.getThinkingLevel?.(modelKey)
    rpcValue(await api.sessions.selectModel({
      sessionId: entry.sessionId,
      provider: config.provider,
      model: config.id,
      ...(thinkingLevel ? { reasoningEffort: thinkingLevel } : {}),
    }), '选择 DSH 模型')
    await ensureLegacyContextMigrated(api, sessionKey, conversationId, entry, legacyTranscript)

    if (emitLifecycle) emit(eventConversationId, webContents, { type: 'start', startedAt: Date.now(), taskId })
    const completed = new Promise((resolve, reject) => {
      running.set(sessionKey, {
        sessionId: entry.sessionId,
        webContents,
        eventConversationId,
        taskId,
        silentText,
        emitLifecycle,
        text: '',
        thinking: '',
        usage: null,
        toolCalls: 0,
        toolResults: 0,
        toolCallsById: new Map(),
        startedAt: Date.now(),
        resolve,
        reject,
      })
    })
    try {
      rpcValue(await api.sessions.prompt({
        sessionId: entry.sessionId,
        mode: behavior === 'steer' ? 'steer' : 'queue',
        content: [{ type: 'text', text: applySkillInstructions(text, skill) }],
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }), '发送消息')
      const currentStats = stats.get(sessionKey) ?? {
        userMessages: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0,
      }
      currentStats.userMessages += 1
      stats.set(sessionKey, currentStats)
    } catch (error) {
      const turn = running.get(sessionKey)
      if (turn) running.delete(sessionKey)
      throw error
    }
    return completed
  }

  async function abort(conversationId = null) {
    const targets = conversationId ? [conversationId] : [...running.keys()]
    if (!targets.length) return false
    const api = await ensureReady()
    let stoppedAny = false
    for (const id of targets) {
      const turn = running.get(id)
      if (!turn) continue
      stoppedAny = true
      try { rpcValue(await api.sessions.cancel({ sessionId: turn.sessionId }), '停止 DSH 会话') } catch { /* turn may finish between lookup and cancel */ }
    }
    return stoppedAny
  }

  async function respondApproval(id, response) {
    return settleApproval(id, response)
  }

  /** Mark the persistent DSH session dirty; the next turn applies the selected mode via /permission. */
  async function syncPermissionMode(conversationId, mode) {
    const entry = sessions.get(conversationId)
    if (!entry) return { ok: false, reason: 'no-session' }
    entry.lastAppliedPermissionMode = null
    await persistSessions()
    return { ok: true, pendingDshPreset: dshPermissionPresetForMode(mode) }
  }

  async function stop() {
    await rejectPendingApprovals({ reason: 'shutdown' })
    stopped = true
    reconnectAttempt = DSH_MAX_RECONNECT_ATTEMPTS
    muxAbort?.abort()
    await muxTask?.catch(() => {})
    for (const [id, turn] of running) {
      emit(id, turn.webContents, { type: 'done', full: turn.text, fullThinking: turn.thinking })
      turn.resolve({ text: turn.text, thinking: turn.thinking, usage: null, cancelled: true })
      running.delete(id)
    }
    await hostManager.stop()
  }

  return {
    send,
    async runAgentTurn({ conversationId, sessionKey, text, modelKey, webContents, cwd, agentPreset = 'code', taskId, signal }) {
      if (signal?.aborted) throw new Error('任务已停止')
      const onAbort = () => { void abort(sessionKey) }
      signal?.addEventListener('abort', onAbort, { once: true })
      try {
        const result = await send({
          text,
          modelKey,
          conversationId,
          sessionKey,
          eventConversationId: conversationId,
          webContents,
          cwdOverride: cwd,
          agentPreset,
          taskId,
          silentText: true,
          emitLifecycle: false,
          behavior: 'followUp',
        })
        if (result.cancelled) throw new Error('任务已停止')
        return result
      } finally {
        signal?.removeEventListener('abort', onAbort)
      }
    },
    abort,
    respondApproval,
    rejectPendingApprovals,
    syncPermissionMode,
    stop,
    isBusy: (id) => running.has(id),
    isBusyAny: () => running.size > 0,
    getRunningConversationId: () => running.keys().next().value ?? null,
    listRunningConversationIds: () => [...running.keys()],
    getLiveContextUsage: (id) => liveUsage.get(id) ?? null,
    getSessionStatsSnapshot: (id) => stats.get(id) ?? null,
    // Switching conversations/workspaces must not destroy DSH's durable history.
    resetSession: async () => {},
    mutateQueue: async (kind, index, action, text, conversationId) => {
      const entry = sessions.get(conversationId)
      if (!entry) return { ok: false }
      const placement = kind === 'steering' ? 'steering' : 'queued'
      const items = (queueSnapshots.get(conversationId) ?? []).filter((item) => item.placement === placement)
      const item = items[index]
      if (!item?.id) return { ok: false, error: '无法修改队列项：该条可能已开始发送' }
      const operation = action === 'remove'
        ? { kind: 'remove' }
        : text?.trim()
          ? { kind: 'edit', content: [{ type: 'text', text: text.trim() }] }
          : null
      if (!operation) return { ok: false, error: '内容不能为空' }
      const api = await ensureReady()
      rpcValue(await api.sessions.updateQueue({ sessionId: entry.sessionId, itemId: item.id, action: operation }), '更新 DSH 队列')
      const current = queueSnapshots.get(conversationId) ?? []
      const toText = (queued) => queued.message?.content?.map((part) => part.text ?? '').join('') ?? ''
      return {
        ok: true,
        steering: current.filter((queued) => queued.placement === 'steering').map(toText),
        followUp: current.filter((queued) => queued.placement === 'queued').map(toText),
      }
    },
    updateThinkingLevel: async () => {},
  }
}
