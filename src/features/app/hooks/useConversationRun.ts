import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type {
  AppState,
  ChatStreamEvent,
  LiveContextUsage,
  OrchestrationChoicePrompt,
  PromptQueueSnapshot,
  SessionStatsSnapshot,
  ToolTraceItem,
  WorkMode,
} from '../../../shared/app-api'
import type { ChatMessage } from '../../../types'
import {
  applyStreamEventToSnapshot,
  emptyConversationStream,
  type ConversationStreamSnapshot,
} from '../../chat/conversation-stream-buffer'
import { completedStreamMessage, endsConversationRun, mayResetStreamAfterReply } from '../../chat/conversation-run-lifecycle'
import { isCompactCommandText } from '../../../shared/context-compaction-policy'
import { shortStreamActivityLabel } from '../../chat/streamActivityLabel'
import { clockLabelZh } from '../../../shared/time-label'
import { getBridge } from '../getBridge'

function emptyPromptQueue(): PromptQueueSnapshot {
  return { steering: [], followUp: [] }
}

export type ConversationRunRefs = {
  runningConversationsRef: MutableRefObject<Set<string>>
  conversationStartedAtRef: MutableRefObject<Map<string, number>>
  conversationTurnIdRef: MutableRefObject<Map<string, string>>
  conversationStreamRef: MutableRefObject<Map<string, ConversationStreamSnapshot>>
  orchestrationChoicesRef: MutableRefObject<Map<string, OrchestrationChoicePrompt>>
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
  setLiveContext: Dispatch<SetStateAction<LiveContextUsage | null>>
  setSessionStats: Dispatch<SetStateAction<SessionStatsSnapshot | null>>
  orchestrationChoice: OrchestrationChoicePrompt | null
  setOrchestrationChoice: Dispatch<SetStateAction<OrchestrationChoicePrompt | null>>
  activeConversationIdRef: MutableRefObject<string | null>
  refreshSessionStats: (expectedConversationId?: string | null) => Promise<void>
  reload: () => Promise<void>
  markCompacted: (conversationId?: string | null) => void
  clearPendingCompaction: (conversationId?: string | null) => void
  setPendingCompactionIds: Dispatch<SetStateAction<string[]>>
  preferDshTranscript: boolean
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
    setLiveContext,
    setSessionStats,
    orchestrationChoice,
    setOrchestrationChoice,
    activeConversationIdRef,
    refreshSessionStats,
    reload,
    markCompacted,
    clearPendingCompaction,
    setPendingCompactionIds,
    preferDshTranscript,
  } = options

  const runningConversationsRef = useRef(new Set<string>())
  const conversationStartedAtRef = useRef(new Map<string, number>())
  const conversationTurnIdRef = useRef(new Map<string, string>())
  const conversationStreamRef = useRef(new Map<string, ConversationStreamSnapshot>())
  const orchestrationChoicesRef = useRef(new Map<string, OrchestrationChoicePrompt>())
  const [runningConversationIds, setRunningConversationIds] = useState<string[]>([])
  const [completedConversationIds, setCompletedConversationIds] = useState<string[]>([])

  const syncRunningConversationIds = useCallback(() => {
    setRunningConversationIds([...runningConversationsRef.current])
  }, [])

  const isConversationRunning = useCallback((conversationId: string | null | undefined) => {
    return Boolean(conversationId && runningConversationsRef.current.has(conversationId))
  }, [])

  const syncRunningConversationsFromBackend = useCallback((ids: string[]) => {
    runningConversationsRef.current = new Set(ids)
    setRunningConversationIds(ids)
  }, [])

  const refs: ConversationRunRefs = {
    runningConversationsRef,
    conversationStartedAtRef,
    conversationTurnIdRef,
    conversationStreamRef,
    orchestrationChoicesRef,
  }

  useEffect(() => {
    if (!bridgeReady) return
    const bridge = getBridge()
    if (!bridge?.chat?.listRunningConversations) return

    const syncFromMain = async () => {
      const res = await bridge.chat.listRunningConversations()
      if (!res.ok || !Array.isArray(res.data)) return

      const backendRunning = new Set(res.data)
      const localRunning = new Set(runningConversationsRef.current)
      const ghosts = [...localRunning].filter((id) => !backendRunning.has(id))

      if (ghosts.length > 0) {
        console.warn('[useConversationRun] 检测到幽灵对话状态，自动清理:', ghosts)
        for (const ghostId of ghosts) {
          runningConversationsRef.current.delete(ghostId)
          conversationStartedAtRef.current.delete(ghostId)
          conversationTurnIdRef.current.delete(ghostId)
          conversationStreamRef.current.delete(ghostId)
          if (activeConversationIdRef.current === ghostId) {
            setSending(false)
            setStreamStartedAt(null)
          }
        }
      }

      runningConversationsRef.current = backendRunning
      setRunningConversationIds(res.data)
    }

    void syncFromMain()
    const intervalId = window.setInterval(() => { void syncFromMain() }, 5000)
    return () => clearInterval(intervalId)
  }, [bridgeReady, activeConversationIdRef, setSending, setStreamStartedAt])

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
    return bridge.chat.onStream((event: ChatStreamEvent) => {
      if ('taskId' in event && event.taskId && event.type !== 'tool') return
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
      if (endsConversationRun(event)) clearPendingCompaction(event.conversationId ?? activeConversationIdRef.current)
      if (endsConversationRun(event) && event.conversationId) {
        runningConversationsRef.current.delete(event.conversationId)
        syncRunningConversationIds()
        if (event.type === 'done') {
          setCompletedConversationIds((current) => current.includes(event.conversationId!)
            ? current
            : [...current, event.conversationId!])
        }
        conversationStartedAtRef.current.delete(event.conversationId)
        conversationTurnIdRef.current.delete(event.conversationId)
        conversationStreamRef.current.delete(event.conversationId)
        if (activeConversationIdRef.current === event.conversationId) {
          setSending(false)
          setStreamStartedAt(null)
        }
      }
      if (endsConversationRun(event) && !event.conversationId && activeConversationIdRef.current) {
        runningConversationsRef.current.delete(activeConversationIdRef.current)
        syncRunningConversationIds()
        conversationStartedAtRef.current.delete(activeConversationIdRef.current)
        conversationTurnIdRef.current.delete(activeConversationIdRef.current)
        conversationStreamRef.current.delete(activeConversationIdRef.current)
        setSending(false)
        setStreamStartedAt(null)
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
    })
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
  ])

  useEffect(() => {
    if (!sending) return
    const bridge = getBridge()
    if (!bridge?.chat?.getLiveContext) return
    const timer = window.setInterval(() => {
      const expectedConversationId = activeConversationIdRef.current
      void bridge.chat.getLiveContext(expectedConversationId).then((res) => {
        if (res.ok && expectedConversationId === activeConversationIdRef.current) setLiveContext(res.data)
      })
      void bridge.chat.getSessionStats?.(expectedConversationId).then((res) => {
        if (res?.ok && expectedConversationId === activeConversationIdRef.current) setSessionStats(res.data)
      })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [sending, activeConversationIdRef, setLiveContext, setSessionStats])

  const sendMessage = useCallback(
    async (
      text: string,
      modelKey?: string,
      skillName?: string,
      executionModeOverride?: 'single-agent' | 'multi-agent',
      workMode?: WorkMode,
    ) => {
      const bridge = getBridge()
      if (!bridge?.chat) {
        setError('聊天后端不可用')
        return false
      }
      const sendConversationId = activeConversationIdRef.current
      const time = clockLabelZh()
      const optimisticMessage: ChatMessage = {
        id: `optimistic-u-${Date.now()}`,
        author: 'user',
        name: '你',
        time,
        text,
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
        if (current) return { ...current, messages: [...current.messages, optimisticMessage] }
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
      const res = await bridge.chat.send(text, modelKey ?? null, skillName ?? null, executionModeOverride ?? null, workMode ?? 'code', sendConversationId)
      if (isCompact) clearPendingCompaction(sendConversationId)
      if (!res.ok) {
        const stillRunning = Boolean(sendConversationId && runningConversationsRef.current.has(sendConversationId))
        const newerTurn = res.turnId && stillRunning && conversationTurnIdRef.current.get(sendConversationId!) !== res.turnId
        const rejectedAdmission = !res.turnId && runAlreadyActive && stillRunning
        if (newerTurn || rejectedAdmission || res.runContinues) {
          if ((rejectedAdmission || res.runContinues) && activeConversationIdRef.current === sendConversationId) setError(res.error)
          return false
        }
        if (sendConversationId) {
          runningConversationsRef.current.delete(sendConversationId)
          syncRunningConversationIds()
        }
        if (sendConversationId) conversationStartedAtRef.current.delete(sendConversationId)
        if (activeConversationIdRef.current === sendConversationId) setSending(false)
        if (activeConversationIdRef.current === sendConversationId) setStreamStartedAt(null)
        if (activeConversationIdRef.current === sendConversationId) {
          setStreamText(null)
          setStreamThinking(null)
          setStreamBlocks([])
          if (runningConversationsRef.current.size === 0) {
            await reload()
          }
          setError(res.error)
        }
        return false
      }
      if (res.data.needsOrchestrationChoice) {
        if (sendConversationId) {
          runningConversationsRef.current.delete(sendConversationId)
          syncRunningConversationIds()
        }
        if (sendConversationId) conversationStartedAtRef.current.delete(sendConversationId)
        const choice = {
          text,
          modelKey,
          skillName,
          reason: res.data.reason ?? '是否启用多 Agent 编排？',
          suggestedMode: res.data.suggestedMode ?? 'multi-agent',
        }
        if (sendConversationId) orchestrationChoicesRef.current.set(sendConversationId, choice)
        if (activeConversationIdRef.current === sendConversationId) setOrchestrationChoice(choice)
        if (activeConversationIdRef.current === sendConversationId) setSending(false)
        if (activeConversationIdRef.current === sendConversationId) setStreamStartedAt(null)
        if (activeConversationIdRef.current === sendConversationId) setStreamText(null)
        return false
      }
      if (sendConversationId) orchestrationChoicesRef.current.delete(sendConversationId)
      if (activeConversationIdRef.current === sendConversationId) {
        setOrchestrationChoice(null)
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
      setOrchestrationChoice,
      setPendingCompactionIds,
    ],
  )

  const cancelMessage = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.chat) return false
    const res = await bridge.chat.cancel(activeConversationIdRef.current)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    return res.data.stopped
  }, [activeConversationIdRef, setError])

  const steerMessage = useCallback(async (text: string) => {
    const bridge = getBridge()
    if (!bridge?.chat) return false
    const conversationId = activeConversationIdRef.current
    if (!conversationId) return false
    const time = clockLabelZh()
    const optimisticMessage: ChatMessage = {
      id: `m-steer-${Date.now()}`,
      author: 'user',
      name: '你',
      time,
      text,
      behavior: 'steer',
    }
    setState((current) => (current ? { ...current, messages: [...current.messages, optimisticMessage] } : current))
    const res = await bridge.chat.steer(text, conversationId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    return true
  }, [activeConversationIdRef, setError, setState])

  const followUpMessage = useCallback(async (text: string) => {
    const bridge = getBridge()
    if (!bridge?.chat) return false
    const conversationId = activeConversationIdRef.current
    if (!conversationId) return false
    const time = clockLabelZh()
    const optimisticMessage: ChatMessage = {
      id: `m-followup-${Date.now()}`,
      author: 'user',
      name: '你',
      time,
      text,
      behavior: 'followUp',
    }
    setState((current) => (current ? { ...current, messages: [...current.messages, optimisticMessage] } : current))
    const res = await bridge.chat.followUp(text, conversationId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    return true
  }, [activeConversationIdRef, setError, setState])

  const confirmOrchestration = useCallback(
    async (mode: 'single-agent' | 'multi-agent') => {
      if (!orchestrationChoice) return false
      const { text, modelKey, skillName } = orchestrationChoice
      if (activeConversationIdRef.current) orchestrationChoicesRef.current.delete(activeConversationIdRef.current)
      setOrchestrationChoice(null)
      return sendMessage(text, modelKey, skillName, mode)
    },
    [orchestrationChoice, sendMessage, activeConversationIdRef, setOrchestrationChoice],
  )

  const dismissOrchestrationChoice = useCallback(() => {
    if (activeConversationIdRef.current) orchestrationChoicesRef.current.delete(activeConversationIdRef.current)
    setOrchestrationChoice(null)
  }, [activeConversationIdRef, setOrchestrationChoice])

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
    const res = await bridge.chat.queueMutate({ ...payload, conversationId })
    if (res.ok && res.data.ok) {
      setPromptQueue({
        steering: res.data.steering ?? [],
        followUp: res.data.followUp ?? [],
      })
      return true
    }
    if (!res.ok) setError(res.error)
    else if (res.data.error) setError(res.data.error)
    return false
  }, [activeConversationIdRef, setError, setPromptQueue])

  return {
    refs,
    runningConversationIds,
    completedConversationIds,
    setCompletedConversationIds,
    syncRunningConversationIds,
    isConversationRunning,
    syncRunningConversationsFromBackend,
    sendMessage,
    cancelMessage,
    steerMessage,
    followUpMessage,
    confirmOrchestration,
    dismissOrchestrationChoice,
    mutateQueue,
  }
}
