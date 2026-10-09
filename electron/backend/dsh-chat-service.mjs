import path from 'node:path'
import { rpcValue } from './dsh-chat/prelude.mjs'
import { createDshSessionMap } from './dsh-chat/session-map.mjs'
import { createDshSessionIndex } from './dsh-chat/session-index.mjs'
import { createDshMuxFanout } from './dsh-chat/mux-fanout.mjs'
import { createDshApprovalBridge } from './dsh-chat/approval-bridge.mjs'
import { createHandleEnvelope } from './dsh-chat/envelope-dispatch.mjs'
import { createFinishTurn } from './dsh-chat/finish-turn.mjs'
import { createSessionRecovery } from './dsh-chat/session-recovery.mjs'
import { createHostMuxRuntime } from './dsh-chat/mux-stream.mjs'
import { createDshModelConfigHelpers } from './dsh-chat/model-config.mjs'
import { createDshSessionRegistry } from './dsh-chat/session-registry.mjs'
import { createDshChatSend } from './dsh-chat/chat-send.mjs'

/** Bridges TaskWeaver's conversation contract to DSH's typed session API. */
export function createDshChatService({
  hostManager,
  userDataPath,
  getWorkspacePath,
  profileStore,
  modelService,
  appState = null,
  getPermissionMode = async () => 'ask',
  conversationHub = null,
  onTurnCompleted = null,
  logger = null,
  logApprovalEvent = null,
}) {
  const mapPath = path.join(userDataPath, 'taskweaver', 'dsh-session-map.json')
  const sessions = new Map()
  const pendingApprovals = new Map()
  const liveUsage = new Map()
  const queueSnapshots = new Map()
  const observedSequences = new Map()
  const running = new Map()
  const pendingQuestions = new Map()
  const cancellingSessions = new Set()
  /** @type {Map<string, Set<import('electron').WebContents>>} */
  const muxWatchers = new Map()
  const { loadSessions, persistSessions } = createDshSessionMap({ mapPath, sessions })
  const {
    conversationIdForSession,
    dropSessionIndexes,
    evictTrackedSessions,
  } = createDshSessionIndex({
    sessions,
    observedSequences,
    liveUsage,
    queueSnapshots,
    muxWatchers,
    running,
  })
  const { fanoutMuxFrame, subscribeMux, unsubscribeMux } = createDshMuxFanout({
    muxWatchers,
    conversationIdForSession,
  })

  /** @type {ReturnType<typeof createHostMuxRuntime> | null} */
  let hostMux = null

  const dshRuntime = {
    ensureReady: async () => {
      throw new Error('Z Host 尚未就绪')
    },
  }
  const {
    registerPendingApproval,
    settleApproval,
    rejectPendingApprovals,
    emitPermission,
    emitUserQuestion,
    answerUserQuestion,
    cancelUserQuestion,
    respondApproval,
  } = createDshApprovalBridge({
    pendingApprovals,
    pendingQuestions,
    getEnsureReady: () => dshRuntime.ensureReady(),
    hostManager,
    getReadyPromise: () => hostMux?.getReadyPromise() ?? null,
    logApprovalEvent,
    getPermissionMode,
  })

  function emit(conversationId, webContents, event) {
    if (!webContents || webContents.isDestroyed?.()) return
    try { webContents.send('chat:stream', { ...event, conversationId }) } catch { /* renderer may be closing */ }
  }

  const finishTurn = createFinishTurn({
    emit,
    liveUsage,
    running,
    modelService,
    onTurnCompleted,
  })

  let recoverSession = async () => {}
  const handleEnvelope = createHandleEnvelope({
    sessions,
    running,
    observedSequences,
    queueSnapshots,
    pendingQuestions,
    conversationHub,
    fanoutMuxFrame,
    registerPendingApproval,
    settleApproval,
    emitPermission,
    emitUserQuestion,
    getPermissionMode,
    emit,
    finishTurn,
    recoverSession: (...args) => recoverSession(...args),
  })

  const recovery = createSessionRecovery({
    observedSequences,
    running,
    emit,
    finishTurn,
    dispatchEnvelope: handleEnvelope,
    setReconnectAttempt: (n) => { hostMux?.setReconnectAttempt(n) },
    getStopped: () => hostMux?.getStopped() ?? false,
  })
  recoverSession = recovery.recoverSession
  const scheduleIdleHistoryReconciliation = recovery.scheduleIdleHistoryReconciliation
  const {
    alignLegacyComposerPreset,
    ensureSessionModelSelection,
    selectedReasoningEffort,
    ensurePermissionModeApplied,
    configureModel,
  } = createDshModelConfigHelpers({ sessions, persistSessions, profileStore, modelService })

  hostMux = createHostMuxRuntime({
    hostManager,
    conversationHub,
    sessions,
    running,
    emit,
    finishTurn,
    handleEnvelope,
  })
  const ensureReady = hostMux.ensureReady
  dshRuntime.ensureReady = ensureReady

  async function searchSessionContent(query) {
    const normalized = String(query ?? '').trim()
    if (!normalized) return { items: [], hasMore: false }
    await loadSessions()
    const api = await ensureReady()
    const page = rpcValue(await api.sessions.search(
      { query: normalized },
      new AbortController().signal,
    ), '搜索 Z 会话历史')
    const items = []
    for (const item of page?.items ?? []) {
      const conversationId = conversationIdForSession(item.sessionId)
      if (conversationId && typeof item.snippet === 'string') {
        items.push({ conversationId, snippet: item.snippet })
      }
    }
    return { items, hasMore: page?.hasMore === true }
  }
  appState?.setSessionSearch?.(searchSessionContent)


  const sessionRegistry = createDshSessionRegistry({
      sessions,
      loadSessions,
      persistSessions,
      evictTrackedSessions,
      dropSessionIndexes,
      muxWatchers,
      conversationHub,
      getWorkspacePath,
      getPermissionMode,
      alignLegacyComposerPreset,
      ensureReady,
      rejectPendingApprovals,
    })
    const { ensureSession, forgetConversation, forkConversation } = sessionRegistry

    const { send, abort } = createDshChatSend({
      ensureReady,
      ensureSession,
      getWorkspacePath,
      getPermissionMode,
      running,
      observedSequences,
      cancellingSessions,
      queueSnapshots,
      logger,
      emit,
      ensurePermissionModeApplied,
      configureModel,
      selectedReasoningEffort,
      ensureSessionModelSelection,
      scheduleIdleHistoryReconciliation,
    })
  async function stop() {
    await rejectPendingApprovals({ reason: 'shutdown' })
    await hostMux?.prepareShutdown()
    for (const [id, turn] of running) {
      finishTurn(id, turn, turn.eventConversationId ?? id, { reason: 'cancelled', continuing: false })
    }
    await hostManager.stop()
  }

  return {
    send,
    async runAgentTurn({ conversationId, sessionKey, text, modelKey, webContents, cwd, agentPreset = 'standard', taskId, signal, parentSessionId, progressOnly = false, permissionMode }) {
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
          permissionMode,
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
    listRunningConversationIds: () => [...running.keys()],
    getLiveContextUsage: (id) => liveUsage.get(id) ?? null,
    getSessionStatsSnapshot: async (id) => {
      // The renderer can request stats before chat:subscribeMux finishes. Load
      // the persisted session mapping and read its durable DSH projections
      // directly, instead of returning process-local cumulative counters.
      await loadSessions()
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
      const hasProjection = projectedStats !== undefined
        || projectedUsage !== undefined
        || contextPressure !== undefined
      if (!hasProjection && !agentPreset) return null

      // Client projection views are normally flat. Accept the persistence
      // state shape too, so version/runtime differences don't drop totals.
      const usageTotals = projectedUsage?.totals ?? projectedUsage
      const input = usageTotals?.uncachedInputTokens ?? 0
      const output = usageTotals?.outputTokens ?? 0
      const cacheRead = usageTotals?.cacheReadTokens ?? 0
      const cacheWrite = usageTotals?.cacheWriteTokens ?? 0
      const rawProjectedTokens = contextPressure?.projectedTokens ?? contextPressure?.pressureTokens
      let contextTokens = typeof rawProjectedTokens === 'number' ? rawProjectedTokens : null
      let contextWindow = contextPressure?.contextWindow ?? null
      if (contextTokens === null && appState?.getConversationState) {
        try {
          const convState = await appState.getConversationState(id)
          const lastAssistant = [...(convState?.messages ?? [])].reverse().find(m => m.author === 'orchestrator' && m.usage)
          if (lastAssistant?.usage) {
            const u = lastAssistant.usage
            const fallback = u.contextTokens || ((u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0))
            if (fallback > 0) {
              contextTokens = fallback
              if (!contextWindow && u.contextWindow) contextWindow = u.contextWindow
            }
          }
        } catch { /* ignore */ }
      }
      const contextPercent = contextTokens !== null && contextTokens !== undefined && contextWindow
        ? Math.round(contextTokens / contextWindow * 100)
        : null
      return {
        userMessages: projectedStats?.turns ?? 0,
        assistantMessages: projectedStats?.steps ?? 0,
        toolCalls: projectedStats?.toolCalls ?? 0,
        llmMs: projectedStats?.llmMs ?? 0,
        toolMs: projectedStats?.toolMs ?? 0,
        ttftMs: projectedStats?.ttftMs ?? 0,
        ttftSteps: projectedStats?.ttftSteps ?? 0,
        decodeMs: projectedStats?.decodeMs ?? 0,
        decodeTokens: projectedStats?.decodeTokens ?? 0,
        tokens: {
          input,
          output,
          cacheRead,
          cacheWrite,
          total: input + output + cacheRead + cacheWrite,
        },
        ...(agentPreset ? { agentPreset } : {}),
        contextTokens,
        contextWindow,
        contextPercent,
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
