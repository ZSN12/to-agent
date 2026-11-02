import { useCallback, useEffect, useReducer, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type {
  AppState,
  ChatStreamEvent,
  OrchestrationModeDecision,
  PromptQueueSnapshot,
  ToolTraceItem,
  WorkMode,
} from '../../../shared/app-api'
import type { ChatMessage } from '../../../types'
import {
  applyStreamBlockDelta,
  applyStreamEventToSnapshot,
  emptyConversationStream,
  type ConversationStreamSnapshot,
} from '../../chat/conversation-stream-buffer'
import { completedStreamMessage, endsConversationRun, mayResetStreamAfterReply } from '../../chat/conversation-run-lifecycle'
import { isCompactCommandText } from '../../../shared/context-compaction-policy'
import { shortStreamActivityLabel } from '../../chat/streamActivityLabel'
import { animationFrameScheduler, createFrameCoalescer } from '../../chat/stream-frame-coalescer'
import { clockLabelZh } from '../../../shared/time-label'
import { getBridge } from '../getBridge'
import {
  bridgeFailureMessage,
  reconcileRunningConversationIds,
  UncertainSendTracker,
} from './conversation-run-reliability'

function emptyPromptQueue(): PromptQueueSnapshot {
  return { steering: [], followUp: [] }
}

function orchestrationChoiceKey(conversationId: string | null, threadId: string | null) {
  return JSON.stringify([conversationId, threadId])
}

/** Token-rate copy updates; their React state is batched per frame. */
function isLiveCopyEvent(event: ChatStreamEvent): boolean {
  return event.type === 'delta' || event.type === 'block_delta' || event.type === 'thinking_delta'
}

export type ConversationRunRefs = {
  runningConversationsRef: MutableRefObject<Set<string>>
  conversationStartedAtRef: MutableRefObject<Map<string, number>>
  conversationTurnIdRef: MutableRefObject<Map<string, string>>
  conversationStreamRef: MutableRefObject<Map<string, ConversationStreamSnapshot>>
}

export type ConversationRunOptions = {
  bridgeReady: boolean
  state: AppState | null
  setState: Dispatch<SetStateAction<AppState | null>>
  setError: Dispatch<SetStateAction<string | null>>
  sending: boolean
  setSending: Dispatch<SetStateAction<boolean>>
  setStreamText: Dispatch<SetStateAction<string | null>>
  setStreamStartedAt: Dispatch<SetStateAction<number | null>>
  setStreamThinking: Dispatch<SetStateAction<{ text: string; durationMs?: number; isActive?: boolean } | null>>
  setStreamActivity: Dispatch<SetStateAction<string | null>>
  setStreamBlocks: Dispatch<SetStateAction<import('../../../types').AssistantContentBlock[]>>
  setToolTraces: Dispatch<SetStateAction<ToolTraceItem[]>>
  setPromptQueue: Dispatch<SetStateAction<PromptQueueSnapshot>>
  setRetryBanner: Dispatch<SetStateAction<{
    attempt: number
    maxAttempts?: number
    delayMs?: number
    message?: string
  } | null>>
  activeConversationIdRef: MutableRefObject<string | null>
  refreshSessionStats: (expectedConversationId?: string | null) => Promise<void>
  reload: () => Promise<boolean>
  markCompacted: (conversationId?: string | null) => void
  clearPendingCompaction: (conversationId?: string | null) => void
  setPendingCompactionIds: Dispatch<SetStateAction<string[]>>
  preferDshTranscript: boolean
  /**
   * Set to apply frame-queued stream copy immediately. Callers must invoke it
   * before switching the active conversation, whose restored snapshot already
   * contains every queued delta.
   */
  flushLiveCopyRef: MutableRefObject<() => void>
}

export function useConversationRun(options: ConversationRunOptions) {
  const {
    bridgeReady,
    state,
    setState,
    setError,
    sending,
    setSending,
    setStreamText,
    setStreamStartedAt,
    setStreamThinking,
    setStreamActivity,
    setStreamBlocks,
    setToolTraces,
    setPromptQueue,
    setRetryBanner,
    activeConversationIdRef,
    refreshSessionStats,
    reload,
    markCompacted,
    clearPendingCompaction,
    setPendingCompactionIds,
    preferDshTranscript,
    flushLiveCopyRef,
  } = options

  const reloadRef = useRef(reload)
  reloadRef.current = reload
  const runningConversationsRef = useRef(new Set<string>())
  const conversationStartedAtRef = useRef(new Map<string, number>())
  const conversationTurnIdRef = useRef(new Map<string, string>())
  const conversationStreamRef = useRef(new Map<string, ConversationStreamSnapshot>())
  const conversationRunEventVersionRef = useRef(new Map<string, number>())
  const sendInFlightConversationIdsRef = useRef(new Set<string>())
  const runningMessageDispatchRef = useRef<(
    behavior: 'steer' | 'followUp',
    text: string,
  ) => Promise<boolean | 'uncertain'>>(async () => false)
  const uncertainSendTrackerRef = useRef(new UncertainSendTracker())
  const uncertainNewConversationThreadsRef = useRef(new Set<string | null>())
  const runningSyncVersionRef = useRef(0)
  const appliedRunningSyncVersionRef = useRef(0)
  const [runningConversationIds, setRunningConversationIds] = useState<string[]>([])
  const [runningStatusReady, setRunningStatusReady] = useState(false)
  const [completedConversationIds, setCompletedConversationIds] = useState<string[]>([])
  const [, refreshOrchestrationChoices] = useReducer((version: number) => version + 1, 0)
  const pendingOrchestrationChoicesRef = useRef(new Map<string, {
    decision: OrchestrationModeDecision
    conversationId: string | null
    threadId: string | null
    text: string
    modelKey?: string
    skillName?: string
    workMode?: WorkMode
    attachments?: { id: string, mediaType: string, data: string, name: string }[]
    documents?: { id: string, name: string }[]
  }>())

  const syncRunningConversationIds = useCallback(() => {
    setRunningConversationIds([...runningConversationsRef.current])
  }, [])

  const isConversationRunning = useCallback((conversationId: string | null | undefined) => {
    return Boolean(conversationId && runningConversationsRef.current.has(conversationId))
  }, [])

  const syncRunningConversationsFromBackend = useCallback((ids: string[]) => {
    const backendRunning = new Set(ids)
    // reload() can finish after a newer stream event. Keep a locally observed
    // active run until the periodic, versioned reconciliation can confirm it.
    for (const localId of runningConversationsRef.current) backendRunning.add(localId)
    runningConversationsRef.current = backendRunning
    setRunningConversationIds([...backendRunning])
    setRunningStatusReady(true)
  }, [])

  const clearConversationRunState = useCallback((conversationId: string) => {
    runningConversationsRef.current.delete(conversationId)
    conversationStartedAtRef.current.delete(conversationId)
    conversationTurnIdRef.current.delete(conversationId)
    conversationStreamRef.current.delete(conversationId)
    setRunningConversationIds([...runningConversationsRef.current])
    clearPendingCompaction(conversationId)
    if (activeConversationIdRef.current !== conversationId) return
    setSending(false)
    setStreamStartedAt(null)
    setStreamText(null)
    setStreamThinking(null)
    setStreamActivity(null)
    setStreamBlocks([])
    setPromptQueue(emptyPromptQueue())
  }, [activeConversationIdRef, clearPendingCompaction, setPromptQueue, setSending, setStreamActivity, setStreamBlocks, setStreamStartedAt, setStreamText, setStreamThinking])

  const bumpConversationRunEventVersion = useCallback((conversationId: string) => {
    conversationRunEventVersionRef.current.set(
      conversationId,
      (conversationRunEventVersionRef.current.get(conversationId) ?? 0) + 1,
    )
  }, [])

  const markUncertainSendTranscriptConfirmed = useCallback((conversationId: string, expectedGeneration?: number) => {
    uncertainSendTrackerRef.current.confirmTranscript(
      conversationId,
      expectedGeneration,
      runningSyncVersionRef.current,
    )
  }, [])

  const markUncertainSendAfterSync = useCallback((conversationId: string) => {
    return uncertainSendTrackerRef.current.markUncertain(conversationId, runningSyncVersionRef.current)
  }, [])

  const clearUncertainSendGate = useCallback((conversationId: string) => {
    uncertainSendTrackerRef.current.clear(conversationId)
  }, [])

  const refs: ConversationRunRefs = {
    runningConversationsRef,
    conversationStartedAtRef,
    conversationTurnIdRef,
    conversationStreamRef,
  }

  useEffect(() => {
    if (!bridgeReady) return
    const bridge = getBridge()
    if (!bridge?.chat?.listRunningConversations) {
      setRunningStatusReady(true)
      return
    }

    const syncFromMain = async () => {
      const syncVersion = ++runningSyncVersionRef.current
      const eventVersionsAtRequest = new Map(conversationRunEventVersionRef.current)
      try {
        const res = await bridge.chat.listRunningConversations()
        if (!res.ok || !Array.isArray(res.data) || syncVersion < appliedRunningSyncVersionRef.current) return

        appliedRunningSyncVersionRef.current = syncVersion
        setRunningStatusReady(true)
        const localRunning = new Set(runningConversationsRef.current)
        const nextRunning = reconcileRunningConversationIds({
          localIds: localRunning,
          backendIds: new Set(res.data),
          eventVersionsAtRequest,
          currentEventVersions: conversationRunEventVersionRef.current,
          inFlightSendIds: sendInFlightConversationIdsRef.current,
          uncertainSendAfterSync: uncertainSendTrackerRef.current.toSyncVersionMap(),
          syncVersion,
        })
        const ghosts = [...localRunning].filter((id) => !nextRunning.has(id))

        runningConversationsRef.current = nextRunning
        setRunningConversationIds([...nextRunning])
        const activeConversationId = activeConversationIdRef.current
        if (activeConversationId && nextRunning.has(activeConversationId)) {
          setSending(true)
          if (!conversationStartedAtRef.current.has(activeConversationId)) {
            const startedAt = Date.now()
            conversationStartedAtRef.current.set(activeConversationId, startedAt)
            setStreamStartedAt(startedAt)
          }
        }
        for (const [conversationId, entry] of uncertainSendTrackerRef.current.entries()) {
          const generation = entry.generation
          if (!entry.transcriptConfirmed) {
            if (activeConversationIdRef.current === conversationId) {
              try {
                const transcriptApplied = await reloadRef.current()
                if (transcriptApplied && activeConversationIdRef.current === conversationId) {
                  markUncertainSendTranscriptConfirmed(conversationId, generation)
                }
              } catch {
                // Keep the duplicate-send guard until the durable transcript is readable.
              }
            }
            if (!uncertainSendTrackerRef.current.isTranscriptConfirmed(conversationId)) continue
          }
          const requiredSyncVersion = uncertainSendTrackerRef.current.getSyncVersion(conversationId)
          if (!uncertainSendTrackerRef.current.has(conversationId)) continue
          if (requiredSyncVersion === undefined || syncVersion <= requiredSyncVersion) continue
          clearUncertainSendGate(conversationId)
          clearPendingCompaction(conversationId)
          if (activeConversationIdRef.current === conversationId) {
            setError(nextRunning.has(conversationId)
              ? '发送请求状态未能确认；后台运行状态已确认，当前对话仍在运行。请勿重复提交这条消息。'
              : '后台当前没有活动运行。请先检查对话记录，再恢复草稿或重试。')
          }
        }

        if (ghosts.length > 0) {
          console.warn('[useConversationRun] 检测到幽灵对话状态，自动清理:', ghosts)
          for (const ghostId of ghosts) {
            const runChangedSinceSnapshot = (conversationRunEventVersionRef.current.get(ghostId) ?? 0)
              !== (eventVersionsAtRequest.get(ghostId) ?? 0)
            const newerSnapshotApplied = syncVersion < appliedRunningSyncVersionRef.current
            if (runChangedSinceSnapshot || newerSnapshotApplied) continue
            clearConversationRunState(ghostId)
          }
        }
      } catch {
        // Bridge loss is expected during a reconnect window. Keep local state
        // until a later successful snapshot can reconcile it.
      }
    }

    void syncFromMain()
    const intervalId = window.setInterval(() => { void syncFromMain() }, 5000)
    return () => clearInterval(intervalId)
  }, [bridgeReady, activeConversationIdRef, clearConversationRunState, clearUncertainSendGate, markUncertainSendTranscriptConfirmed, setSending, setStreamStartedAt])

  useEffect(() => {
    const conversationId = state?.conversationId
    const threadId = state?.currentThreadId ?? null
    if (!conversationId || !uncertainNewConversationThreadsRef.current.has(threadId)) return
    uncertainNewConversationThreadsRef.current.delete(threadId)
    markUncertainSendAfterSync(conversationId)
  }, [markUncertainSendAfterSync, state?.conversationId, state?.currentThreadId])

  useEffect(() => {
    const bridge = getBridge()
    const conversationId = state?.conversationId
    if (!bridge?.chat?.subscribeMux || !conversationId) return
    void bridge.chat.subscribeMux(conversationId)
    return () => {
      void bridge.chat.unsubscribeMux?.(conversationId)
    }
  }, [bridgeReady, state?.conversationId])

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge?.chat) return
    const liveCopy = createFrameCoalescer<ChatStreamEvent>(
      (events) => { for (const event of events) applyToActiveView(event) },
      animationFrameScheduler(),
    )
    const unsubscribe = bridge.chat.onStream((event: ChatStreamEvent) => {
      if ('taskId' in event && event.taskId && event.type !== 'tool') return
      const eventTurnId = 'turnId' in event ? event.turnId : undefined
      const activeTurnId = event.conversationId
        ? conversationTurnIdRef.current.get(event.conversationId)
        : undefined
      const terminalMatchesActiveTurn = !eventTurnId || !activeTurnId || eventTurnId === activeTurnId
      const endsRun = endsConversationRun(event) && terminalMatchesActiveTurn
      const liveCopyEvent = isLiveCopyEvent(event)
      if (!liveCopyEvent) liveCopy.flush()
      const completedMessage = completedStreamMessage(event)
      if (completedMessage) {
        setState((current) => {
          if (!current || current.conversationId !== event.conversationId) return current
          if (current.messages.some((message) => message.id === completedMessage.id)) return current
          return { ...current, messages: [...current.messages, completedMessage] }
        })
      }
      if (event.type === 'done' && event.interrupted && !event.turnId && event.conversationId) {
        const prior = conversationStreamRef.current.get(event.conversationId)
        const text = event.full.trim() || prior?.streamText?.trim() || ''
        const thinking = event.fullThinking?.trim() || prior?.streamThinking?.text?.trim() || ''
        if (text || thinking) {
          const timestamp = Date.now()
          const interruptedMessage: ChatMessage = {
            id: `interrupted-stream-${event.conversationId}-${timestamp}`,
            author: 'orchestrator',
            name: 'TaskWeaver',
            time: clockLabelZh(timestamp),
            timestamp,
            text,
            thinking: thinking || undefined,
            contentBlocks: event.contentBlocks?.length
              ? event.contentBlocks
              : prior?.streamBlocks.length ? prior.streamBlocks : undefined,
            interrupted: true,
          }
          setState((current) => {
            if (!current || current.conversationId !== event.conversationId) return current
            return { ...current, messages: [...current.messages, interruptedMessage] }
          })
        }
      }
      if (event.type === 'start' && event.conversationId) {
        bumpConversationRunEventVersion(event.conversationId)
        clearUncertainSendGate(event.conversationId)
        if (activeConversationIdRef.current === event.conversationId) {
          // A turn started in the conversation the user is already viewing, so
          // any stale completion marker for it is no longer unread.
          setCompletedConversationIds((current) => current.filter((id) => id !== event.conversationId))
        }
        const previousStream = conversationStreamRef.current.get(event.conversationId)
        const interruptedText = previousStream?.streamText?.trim() ?? ''
        const interruptedThinking = previousStream?.streamThinking?.text?.trim() ?? ''
        if (interruptedText || interruptedThinking) {
          const timestamp = Date.now()
          const interruptedMessage: ChatMessage = {
            id: `interrupted-stream-${event.conversationId}-${timestamp}`,
            author: 'orchestrator',
            name: 'TaskWeaver',
            time: clockLabelZh(timestamp),
            timestamp,
            text: interruptedText,
            thinking: interruptedThinking || undefined,
            contentBlocks: previousStream?.streamBlocks.length ? previousStream.streamBlocks : undefined,
            interrupted: true,
          }
          setState((current) => {
            if (!current || current.conversationId !== event.conversationId) return current
            if (current.messages.some((message) => message.id === interruptedMessage.id)) return current
            return { ...current, messages: [...current.messages, interruptedMessage] }
          })
        }
      }
      if (event.type === 'start' && event.conversationId) {
        runningConversationsRef.current.add(event.conversationId)
        if (event.turnId) conversationTurnIdRef.current.set(event.conversationId, event.turnId)
        else conversationTurnIdRef.current.delete(event.conversationId)
        syncRunningConversationIds()
        const startedAt = event.startedAt ?? Date.now()
        conversationStartedAtRef.current.set(event.conversationId, startedAt)
        if (activeConversationIdRef.current === event.conversationId) {
          setSending(true)
          setStreamStartedAt(startedAt)
        }
      }
      if (endsRun && event.conversationId) {
        bumpConversationRunEventVersion(event.conversationId)
        clearUncertainSendGate(event.conversationId)
      }
      if (endsRun) clearPendingCompaction(event.conversationId ?? activeConversationIdRef.current)
      if (endsRun && event.conversationId) {
        // The stream terminal event is authoritative that this send has been
        // admitted and completed. IPC may resolve later while post-turn hooks
        // and projections settle; that tail must not lock the next draft.
        sendInFlightConversationIdsRef.current.delete(event.conversationId)
        runningConversationsRef.current.delete(event.conversationId)
        syncRunningConversationIds()
        if (event.type === 'done') {
          const completedConversationId = event.conversationId
          const wasActiveConversation = activeConversationIdRef.current === completedConversationId
          setCompletedConversationIds((current) => {
            if (wasActiveConversation) {
              return current.filter((id) => id !== completedConversationId)
            }
            return current.includes(completedConversationId)
              ? current
              : [...current, completedConversationId]
          })
        }
        conversationStartedAtRef.current.delete(event.conversationId)
        conversationTurnIdRef.current.delete(event.conversationId)
        conversationStreamRef.current.delete(event.conversationId)
        if (activeConversationIdRef.current === event.conversationId) {
          setSending(false)
          setStreamStartedAt(null)
        }
      }
      if (endsRun && !event.conversationId && activeConversationIdRef.current) {
        const endedConversationId = activeConversationIdRef.current
        bumpConversationRunEventVersion(endedConversationId)
        clearUncertainSendGate(endedConversationId)
        sendInFlightConversationIdsRef.current.delete(endedConversationId)
        runningConversationsRef.current.delete(endedConversationId)
        syncRunningConversationIds()
        conversationStartedAtRef.current.delete(endedConversationId)
        conversationTurnIdRef.current.delete(endedConversationId)
        conversationStreamRef.current.delete(endedConversationId)
        setSending(false)
        setStreamStartedAt(null)
      }

      if (event.type === 'role_progress' && event.assistantMessage && event.conversationId) {
        const assistantMessage = event.assistantMessage
        setState((current) => {
          if (!current || current.conversationId !== event.conversationId) return current
          if (current.messages.some((message) => message.id === assistantMessage.id)) return current
          return { ...current, messages: [...current.messages, assistantMessage] }
        })
      }

      if (event.type === 'role_progress' && event.status === 'started' && event.conversationId
        && event.streamToRenderer !== false) {
        // Each Bot owns a separate transient DSH stream. Its finalized answer
        // is committed to the transcript by the completion event above before
        // the next speaker gets a fresh live projection.
        conversationStreamRef.current.set(event.conversationId, emptyConversationStream())
        if (activeConversationIdRef.current === event.conversationId) {
          setStreamStartedAt(Date.now())
          setStreamText('')
          setStreamThinking(null)
          setStreamActivity(null)
          setStreamBlocks([])
          setToolTraces([])
        }
      }

      const bufferable = event.type !== 'compaction'
        && event.type !== 'retry'
        && event.type !== 'tasks'
        && event.type !== 'orchestration'
        && event.type !== 'model_route'
      if (event.conversationId && bufferable) {
        const prev = conversationStreamRef.current.get(event.conversationId) ?? emptyConversationStream()
        const next = applyStreamEventToSnapshot(prev, event)
        conversationStreamRef.current.set(event.conversationId, next)
        if (event.type === 'start' && event.conversationId === activeConversationIdRef.current) {
          setToolTraces(next.toolTraces)
        }
      }
      if (event.conversationId && event.conversationId !== activeConversationIdRef.current) return
      if (liveCopyEvent) liveCopy.push(event)
      else applyToActiveView(event, completedMessage)
    })
    flushLiveCopyRef.current = liveCopy.flush

    function applyToActiveView(event: ChatStreamEvent, completedMessage: ChatMessage | null = null) {
      if (event.conversationId && event.conversationId !== activeConversationIdRef.current) return

      if (event.type === 'thinking_start') {
        setStreamActivity(null)
        setStreamThinking((prev) => {
          if (prev?.text?.trim()) return { text: prev.text, durationMs: prev.durationMs ?? 0, isActive: true }
          return { text: '', durationMs: prev?.durationMs ?? 0, isActive: true }
        })
      }
      if (event.type === 'thinking_delta') {
        setStreamActivity(null)
        setStreamThinking((prev) => ({
          text: event.fullThinking ?? `${prev?.text ?? ''}${event.delta ?? ''}`,
          durationMs: event.durationMs ?? prev?.durationMs,
          isActive: true,
        }))
      }
      if (event.type === 'thinking_end') {
        setStreamThinking((prev) => ({
          text: event.fullThinking ?? prev?.text ?? '',
          durationMs: event.durationMs ?? prev?.durationMs,
          isActive: false,
        }))
      }
      if (event.type === 'activity') setStreamActivity(shortStreamActivityLabel(event.message ?? null))
      if (event.type === 'connection') {
        setStreamActivity(shortStreamActivityLabel(event.message))
        if (event.state === 'restored') setError(null)
        else if (event.state === 'unavailable') setError(event.message)
      }
      if (event.type === 'delta') {
        setStreamActivity(null)
        setStreamText((prev) => event.full ?? `${prev ?? ''}${event.delta ?? ''}`)
        setStreamThinking((prev) => (prev ? { ...prev, isActive: false } : prev))
      }
      if (event.type === 'done') {
        setStreamText(completedMessage ? null : event.full)
        if (completedMessage) {
          setStreamThinking(null)
          setStreamBlocks([])
          setStreamActivity(null)
        } else if (event.fullThinking && String(event.fullThinking).trim()) {
          setStreamThinking((prev) => ({
            text: String(event.fullThinking),
            durationMs: event.thinkingDurationMs ?? prev?.durationMs,
          }))
        }
        if (!completedMessage && event.contentBlocks?.length) {
          setStreamBlocks(event.contentBlocks)
        }
        if (!event.continuing) setPromptQueue(emptyPromptQueue())
        void refreshSessionStats()
      }
      if (event.type === 'error') {
        setError(event.message)
        if (completedMessage) {
          setStreamText(null)
          setStreamThinking(null)
          setStreamBlocks([])
          setStreamActivity(null)
        }
        setPromptQueue(emptyPromptQueue())
        void refreshSessionStats()
      }
      if (event.type === 'blocks') {
        setStreamBlocks(event.segments)
      }
      if (event.type === 'block_delta') {
        setStreamBlocks((current) => applyStreamBlockDelta(current, event))
      }
      if (event.type === 'start') {
        setStreamText('')
        setStreamThinking(null)
        setStreamActivity(null)
        setStreamBlocks([])
        setPromptQueue(emptyPromptQueue())
      }
      if (event.type === 'queue_update') {
        setPromptQueue({
          steering: Array.from(new Set(event.steering || [])),
          followUp: Array.from(new Set(event.followUp || [])),
        })
      }
      if (event.type === 'steering_queued') {
        setPromptQueue((current) => ({
          ...current,
          steering: Array.from(new Set([...current.steering, event.text])),
        }))
      }
      if (event.type === 'followup_queued') {
        setPromptQueue((current) => ({
          ...current,
          followUp: Array.from(new Set([...current.followUp, event.text])),
        }))
      }
      if (event.type === 'tasks') setState((current) => (current ? { ...current, tasks: event.tasks } : current))
      if (event.type === 'progress') setStreamText(event.text)
      if (event.type === 'tool') {
        if (event.status === 'running') {
          setStreamActivity(null)
          setStreamThinking((prev) => (prev ? { ...prev, isActive: false } : prev))
        } else {
          setStreamActivity('工具已返回，模型正在继续')
        }
        setToolTraces((current) => {
          const key = (item: ToolTraceItem) => `${item.taskId ?? 'main'}:${item.id}`
          const index = current.findIndex((item) => key(item) === key(event))
          if (index < 0) return [...current, event].slice(-80)
          const updated = [...current]
          updated[index] = { ...updated[index], ...event }
          return updated
        })
      }
      if (event.type === 'compaction') {
        markCompacted(event.conversationId ?? activeConversationIdRef.current)
        const compactId = event.id ?? `compact-${Date.now()}`
        const time = clockLabelZh()
        const entry: ChatMessage = {
          id: compactId,
          author: 'orchestrator',
          name: 'TaskWeaver',
          time,
          timestamp: Date.now(),
          text: '',
          compaction: {
            automatic: event.automatic,
            summary: event.summary,
            tokensBefore: event.tokensBefore ?? null,
          },
        }
        setState((current) => {
          if (!current) return current
          if (current.messages.some((m) => m.id === compactId)) return current
          return { ...current, messages: [...current.messages, entry] }
        })
        void refreshSessionStats()
      }
      if (event.type === 'retry') {
        if (event.phase === 'start') {
          setRetryBanner({
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delayMs: event.delayMs,
            message: event.message,
          })
        } else {
          setRetryBanner(null)
        }
      }
    }

    return () => {
      unsubscribe()
      // Deliver, never drop, queued copy: a dependency change mid-stream would
      // otherwise lose deltas that the next subscription cannot replay.
      liveCopy.flush()
      liveCopy.dispose()
      if (flushLiveCopyRef.current === liveCopy.flush) flushLiveCopyRef.current = () => {}
    }
  }, [
    refreshSessionStats,
    syncRunningConversationIds,
    preferDshTranscript,
    markCompacted,
    clearPendingCompaction,
    activeConversationIdRef,
    setState,
    setError,
    setSending,
    setStreamStartedAt,
    setStreamActivity,
    setStreamBlocks,
    setStreamText,
    setStreamThinking,
    setToolTraces,
    setPromptQueue,
    setRetryBanner,
    bumpConversationRunEventVersion,
    clearUncertainSendGate,
  ])

  useEffect(() => {
    if (!sending) return
    const bridge = getBridge()
    if (!bridge?.chat?.getSessionStats) return
    let active = true
    let timer: number | null = null
    const poll = async () => {
      const expectedConversationId = activeConversationIdRef.current
      try {
        await refreshSessionStats(expectedConversationId)
      } catch {
        // A transient stats read must not interrupt an active conversation.
      }
      if (active) timer = window.setTimeout(() => { void poll() }, 2000)
    }
    timer = window.setTimeout(() => { void poll() }, 2000)
    return () => {
      active = false
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [sending, activeConversationIdRef, refreshSessionStats])

  const sendMessage = useCallback(
    async (
      text: string,
      modelKey?: string,
      skillName?: string,
      executionModeOverride?: 'single-agent' | 'multi-agent',
      workMode?: WorkMode,
      attachments?: { id: string, mediaType: string, data: string, name: string }[],
      documents?: { id: string, name: string }[],
    ) => {
      const bridge = getBridge()
      if (!bridge?.chat) {
        setError('聊天后端不可用')
        return false
      }
      const sendConversationId = activeConversationIdRef.current
      const sendLockId = sendConversationId ?? '__new-conversation__'
      const hasSubmissionInFlight = sendInFlightConversationIdsRef.current.has(sendLockId)
      let effectiveExecutionModeOverride = executionModeOverride
      const shouldClassify = !hasSubmissionInFlight
        && !executionModeOverride
        && !['goal', 'plan'].includes(workMode ?? 'code')
        && Boolean(text.trim())
        && !/^\s*\//.test(text)
      const sendThreadId = state?.currentThreadId ?? null
      const pendingChoiceKey = orchestrationChoiceKey(sendConversationId, sendThreadId)
      if (shouldClassify && bridge.chat.classifyOrchestration) {
        if (pendingOrchestrationChoicesRef.current.has(pendingChoiceKey)) {
          setError('请先选择本条任务的执行模式。')
          return false
        }
        let classification
        try {
          classification = await bridge.chat.classifyOrchestration({
            text,
            skillName: skillName ?? null,
            workMode: workMode ?? 'code',
            conversationId: sendConversationId,
          })
        } catch (error) {
          setError(bridgeFailureMessage('判断任务编排模式', error))
          return false
        }
        if (!classification.ok) {
          setError(classification.error)
          return false
        }
        const decision = classification.data
        if (decision.mode === 'ask-user') {
          const pending = {
            decision,
            conversationId: sendConversationId,
            threadId: sendThreadId,
            text,
            modelKey,
            skillName,
            workMode,
            attachments,
            documents,
          }
          pendingOrchestrationChoicesRef.current.set(pendingChoiceKey, pending)
          refreshOrchestrationChoices()
          setError(null)
          return true
        }
        effectiveExecutionModeOverride = decision.mode
      }
      if (sendConversationId && uncertainNewConversationThreadsRef.current.has(sendThreadId)) {
        // Transfer the new-thread uncertainty to its durable conversation ID.
        // The transcript must be read before a later running snapshot can
        // release the retry guard.
        markUncertainSendAfterSync(sendConversationId)
        uncertainNewConversationThreadsRef.current.delete(sendThreadId)
      }
      if (!sendConversationId && uncertainNewConversationThreadsRef.current.has(sendThreadId)) {
        if (activeConversationIdRef.current === sendConversationId) {
          setError('新会话的上一条消息状态仍未确认。请先刷新并核对会话记录，获得会话ID后再恢复草稿。')
        }
        return false
      }
      if (sendConversationId && uncertainSendTrackerRef.current.has(sendConversationId)) {
        if (activeConversationIdRef.current === sendConversationId) {
          setError('上一条消息的请求状态仍未确认。正在等待连接恢复并同步运行状态，请检查对话后再试。')
        }
        return false
      }
      if (sendInFlightConversationIdsRef.current.has(sendLockId)) {
        const stream = sendConversationId ? conversationStreamRef.current.get(sendConversationId) : null
        const hasStartedRun = Boolean(sendConversationId && runningConversationsRef.current.has(sendConversationId))
          && Boolean(sendConversationId && (
            conversationTurnIdRef.current.has(sendConversationId)
            || stream?.streamText?.trim()
            || stream?.streamThinking?.text?.trim()
            || stream?.streamBlocks.length
            || stream?.toolTraces.length
          ))
        if (sendConversationId && hasStartedRun && !/^\s*\//.test(text)) {
          if ((attachments?.length ?? 0) > 0 || (documents?.length ?? 0) > 0) {
            if (activeConversationIdRef.current === sendConversationId) {
              setError('任务运行期间暂不支持追加附件，请等待本轮完成后再发送。')
            }
            return false
          }
          const isRoleConversation = state?.conversationId === sendConversationId
            && state.messages.some((message) => message.roleMode)
          if (activeConversationIdRef.current === sendConversationId) setError(null)
          return runningMessageDispatchRef.current(isRoleConversation ? 'steer' : 'followUp', text)
        }
        if (activeConversationIdRef.current === sendConversationId) setError('上一条消息仍在提交，请稍候。')
        return false
      }
      sendInFlightConversationIdsRef.current.add(sendLockId)
      const runEventVersionAtSend = sendConversationId
        ? conversationRunEventVersionRef.current.get(sendConversationId) ?? 0
        : 0
      const time = clockLabelZh()
      const optimisticMessage: ChatMessage = {
        id: `optimistic-u-${crypto.randomUUID()}`,
        author: 'user',
        name: '你',
        time,
        text,
      }
      const removeOptimisticMessage = () => {
        setState((current) => {
          if (!current || (sendConversationId && current.conversationId !== sendConversationId)) return current
          const messages = current.messages.filter((message) => message.id !== optimisticMessage.id)
          return messages.length === current.messages.length ? current : { ...current, messages }
        })
      }
      const runAlreadyActive = Boolean(sendConversationId && runningConversationsRef.current.has(sendConversationId))
      if (sendConversationId) {
        runningConversationsRef.current.add(sendConversationId)
        syncRunningConversationIds()
      }
      const optimisticStartedAt = (sendConversationId && sending ? conversationStartedAtRef.current.get(sendConversationId) : null) ?? Date.now()
      if (sendConversationId) conversationStartedAtRef.current.set(sendConversationId, optimisticStartedAt)
      setStreamStartedAt(optimisticStartedAt)
      setState((current) => {
        if (current) {
          if (sendConversationId && current.conversationId !== sendConversationId) return current
          return { ...current, messages: [...current.messages, optimisticMessage] }
        }
        return {
          workspacePath: state?.workspacePath ?? null,
          conversationId: sendConversationId ?? '',
          threadTitle: '',
          currentThreadId: state?.currentThreadId ?? '',
          threads: state?.threads ?? [],
          messages: [optimisticMessage],
          modelKey: modelKey ?? state?.modelKey ?? null,
          thinkingLevel: state?.thinkingLevel ?? null,
          permissionMode: state?.permissionMode ?? 'ask',
          tasks: state?.tasks ?? [],
          outputLogs: [],
        }
      })
      setSending(true)
      if (!sending) {
        setStreamText(null)
        setStreamThinking(null)
        setStreamBlocks([])
        setToolTraces([])
        setPromptQueue(emptyPromptQueue())
      }
      setError(null)
      const isCompact = !runAlreadyActive && isCompactCommandText(text)
      if (isCompact && sendConversationId) {
        setPendingCompactionIds((current) => (current.includes(sendConversationId) ? current : [...current, sendConversationId]))
      }
      const mappedAttachments = attachments ? attachments.map(({ mediaType, data, name }) => ({ mediaType, data, name })) : null
      const documentIds = documents?.map(({ id }) => id) ?? null
      let res: Awaited<ReturnType<NonNullable<typeof bridge.chat.send>>>
      try {
        res = await Promise.resolve().then(() => bridge.chat!.send(
          text,
          modelKey ?? null,
          skillName ?? null,
          effectiveExecutionModeOverride ?? null,
          workMode ?? 'code',
          sendConversationId,
          mappedAttachments,
          documentIds,
        )).finally(() => {
          sendInFlightConversationIdsRef.current.delete(sendLockId)
        })
      } catch (error) {
        let uncertainGeneration: number | undefined
        if (sendConversationId) {
          uncertainGeneration = markUncertainSendAfterSync(sendConversationId)
        } else {
          uncertainNewConversationThreadsRef.current.add(sendThreadId)
        }
        removeOptimisticMessage()
        const eventVersionNow = sendConversationId
          ? conversationRunEventVersionRef.current.get(sendConversationId) ?? 0
          : runEventVersionAtSend
        const streamAtFailure = sendConversationId
          ? conversationStreamRef.current.get(sendConversationId)
          : undefined
        const hasStreamEvidence = Boolean(
          streamAtFailure?.streamText?.trim()
          || streamAtFailure?.streamThinking?.text?.trim()
          || streamAtFailure?.streamBlocks.length
          || streamAtFailure?.toolTraces.length,
        )
        const hasActiveRunEvidence = Boolean(sendConversationId && runningConversationsRef.current.has(sendConversationId))
          && (runAlreadyActive || eventVersionNow !== runEventVersionAtSend || hasStreamEvidence)
        if (!hasActiveRunEvidence) {
          if (sendConversationId) clearPendingCompaction(sendConversationId)
          if (sendConversationId) {
            runningConversationsRef.current.delete(sendConversationId)
            conversationStartedAtRef.current.delete(sendConversationId)
            conversationTurnIdRef.current.delete(sendConversationId)
            conversationStreamRef.current.delete(sendConversationId)
            setRunningConversationIds([...runningConversationsRef.current])
          }
          if (activeConversationIdRef.current === sendConversationId) {
            setSending(false)
            setStreamStartedAt(null)
            setStreamText(null)
            setStreamThinking(null)
            setStreamBlocks([])
            setStreamActivity(null)
            setPromptQueue(emptyPromptQueue())
          }
        }
        if (activeConversationIdRef.current === sendConversationId) {
          const errorMessage = bridgeFailureMessage('发送', error)
          setError(hasActiveRunEvidence
            ? `${errorMessage}当前对话仍有运行证据；状态确认前请勿重复提交这条消息。`
            : sendConversationId
              ? `${errorMessage}已停止普通发送指示器。`
              : `${errorMessage}当前尚未获得会话ID；请先刷新并核对新会话，获得会话ID后再恢复草稿。`)
        }
        if (sendConversationId) {
          // Refresh the durable transcript so the user can check whether the
          // request reached the backend. reload() fences results to its active
          // conversation; reapply the uncertainty notice after it clears errors.
          const publishRecoveryNotice = () => {
            if (activeConversationIdRef.current !== sendConversationId) return
            const stillRunning = runningConversationsRef.current.has(sendConversationId)
            setError(stillRunning
              ? '发送请求状态仍未确认。已尝试刷新当前对话记录，但后台运行状态仍在；请勿重复提交这条消息。'
              : '发送请求状态仍未确认，正在等待连接恢复。已停止普通发送指示器；已尝试刷新当前对话记录，请检查是否已有这条消息再恢复草稿或重试。')
          }
          void Promise.resolve().then(() => {
            if (activeConversationIdRef.current !== sendConversationId) return
            return reload()
          }).then((transcriptApplied) => {
            if (transcriptApplied === true && activeConversationIdRef.current === sendConversationId) {
              markUncertainSendTranscriptConfirmed(sendConversationId, uncertainGeneration)
            }
            publishRecoveryNotice()
          }).catch(publishRecoveryNotice).catch(() => {
            // An unavailable reload must not turn an uncertain send into an
            // unhandled rejection or overwrite the more specific send error.
          })
        }
        if (sendConversationId) {
          const eventVersionAtProbe = eventVersionNow
          void Promise.resolve().then(() => bridge.chat!.listRunningConversations!()).then((status) => {
            if (!status.ok || !Array.isArray(status.data)) return
            if ((conversationRunEventVersionRef.current.get(sendConversationId) ?? 0) !== eventVersionAtProbe) return
            const backendRunning = status.data.includes(sendConversationId)
            if (backendRunning) {
              runningConversationsRef.current.add(sendConversationId)
              setRunningConversationIds([...runningConversationsRef.current])
              if (activeConversationIdRef.current === sendConversationId) {
                setSending(true)
                if (!conversationStartedAtRef.current.has(sendConversationId)) {
                  const startedAt = Date.now()
                  conversationStartedAtRef.current.set(sendConversationId, startedAt)
                  setStreamStartedAt(startedAt)
                }
                setError('发送请求状态未能确认；后台运行状态已确认，当前对话仍在运行。请勿重复提交这条消息。')
              }
            } else {
              runningConversationsRef.current.delete(sendConversationId)
              conversationStartedAtRef.current.delete(sendConversationId)
              conversationTurnIdRef.current.delete(sendConversationId)
              conversationStreamRef.current.delete(sendConversationId)
              setRunningConversationIds([...runningConversationsRef.current])
              clearPendingCompaction(sendConversationId)
              if (activeConversationIdRef.current === sendConversationId) {
                setSending(false)
                setStreamStartedAt(null)
                setError('后台当前没有活动运行。请先检查对话记录，再恢复草稿或重试。')
              }
            }
          }).catch(() => {
            // Keep the request marked uncertain. The periodic poll retries after reconnection.
          })
        }
        return 'uncertain'
      }
      if (!res.ok) {
        const stillRunning = Boolean(sendConversationId && runningConversationsRef.current.has(sendConversationId))
        const newerTurn = res.turnId && stillRunning && conversationTurnIdRef.current.get(sendConversationId!) !== res.turnId
        const rejectedAdmission = !res.turnId && runAlreadyActive && stillRunning
        const newerRunObserved = Boolean(
          sendConversationId
          && stillRunning
          && (conversationRunEventVersionRef.current.get(sendConversationId) ?? 0) !== runEventVersionAtSend,
        )
        if (newerTurn || rejectedAdmission || res.runContinues || newerRunObserved) {
          removeOptimisticMessage()
          if (activeConversationIdRef.current === sendConversationId) setError(res.error)
          return false
        }
        if (isCompact) clearPendingCompaction(sendConversationId)
        removeOptimisticMessage()
        if (sendConversationId) clearConversationRunState(sendConversationId)
        if (activeConversationIdRef.current === sendConversationId) {
          if (runningConversationsRef.current.size === 0) {
            try {
              await reload()
            } catch {
              // Keep the explicit send error visible even when reload also fails.
            }
          }
          setError(res.error)
        }
        return false
      }
      if (isCompact) clearPendingCompaction(sendConversationId)
      if (activeConversationIdRef.current === sendConversationId) {
        const committedMessages = [res.data.user, res.data.assistant].filter(
          (message): message is ChatMessage => Boolean(message),
        )
        if (committedMessages.length > 0) {
          setState((current) => {
            if (!current || current.conversationId !== sendConversationId) return current
            const committedIds = new Set(committedMessages.map((message) => message.id))
            const nextMessages = current.messages.filter((message) =>
              message.id !== optimisticMessage.id && !committedIds.has(message.id),
            )
            return { ...current, messages: [...nextMessages, ...committedMessages] }
          })
          if (res.data.assistant?.compaction || res.data.assistant?.usageKind === 'compaction') {
            markCompacted(sendConversationId)
            void refreshSessionStats(sendConversationId)
          }
        } else if (!res.data.accepted) {
          await reload()
        }
        if (mayResetStreamAfterReply(res.data.accepted, Boolean(sendConversationId && runningConversationsRef.current.has(sendConversationId)))) {
          setSending(false)
          setStreamText(null)
          setStreamThinking(null)
          setStreamBlocks([])
          setStreamActivity(null)
        }
      }
      return true
    },
    [
      reload,
      refreshSessionStats,
      syncRunningConversationIds,
      markUncertainSendAfterSync,
      markUncertainSendTranscriptConfirmed,
      sending,
      markCompacted,
      clearPendingCompaction,
      state,
      activeConversationIdRef,
      setState,
      setError,
      setSending,
      setStreamStartedAt,
      setStreamText,
      setStreamThinking,
      setStreamBlocks,
      setStreamActivity,
      setToolTraces,
      setPromptQueue,
      setPendingCompactionIds,
      clearConversationRunState,
      refreshOrchestrationChoices,
    ],
  )

  const respondToOrchestrationChoice = useCallback(async (choice: 'single-agent' | 'multi-agent') => {
    const conversationId = activeConversationIdRef.current
    const threadId = state?.currentThreadId ?? null
    const key = orchestrationChoiceKey(conversationId, threadId)
    const pending = pendingOrchestrationChoicesRef.current.get(key)
    if (!pending) return false
    if (conversationId !== pending.conversationId || threadId !== pending.threadId) {
      setError('对话已切换；请返回原对话后再选择执行模式。')
      return false
    }
    pendingOrchestrationChoicesRef.current.delete(key)
    refreshOrchestrationChoices()
    const accepted = await sendMessage(
      pending.text,
      pending.modelKey,
      pending.skillName,
      choice,
      pending.workMode,
      pending.attachments,
      pending.documents,
    )
    if (!accepted) {
      pendingOrchestrationChoicesRef.current.set(key, pending)
      refreshOrchestrationChoices()
      return false
    }
    return true
  }, [activeConversationIdRef, refreshOrchestrationChoices, sendMessage, setError, state?.currentThreadId])

  const sendAsRoles = useCallback(async (
    text: string,
    roleIds: string[],
    attachments?: { id: string; mediaType: string; data: string; name: string }[],
    documents?: { id: string; name: string }[],
    options: { discussionStrategy?: 'relay' | 'independent'; summarize?: boolean } = {},
  ) => {
    const bridge = getBridge()
    if (!bridge?.chat?.sendAsRoles) {
      setError('角色对话后端不可用，请重启 TaskWeaver 后重试。')
      return false
    }
    const conversationId = activeConversationIdRef.current
    if (!conversationId) {
      setError('当前对话尚未准备好，请稍后重试。')
      return false
    }
    if (roleIds.length < 1 || roleIds.length > 5) {
      setError('请为本轮选择 1 到 5 个角色。')
      return false
    }
    if (runningConversationsRef.current.has(conversationId)
      || sendInFlightConversationIdsRef.current.has(conversationId)) {
      setError('当前对话仍在处理中，请等待本轮完成。')
      return false
    }

    sendInFlightConversationIdsRef.current.add(conversationId)
    const optimisticTimestamp = Date.now()
    const optimisticMessage: ChatMessage = {
      id: `optimistic-role-u-${crypto.randomUUID()}`,
      author: 'user',
      name: '你',
      time: clockLabelZh(optimisticTimestamp),
      timestamp: optimisticTimestamp,
      text,
      roleMode: true,
      roleDiscussionStrategy: options.discussionStrategy ?? 'relay',
      ...(options.summarize ? { roleSummaryRequested: true } : {}),
    }
    const removeOptimisticMessage = () => {
      setState((current) => current?.conversationId === conversationId
        ? { ...current, messages: current.messages.filter((message) => message.id !== optimisticMessage.id) }
        : current)
    }
    const recoverFailedSend = async (failureMessage: string) => {
      removeOptimisticMessage()
      if (activeConversationIdRef.current !== conversationId) return
      try {
        await reload()
      } catch {
        // Keep the send failure visible if transcript recovery also fails.
      }
      if (activeConversationIdRef.current === conversationId) setError(failureMessage)
    }
    setState((current) => current?.conversationId === conversationId
      ? { ...current, messages: [...current.messages, optimisticMessage] }
      : current)
    runningConversationsRef.current.add(conversationId)
    syncRunningConversationIds()
    const startedAt = Date.now()
    conversationStartedAtRef.current.set(conversationId, startedAt)
    setStreamStartedAt(startedAt)
    setStreamText(null)
    setStreamThinking(null)
    setStreamBlocks([])
    setToolTraces([])
    setPromptQueue(emptyPromptQueue())
    setSending(true)
    setError(null)

    try {
      const result = await bridge.chat.sendAsRoles({
        text,
        roleIds,
        conversationId,
        discussionStrategy: options.discussionStrategy ?? 'relay',
        summarize: options.summarize ?? false,
        attachments: attachments?.map(({ mediaType, data, name }) => ({ mediaType, data, name })) ?? null,
        documentIds: documents?.map(({ id }) => id) ?? null,
      })
      if (!result.ok) {
        await recoverFailedSend(result.error ?? '发送角色消息失败')
        return false
      }

      if (activeConversationIdRef.current === conversationId) {
        const committedMessages = [result.data.user, ...(result.data.assistants ?? [])].filter(
          (message): message is ChatMessage => Boolean(message),
        )
        if (committedMessages.length) {
          const committedIds = new Set(committedMessages.map((message) => message.id))
          setState((current) => current?.conversationId === conversationId
            ? {
                ...current,
                messages: [
                  ...current.messages.filter((message) => message.id !== optimisticMessage.id && !committedIds.has(message.id)),
                  ...committedMessages,
                ],
              }
            : current)
        } else {
          removeOptimisticMessage()
          await reload()
        }
        const failures = result.data.roleErrors ?? []
        if (failures.length) {
          setError(failures.map((failure) => `${failure.roleName}：${failure.message}`).join('；'))
        }
      }
      return true
    } catch (error) {
      await recoverFailedSend(bridgeFailureMessage('发送角色消息', error))
      return false
    } finally {
      sendInFlightConversationIdsRef.current.delete(conversationId)
      runningConversationsRef.current.delete(conversationId)
      conversationStartedAtRef.current.delete(conversationId)
      conversationTurnIdRef.current.delete(conversationId)
      conversationStreamRef.current.delete(conversationId)
      syncRunningConversationIds()
      if (activeConversationIdRef.current === conversationId) {
        setSending(false)
        setStreamStartedAt(null)
        setStreamText(null)
        setStreamThinking(null)
        setStreamBlocks([])
        setStreamActivity(null)
      }
    }
  }, [
    activeConversationIdRef,
    reload,
    setError,
    setPromptQueue,
    setSending,
    setState,
    setStreamActivity,
    setStreamBlocks,
    setStreamStartedAt,
    setStreamText,
    setStreamThinking,
    setToolTraces,
    syncRunningConversationIds,
  ])

  const cancelMessage = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.chat) return false
    const conversationId = activeConversationIdRef.current
    try {
      const res = await bridge.chat.cancel(conversationId)
      if (!res.ok) {
        if (activeConversationIdRef.current === conversationId) setError(res.error)
        return false
      }
      return res.data.stopped
    } catch (error) {
      if (activeConversationIdRef.current === conversationId) setError(bridgeFailureMessage('停止', error))
      return false
    }
  }, [activeConversationIdRef, setError])

  const steerMessage = useCallback(async (text: string) => {
    const bridge = getBridge()
    if (!bridge?.chat) return false
    const conversationId = activeConversationIdRef.current
    if (!conversationId) return false
    const time = clockLabelZh()
    const optimisticMessage: ChatMessage = {
      id: `m-steer-${crypto.randomUUID()}`,
      author: 'user',
      name: '你',
      time,
      text,
      behavior: 'steer',
      ...(state?.conversationId === conversationId && state.messages.some((message) => message.roleMode)
        ? { roleMode: true }
        : {}),
    }
    setState((current) => current?.conversationId === conversationId
      ? { ...current, messages: [...current.messages, optimisticMessage] }
      : current)
    let res
    try {
      res = await bridge.chat.steer(text, conversationId)
    } catch (error) {
      setState((current) => current?.conversationId === conversationId
        ? { ...current, messages: current.messages.filter((message) => message.id !== optimisticMessage.id) }
        : current)
      if (activeConversationIdRef.current === conversationId) setError(bridgeFailureMessage('插话纠偏', error))
      return 'uncertain'
    }
    if (!res.ok) {
      setState((current) => current?.conversationId === conversationId
        ? { ...current, messages: current.messages.filter((message) => message.id !== optimisticMessage.id) }
        : current)
      if (activeConversationIdRef.current === conversationId) setError(res.error)
      return false
    }
    if (typeof res.data?.warning === 'string' && activeConversationIdRef.current === conversationId) {
      setError(res.data.warning)
    }
    return true
  }, [activeConversationIdRef, setError, setState, state])

  const followUpMessage = useCallback(async (text: string) => {
    const bridge = getBridge()
    if (!bridge?.chat) return false
    const conversationId = activeConversationIdRef.current
    if (!conversationId) return false
    const time = clockLabelZh()
    const optimisticMessage: ChatMessage = {
      id: `m-followup-${crypto.randomUUID()}`,
      author: 'user',
      name: '你',
      time,
      text,
      behavior: 'followUp',
    }
    setState((current) => current?.conversationId === conversationId
      ? { ...current, messages: [...current.messages, optimisticMessage] }
      : current)
    let res
    try {
      res = await bridge.chat.followUp(text, conversationId)
    } catch (error) {
      setState((current) => current?.conversationId === conversationId
        ? { ...current, messages: current.messages.filter((message) => message.id !== optimisticMessage.id) }
        : current)
      if (activeConversationIdRef.current === conversationId) setError(bridgeFailureMessage('补充消息', error))
      return 'uncertain'
    }
    if (!res.ok) {
      setState((current) => current?.conversationId === conversationId
        ? { ...current, messages: current.messages.filter((message) => message.id !== optimisticMessage.id) }
        : current)
      if (activeConversationIdRef.current === conversationId) setError(res.error)
      return false
    }
    return true
  }, [activeConversationIdRef, setError, setState])

  // Keep a ref so the early send-lock fallback can safely reuse the exact
  // queue/steer path without coupling sendMessage's hook dependencies.
  runningMessageDispatchRef.current = (behavior, text) => (
    behavior === 'steer' ? steerMessage(text) : followUpMessage(text)
  )

  const mutateQueue = useCallback(async (payload: {
    kind: 'steering' | 'followUp'
    index: number
    action: 'remove' | 'update'
    text?: string
  }) => {
    const bridge = getBridge()
    if (!bridge?.chat?.queueMutate) return false
    const conversationId = activeConversationIdRef.current
    if (!conversationId) return false
    try {
      const res = await bridge.chat.queueMutate({ ...payload, conversationId })
      if (res.ok && res.data.ok) {
        if (activeConversationIdRef.current !== conversationId) return false
        setPromptQueue({
          steering: res.data.steering ?? [],
          followUp: res.data.followUp ?? [],
        })
        return true
      }
      if (activeConversationIdRef.current === conversationId) {
        if (!res.ok) setError(res.error)
        else if (res.data.error) setError(res.data.error)
      }
    } catch (error) {
      if (activeConversationIdRef.current === conversationId) setError(bridgeFailureMessage('队列修改', error))
    }
    return false
  }, [activeConversationIdRef, setError, setPromptQueue])

  return {
    refs,
    runningConversationIds,
    runningStatusReady,
    completedConversationIds,
    setCompletedConversationIds,
    syncRunningConversationIds,
    isConversationRunning,
    syncRunningConversationsFromBackend,
    sendMessage,
    sendAsRoles,
    cancelMessage,
    steerMessage,
    followUpMessage,
    mutateQueue,
    orchestrationChoicePrompt: (() => {
      const pending = pendingOrchestrationChoicesRef.current.get(
        orchestrationChoiceKey(state?.conversationId || null, state?.currentThreadId ?? null),
      )
      return pending
        ? { confidence: pending.decision.confidence, reasons: pending.decision.reasons }
        : null
    })(),
    respondToOrchestrationChoice,
  }
}
