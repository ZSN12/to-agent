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
  Z_APPROVAL_PROMPT_TIMEOUT_MS,
  Z_APPROVAL_PROMPT_GRACE_PERIOD_MS,
  Z_MAX_RECONNECT_ATTEMPTS,
  Z_INITIAL_RECONNECT_DELAY_MS,
  Z_MAX_RECONNECT_DELAY_MS,
  Z_EVENT_CHANNEL_OPEN_TIMEOUT_MS,
  Z_MAX_TRACKED_SESSIONS,
} from './config.mjs'

/** 主会话的 DSH 会话 id 是确定性的：同一个 sessionKey 永远推导出同一个 id。 */
function sessionIdForKey(sessionKey) {
  return `tw-${sessionKey}`
}

/**
 * 会话 cwd 是否是文件系统根（`/`、`C:\`）。
 * DSH 的沙箱边界就是会话 cwd（`sandbox-policy` 用 `session.header.cwd` 当 workspaceRoot），
 * 所以 cwd 落在根上等于 `workspace-write` 的「只能写工作区内」完全失效。
 */
function isFilesystemRoot(target) {
  if (typeof target !== 'string' || !target) return false
  const resolved = path.resolve(target)
  return resolved === path.parse(resolved).root
}

/**
 * 未绑定工作区时 `process.cwd()` 会退化成 `/`（打包版从 Finder 启动），
 * 而 DSH 用会话 cwd 当沙箱边界 —— 等于把 workspace-write 放开到整个磁盘。
 * 宁可拒绝发送，也不静默建一个边界失效的会话。
 */
function assertBindableWorkspace(cwd) {
  if (!isFilesystemRoot(cwd)) return
  throw new Error(
    '当前对话还没有绑定工作区。未绑定工作区时会话会落在文件系统根目录，'
    + 'DSH 的文件写入沙箱边界将失效，因此本次消息已阻止。请先选择一个工作区文件夹再发送。',
  )
}

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

function normalizeTokenUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  const cost = typeof usage.cost === 'number' ? usage.cost : usage.cost?.total
  return {
    inputTokens: Number(usage.inputTokens ?? usage.input ?? 0) || 0,
    outputTokens: Number(usage.outputTokens ?? usage.output ?? 0) || 0,
    cacheReadTokens: Number(usage.cacheReadTokens ?? usage.cacheRead ?? 0) || 0,
    cacheWriteTokens: Number(usage.cacheWriteTokens ?? usage.cacheWrite ?? 0) || 0,
    costUsd: Number(cost ?? 0) || 0,
    contextTokens: Number(usage.contextTokens ?? usage.totalTokens ?? 0) || null,
    contextWindow: Number(usage.contextWindow ?? 0) || null,
  }
}

function usageFromMessage(message) {
  return normalizeTokenUsage(message?.usage)
}

function usageFromAssistantEvent(event) {
  return normalizeTokenUsage(event?.data?.usage) ?? usageFromMessage(event?.data?.message)
}

/** Pause reasoning clock so tool/model gaps are not shown as “Think 用时”. */
function pauseThinkingSegment(turn, now = Date.now()) {
  if (!turn.thinkingStartedAt || turn.thinkingEndedAt) return
  turn.thinkingEndedAt = now
  turn.thinkingActiveMs = (turn.thinkingActiveMs ?? 0) + Math.max(0, now - turn.thinkingStartedAt)
  turn.thinkingStartedAt = null
}

function activeThinkingDurationMs(turn, now = Date.now()) {
  let total = turn.thinkingActiveMs ?? 0
  if (turn.thinkingStartedAt && !turn.thinkingEndedAt) {
    total += Math.max(0, now - turn.thinkingStartedAt)
  }
  return total
}

function resumeThinkingSegment(turn, now = Date.now()) {
  if (turn.thinkingStartedAt && !turn.thinkingEndedAt) return
  turn.thinkingStartedAt = now
  turn.thinkingEndedAt = null
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
  getPermissionMode = async () => 'ask',
  conversationHub = null,
}) {
  const mapPath = path.join(userDataPath, 'taskweaver', 'dsh-session-map.json')
  const sessions = new Map()
  const pendingApprovals = new Map()
  const liveUsage = new Map()
  const stats = new Map()
  const queueSnapshots = new Map()
  const running = new Map()
  /** @type {Map<string, Set<import('electron').WebContents>>} */
  const muxWatchers = new Map()
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

  function conversationIdForSession(sessionId) {
    for (const [key, entry] of sessions.entries()) {
      if (entry.sessionId === sessionId) return entry.ownerConversationId || key
    }
    return null
  }

  /** 清掉某个 sessionKey 在所有内存索引里的痕迹（映射表之外的副作用表）。 */
  function dropSessionIndexes(sessionKey) {
    sessions.delete(sessionKey)
    stats.delete(sessionKey)
    liveUsage.delete(sessionKey)
    queueSnapshots.delete(sessionKey)
    muxWatchers.delete(sessionKey)
  }

  /**
   * 映射表回收：只淘汰「可推导」条目。
   *
   * 主会话的 DSH 会话 id 恒为 `tw-<sessionKey>`，丢掉条目后下一次 ensureSession 会用
   * 同一个 id 重新 attach 到磁盘上的会话日志，上下文不丢；而 fork 出来的子会话 id 由
   * DSH 随机生成（`session-<uuid>`，见 api-proxy 的 `session.fork`），一旦丢掉条目就
   * 无法重建 —— 那会让分支对话直接失忆，所以永不淘汰。
   *
   * 正在运行的会话同样跳过。被淘汰的条目只从映射表移除，**不删磁盘日志**。
   */
  function evictTrackedSessions({ protectKey = null } = {}) {
    if (sessions.size <= Z_MAX_TRACKED_SESSIONS) return []
    const overflow = sessions.size - Z_MAX_TRACKED_SESSIONS
    const candidates = [...sessions.entries()]
      .filter(([key, entry]) => key !== protectKey
        && entry?.sessionId === sessionIdForKey(key)
        && !running.has(key))
      .sort((a, b) => (a[1].lastUsedAt ?? 0) - (b[1].lastUsedAt ?? 0))
    const evicted = []
    for (const [key] of candidates) {
      if (evicted.length >= overflow) break
      dropSessionIndexes(key)
      evicted.push(key)
    }
    return evicted
  }

  const MUX_FANOUT_TYPES = new Set([
    'session/event',
    'session/projection',
    'session/queue',
    'session/subscribed',
    'session/jobs',
  ])

  function fanoutMuxFrame(envelope) {
    const frame = envelope?.payload
    if (!frame?.sessionId || !MUX_FANOUT_TYPES.has(frame.type)) return
    const conversationId = conversationIdForSession(frame.sessionId)
    if (!conversationId) return
    const watchers = muxWatchers.get(conversationId)
    if (!watchers?.size) return
    const payload = { conversationId, rpcId: envelope.rpcId, frame }
    for (const wc of watchers) {
      if (wc.isDestroyed?.()) continue
      try { wc.send('chat:mux', payload) } catch { /* renderer may be closing */ }
    }
  }

  function subscribeMux(conversationId, webContents) {
    if (!conversationId || !webContents || webContents.isDestroyed?.()) return
    let set = muxWatchers.get(conversationId)
    if (!set) {
      set = new Set()
      muxWatchers.set(conversationId, set)
    }
    set.add(webContents)
    const onDestroyed = () => {
      set.delete(webContents)
      if (set.size === 0) muxWatchers.delete(conversationId)
      webContents.removeListener?.('destroyed', onDestroyed)
    }
    webContents.once?.('destroyed', onDestroyed)
  }

  function unsubscribeMux(conversationId, webContents) {
    const set = muxWatchers.get(conversationId)
    if (!set) return
    set.delete(webContents)
    if (set.size === 0) muxWatchers.delete(conversationId)
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
    }, Z_APPROVAL_PROMPT_TIMEOUT_MS + Z_APPROVAL_PROMPT_GRACE_PERIOD_MS)
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
    }, Z_APPROVAL_PROMPT_TIMEOUT_MS)
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
    fanoutMuxFrame(envelope)
    if (conversationHub) {
      void conversationHub.handleMuxEnvelope(envelope)
    }
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
    const sessionMatch = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)
    const sessionKey = sessionMatch?.[0]
    if (!sessionKey) return
    const turn = running.get(sessionKey)
    if (!turn) return
    const ownerConversationId = sessionMatch[1]?.ownerConversationId || sessionKey
    const emitTarget = turn.eventConversationId ?? ownerConversationId
    turn.lastEventAt = event.time || Date.now()
    if (event?.type === 'step/start') {
      // DSH ui-conversation does not surface step numbers in the live status row
      // (only TurnStatus "Deep diving…" + optional clock). Step timing feeds projection.
      pauseThinkingSegment(turn, event.time || Date.now())
      return
    }
    if (event?.type === 'request/header') {
      return
    }
    if (event?.type === 'assistant/chunk') {
      const chunk = event.data?.chunk
      if (chunk?.type === 'text-delta' && chunk.text) {
        pauseThinkingSegment(turn, event.time || Date.now())
        turn.text += chunk.text
        if (!turn.silentText) emit(emitTarget, turn.webContents, { type: 'delta', delta: chunk.text, full: turn.text })
      } else if (chunk?.type === 'reasoning-delta' && chunk.text) {
        const now = event.time || Date.now()
        const wasIdle = !turn.thinkingStartedAt || turn.thinkingEndedAt
        resumeThinkingSegment(turn, now)
        if (wasIdle && !turn.silentText) {
          emit(emitTarget, turn.webContents, { type: 'thinking_start' })
        }
        turn.lastReasoningAt = now
        turn.thinking += chunk.text
        const thinkingDurationMs = activeThinkingDurationMs(turn, now)
        if (!turn.silentText) {
          emit(emitTarget, turn.webContents, {
            type: 'thinking_delta',
            delta: chunk.text,
            fullThinking: turn.thinking,
            durationMs: thinkingDurationMs,
          })
        }
      }
      return
    }
    if (event?.type === 'assistant/message') {
      const message = event.data?.message
      const finalText = textFromMessage(message)
      if (finalText && finalText.length >= turn.text.length) turn.text = finalText
      const usage = usageFromAssistantEvent(event)
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
      pauseThinkingSegment(turn, event.time || Date.now())
      turn.toolCalls += 1
      const input = (() => {
        try { return JSON.parse(event.data?.arguments || '{}') } catch { return {} }
      })()
      const callId = event.data?.callId
      const toolName = event.data?.name || 'tool'
      turn.toolCallsById.set(callId, { toolName, input, startedAt: event.time || Date.now() })
      emit(emitTarget, turn.webContents, {
        type: 'activity',
        phase: 'tools',
        message: `正在执行工具：${toolName}…`,
      })
      emit(emitTarget, turn.webContents, {
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
        emit(emitTarget, turn.webContents, {
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
      pauseThinkingSegment(turn, Date.now())
      const thinkingDurationMs = activeThinkingDurationMs(turn, Date.now())
      const result = {
        text: turn.text,
        thinking: turn.thinking,
        thinkingDurationMs,
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
      liveUsage.set(sessionKey, result.usage)
      const priorStats = stats.get(sessionKey) ?? {
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
      stats.set(sessionKey, priorStats)
      if (turn.emitLifecycle !== false) {
        if (result.thinking && thinkingDurationMs > 0) {
          emit(emitTarget, turn.webContents, {
            type: 'thinking_end',
            fullThinking: result.thinking,
            durationMs: thinkingDurationMs,
          })
        }
        emit(emitTarget, turn.webContents, {
          type: 'done',
          full: result.text,
          fullThinking: result.thinking,
          thinkingDurationMs,
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
      }
      running.delete(sessionKey)
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
    if (stopped || reconnectAttempt >= Z_MAX_RECONNECT_ATTEMPTS) {
      if (reconnectAttempt >= Z_MAX_RECONNECT_ATTEMPTS) {
        console.error(`Z 事件流重连已达到最大尝试次数 (${Z_MAX_RECONNECT_ATTEMPTS})，停止重连`)
      }
      return
    }
    reconnectAttempt += 1
    const delay = Math.min(
      Z_INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempt - 1),
      Z_MAX_RECONNECT_DELAY_MS
    )
    console.warn(`DSH 事件流将在 ${delay}ms 后进行第 ${reconnectAttempt} 次重连...`)
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, delay)
      timer.unref?.()
    })
    if (stopped) return
    try {
      console.log(`正在重连 Z 事件流 (尝试 ${reconnectAttempt}/${Z_MAX_RECONNECT_ATTEMPTS})...`)
      await startMuxStream(api)
      console.log('DSH 事件流重连成功')
      const activeSessions = [...sessions.entries()]
      if (activeSessions.length > 0) {
        console.log(`正在恢复 ${activeSessions.length} 个活跃会话的监听器...`)
      }
    } catch (error) {
      console.error(`DSH 事件流重连失败：${error instanceof Error ? error.message : String(error)}`)
      if (!stopped && reconnectAttempt < Z_MAX_RECONNECT_ATTEMPTS) {
        await scheduleReconnect(api)
      }
    }
  }

  async function ensureReady() {
    if (stopped) throw new Error('DSH 后端已关闭')
    if (readyPromise) return readyPromise
    readyPromise = (async () => {
      const { api } = await hostManager.start()
      conversationHub?.bindApi?.(api)
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
    // 未绑定工作区时 `process.cwd()` 会退化成 `/`，而 DSH 用会话 cwd 当沙箱边界。
    assertBindableWorkspace(requestedCwd)
    if (entry) assertBindableWorkspace(entry.cwd)
    const mode = normalizePermissionMode(permissionMode ?? await Promise.resolve(getPermissionMode(conversationId)))
    const resolvedPreset = agentPreset || dshAgentPresetForPermissionMode(mode)
    if (entry && entry.cwd !== requestedCwd) {
      throw new Error('此对话绑定的工作区与当前工作区不同。为保持 DSH 会话上下文一致，请在原工作区继续，或新建对话。')
    }
    if (!entry) {
      const sessionId = sessionIdForKey(conversationId)
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
        lastUsedAt: Date.now(),
      }
      sessions.set(conversationId, entry)
      evictTrackedSessions({ protectKey: conversationId })
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
      // LRU 用：只在时间戳明显推进时落盘，避免每轮都写一次映射表。
      const now = Date.now()
      if (now - (entry.lastUsedAt ?? 0) > 60_000) {
        entry.lastUsedAt = now
        sessions.set(conversationId, entry)
        await persistSessions()
      }
    }
    if (conversationHub) {
      const watchers = muxWatchers.get(conversationId)
      const wc = watchers?.size ? [...watchers].at(-1) : null
      if (wc) void conversationHub.attach(conversationId, entry.sessionId, wc)
    }
    return entry
  }

  function sessionModelMatches(current, config, explicitReasoningEffort) {
    if (!current || current.provider !== config.provider || current.model !== config.id) return false
    if (explicitReasoningEffort == null || explicitReasoningEffort === '') return true
    // DSH 的 sessions.models.current 只回读 { provider, model }，不返回 reasoningEffort。
    // 回读值缺失时不能判定为“不匹配”，否则每轮都会调 selectModel：
    // 既重建会话的模型绑定，又让上游 prompt cache 失效（实测每轮都命中该分支）。
    if (current.reasoningEffort == null) return true
    return current.reasoningEffort === explicitReasoningEffort
  }

  /** Align Host session route with Composer; skip selectModel when already matched (DSH Web semantics). */
  async function ensureSessionModelSelection(api, sessionId, config, explicitReasoningEffort) {
    const directory = rpcValue(await api.sessions.models({ sessionId }), '读取 DSH 会话模型')
    const current = directory?.current ?? null
    if (sessionModelMatches(current, config, explicitReasoningEffort)) return current
    const payload = {
      sessionId,
      provider: config.provider,
      model: config.id,
      ...(explicitReasoningEffort ? { reasoningEffort: explicitReasoningEffort } : {}),
    }
    const selected = rpcValue(await api.sessions.selectModel(payload), '选择 DSH 模型')
    return selected?.selected ?? selected
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
    taskId,
    silentText = false,
    emitLifecycle = true,
  }) {
    if (!text || typeof text !== 'string') throw new Error('消息不能为空')
    if (!conversationId) throw new Error('当前对话标识无效')
    if (!sessionKey) throw new Error('DSH 会话标识无效')
    // steer 模式允许在运行时纠偏，只有 followUp 需要等待
    if (running.has(sessionKey) && behavior !== 'steer') throw new Error('当前 DSH 会话仍在运行，请停止或等待完成')
    // 先做工作区校验再启动 Host：无效请求不该把 DSH 拉起来。
    assertBindableWorkspace(cwdOverride || getWorkspacePath() || process.cwd())
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
    const explicitReasoningEffort = await profileStore?.getThinkingLevel?.(modelKey) ?? null
    await ensureSessionModelSelection(api, entry.sessionId, config, explicitReasoningEffort)

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
        thinkingStartedAt: null,
        thinkingEndedAt: null,
        thinkingActiveMs: 0,
        lastReasoningAt: null,
        usage: null,
        toolCalls: 0,
        toolResults: 0,
        toolCallsById: new Map(),
        startedAt: Date.now(),
        lastEventAt: Date.now(),
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

  /**
   * 回收一个对话（及其编排子会话）在映射表里的全部条目。
   *
   * 只动映射表与内存索引，**不删磁盘上的 DSH 会话日志** —— 日志保留可用于排查与恢复，
   * 删除是不可逆操作。返回值里带上被移除的 key，调用方据此断开 hub attachment。
   */
  async function forgetConversation(conversationId) {
    if (!conversationId) return { removed: [] }
    await loadSessions()
    await rejectPendingApprovals({ conversationId, reason: 'conversation-removed' }).catch(() => 0)
    const removed = []
    for (const [key, entry] of [...sessions.entries()]) {
      if (key !== conversationId && entry?.ownerConversationId !== conversationId) continue
      dropSessionIndexes(key)
      removed.push(key)
    }
    if (removed.length) await persistSessions()
    return { removed }
  }

  /**
   * 读出会话日志里所有 `turn/end` 的 seq（升序）。
   * `session.fork` 的 atSeq 语义是「切在包含该 seq 的那个已完成 turn 的末尾」，
   * 所以第 N 个 turn/end 的 seq 正好表示「保留前 N 轮」。
   */
  async function collectTurnEndSeqs(api, sessionId) {
    const seqs = []
    let beforeSeq
    for (let page = 0; page < 40; page += 1) {
      const value = rpcValue(await api.sessions.history({
        sessionId,
        maxMessages: 500,
        ...(beforeSeq === undefined ? {} : { beforeSeq }),
      }), '读取 DSH 会话历史')
      const events = value?.events ?? []
      if (!events.length) break
      for (const item of events) {
        const event = item?.event
        if (event?.type === 'turn/end' && Number.isInteger(event.seq)) seqs.push(event.seq)
      }
      if (!value?.hasMore) break
      const firstSeq = events[0]?.event?.seq
      if (!Number.isInteger(firstSeq) || firstSeq === beforeSeq) break
      beforeSeq = firstSeq
    }
    return seqs.sort((a, b) => a - b)
  }

  /**
   * 让新分支继承源对话的 DSH 上下文。
   *
   * 不做这一步时，fork 出来的对话是「UI 有消息、模型是空的」：DSH 会话是新建的空会话。
   * 传入 `completedTurns` 时按「保留前 N 轮」精确切分；无法可靠换算则退化为
   * 「继承源会话全部已完成轮次」（比失忆好，但会比 UI 多看到内容）。
   */
  async function forkConversation({ sourceConversationId, targetConversationId, completedTurns } = {}) {
    if (!sourceConversationId || !targetConversationId) return { ok: false, reason: 'missing-args' }
    await loadSessions()
    const source = sessions.get(sourceConversationId)
    if (!source?.sessionId) return { ok: false, reason: 'no-source-session' }
    const api = await ensureReady()
    let atSeq
    if (Number.isInteger(completedTurns) && completedTurns > 0) {
      try {
        const turnEndSeqs = await collectTurnEndSeqs(api, source.sessionId)
        if (turnEndSeqs.length >= completedTurns) atSeq = turnEndSeqs[completedTurns - 1]
      } catch (error) {
        console.warn('[dsh-chat-service] fork 时读取会话历史失败，退化为整段继承:', error instanceof Error ? error.message : error)
      }
    }
    let childSessionId
    try {
      const value = rpcValue(await api.sessions.fork({
        sessionId: source.sessionId,
        ...(atSeq === undefined ? {} : { atSeq }),
      }), '分叉 DSH 会话')
      childSessionId = value?.sessionId ?? null
    } catch (error) {
      return { ok: false, reason: 'fork-failed', error: error instanceof Error ? error.message : String(error) }
    }
    if (!childSessionId) return { ok: false, reason: 'fork-failed' }
    sessions.set(targetConversationId, {
      sessionId: childSessionId,
      cwd: source.cwd,
      ...(source.agentPreset ? { agentPreset: source.agentPreset } : {}),
      ownerConversationId: targetConversationId,
      lastAppliedPermissionMode: source.lastAppliedPermissionMode ?? null,
      forkedFromSessionId: source.sessionId,
      ...(atSeq === undefined ? {} : { forkedAtSeq: atSeq }),
      lastUsedAt: Date.now(),
    })
    evictTrackedSessions({ protectKey: targetConversationId })
    await persistSessions()
    return { ok: true, sessionId: childSessionId, atSeq: atSeq ?? null }
  }

  async function stop() {
    await rejectPendingApprovals({ reason: 'shutdown' })
    stopped = true
    reconnectAttempt = Z_MAX_RECONNECT_ATTEMPTS
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
    forgetConversation,
    forkConversation,
    stop,
    isBusy: (id) => running.has(id),
    isBusyAny: () => running.size > 0,
    getRunningConversationId: () => running.keys().next().value ?? null,
    listRunningConversationIds: () => [...running.keys()],
    getLiveContextUsage: (id) => liveUsage.get(id) ?? null,
    getSessionStatsSnapshot: (id) => stats.get(id) ?? null,
    // 切换对话 / 工作区不能销毁 DSH 的持久历史，所以这里保持无副作用。
    // 真正的回收走 forgetConversation（删除对话时调用）。
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
    async applyComposerModel(conversationId, modelKey) {
      if (!conversationId || !modelKey) return { ok: false, reason: 'missing-args' }
      const entry = sessions.get(conversationId)
      if (!entry) return { ok: false, reason: 'no-session' }
      const api = await ensureReady()
      const config = await configureModel(api, modelKey)
      const explicitReasoningEffort = await profileStore?.getThinkingLevel?.(modelKey) ?? null
      await ensureSessionModelSelection(api, entry.sessionId, config, explicitReasoningEffort)
      return { ok: true }
    },
    subscribeMux,
    unsubscribeMux,
    getSessionId: (conversationId) => sessions.get(conversationId)?.sessionId ?? null,
  }
}
