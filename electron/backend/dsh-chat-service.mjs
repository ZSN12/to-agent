import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { extractFileDiff, normalizeToolResult, summarizeToolInput, summarizeToolResult } from './tool-trace.mjs'
import { applySkillInstructions } from './skill-prompt.mjs'
import { nativeChatCommand } from './native-chat-command.mjs'
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
import { sessionModelMatches } from './dsh-session-model.mjs'
import { isCursorFamilyModelKey } from './cursor-model-route.mjs'
import { ensureOpenCodexProxyReachable, isOpenCodexModelKey } from './opencodex-health.mjs'
import { resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'

const Z_IDLE_HISTORY_RECONCILE_MS = 10_000
const Z_MAX_HISTORY_RECONCILE_MS = 30_000

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
    + 'Z Runtime 的文件写入沙箱边界将失效，因此本次消息已阻止。请先选择一个工作区文件夹再发送。',
  )
}

function rpcValue(response, operation) {
  const result = response?.result ?? response
  if (result?.ok === false) {
    const error = result.error ?? {}
    const failure = new Error(error.message || `${operation} failed`)
    if (error.code) failure.code = error.code
    throw failure
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

function assistantTextStepKey(turn, event) {
  const eventTurn = event?.data?.turn
  const eventStep = event?.data?.step
  if (Number.isInteger(eventTurn) && Number.isInteger(eventStep)) {
    const key = String(eventTurn) + ':' + String(eventStep)
    turn.currentTextStepKey = key
    return key
  }
  return turn.currentTextStepKey ?? 'unsequenced'
}

function setAssistantStepText(turn, stepKey, text) {
  turn.textByStep ??= new Map()
  turn.textByStep.set(stepKey, text)
  turn.text = [...turn.textByStep.values()].join('')
}

function logHostUserMessageBytes(logger, {
  conversationId,
  sessionKey,
  taskId,
  delivery,
  inputText,
  submittedText,
  skill,
}) {
  const inputUtf8Bytes = Buffer.byteLength(inputText, 'utf8')
  const submittedUtf8Bytes = Buffer.byteLength(submittedText, 'utf8')
  logger?.debug?.('[prompt-pipeline] Host user-message payload bytes', {
    conversationId,
    sessionKey,
    taskId: taskId ?? null,
    delivery,
    inputUtf8Bytes,
    submittedUtf8Bytes,
    skillEnvelopeAddedUtf8Bytes: Math.max(0, submittedUtf8Bytes - inputUtf8Bytes),
    skillMode: !skill ? 'none' : skill.nativeInvocation ? 'host-native' : 'filesystem',
  })
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

function endThinkingSegment(turn, emitFn, emitTarget, now = Date.now()) {
  const wasActive = Boolean(turn.thinkingStartedAt && !turn.thinkingEndedAt)
  pauseThinkingSegment(turn, now)
  if (wasActive && !turn.silentText) {
    emitFn(emitTarget, turn.webContents, {
      type: 'thinking_end',
      fullThinking: turn.thinking,
      durationMs: activeThinkingDurationMs(turn, now),
    })
  }
}

function activeThinkingDurationMs(turn, now = Date.now()) {
  let total = turn.thinkingActiveMs ?? 0
  if (turn.thinkingStartedAt && !turn.thinkingEndedAt) {
    total += Math.max(0, now - turn.thinkingStartedAt)
  }
  return total
}

function recordFileChange(turn, fileDiff) {
  if (!turn.fileChanges || typeof fileDiff?.path !== 'string' || !fileDiff.path) return
  const normalizedPath = fileDiff.path.replace(/\\/g, '/')
  const key = normalizedPath.toLocaleLowerCase()
  const hasCounts = Number.isFinite(fileDiff.addedLines) && Number.isFinite(fileDiff.deletedLines)
  const existing = turn.fileChanges.get(key)
  if (!existing) {
    turn.fileChanges.set(key, {
      path: fileDiff.path,
      addedLines: hasCounts ? Math.max(0, fileDiff.addedLines) : 0,
      deletedLines: hasCounts ? Math.max(0, fileDiff.deletedLines) : 0,
      statsComplete: hasCounts,
      isNewFile: fileDiff.isNewFile === true,
    })
    return
  }
  if (hasCounts) {
    existing.addedLines += Math.max(0, fileDiff.addedLines)
    existing.deletedLines += Math.max(0, fileDiff.deletedLines)
  } else {
    existing.statsComplete = false
  }
  existing.isNewFile ||= fileDiff.isNewFile === true
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
    throw new Error(`读取 Z 会话映射失败：${error instanceof Error ? error.message : String(error)}`)
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
  onTurnCompleted = null,
  logger = null,
}) {
  const mapPath = path.join(userDataPath, 'taskweaver', 'dsh-session-map.json')
  const sessions = new Map()
  const pendingApprovals = new Map()
  const liveUsage = new Map()
  const stats = new Map()
  const queueSnapshots = new Map()
  const observedSequences = new Map()
  const running = new Map()
  const pendingQuestions = new Map()
  const cancellingSessions = new Set()
  /** @type {Map<string, Set<import('electron').WebContents>>} */
  const muxWatchers = new Map()
  let mapLoad = null
  let persistenceQueue = Promise.resolve()
  let muxAbort = null
  let muxTask = null
  let muxGeneration = 0
  let reconnectTask = null
  let readyPromise = null
  let establishingReady = false
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
    observedSequences.delete(sessions.get(sessionKey)?.sessionId)
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
    // The Host replays still-pending server requests on mux reconnect with the
    // same rpcId. Keep the original prompt/timers so a replay cannot duplicate
    // the UI request or extend its approval window indefinitely.
    if (pendingApprovals.has(id)) return false

    // Add failsafe timeout cleanup to prevent memory leaks
    // This runs only if settleApproval was never called
    const cleanupTimeoutId = setTimeout(() => {
      // A stale timer must never delete a newer request that reused this id.
      if (pendingApprovals.get(id) === entry) {
        console.error(`Approval ${id} 未在超时时间内处理，强制清理以防止内存泄漏`)
        pendingApprovals.delete(id)
        if (entry?.timeoutId) clearTimeout(entry.timeoutId)
        if (entry?.cleanupTimeoutId) clearTimeout(entry.cleanupTimeoutId)
      }
    }, Z_APPROVAL_PROMPT_TIMEOUT_MS + Z_APPROVAL_PROMPT_GRACE_PERIOD_MS)
    cleanupTimeoutId.unref?.()

    // Store cleanup timeout in entry so it can be cleared by clearApprovalTimer
    entry.cleanupTimeoutId = cleanupTimeoutId
    pendingApprovals.set(id, entry)
    return true
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
          outcome: allowed === true ? 'allowed-once' : 'rejected',
        },
      },
    })
  }

  function clearApprovalTimer(pending) {
    if (pending?.timeoutId) clearTimeout(pending.timeoutId)
    if (pending?.cleanupTimeoutId) clearTimeout(pending.cleanupTimeoutId)
  }

  async function settleApproval(id, response, { skipMapDelete = false } = {}) {
    const pending = pendingApprovals.get(id)
    if (!pending) return false
    if (!skipMapDelete) pendingApprovals.delete(id)
    clearApprovalTimer(pending)
    const allowed = response?.action === 'allow-once' || response?.action === 'allow'
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
      const registered = registerPendingApproval(id, {
        rpcId: frame.rpcId,
        sessionId: frame.sessionId,
        approvalId: frame.approvalId,
        conversationId,
      })
      if (!registered) return
      void settleApproval(id, { action: 'allow-once' })
      return
    }
    if (!webContents || webContents.isDestroyed?.()) {
      const registered = registerPendingApproval(id, {
        rpcId: frame.rpcId,
        sessionId: frame.sessionId,
        approvalId: frame.approvalId,
        conversationId,
      })
      if (!registered) return
      void settleApproval(id, { action: 'deny' })
      return
    }
    const timeoutId = setTimeout(() => {
      void settleApproval(id, { action: 'deny', reason: 'timeout' })
    }, Z_APPROVAL_PROMPT_TIMEOUT_MS)
    timeoutId.unref?.()
    const registered = registerPendingApproval(id, {
      rpcId: frame.rpcId,
      sessionId: frame.sessionId,
      approvalId: frame.approvalId,
      conversationId,
      timeoutId,
    })
    if (!registered) {
      clearTimeout(timeoutId)
      return
    }
    try {
      webContents.send('permission:prompt', {
        id,
        conversationId,
        tool: frame.toolName || 'Z 工具',
        reason: frame.reason || '该操作需要权限确认。',
        detail: frame.reason || 'Z 请求执行需要授权的操作。',
        allowAlways: false,
      })
    } catch {
      void settleApproval(id, { action: 'deny' })
    }
  }

  function emitUserQuestion(conversationId, webContents, envelope) {
    const id = envelope.rpcId
    if (typeof id !== 'string' || !id) return
    const existing = pendingQuestions.get(id)
    if (existing) {
      // Replayed requests are the same logical question. Re-send only when a
      // different live renderer takes over after a window reload.
      if (webContents && !webContents.isDestroyed?.() && existing.webContents !== webContents) {
        existing.webContents = webContents
        webContents.send('user-question:prompt', {
          id, conversationId, questions: existing.questions,
        })
      }
      return
    }
    if (!conversationId) {
      void Promise.resolve(hostManager.getApi?.() ?? readyPromise).then(api => api?.respond({
        type: 'client-response', rpcId: id,
        result: { ok: false, error: { code: 'cancelled', message: 'Conversation is unavailable.' } },
      })).catch(() => {})
      return
    }
    const entry = {
      rpcId: id,
      sessionId: envelope.payload.sessionId,
      conversationId,
      questions: envelope.payload.questions,
      webContents,
    }
    pendingQuestions.set(id, entry)
    if (!webContents || webContents.isDestroyed?.()) return
    try {
      webContents.send('user-question:prompt', {
        id, conversationId, questions: entry.questions,
      })
    } catch (error) {
      console.error('发送用户问题提示失败：', error)
    }
  }

  async function answerUserQuestion(id, answer) {
    const pending = pendingQuestions.get(id)
    if (!pending) return false
    const api = await ensureReady()
    const receipt = await api.respond({
      type: 'client-response',
      rpcId: pending.rpcId,
      result: { ok: true, value: { sessionId: pending.sessionId, answer } },
    })
    if (receipt?.accepted === false) return false
    pendingQuestions.delete(id)
    return true
  }

  async function cancelUserQuestion(id) {
    const pending = pendingQuestions.get(id)
    if (!pending) return false
    const api = await ensureReady()
    const receipt = await api.respond({
      type: 'client-response',
      rpcId: pending.rpcId,
      result: {
        ok: false,
        error: {
          code: 'cancelled',
          message: 'the user dismissed the question to speak instead',
          details: {},
        },
      },
    })
    if (receipt?.accepted === false) return false
    pendingQuestions.delete(id)
    return true
  }

  async function handleEnvelope(api, envelope) {
    const frame = envelope?.payload
    if (!frame) return
    if (frame.type === 'stream/error') throw new Error(frame.error?.message || 'Z 事件通道返回错误')
    if (frame.type === 'session/event' && Number.isInteger(frame.event?.seq)) {
      const previous = observedSequences.get(frame.sessionId) ?? -1
      // History replay and live frames can overlap. Sequence, not text or
      // arrival time, is the native identity for exactly-once bridge folding.
      if (frame.event.seq <= previous) return
      observedSequences.set(frame.sessionId, frame.event.seq)
    }
    fanoutMuxFrame(envelope)
    if (conversationHub) {
      void conversationHub.handleMuxEnvelope(envelope)
    }
    if (frame.type === 'session/subscribed') {
      const previous = observedSequences.get(frame.sessionId)
      if (previous === undefined) observedSequences.set(frame.sessionId, frame.lastSeq ?? -1)
      const match = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)
      if (match) {
        const turn = running.get(match[0])
        // Empty queues have no baseline frame. Discard the old generation's
        // mirror, but retain its accepted count while stitching missed turns.
        queueSnapshots.delete(match[0])
        if (turn?.recovering && !turn.command) await recoverSession(api, match[0], turn, frame.lastSeq)
      }
      return
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
        const registered = registerPendingApproval(id, {
          rpcId: envelope.rpcId,
          sessionId: frame.sessionId,
          approvalId: frame.approvalId,
          conversationId: null,
        })
        if (!registered) return
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
    if (frame.type === 'question/requested') {
      const sessionMatch = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)
      const sessionKey = sessionMatch?.[0]
      const conversationId = sessionMatch?.[1]?.ownerConversationId || sessionKey
      const turn = running.get(sessionKey)
      emitUserQuestion(turn?.eventConversationId ?? conversationId, turn?.webContents, {
        rpcId: envelope.rpcId,
        payload: frame,
      })
      return
    }
    if (frame.type === 'question/resolved') {
      const pending = pendingQuestions.get(frame.questionRpcId)
      if (pending) {
        pendingQuestions.delete(frame.questionRpcId)
        try {
          pending.webContents?.send('user-question:resolved', {
            id: frame.questionRpcId, conversationId: pending.conversationId,
          })
        } catch {}
      }
      return
    }
    if (frame.type === 'session/queue') {
      const conversationId = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)?.[0]
      if (conversationId) {
        const items = frame.items ?? []
        queueSnapshots.set(conversationId, items)
        const turn = running.get(conversationId)
        if (turn) {
          // Native inbox mutations include removal, replacement and claiming.
          // Counting accepted sends alone leaves phantom work after deletion.
          turn.queueAuthoritative = true
          turn.pendingQueuedTurns = items.filter(item => item.placement === 'queued').length
        }
      }
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
    if (turn.command) {
      // Manual maintenance has compaction/command brackets, not chat turns.
      // The prompt RPC owns settlement; never consume a chat turn/end here.
      if (event?.type === 'compaction/summary') turn.usage = normalizeTokenUsage(event.data?.usage)
      return
    }
    if (event?.type === 'turn/start' && turn.awaitingQueuedTurn) {
      turn.awaitingQueuedTurn = false
      // With a native queue stream, the subsequent inbox claim supplies the
      // exact count. Decrement only for old transports without queue frames.
      if (!turn.queueAuthoritative) turn.pendingQueuedTurns = Math.max(0, turn.pendingQueuedTurns - 1)
      turn.turnId = crypto.randomUUID()
      turn.text = ''
      turn.textByStep?.clear()
      turn.currentTextStepKey = null
      turn.thinking = ''
      turn.thinkingStartedAt = null
      turn.thinkingEndedAt = null
      turn.thinkingActiveMs = 0
      turn.lastReasoningAt = null
      turn.usage = null
      turn.toolCalls = 0
      turn.toolResults = 0
      turn.toolCallsById.clear()
      turn.fileChanges.clear()
      turn.searchCycleBlocked = false
      turn.startedAt = event.time || Date.now()
      if (turn.emitLifecycle !== false) {
        emit(emitTarget, turn.webContents, { type: 'start', startedAt: turn.startedAt, turnId: turn.turnId, taskId: turn.taskId })
      }
      return
    }
    if (event?.type === 'step/start') {
      endThinkingSegment(turn, emit, emitTarget, event.time || Date.now())
      return
    }
    if (event?.type === 'request/header') {
      return
    }
    if (event?.type === 'llm/retry') {
      const retry = event.data ?? {}
      const failureLabels = {
        TIMEOUT: '模型响应超时',
        TRANSPORT: '模型连接中断',
        RATE_LIMIT: '模型服务限流',
        SERVER: '模型服务端暂时不可用',
        EMPTY_RESPONSE: '模型未返回有效内容',
      }
      const failureLabel = failureLabels[retry.failure?.code] ?? '模型请求失败'
      const retryMessage = `${turn.taskId ? `子任务 ${turn.taskId}：` : ''}${failureLabel}`
      emit(emitTarget, turn.webContents, {
        type: 'retry',
        phase: 'start',
        attempt: retry.retry,
        maxAttempts: retry.maxRetries,
        delayMs: retry.delayMs,
        message: retryMessage,
      })
      return
    }
    if (event?.type === 'llm/retry-started') {
      emit(emitTarget, turn.webContents, {
        type: 'retry',
        phase: 'end',
        attempt: event.data?.retry,
      })
      return
    }
    if (event?.type === 'assistant/chunk') {
      const chunk = event.data?.chunk
      if (chunk?.type === 'text-delta' && chunk.text) {
        endThinkingSegment(turn, emit, emitTarget, event.time || Date.now())
        const stepKey = assistantTextStepKey(turn, event)
        const stepText = turn.textByStep?.get(stepKey) ?? ''
        setAssistantStepText(turn, stepKey, stepText + chunk.text)
        if (turn.progressOnly && turn.plannerPhase !== 'text') {
          turn.plannerPhase = 'text'
          emit(emitTarget, turn.webContents, { type: 'planner_phase', phase: 'text' })
        }
        // Keep the incremental chat stream as the authoritative live-text path.
        // A DSH projection can be attached while its session is still opening or
        // repairing a mux gap; suppressing these deltas merely because a view is
        // attached makes the answer appear all at once in the terminal `done`.
        if (!turn.silentText) {
          emit(emitTarget, turn.webContents, { type: 'delta', delta: chunk.text })
        }
      } else if (chunk?.type === 'reasoning-delta' && chunk.text) {
        const now = event.time || Date.now()
        const wasIdle = !turn.thinkingStartedAt || turn.thinkingEndedAt
        resumeThinkingSegment(turn, now)
        if (turn.progressOnly && turn.plannerPhase !== 'reasoning') {
          turn.plannerPhase = 'reasoning'
          emit(emitTarget, turn.webContents, { type: 'planner_phase', phase: 'reasoning' })
        }
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
            durationMs: thinkingDurationMs,
          })
        }
      }
      return
    }
    if (event?.type === 'assistant/message') {
      const message = event.data?.message
      const finalText = textFromMessage(message)
      if (finalText) {
        const stepKey = assistantTextStepKey(turn, event)
        const streamedStepText = turn.textByStep?.get(stepKey) ?? ''
        if (finalText !== streamedStepText) {
          endThinkingSegment(turn, emit, emitTarget, event.time || Date.now())
          setAssistantStepText(turn, stepKey, finalText)
          if (turn.progressOnly && turn.plannerPhase !== 'text') {
            turn.plannerPhase = 'text'
            emit(emitTarget, turn.webContents, { type: 'planner_phase', phase: 'text' })
          }
          // Some adapters expose no token chunks (sourceEventSeqs: []). Their
          // assembled assistant/message is still available before turn/end, so
          // publish it now. The full snapshot also reconciles a streamed prefix
          // without duplicating text or corrupting earlier assistant steps.
          if (!turn.silentText) {
            emit(emitTarget, turn.webContents, {
              type: 'delta',
              delta: finalText,
              full: turn.text,
            })
          }
        } else {
          turn.text = [...(turn.textByStep?.values() ?? [])].join('')
        }
      }
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
      endThinkingSegment(turn, emit, emitTarget, event.time || Date.now())
      turn.toolCalls += 1
      const hostTurn = Number.isInteger(event.data?.turn) ? event.data.turn : undefined
      const hostStep = Number.isInteger(event.data?.step) ? event.data.step : undefined
      const input = (() => {
        try { return JSON.parse(event.data?.arguments || '{}') } catch { return {} }
      })()
      const callId = event.data?.callId
      const toolName = event.data?.name || 'tool'
      turn.toolCallsById.set(callId, {
        toolName, input, startedAt: event.time || Date.now(), turn: hostTurn, step: hostStep,
      })
      emit(emitTarget, turn.webContents, {
        type: 'activity',
        phase: 'tools',
        message: `正在执行工具：${toolName}…`,
      })
      emit(emitTarget, turn.webContents, {
        type: 'tool',
        id: callId,
        ...(hostTurn !== undefined ? { turn: hostTurn } : {}),
        ...(hostStep !== undefined ? { step: hostStep } : {}),
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
        ?? message?.content?.find((block) => block?.type === 'tool-result')?.toolCallId
      const call = turn.toolCallsById.get(callId)
      const result = normalizeToolResult({
        content: message?.content ?? [],
        isError: Boolean(event.data?.error || message?.isError),
        details: message?.details,
        meta: event.data?.meta,
        error: event.data?.error?.message || event.data?.error?.code,
      })
      if (result.isError) {
        const resultText = result.content
          .filter((block) => block?.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n')
        if (/Repeated filesystem-search cycle detected|Filesystem search at scope .+ was disabled/i.test(resultText)) {
          turn.searchCycleBlocked = true
        }
      }
      if (call) {
        const fileDiff = extractFileDiff(call.toolName, call.input, result)
        if (fileDiff) recordFileChange(turn, fileDiff)
        emit(emitTarget, turn.webContents, {
          type: 'tool',
          id: callId,
          ...(call.turn !== undefined ? { turn: call.turn } : {}),
          ...(call.step !== undefined ? { step: call.step } : {}),
          toolName: call.toolName,
          status: result.isError ? 'error' : 'done',
          inputSummary: summarizeToolInput(call.toolName, call.input),
          resultSummary: summarizeToolResult(result, result.isError),
          durationMs: Math.max(0, (event.time || Date.now()) - call.startedAt),
          fileDiff,
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
        turn.toolCallsById.delete(callId)
      }
      return
    }
    if (event?.type === 'tool/code-dispatch-start') {
      endThinkingSegment(turn, emit, emitTarget, event.time || Date.now())
      const data = event.data ?? {}
      const callId = data.subCallId
      if (typeof callId !== 'string' || !callId) return
      const input = data.arguments && typeof data.arguments === 'object' ? data.arguments : {}
      const toolName = typeof data.name === 'string' && data.name ? data.name : 'tool'
      const parentCall = turn.toolCallsById.get(data.parentCallId)
      const hostTurn = Number.isInteger(data.turn) ? data.turn : parentCall?.turn
      const hostStep = Number.isInteger(data.step) ? data.step : parentCall?.step
      turn.toolCalls += 1
      turn.toolCallsById.set(callId, {
        toolName,
        input,
        startedAt: event.time || Date.now(),
        parentCallId: data.parentCallId ?? null,
        turn: hostTurn,
        step: hostStep,
      })
      emit(emitTarget, turn.webContents, {
        type: 'activity',
        phase: 'tools',
        message: `正在执行工具：${toolName}（批量调用）…`,
        ...(turn.taskId ? { taskId: turn.taskId } : {}),
      })
      emit(emitTarget, turn.webContents, {
        type: 'tool',
        id: callId,
        parentCallId: data.parentCallId ?? null,
        ...(hostTurn !== undefined ? { turn: hostTurn } : {}),
        ...(hostStep !== undefined ? { step: hostStep } : {}),
        toolName,
        status: 'running',
        inputSummary: summarizeToolInput(toolName, input),
        startedAt: event.time || Date.now(),
        ...(turn.taskId ? { taskId: turn.taskId } : {}),
      })
      return
    }
    if (event?.type === 'tool/code-dispatch') {
      const data = event.data ?? {}
      const callId = data.subCallId
      if (typeof callId !== 'string' || !callId) return
      const call = turn.toolCallsById.get(callId)
      const toolName = typeof data.name === 'string' && data.name ? data.name : call?.toolName ?? 'tool'
      const input = data.arguments && typeof data.arguments === 'object' ? data.arguments : call?.input ?? {}
      const result = normalizeToolResult({
        content: Array.isArray(data.content) ? data.content : [],
        isError: Boolean(data.isError),
      })
      turn.toolResults += 1
      if (call) {
        const fileDiff = extractFileDiff(toolName, input, result)
        if (fileDiff) recordFileChange(turn, fileDiff)
        emit(emitTarget, turn.webContents, {
          type: 'tool',
          id: callId,
          parentCallId: data.parentCallId ?? call.parentCallId ?? null,
          ...(Number.isInteger(data.turn) ? { turn: data.turn } : call.turn !== undefined ? { turn: call.turn } : {}),
          ...(Number.isInteger(data.step) ? { step: data.step } : call.step !== undefined ? { step: call.step } : {}),
          toolName,
          status: result.isError ? 'error' : 'done',
          inputSummary: summarizeToolInput(toolName, input),
          resultSummary: summarizeToolResult(result, result.isError),
          durationMs: Math.max(0, (event.time || Date.now()) - call.startedAt),
          fileDiff,
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
        turn.toolCallsById.delete(callId)
      }
      return
    }
    if (event?.type === 'turn/end') {
      finishTurn(sessionKey, turn, emitTarget, {
        reason: event.data?.reason?.kind,
        error: event.data?.reason?.error ?? event.data?.error,
        continuing: turn.recoveryContinuing,
        endedAt: event.time,
      })
    }
  }

  async function readMissingEvents(api, sessionId, afterSeq) {
    const pages = []
    let beforeSeq
    for (;;) {
      const page = rpcValue(await api.sessions.history({ sessionId, maxMessages: 80,
        ...(beforeSeq === undefined ? {} : { beforeSeq }) }), '补齐 Z 会话历史')
      const rows = page.events ?? []
      pages.push(rows)
      const firstSeq = rows.reduce((min, row) => Number.isInteger(row.event?.seq) ? Math.min(min, row.event.seq) : min, Infinity)
      if (!page.hasMore || firstSeq <= afterSeq) break
      if (!Number.isFinite(firstSeq) || (beforeSeq !== undefined && firstSeq >= beforeSeq)) {
        throw new Error('Z 历史分页未前进，无法确认遗漏事件；未重新发送任务')
      }
      beforeSeq = firstSeq
    }
    const entries = new Map()
    for (const row of pages.flat()) {
      if (Number.isInteger(row.event?.seq) && row.event.seq > afterSeq) entries.set(row.event.seq, row)
    }
    return [...entries.values()].sort((a, b) => a.event.seq - b.event.seq)
  }

  async function recoverSession(api, sessionKey, turn, subscribedSeq) {
    const sessionId = turn.sessionId
    const emitTarget = turn.eventConversationId ?? sessionKey
    const before = observedSequences.get(sessionId) ?? -1
    let missing = await readMissingEvents(api, sessionId, before)
    const list = rpcValue(await api.sessions.list({}), '确认 Z Agent 运行状态')
    if (!Array.isArray(list.items)) throw new Error('Z 会话列表格式无效，无法确认任务状态')
    const nativeRunning = list.items?.some(item => item.sessionId === sessionId && item.running)
    // The Agent can close after the history snapshot and before list(). Pull
    // once more before declaring a stopped Host/session without a terminal.
    if (!nativeRunning) missing = await readMissingEvents(api, sessionId, before)
    if (!turn.silentText) emit(emitTarget, turn.webContents, { type: 'connection', state: 'restored',
      message: nativeRunning ? '连接已恢复，任务仍在执行…' : '会话连接已恢复。' })
    const acceptedBeforeGap = turn.pendingQueuedTurns
    turn.pendingQueuedTurns = 0
    turn.queueAuthoritative = false
    for (let index = 0; index < missing.length; index++) {
      const row = missing[index]
      if (row.event.type === 'turn/end') {
        turn.recoveryContinuing = !['error', 'aborted', 'cancelled', 'interrupted'].includes(row.event.data?.reason?.kind)
          && (missing.slice(index + 1).some(next => next.event.type === 'turn/start')
            || Boolean(nativeRunning && acceptedBeforeGap > 0))
      }
      await handleEnvelope(api, { payload: { type: 'session/event', sessionId, ...row } })
      delete turn.recoveryContinuing
    }
    turn.recovering = false
    turn.connectionFailed = false
    if (![...running.values()].some(record => record.recovering)) reconnectAttempt = 0
    if (running.get(sessionKey) !== turn) return
    if (!nativeRunning) {
      // Native list is authoritative: only a proven stopped Agent may be
      // released. A lost mux alone never cancels work or reissues the prompt.
      if (Number.isInteger(subscribedSeq) && subscribedSeq < before) observedSequences.set(sessionId, subscribedSeq)
      finishTurn(sessionKey, turn, emitTarget, { reason: 'error', error: {
        message: 'Z Agent 已停止，未找到完整结束事件；已保留此前输出，未自动重新执行任务。',
        code: 'HOST_INTERRUPTED',
      } })
    }
  }

  function scheduleIdleHistoryReconciliation(api, sessionKey, turn) {
    if (turn.command || typeof api.sessions.history !== 'function' || stopped || running.get(sessionKey) !== turn || turn.reconcileTimer) return
    const delay = turn.reconcileDelayMs ?? Z_IDLE_HISTORY_RECONCILE_MS
    turn.reconcileTimer = setTimeout(async () => {
      turn.reconcileTimer = null
      if (stopped || running.get(sessionKey) !== turn) return
      if (Date.now() - turn.lastEventAt >= delay) {
        try {
          const afterSeq = observedSequences.get(turn.sessionId) ?? turn.historyBaselineSeq
          if (Number.isInteger(afterSeq)) {
            const missing = await readMissingEvents(api, turn.sessionId, afterSeq)
            for (const row of missing) {
              await handleEnvelope(api, { payload: { type: 'session/event', sessionId: turn.sessionId, ...row } })
              if (running.get(sessionKey) !== turn) break
            }
          }
        } catch (error) {
          console.warn(`Z 会话 ${turn.sessionId} 的静默历史对账失败：${error instanceof Error ? error.message : String(error)}`)
        }
        turn.reconcileDelayMs = Math.min(delay * 2, Z_MAX_HISTORY_RECONCILE_MS)
      }
      scheduleIdleHistoryReconciliation(api, sessionKey, turn)
    }, delay)
    turn.reconcileTimer.unref?.()
  }

  function finishTurn(sessionKey, turn, emitTarget, ending = {}) {
    if (turn.reconcileTimer) clearTimeout(turn.reconcileTimer)
    turn.reconcileTimer = null
    const reason = ending.reason
    const cancelled = reason === 'aborted' || reason === 'cancelled' || reason === 'interrupted'
    const turnFailure = reason === 'error'
      ? (ending.error ?? { message: 'Z Agent 执行失败' })
      : reason === 'blocked'
        ? {
          code: 'AGENT_BLOCKED',
          message: turn.searchCycleBlocked
            ? '检测到重复的文件搜索循环，已停止本轮以避免继续消耗；本轮没有生成最终答案。请基于已读取内容总结，或在新消息中指定更窄的搜索范围。'
            : 'Z Agent 本轮被工具或安全策略阻止，未生成最终答案。请检查工具调用记录后重试。',
        }
        : reason === 'completed' && !turn.text.trim()
          ? {
            code: 'AGENT_EMPTY_RESPONSE',
            message: 'Z Agent 本轮结束但没有生成最终文本；不会将空响应记为成功。请查看工具记录后再决定是否继续。',
          }
        : null
    const continuing = ending.continuing ?? (!turnFailure && !cancelled && turn.pendingQueuedTurns > 0)
    // Replayed terminals may arrive seconds after the Agent actually ended.
    // Transport backoff must not train routing/stats to think the model took
    // that extra time, or inflate a finished reasoning segment.
    const endedAt = Number.isFinite(ending.endedAt) ? ending.endedAt : Date.now()
    const elapsedMs = Math.max(0, endedAt - turn.startedAt)
    pauseThinkingSegment(turn, endedAt)
    const thinkingDurationMs = activeThinkingDurationMs(turn, endedAt)
    const result = {
      turnId: turn.turnId,
      startedAt: turn.startedAt,
      text: turn.text,
      thinking: turn.thinking,
      thinkingDurationMs,
      fileChanges: Array.from(turn.fileChanges.values()).map((file) => ({
        path: file.path,
        ...(file.statsComplete ? { addedLines: file.addedLines, deletedLines: file.deletedLines } : {}),
        ...(file.isNewFile ? { isNewFile: true } : {}),
      })),
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
    // A queued turn has no outstanding IPC caller. Persist at the native
    // terminal boundary, not only when the first send promise resolves.
    // Do not await disk IO on the shared mux: it must keep consuming queue
    // claims and other sessions while this turn's commit finishes.
    const persisted = turn.persistTerminal && onTurnCompleted
      ? Promise.resolve().then(() => onTurnCompleted({
        conversationId: emitTarget, modelKey: turn.modelKey, result,
        errorMessage: turnFailure ? (turnFailure.message || 'Z Agent 执行失败') : null,
      })).then(() => { result.nativePersisted = true })
      : Promise.resolve()
    // The first IPC caller also observes commit failures below; later queued
    // commits have no caller, so keep diagnostics without breaking the mux.
    void persisted.catch(error => console.error('[chat] 保存本轮结果失败:', error instanceof Error ? error.message : error))
    if (turn.emitLifecycle !== false) {
      if (result.thinking && thinkingDurationMs > 0) {
        emit(emitTarget, turn.webContents, {
          type: 'thinking_end',
          fullThinking: result.thinking,
          durationMs: thinkingDurationMs,
        })
      }
      if (turnFailure) {
        emit(emitTarget, turn.webContents, {
          type: 'error',
          message: turnFailure.message || 'Z Agent 执行失败',
          turnId: turn.turnId,
          startedAt: turn.startedAt,
          full: result.text,
          fullThinking: result.thinking,
          thinkingDurationMs,
          fileChanges: result.fileChanges,
          usage: result.usage,
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
      } else {
        emit(emitTarget, turn.webContents, {
          type: 'done',
          turnId: turn.turnId,
          startedAt: turn.startedAt,
          continuing,
          full: result.text,
          fullThinking: result.thinking,
          thinkingDurationMs,
          fileChanges: result.fileChanges,
          interrupted: cancelled,
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
      }
    }
    if (!turn.initialResolved) {
      turn.initialResolved = true
      if (turnFailure) {
        const error = new Error(turnFailure.message || 'Z Agent 执行失败')
        if (turnFailure.code) error.code = turnFailure.code
        error.partialResult = result
        error.modelKey = turn.modelKey
        void persisted.then(() => turn.reject(error), persistenceError => {
          error.persistenceError = persistenceError
          turn.reject(error)
        })
      } else {
        void persisted.then(() => turn.resolve(result), error => {
          error.partialResult = result
          error.modelKey = turn.modelKey
          turn.reject(error)
        })
      }
    }
    if (continuing) {
      // Keep the conversation busy across DSH's queued next-turn work. The
      // next turn/start rotates the visible per-turn stream, and its turn/end
      // is the only point at which the busy entry is finally released.
      turn.awaitingQueuedTurn = true
    } else {
      turn.pendingQueuedTurns = 0
      running.delete(sessionKey)
    }
  }

  async function startMuxStream(api) {
    const generation = ++muxGeneration
    muxAbort = new AbortController()
    const activeController = muxAbort
    const activeSignal = muxAbort.signal
    let connected = false
    let markMuxOpen
    let rejectMuxOpen
    const muxOpened = new Promise((resolve, reject) => {
      markMuxOpen = () => { connected = true; resolve() }
      rejectMuxOpen = reject
    })
    const openTimer = setTimeout(() => {
      rejectMuxOpen(new Error('Z 事件通道连接超时'))
      activeController.abort()
    }, 8_000)
    openTimer.unref?.()
    muxTask = (async () => {
      try {
        for await (const envelope of api.events.mux({}, activeSignal, markMuxOpen)) {
          markMuxOpen()
          await handleEnvelope(api, envelope)
        }
        if (!activeSignal.aborted) throw new Error('Z 事件流意外关闭')
      } catch (error) {
        rejectMuxOpen(error)
        if (!activeSignal.aborted && !stopped && generation === muxGeneration) {
          for (const [conversationId, turn] of running) {
            turn.recovering = true
            if (!turn.silentText) emit(turn.eventConversationId ?? conversationId, turn.webContents,
              { type: 'connection', state: 'reconnecting', message: '正在恢复会话连接，任务未被自动停止…' })
          }
          muxTask = null
          muxAbort = null
          // A pre-open failure belongs to startMuxStream's awaiting caller.
          // Scheduling here as well would open two competing generations.
          if (connected) {
            const retry = scheduleReconnect(api)
            reconnectTask = retry
            await retry
            if (reconnectTask === retry) reconnectTask = null
          }
        }
      } finally {
        clearTimeout(openTimer)
        if (!connected && generation === muxGeneration) {
          muxTask = null
          muxAbort = null
        }
      }
    })()
    try {
      await muxOpened
    } finally {
      // This timeout only bounds the initial handshake. Leaving it armed after
      // the SSE stream opens silently aborts every healthy mux after 8 seconds;
      // because the abort then looks intentional, the reconnect path is skipped.
      clearTimeout(openTimer)
    }
    if (![...running.values()].some(turn => turn.recovering)) reconnectAttempt = 0
  }

  function reportUnconfirmedRuns(message) {
    for (const [sessionKey, turn] of running) {
      const target = turn.eventConversationId ?? sessionKey
      if (typeof hostManager.isRunning === 'function' && !hostManager.isRunning()) {
        finishTurn(sessionKey, turn, target, { reason: 'error', error: { message: 'Z Host 已停止；已保留此前输出，未自动重复执行。', code: 'HOST_INTERRUPTED' } })
        continue
      }
      turn.connectionFailed = true
      if (!turn.silentText) emit(target, turn.webContents, { type: 'connection', state: 'unavailable', message })
      if (!turn.initialResolved) {
        turn.initialResolved = true
        const error = new Error(message)
        // Unknown remote state is not a terminal. The UI must retain its run
        // and partial stream; do not account a partial as a completed call.
        error.runContinues = true
        error.turnId = turn.turnId
        turn.reject(error)
      }
    }
  }

  async function scheduleReconnect(api) {
    if (stopped || reconnectAttempt >= Z_MAX_RECONNECT_ATTEMPTS) {
      if (reconnectAttempt >= Z_MAX_RECONNECT_ATTEMPTS) {
        console.error(`Z 事件流重连已达到最大尝试次数 (${Z_MAX_RECONNECT_ATTEMPTS})，停止重连`)
        reportUnconfirmedRuns('会话连接暂不可用，后台任务状态尚未确认；未自动停止或重复执行，请检查连接后再同步。')
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
      let reconnectApi = api
      if (typeof hostManager.isRunning === 'function' && !hostManager.isRunning()) {
        readyPromise = null
        reconnectApi = (await hostManager.start()).api
      } else {
        reconnectApi = hostManager.getApi?.() ?? api
        // A failed health RPC is not proof the child died. Do not destroy all
        // live Agents because one connection/health check failed transiently.
        rpcValue(await reconnectApi.host.describe({}), '检查 Z Host')
      }
      conversationHub?.bindApi?.(reconnectApi)
      readyPromise = Promise.resolve(reconnectApi)
      await startMuxStream(reconnectApi)
      console.log('DSH 事件流重连成功')
      const activeSessions = [...sessions.entries()]
      if (activeSessions.length > 0) {
        console.log(`正在恢复 ${activeSessions.length} 个活跃会话的监听器...`)
      }
    } catch (error) {
      console.error(`DSH 事件流重连失败：${error instanceof Error ? error.message : String(error)}`)
      if (!stopped && reconnectAttempt < Z_MAX_RECONNECT_ATTEMPTS) {
        await scheduleReconnect(api)
      } else if (!stopped) {
        reportUnconfirmedRuns('会话连接暂不可用，后台任务状态尚未确认；未自动停止或重复执行，请检查连接后再同步。')
      }
    }
  }

  async function ensureReady() {
    if (stopped) throw new Error('Z Host 已关闭')
    // Both a not-yet-running child and an already-running child with a pending
    // first mux handshake share this promise. Never install a second opener
    // merely because the first caller has not reached startMuxStream yet.
    if (readyPromise && establishingReady) return readyPromise
    if (readyPromise && (typeof hostManager.isRunning !== 'function' || hostManager.isRunning())) {
      if (reconnectTask && [...running.values()].some(turn => turn.connectionFailed)) await reconnectTask
      // After retry exhaustion, a new explicit read/send may re-establish the
      // stream. During backoff, do not create a competing mux consumer.
      if (!muxTask && !reconnectTask) {
        establishingReady = true
        readyPromise = readyPromise.then(async api => { await startMuxStream(api); return api }).catch(error => {
          readyPromise = null
          throw error
        }).finally(() => { establishingReady = false })
      }
      return readyPromise
    }
    if (readyPromise) {
      // A fulfilled API promise can outlive the host child it points to.
      // Discard the dead transport before starting a fresh host/client pair.
      readyPromise = null
      muxAbort?.abort()
      muxAbort = null
      muxTask = null
    }
    establishingReady = true
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
    }).finally(() => { establishingReady = false })
    return readyPromise
  }

  async function ensureSession(api, conversationId, {
    cwdOverride,
    agentPreset,
    permissionMode,
    ownerConversationId,
    parentSessionId,
    modelKey = null,
  } = {}) {
    await loadSessions()
    let entry = sessions.get(conversationId)
    const requestedCwd = cwdOverride || getWorkspacePath() || process.cwd()
    // 未绑定工作区时 `process.cwd()` 会退化成 `/`，而 DSH 用会话 cwd 当沙箱边界。
    assertBindableWorkspace(requestedCwd)
    if (entry) assertBindableWorkspace(entry.cwd)
    const mode = normalizePermissionMode(permissionMode ?? await Promise.resolve(getPermissionMode(conversationId)))
    const resolvedPreset = agentPreset || dshAgentPresetForPermissionMode(mode)
    if (
      entry
      && isCursorFamilyModelKey(modelKey)
      && entry.agentPreset === 'code'
      && resolvedPreset === 'standard'
    ) {
      // Composer on Code Mode only sees run_code; it then hunts for Cursor-only tools and appears hung.
      sessions.delete(conversationId)
      entry = null
    }
    if (entry && entry.cwd !== requestedCwd) {
      throw new Error('此对话绑定的工作区与当前工作区不同。为保持 Z 会话上下文一致，请在原工作区继续，或新建对话。')
    }
    if (!entry) {
      const sessionId = sessionIdForKey(conversationId)
      let created
      try {
        created = rpcValue(await api.sessions.create({
          sessionId,
          cwd: requestedCwd,
          agentPreset: resolvedPreset,
          ...(parentSessionId ? { parentSessionId } : {}),
        }), '创建 Z 会话')
      } catch (error) {
        // 映射表可能因 LRU/恢复丢失，但确定性 sessionId 对应的 Host 日志仍在。
        // Host 用 agent-preset-conflict 明确表示“这是旧会话，预设不可覆盖”；
        // 去掉 agentPreset 重试会采用日志中真实预设，不改写历史会话配置。
        if (error?.code !== 'agent-preset-conflict') throw error
        created = rpcValue(await api.sessions.create({
          sessionId,
          cwd: requestedCwd,
          ...(parentSessionId ? { parentSessionId } : {}),
        }), '恢复已有 Z 会话')
      }
      entry = {
        sessionId: created.sessionId || sessionId,
        cwd: requestedCwd,
        agentPreset: created.agentPreset || resolvedPreset,
        ...(parentSessionId ? { parentSessionId } : {}),
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
      }), '恢复 Z 会话')
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

  /** Align Host session route with Composer; persist successful selections when Host readback omits effort. */
  async function ensureSessionModelSelection(api, sessionKey, entry, config, explicitReasoningEffort) {
    const sessionId = entry.sessionId
    const directory = rpcValue(await api.sessions.models({ sessionId }), '读取 Z 会话模型')
    const current = directory?.current ?? null
    if (sessionModelMatches(current, config, explicitReasoningEffort, entry.lastAppliedModelSelection)) return current
    const payload = {
      sessionId,
      provider: config.provider,
      model: config.id,
      ...(explicitReasoningEffort ? { reasoningEffort: explicitReasoningEffort } : {}),
    }
    const selected = rpcValue(await api.sessions.selectModel(payload), '选择 Z 模型')
    entry.lastAppliedModelSelection = {
      provider: config.provider,
      model: config.id,
      ...(explicitReasoningEffort ? { reasoningEffort: explicitReasoningEffort } : {}),
    }
    sessions.set(sessionKey, entry)
    await persistSessions()
    return selected?.selected ?? selected
  }

  async function selectedReasoningEffort(config, modelKey) {
    // A global Composer preference must not be sent to routes that explicitly
    // declare no reasoning support; some OpenAI-compatible gateways reject
    // the request before generation when an effort is present.
    if (config?.reasoning === false) return null
    const requested = await profileStore?.getThinkingLevel?.(modelKey) ?? null
    if (!requested) return null
    const supported = config?.supportedThinkingLevels
    if (Array.isArray(supported) && !supported.includes(requested)) {
      return supported.includes(config.defaultThinkingLevel) ? config.defaultThinkingLevel : null
    }
    return requested
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
    }), '应用 Z 权限模式')
    if (response.command?.kind !== 'success') {
      throw new Error('Z Host 未确认应用权限模式；为避免以错误权限执行，本次消息已阻止。请检查权限设置后重试。')
    }
    const history = rpcValue(await api.sessions.history({
      sessionId: entry.sessionId,
      maxMessages: 1,
    }), '核对 Z 权限投影')
    if (history?.projections?.values?.permissions?.currentValue !== preset) {
      throw new Error('Z Host 权限投影未确认目标权限；为避免以错误权限执行，本次消息已阻止。')
    }
    entry.lastAppliedPermissionMode = normalizedMode
    sessions.set(sessionKey, entry)
    await persistSessions()
  }

  async function configureModel(api, modelKey) {
    const config = await modelService.getDshModelConfig(modelKey)
    const providerList = rpcValue(await api.llm.providers({}), '读取 Z 提供方目录')
    const route = providerList.providers?.find((item) => item.provider === config.provider)
    if (!route?.active) throw new Error(`Z Runtime 当前没有启用模型提供方 ${config.provider}；请先检查 TaskWeaver 模型设置。`)
    const auth = await modelService.listProvidersAuth()
    if (!auth.some((item) => item.id === config.provider && item.configured)) {
      throw new Error(`模型提供方 ${config.provider} 尚未完成 API Key 或官方订阅授权。请先在模型设置中连接账号。`)
    }
    if (config.provider === 'opencodex' || isOpenCodexModelKey(modelKey)) {
      const modelsPath = resolveTaskWeaverModelsPath(userDataPath)
      const { up, baseUrl } = await ensureOpenCodexProxyReachable(modelsPath)
      if (!up) {
        throw new Error(
          `无法连接本机 OpenCodex 代理（${baseUrl}）。`
          + '请在「模型与来源」打开 OpenCodex 卡片，点击「启动 OpenCodex」并完成 Cursor 登录，再重试。'
          + 'Composer 等 Cursor 模型必须经 ocx 转发；小米 MiMo 等官方 API 模型不经过 ocx。',
        )
      }
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
    agentPreset = 'standard',
    skill = null,
    taskId,
    silentText = false,
    progressOnly = false,
    emitLifecycle = true,
    persistTerminal = true,
    parentSessionId,
  }) {
    if (!text || typeof text !== 'string') throw new Error('消息不能为空')
    if (!conversationId) throw new Error('当前对话标识无效')
    if (!sessionKey) throw new Error('Z 会话标识无效')
    const command = nativeChatCommand(text)
    if (cancellingSessions.has(sessionKey)) throw new Error('当前会话正在停止，请稍后再发送')
    // 先做工作区校验再启动 Host：无效请求不该把 DSH 拉起来。
    assertBindableWorkspace(cwdOverride || getWorkspacePath() || process.cwd())
    const api = await ensureReady()
    const permissionMode = normalizePermissionMode(await Promise.resolve(getPermissionMode(conversationId)))
    const entry = await ensureSession(api, sessionKey, {
      cwdOverride,
      agentPreset,
      permissionMode,
      ownerConversationId: conversationId,
      parentSessionId,
      modelKey,
    })

    const activeTurn = running.get(sessionKey)
    if (cancellingSessions.has(sessionKey)) throw new Error('当前会话正在停止，请稍后再发送')
    if (activeTurn?.command || (activeTurn && command)) throw new Error('当前会话正在执行任务或压缩命令，请稍后再发送')
    if (activeTurn) {
      // DSH owns queue/steer delivery for a live Agent. Do not reconfigure or
      // replace its lifecycle record: turn/end must still settle the original
      // send and release the caller's per-conversation lock.
      if (behavior !== 'steer') activeTurn.pendingQueuedTurns += 1
      const submittedText = applySkillInstructions(text, skill)
      logHostUserMessageBytes(logger, {
        conversationId,
        sessionKey,
        taskId,
        delivery: behavior === 'steer' ? 'steer' : 'queue',
        inputText: text,
        submittedText,
        skill,
      })
      const admission = Promise.resolve().then(() => api.sessions.prompt({
        sessionId: entry.sessionId,
        mode: behavior === 'steer' ? 'steer' : 'queue',
        content: [{ type: 'text', text: submittedText }],
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }))
      activeTurn.pendingPromptAdmissions.add(admission)
      try {
        rpcValue(await admission, '发送消息')
      } catch (error) {
        if (behavior !== 'steer') activeTurn.pendingQueuedTurns = Math.max(0, activeTurn.pendingQueuedTurns - 1)
        throw error
      } finally {
        activeTurn.pendingPromptAdmissions.delete(admission)
      }
      const currentStats = stats.get(sessionKey)
      if (currentStats) currentStats.userMessages += 1
      return { accepted: true, queued: behavior !== 'steer' }
    }

    await ensurePermissionModeApplied(api, sessionKey, entry, permissionMode)
    if (!modelKey) throw new Error('请先选择已配置的模型')
    const config = await configureModel(api, modelKey)
    const explicitReasoningEffort = await selectedReasoningEffort(config, modelKey)
    await ensureSessionModelSelection(api, sessionKey, entry, config, explicitReasoningEffort)
    let historyBaselineSeq = observedSequences.get(entry.sessionId)
    if (historyBaselineSeq === undefined && typeof api.sessions.history === 'function') {
      try {
        const history = rpcValue(await api.sessions.history({ sessionId: entry.sessionId, maxMessages: 1 }), '读取 Z 会话事件基线')
        historyBaselineSeq = history.events?.reduce((max, row) => Math.max(max, row.event?.seq ?? -1), -1) ?? -1
        observedSequences.set(entry.sessionId, historyBaselineSeq)
      } catch (error) {
        // A baseline is only for the recovery fallback; its failure must not
        // block the user prompt or cause an unsafe replay from sequence zero.
        console.warn(`读取 Z 会话事件基线失败，继续正常发送：${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const turnId = crypto.randomUUID()
    if (emitLifecycle) emit(eventConversationId, webContents, { type: 'start', startedAt: Date.now(), ...(command ? {} : { turnId }), taskId })
    let resolveTurn
    let rejectTurn
    const completed = new Promise((resolve, reject) => {
      resolveTurn = resolve
      rejectTurn = reject
    })
    running.set(sessionKey, {
        turnId,
        modelKey,
        persistTerminal: persistTerminal && sessionKey === eventConversationId && !taskId && !silentText,
        command: Boolean(command),
        sessionId: entry.sessionId,
        historyBaselineSeq,
        webContents,
        eventConversationId,
        taskId,
        silentText,
        progressOnly: Boolean(progressOnly && silentText),
        plannerPhase: null,
        emitLifecycle,
        text: '',
        textByStep: new Map(),
        currentTextStepKey: null,
        thinking: '',
        thinkingStartedAt: null,
        thinkingEndedAt: null,
        thinkingActiveMs: 0,
        lastReasoningAt: null,
        usage: null,
        toolCalls: 0,
        toolResults: 0,
        toolCallsById: new Map(),
        fileChanges: new Map(),
        pendingQueuedTurns: 0,
        queueAuthoritative: false,
        pendingPromptAdmissions: new Set(),
        awaitingQueuedTurn: false,
        initialResolved: false,
        startedAt: Date.now(),
        lastEventAt: Date.now(),
        resolve: resolveTurn,
        reject: rejectTurn,
        completion: completed,
      })
    scheduleIdleHistoryReconciliation(api, sessionKey, running.get(sessionKey))
    try {
      const submittedText = command || applySkillInstructions(text, skill)
      if (!command) {
        logHostUserMessageBytes(logger, {
          conversationId,
          sessionKey,
          taskId,
          delivery: 'new-turn',
          inputText: text,
          submittedText,
          skill,
        })
      }
      const reply = rpcValue(await api.sessions.prompt({
        sessionId: entry.sessionId,
        mode: behavior === 'steer' ? 'steer' : 'queue',
        content: [{ type: 'text', text: submittedText }],
        ...(command ? { commandOnly: true } : {}),
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }), '发送消息')
      if (command) {
        if (reply.command?.kind !== 'success') throw new Error('Z Host 未确认执行原生命令')
        const record = running.get(sessionKey)
        // RPC acknowledgement and mux delivery use independent transports.
        // Read the durable tail if the summary's usage has not arrived yet;
        // never borrow usage from a previous maintenance operation.
        if (record && !record.usage) {
          try {
            const history = rpcValue(await api.sessions.history({ sessionId: entry.sessionId, maxMessages: 10 }), '读取压缩用量')
            const summary = history?.events?.map(row => row.event).findLast(event =>
              event.type === 'compaction/summary' && event.time >= record.startedAt)
            if (summary) record.usage = normalizeTokenUsage(summary.data?.usage)
          } catch { /* Successful maintenance must not fail on optional accounting. */ }
        }
        const usage = record?.usage ? { ...record.usage, elapsedMs: Date.now() - record.startedAt } : null
        running.delete(sessionKey)
        if (emitLifecycle) emit(eventConversationId, webContents, { type: 'done', full: '', continuing: false })
        resolveTurn({ text: reply.command.text || '命令已执行。', thinking: '', usage, cancelled: false, command: true })
        return completed
      }
      const currentStats = stats.get(sessionKey) ?? {
        userMessages: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0,
      }
      currentStats.userMessages += 1
      stats.set(sessionKey, currentStats)
    } catch (error) {
      const turn = running.get(sessionKey)
      if (turn) {
        if (turn.reconcileTimer) clearTimeout(turn.reconcileTimer)
        running.delete(sessionKey)
        const partialResult = {
          turnId: turn.turnId,
          startedAt: turn.startedAt,
          text: turn.text,
          thinking: turn.thinking,
          fileChanges: Array.from(turn.fileChanges.values()).map((file) => ({
            path: file.path,
            ...(file.statsComplete ? { addedLines: file.addedLines, deletedLines: file.deletedLines } : {}),
            ...(file.isNewFile ? { isNewFile: true } : {}),
          })),
          usage: turn.usage,
        }
        if (error && typeof error === 'object') {
          error.partialResult ??= partialResult
          error.modelKey ??= turn.modelKey
        }
        if (emitLifecycle) emit(eventConversationId, webContents, {
          type: 'error',
          message: error.message || 'Z Host 未能接收本轮消息',
          turnId: turn.turnId,
          startedAt: turn.startedAt,
          full: turn.text,
          fullThinking: turn.thinking,
          fileChanges: partialResult.fileChanges,
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
      }
      if (command && !turn && emitLifecycle) {
        emit(eventConversationId, webContents, { type: 'error', message: error.message || 'Z Host 原生命令执行失败' })
      }
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
      cancellingSessions.add(id)
      try {
        // Drain every prompt admission that passed the send-side stopping
        // guard before issuing the Host's atomic clear+cancel. Otherwise a
        // queued prompt can be admitted just after cancel and wake a new turn.
        await Promise.allSettled([...turn.pendingPromptAdmissions])
        try {
          rpcValue(await api.sessions.cancel({
            sessionId: turn.sessionId,
            clearPendingUserInput: true,
          }), '停止 Z 会话')
        }
        catch (error) { if (error.code !== 'session-not-found') throw error }
        // Keep the queue-snapshot cleanup as a compatibility fallback for
        // older Hosts that may ignore clearPendingUserInput. The bundled Host
        // already cleared the user input atomically above.
        const pending = (queueSnapshots.get(id) ?? []).filter(item => ['queued', 'steering'].includes(item.placement))
        for (const item of pending) {
          try {
            rpcValue(await api.sessions.updateQueue({ sessionId: turn.sessionId, itemId: item.id, action: { kind: 'remove' } }), '取消待处理消息')
          } catch (error) {
            // An already claimed/removed occurrence is no longer queued.
            if (!['queue-item-not-found', 'session-not-found'].includes(error.code)) throw error
          }
        }
      } finally {
        cancellingSessions.delete(id)
      }
    }
    return stoppedAny
  }

  async function respondApproval(id, response) {
    if (response?.action === 'deny') return settleApproval(id, { action: 'deny' })
    if (response?.action === 'allow-once' || response?.action === 'allow') {
      return settleApproval(id, { action: 'allow-once' })
    }
    return false
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
      }), '读取 Z 会话历史')
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
   * 传入 `completedTurns` 时按「保留前 N 轮」精确切分；无法可靠换算就失败，
   * 不能退化为继承全部历史，否则模型会看到 UI 分支点之后的内容。
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
        if (turnEndSeqs.length < completedTurns) {
          return { ok: false, reason: 'fork-point-unavailable' }
        }
        atSeq = turnEndSeqs[completedTurns - 1]
      } catch (error) {
        return {
          ok: false,
          reason: 'fork-history-unavailable',
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
    let childSessionId
    try {
      const value = rpcValue(await api.sessions.fork({
        sessionId: source.sessionId,
        ...(atSeq === undefined ? {} : { atSeq }),
      }), '分叉 Z 会话')
      childSessionId = value?.sessionId ?? null
    } catch (error) {
      return { ok: false, reason: 'fork-failed', error: error instanceof Error ? error.message : String(error) }
    }
    if (!childSessionId) return { ok: false, reason: 'fork-failed' }
    const previousTarget = sessions.get(targetConversationId)
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
    try {
      // Persist the non-derivable child session mapping before reporting fork
      // success. If this write fails, the UI must not retain a branch whose
      // random Host session ID cannot be recovered after restart.
      await persistSessions()
    } catch (error) {
      if (previousTarget) sessions.set(targetConversationId, previousTarget)
      else dropSessionIndexes(targetConversationId)
      return {
        ok: false,
        reason: 'mapping-persist-failed',
        error: error instanceof Error ? error.message : String(error),
      }
    }
    const evicted = evictTrackedSessions({ protectKey: targetConversationId })
    if (evicted.length) {
      try { await persistSessions() }
      catch (error) {
        // Eviction is only a size optimization. Keep the successful fork and
        // its durable mapping even if pruning older derivable entries fails.
        console.warn('[dsh-chat-service] fork 后清理旧会话映射失败:', error instanceof Error ? error.message : error)
      }
    }
    return { ok: true, sessionId: childSessionId, atSeq: atSeq ?? null }
  }

  async function stop() {
    await rejectPendingApprovals({ reason: 'shutdown' })
    stopped = true
    reconnectAttempt = Z_MAX_RECONNECT_ATTEMPTS
    muxAbort?.abort()
    await muxTask?.catch(() => {})
    for (const [id, turn] of running) {
      finishTurn(id, turn, turn.eventConversationId ?? id, { reason: 'cancelled', continuing: false })
    }
    await hostManager.stop()
  }

  return {
    send,
    async runAgentTurn({ conversationId, sessionKey, text, modelKey, webContents, cwd, agentPreset = 'standard', taskId, signal, parentSessionId, progressOnly = false }) {
      if (signal?.aborted) throw new Error('任务已停止')
      const onAbort = () => {
        void abort(sessionKey).catch((error) => {
          emit(conversationId, webContents, {
            type: 'connection',
            state: 'reconnecting',
            message: `已收到停止请求，但 Host 暂未确认取消：${error instanceof Error ? error.message : String(error)}`,
          })
        })
      }
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
          parentSessionId,
          taskId,
          silentText: true,
          progressOnly,
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
    answerUserQuestion,
    cancelUserQuestion,
    rejectPendingApprovals,
    forgetConversation,
    forkConversation,
    stop,
    isBusy: (id) => running.has(id),
    isBusyAny: () => running.size > 0,
    getRunningConversationId: () => running.keys().next().value ?? null,
    listRunningConversationIds: () => [...running.keys()],
    getLiveContextUsage: (id) => liveUsage.get(id) ?? null,
    getSessionStatsSnapshot: async (id) => {
      // The renderer can request stats before chat:subscribeMux finishes. Load
      // the persisted session mapping and read its durable DSH projections
      // directly, instead of silently returning the per-process turn counter.
      await loadSessions()
      const current = stats.get(id)
      const mappedSession = sessions.get(id)
      const mappedSessionId = mappedSession?.sessionId ?? null
      const agentPreset = mappedSession?.agentPreset ?? null
      let projections = null
      if (mappedSessionId) {
        try {
          const api = await ensureReady()
          const history = rpcValue(await api.sessions.history({
            sessionId: mappedSessionId,
            maxMessages: 1,
          }), '读取 Z 会话投影')
          projections = history?.projections?.values ?? null
        } catch (error) {
          console.warn(
            '[dsh-chat-service] 直接读取 DSH 投影失败，回退到会话 Hub:',
            error instanceof Error ? error.message : String(error),
          )
          projections = await conversationHub?.getProjections?.(id, mappedSessionId) ?? null
        }
      } else {
        projections = await conversationHub?.getProjections?.(id) ?? null
      }
      const projectedStats = projections?.sessionStats
      const projectedUsage = projections?.tokenUsage
      const contextPressure = projections?.contextPressure
      if (!projectedStats && !projectedUsage && !contextPressure) {
        if (!current && !agentPreset) return null
        return {
          ...(current ?? {
            userMessages: 0,
            assistantMessages: 0,
            toolCalls: 0,
            toolResults: 0,
            tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            cost: 0,
          }),
          ...(agentPreset ? { agentPreset } : {}),
        }
      }

      // Client projection views are normally flat. Accept the persistence
      // state shape too, so version/runtime differences don't drop totals.
      const usageTotals = projectedUsage?.totals ?? projectedUsage
      const input = usageTotals?.uncachedInputTokens ?? current?.tokens.input ?? 0
      const output = usageTotals?.outputTokens ?? current?.tokens.output ?? 0
      const cacheRead = usageTotals?.cacheReadTokens ?? current?.tokens.cacheRead ?? 0
      const cacheWrite = usageTotals?.cacheWriteTokens ?? current?.tokens.cacheWrite ?? 0
      const projectedContextTokens = contextPressure?.projectedTokens ?? contextPressure?.pressureTokens
      const contextTokens = projectedContextTokens ?? current?.contextTokens
      const contextWindow = contextPressure?.contextWindow ?? current?.contextWindow
      const contextPercent = projectedContextTokens !== undefined && contextPressure?.contextWindow
        ? Math.round(projectedContextTokens / contextPressure.contextWindow * 100)
        : current?.contextPercent
      return {
        userMessages: projectedStats?.turns ?? current?.userMessages ?? 0,
        assistantMessages: projectedStats?.steps ?? current?.assistantMessages ?? 0,
        toolCalls: current?.toolCalls ?? 0,
        toolResults: current?.toolResults ?? 0,
        tokens: {
          input,
          output,
          cacheRead,
          cacheWrite,
          total: input + output + cacheRead + cacheWrite,
        },
        cost: current?.cost ?? 0,
        ...(agentPreset ? { agentPreset } : {}),
        ...(contextTokens === undefined ? {} : { contextTokens }),
        ...(contextWindow === undefined ? {} : { contextWindow }),
        ...(contextPercent === undefined ? {} : { contextPercent }),
      }
    },
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
      rpcValue(await api.sessions.updateQueue({ sessionId: entry.sessionId, itemId: item.id, action: operation }), '更新 Z 队列')
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
      const explicitReasoningEffort = await selectedReasoningEffort(config, modelKey)
      await ensureSessionModelSelection(api, conversationId, entry, config, explicitReasoningEffort)
      return { ok: true }
    },
    subscribeMux,
    unsubscribeMux,
    getSessionId: (conversationId) => sessions.get(conversationId)?.sessionId ?? null,
  }
}
