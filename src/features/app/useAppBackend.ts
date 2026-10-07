import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ThinkingLevel } from '../../shared/model-api'
import type {
  AppState,
  BusyEnterMode,
  ChatStreamEvent,
  DshConversationRunningCall,
  LiveContextUsage,
  SessionStatsSnapshot,
  OrchestrationChoicePrompt,
  PermissionMode,
  PermissionPromptPayload,
  PromptQueueSnapshot,
  SkillOption,
  ThreadSummary,
  ToolTraceItem,
  UserQuestionAnswer,
  UserQuestionPromptPayload,
  WorkMode,
  WorkspaceEntry,
  WorkspaceReference,
} from '../../shared/app-api'
import { useDshConversationView } from '../dsh-runtime/useDshConversationView'
import { matchDshConversationView } from '../dsh-runtime/matchDshConversationView'
import {
  applyDshProjectionToStreamState,
  isStreamEventSupersededByProjection,
  shouldPreferProjectionStream,
} from '../dsh-runtime/projectionStream'
import { mergeStoredMessagesWithDshTranscript } from '../dsh-runtime/dshTranscriptMessages'
import { liveContextFromDshProjections } from '../chat/session-usage'
import { readHostPlanMode, readHostTodos } from '../chat/hostPlanTodoProjection'
import { shortStreamActivityLabel } from '../chat/streamActivityLabel'
import { readCachedSkillCatalog, writeSkillCatalogCache } from '../skills/useEnabledSkills'
import type { AssistantContentBlock, ChatMessage, TaskNode } from '../../types'
import {
  applyStreamEventToSnapshot,
  emptyConversationStream,
  type ConversationStreamSnapshot,
} from '../chat/conversation-stream-buffer'
import { completedStreamMessage, endsConversationRun, mayResetStreamAfterReply } from '../chat/conversation-run-lifecycle'

function getBridge() {
  return window.taskweaver
}

function mergeDshRunningCallsIntoTraces(
  current: ToolTraceItem[],
  runningCalls: readonly DshConversationRunningCall[],
): ToolTraceItem[] {
  if (!runningCalls.length) return current
  const traceKey = (item: ToolTraceItem) => `${item.taskId ?? 'main'}:${item.id}`
  const updated = [...current]
  const indexByKey = new Map(updated.map((item, index) => [traceKey(item), index]))
  for (const call of runningCalls) {
    const id = call.callId || `dsh-${call.toolName}`
    const key = `main:${id}`
    const row: ToolTraceItem = {
      id,
      parentCallId: call.parentCallId ?? null,
      toolName: call.toolName,
      status: 'running',
      startedAt: call.startedAt ?? undefined,
    }
    const index = indexByKey.get(key)
    if (index === undefined) {
      indexByKey.set(key, updated.length)
      updated.push(row)
    } else {
      updated[index] = { ...updated[index], ...row }
    }
  }
  return updated.slice(-80)
}

export function useAppBackend() {
  const [state, setState] = useState<AppState | null>(null)
  const workspacePathRef = useRef<string | null>(null)
  workspacePathRef.current = state?.workspacePath ?? null
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [streamText, setStreamText] = useState<string | null>(null)
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null)
  const [streamThinking, setStreamThinking] = useState<{ text: string; durationMs?: number } | null>(null)
  const [streamActivity, setStreamActivity] = useState<string | null>(null)
  const [streamBlocks, setStreamBlocks] = useState<AssistantContentBlock[]>([])
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [skillsLoading, setSkillsLoading] = useState(true)
  const skillsRequestsRef = useRef(new Map<string, Promise<void>>())
  const [toolTraces, setToolTraces] = useState<ToolTraceItem[]>([])
  const [promptQueue, setPromptQueue] = useState<PromptQueueSnapshot>({ steering: [], followUp: [] })
  const [orchestrationChoice, setOrchestrationChoice] = useState<OrchestrationChoicePrompt | null>(null)
  const orchestrationChoicesRef = useRef(new Map<string, OrchestrationChoicePrompt>())
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptPayload | null>(null)
  const [userQuestionPrompt, setUserQuestionPrompt] = useState<UserQuestionPromptPayload | null>(null)
  const userQuestionPromptsRef = useRef(new Map<string, UserQuestionPromptPayload[]>())
  const [liveContext, setLiveContext] = useState<LiveContextUsage | null>(null)
  const [sessionStats, setSessionStats] = useState<SessionStatsSnapshot | null>(null)
  const [busyEnterMode, setBusyEnterMode] = useState<BusyEnterMode>('followUp')
  const activeConversationIdRef = useRef<string | null>(null)
  const runningConversationsRef = useRef(new Set<string>())
  const [runningConversationIds, setRunningConversationIds] = useState<string[]>([])
  const [completedConversationIds, setCompletedConversationIds] = useState<string[]>([])
  const syncRunningConversationIds = useCallback(() => {
    setRunningConversationIds([...runningConversationsRef.current])
  }, [])
  const conversationStartedAtRef = useRef(new Map<string, number>())
  const conversationTurnIdRef = useRef(new Map<string, string>())
  const conversationStreamRef = useRef(new Map<string, ConversationStreamSnapshot>())
  const dshMuxTapeRef = useRef<import('../../shared/app-api').DshMuxFramePayload[]>([])
  const isConversationRunning = useCallback((conversationId: string | null | undefined) => {
    return Boolean(conversationId && runningConversationsRef.current.has(conversationId))
  }, [])
  const permissionPromptsRef = useRef(new Map<string, PermissionPromptPayload>())
  const [retryBanner, setRetryBanner] = useState<{
    attempt: number
    maxAttempts?: number
    delayMs?: number
    message?: string
  } | null>(null)
  activeConversationIdRef.current = state?.conversationId ?? null

  const emptyPromptQueue = (): PromptQueueSnapshot => ({ steering: [], followUp: [] })

  const applyConversationStreamSnapshot = useCallback((snapshot: ConversationStreamSnapshot) => {
    setStreamText(snapshot.streamText)
    setStreamThinking(snapshot.streamThinking)
    setStreamBlocks(snapshot.streamBlocks)
    setToolTraces(snapshot.toolTraces)
    setPromptQueue(snapshot.promptQueue)
  }, [])

  const resetTransientConversationState = useCallback(() => {
    setStreamText(null)
    setStreamStartedAt(null)
    setStreamThinking(null)
    setStreamActivity(null)
    setStreamBlocks([])
    setLiveContext(null)
    setSessionStats(null)
    setPromptQueue(emptyPromptQueue())
    setOrchestrationChoice(null)
    setPermissionPrompt(null)
    setUserQuestionPrompt(null)
    setRetryBanner(null)
  }, [])

  const refreshSkills = useCallback(async (workspacePathOverride?: string | null) => {
    const bridge = getBridge()
    if (!bridge?.skills?.list) {
      setSkillsLoading(false)
      return
    }
    const workspacePath = workspacePathOverride === undefined ? workspacePathRef.current : workspacePathOverride
    const requestKey = workspacePath ?? '<no-workspace>'
    workspacePathRef.current = workspacePath
    const cachedCatalog = readCachedSkillCatalog(workspacePath)
    setSkills(cachedCatalog ?? [])
    const pending = skillsRequestsRef.current.get(requestKey)
    if (pending) {
      await pending
      return
    }
    setSkillsLoading(true)
    const request = (async () => {
      try {
        const result = await bridge.skills?.list()
        if (result?.ok) {
          const catalog = result.data ?? []
          writeSkillCatalogCache(catalog, workspacePath)
          if (workspacePathRef.current === workspacePath) setSkills(catalog)
        }
      } catch (err) {
        console.warn('[useAppBackend] Skill 目录加载失败:', err)
      } finally {
        if (workspacePathRef.current === workspacePath) setSkillsLoading(false)
      }
    })()
    skillsRequestsRef.current.set(requestKey, request)
    try {
      await request
    } finally {
      if (skillsRequestsRef.current.get(requestKey) === request) skillsRequestsRef.current.delete(requestKey)
    }
  }, [])

  const bridgeReady = Boolean(getBridge()?.app)
  const { view: dshView, subscribed: dshProjectionSubscribed } = useDshConversationView(
    bridgeReady ? state?.conversationId : null,
  )
  const activeDshView = matchDshConversationView(dshView, state?.conversationId)
  const projectionStreamActive = shouldPreferProjectionStream(
    dshProjectionSubscribed,
    state?.conversationId,
    activeDshView,
  )
  const dshToolRows = useMemo(() => {
    if (!activeDshView?.toolRows?.length) return []
    return activeDshView.toolRows
  }, [activeDshView])
  const projectionLiveContext = useMemo(
    () => liveContextFromDshProjections(activeDshView?.projections),
    [activeDshView?.projections],
  )
  const projectedSessionStats = useMemo<SessionStatsSnapshot | null>(() => {
    if (!activeDshView) return null
    const projections = activeDshView.projections
    const rawSessionStats = projections?.sessionStats
    const rawTokenUsage = projections?.tokenUsage
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      value !== null && typeof value === 'object'
    const sessionStatsProjection = isRecord(rawSessionStats)
      && typeof rawSessionStats.turns === 'number'
      && typeof rawSessionStats.steps === 'number'
      ? rawSessionStats
      : null
    const tokenUsageValues = isRecord(rawTokenUsage) && isRecord(rawTokenUsage.totals)
      ? rawTokenUsage.totals
      : rawTokenUsage
    const tokenUsageProjection = isRecord(tokenUsageValues)
      && typeof tokenUsageValues.uncachedInputTokens === 'number'
      && typeof tokenUsageValues.outputTokens === 'number'
      && typeof tokenUsageValues.cacheReadTokens === 'number'
      && typeof tokenUsageValues.cacheWriteTokens === 'number'
      ? tokenUsageValues
      : null
    if (!sessionStatsProjection && !tokenUsageProjection) return null

    const fallback: SessionStatsSnapshot = sessionStats ?? {
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      toolResults: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      cost: 0,
    }
    const input = tokenUsageProjection
      ? tokenUsageProjection.uncachedInputTokens as number
      : fallback.tokens.input
    const output = tokenUsageProjection
      ? tokenUsageProjection.outputTokens as number
      : fallback.tokens.output
    const cacheRead = tokenUsageProjection
      ? tokenUsageProjection.cacheReadTokens as number
      : fallback.tokens.cacheRead
    const cacheWrite = tokenUsageProjection
      ? tokenUsageProjection.cacheWriteTokens as number
      : fallback.tokens.cacheWrite

    return {
      ...fallback,
      ...(sessionStatsProjection ? {
        userMessages: sessionStatsProjection.turns as number,
        assistantMessages: sessionStatsProjection.steps as number,
      } : {}),
      tokens: tokenUsageProjection
        ? { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite }
        : fallback.tokens,
    }
  }, [activeDshView, sessionStats])
  const hostPlanModeActive = useMemo(
    () => readHostPlanMode(activeDshView?.projections),
    [activeDshView?.projections],
  )
  const hostTodos = useMemo(
    () => readHostTodos(activeDshView?.projections),
    [activeDshView?.projections],
  )

  const displayMessages = useMemo(
    () => mergeStoredMessagesWithDshTranscript(
      state?.messages ?? [],
      activeDshView?.transcript,
      projectionStreamActive,
      sending,
    ),
    [state?.messages, activeDshView?.transcript, projectionStreamActive, sending],
  )

  const refreshSessionStats = useCallback(async (expectedConversationId = activeConversationIdRef.current) => {
    const bridge = getBridge()
    if (!bridge?.chat?.getSessionStats) return
    const [statsRes, contextRes] = await Promise.all([
      bridge.chat.getSessionStats(expectedConversationId),
      bridge.chat.getLiveContext?.(expectedConversationId),
    ])
    if (expectedConversationId !== activeConversationIdRef.current) return
    if (statsRes.ok) setSessionStats(statsRes.data)
    if (contextRes?.ok) setLiveContext(contextRes.data)
  }, [])

  const reload = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.app) {
      setLoading(false)
      setError('请在 Electron 桌面应用中运行以加载后端状态。')
      return
    }
    const requestedConversationId = activeConversationIdRef.current
    setLoading(true)
    const res = await bridge.app.getState()
    if (!res.ok) {
      setError(res.error)
      setLoading(false)
      return
    }
    if (requestedConversationId && res.data.conversationId !== requestedConversationId) {
      setLoading(false)
      return
    }
    activeConversationIdRef.current = res.data.conversationId
    setState(res.data)
    setToolTraces(res.data.outputLogs ?? [])
    setError(null)
    setLoading(false)
    void refreshSkills(res.data.workspacePath)
    const enterMode = await bridge.models?.getBusyEnterMode?.()
    if (enterMode?.ok) setBusyEnterMode(enterMode.data)
    await refreshSessionStats()
    const runningRes = await bridge.chat?.listRunningConversations?.()
    if (runningRes?.ok && Array.isArray(runningRes.data)) {
      runningConversationsRef.current = new Set(runningRes.data)
      setRunningConversationIds(runningRes.data)
    }
  }, [refreshSessionStats, refreshSkills])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!bridgeReady) return
    const bridge = getBridge()
    if (!bridge?.chat?.listRunningConversations) return

    const syncFromMain = async () => {
      const res = await bridge.chat.listRunningConversations()
      if (!res.ok || !Array.isArray(res.data)) return

      // Verify each "running" conversation is actually still busy in backend
      const backendRunning = new Set(res.data)
      const localRunning = new Set(runningConversationsRef.current)

      // Find ghost states: conversations we think are running but backend says they're not
      const ghosts = [...localRunning].filter(id => !backendRunning.has(id))

      if (ghosts.length > 0) {
        console.warn('[useAppBackend] 检测到幽灵对话状态，自动清理:', ghosts)
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

    // Initial sync
    void syncFromMain()

    const intervalId = window.setInterval(() => {
      void syncFromMain()
    }, 5000)
    return () => clearInterval(intervalId)
  }, [bridgeReady])

  useEffect(() => {
    if (state?.conversationId) void refreshSessionStats(state.conversationId)
  }, [refreshSessionStats, state?.conversationId])

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
    if (!bridge?.chat?.onMux) return
    return bridge.chat.onMux((payload) => {
      if (payload.conversationId !== activeConversationIdRef.current) return
      dshMuxTapeRef.current.push(payload)
      if (dshMuxTapeRef.current.length > 800) dshMuxTapeRef.current.splice(0, dshMuxTapeRef.current.length - 800)
    })
  }, [bridgeReady])

  useEffect(() => {
    if (!projectionStreamActive || !activeDshView) return
    applyDshProjectionToStreamState(activeDshView, {
      setStreamText,
      setStreamThinking,
      setStreamActivity,
      setPromptQueue,
    })
  }, [projectionStreamActive, activeDshView])

  useEffect(() => {
    if (projectionStreamActive) return
    if (activeDshView?.toolRows?.length) return
    if (!activeDshView?.runningCalls?.length) return
    if (activeDshView.conversationId !== activeConversationIdRef.current) return
    setToolTraces((current) => mergeDshRunningCallsIntoTraces(current, activeDshView.runningCalls))
  }, [activeDshView, projectionStreamActive])

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge?.chat) return
    return bridge.chat.onStream((event: ChatStreamEvent) => {
      // Child lifecycle belongs to its task panel, never the parent's stream
      // buffer, inbox or error banner. Tool traces still flow through below.
      if ('taskId' in event && event.taskId && event.type !== 'tool') return
      const skipStreamContent = isStreamEventSupersededByProjection(event, projectionStreamActive)
      const completedMessage = completedStreamMessage(event)
      if (completedMessage) {
        setState((current) => {
          if (!current || current.conversationId !== event.conversationId) return current
          if (current.messages.some(message => message.id === completedMessage.id)) return current
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
            time: new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
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
            time: new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
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
      // Fallback cleanup for done/error events without conversationId (should use active conversation)
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
        conversationStreamRef.current.set(
          event.conversationId,
          applyStreamEventToSnapshot(prev, event),
        )
      }
      if (event.conversationId && event.conversationId !== activeConversationIdRef.current) return

      if (skipStreamContent && event.type !== 'start' && event.type !== 'done' && event.type !== 'error') {
        return
      }

      if (event.type === 'thinking_start') {
        // 多轮工具循环会重复 thinking_start；勿清空已累积内容
        setStreamThinking((prev) => {
          if (prev?.text?.trim()) return { text: prev.text, durationMs: prev.durationMs ?? 0 }
          return { text: '', durationMs: prev?.durationMs ?? 0 }
        })
      }
      if (event.type === 'thinking_delta') {
        setStreamThinking((prev) => ({
          text: event.fullThinking ?? `${prev?.text ?? ''}${event.delta ?? ''}`,
          durationMs: event.durationMs ?? prev?.durationMs,
        }))
      }
      if (event.type === 'thinking_end') {
        setStreamThinking((prev) => ({
          text: event.fullThinking ?? prev?.text ?? '',
          durationMs: event.durationMs ?? prev?.durationMs,
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
      if (event.type === 'tasks') setState((current) => current ? { ...current, tasks: event.tasks } : current)
      if (event.type === 'progress') setStreamText(event.text)
      if (event.type === 'tool') {
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
        const compactId = event.id ?? `compact-${Date.now()}`
        const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
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
  }, [refreshSessionStats, syncRunningConversationIds, projectionStreamActive])

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge?.permission?.onPrompt) return
    return bridge.permission.onPrompt((payload) => {
      const conversationId = payload.conversationId ?? activeConversationIdRef.current
      if (conversationId) permissionPromptsRef.current.set(conversationId, payload)
      if (!conversationId || conversationId === activeConversationIdRef.current) setPermissionPrompt(payload)
    })
  }, [])

  useEffect(() => {
    const questions = getBridge()?.userQuestions
    if (!questions?.onPrompt) return
    const unsubscribePrompt = questions.onPrompt(payload => {
      const pending = userQuestionPromptsRef.current.get(payload.conversationId) ?? []
      if (!pending.some(item => item.id === payload.id)) pending.push(payload)
      userQuestionPromptsRef.current.set(payload.conversationId, pending)
      if (payload.conversationId === activeConversationIdRef.current) setUserQuestionPrompt(pending[0] ?? null)
    })
    const unsubscribeResolved = questions.onResolved?.(payload => {
      const pending = userQuestionPromptsRef.current.get(payload.conversationId) ?? []
      const remaining = pending.filter(item => item.id !== payload.id)
      if (remaining.length) userQuestionPromptsRef.current.set(payload.conversationId, remaining)
      else userQuestionPromptsRef.current.delete(payload.conversationId)
      if (payload.conversationId === activeConversationIdRef.current) setUserQuestionPrompt(remaining[0] ?? null)
    })
    return () => { unsubscribePrompt(); unsubscribeResolved?.() }
  }, [])

  useEffect(() => {
    if (!sending) {
      return
    }
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
  }, [sending])

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
      const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
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
        // New conversation: initialize minimal state with the message
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
      // A busy send may be accepted as a follow-up; do not erase its active turn.
      if (!sending) {
        setStreamText(null)
        setStreamThinking(null)
        setStreamBlocks([])
        setToolTraces([])
        setPromptQueue(emptyPromptQueue())
      }
      setError(null)
      const res = await bridge.chat.send(text, modelKey ?? null, skillName ?? null, executionModeOverride ?? null, workMode ?? 'code', sendConversationId)
      if (!res.ok) {
        const stillRunning = Boolean(sendConversationId && runningConversationsRef.current.has(sendConversationId))
        const newerTurn = res.turnId && stillRunning && conversationTurnIdRef.current.get(sendConversationId!) !== res.turnId
        const rejectedAdmission = !res.turnId && runAlreadyActive && stillRunning
        if (newerTurn || rejectedAdmission || res.runContinues) {
          // An old terminal commit or a rejected busy admission must not erase
          // the independent newer/current native turn's output and queue.
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
          // Don't reload if there are other running conversations - it would clear their in-flight messages
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
        } else if (!res.data.accepted) {
          // Compatibility with older backends that don't return committed
          // messages: reload the durable conversation after the turn settles.
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
    [reload, syncRunningConversationIds, sending],
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
  }, [])

  const steerMessage = useCallback(async (text: string) => {
    const bridge = getBridge()
    if (!bridge?.chat) return false
    const conversationId = activeConversationIdRef.current
    if (!conversationId) return false
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    const optimisticMessage: ChatMessage = {
      id: `m-steer-${Date.now()}`,
      author: 'user',
      name: '你',
      time,
      text,
      behavior: 'steer',
    }
    setState((current) => current ? { ...current, messages: [...current.messages, optimisticMessage] } : current)
    const res = await bridge.chat.steer(text, conversationId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    return true
  }, [])

  const followUpMessage = useCallback(async (text: string) => {
    const bridge = getBridge()
    if (!bridge?.chat) return false
    const conversationId = activeConversationIdRef.current
    if (!conversationId) return false
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    const optimisticMessage: ChatMessage = {
      id: `m-followup-${Date.now()}`,
      author: 'user',
      name: '你',
      time,
      text,
      behavior: 'followUp',
    }
    setState((current) => current ? { ...current, messages: [...current.messages, optimisticMessage] } : current)
    const res = await bridge.chat.followUp(text, conversationId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    return true
  }, [])

  const confirmOrchestration = useCallback(
    async (mode: 'single-agent' | 'multi-agent') => {
      if (!orchestrationChoice) return false
      const { text, modelKey, skillName } = orchestrationChoice
      if (activeConversationIdRef.current) orchestrationChoicesRef.current.delete(activeConversationIdRef.current)
      setOrchestrationChoice(null)
      return sendMessage(text, modelKey, skillName, mode)
    },
    [orchestrationChoice, sendMessage],
  )

  const dismissOrchestrationChoice = useCallback(() => {
    if (activeConversationIdRef.current) orchestrationChoicesRef.current.delete(activeConversationIdRef.current)
    setOrchestrationChoice(null)
  }, [])

  const clearConversation = useCallback(async (options?: { workspacePath?: string | null }) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.clearConversation(options)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    resetTransientConversationState()
    activeConversationIdRef.current = res.data.conversationId
    setState(res.data)
    void refreshSkills(res.data.workspacePath)
    setToolTraces([])
    setSending(isConversationRunning(res.data.conversationId))
    setStreamStartedAt(conversationStartedAtRef.current.get(res.data.conversationId) ?? null)
    setPermissionPrompt(permissionPromptsRef.current.get(res.data.conversationId) ?? null)
    setUserQuestionPrompt(userQuestionPromptsRef.current.get(res.data.conversationId)?.[0] ?? null)
    return true
  }, [isConversationRunning, refreshSkills, resetTransientConversationState])

  const setWorkspace = useCallback(async (workspacePath: string | null) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.setWorkspace(workspacePath)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    resetTransientConversationState()
    activeConversationIdRef.current = res.data.conversationId
    setState(res.data)
    void refreshSkills(res.data.workspacePath)
    setToolTraces([])
    return true
  }, [refreshSkills, resetTransientConversationState])

  const pickWorkspace = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.pickWorkspace()
    if (!res.ok) {
      setError(res.error)
      return false
    }
    if (res.data.cancelled) return false
    resetTransientConversationState()
    activeConversationIdRef.current = res.data.state.conversationId
    setState(res.data.state)
    void refreshSkills(res.data.state.workspacePath)
    setToolTraces(res.data.state.outputLogs ?? [])
    setSending(isConversationRunning(res.data.state.conversationId))
    setStreamStartedAt(conversationStartedAtRef.current.get(res.data.state.conversationId) ?? null)
    setPermissionPrompt(permissionPromptsRef.current.get(res.data.state.conversationId) ?? null)
    setUserQuestionPrompt(userQuestionPromptsRef.current.get(res.data.state.conversationId)?.[0] ?? null)
    setError(null)
    return true
  }, [isConversationRunning, refreshSkills, resetTransientConversationState])

  const switchThread = useCallback(async (threadId: string) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.switchThread(threadId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    resetTransientConversationState()
    activeConversationIdRef.current = res.data.conversationId
    setCompletedConversationIds((current) => current.filter((id) => id !== res.data.conversationId))
    setState(res.data)
    void refreshSkills(res.data.workspacePath)
    const streamSnap = conversationStreamRef.current.get(res.data.conversationId)
    if (streamSnap) applyConversationStreamSnapshot(streamSnap)
    else setToolTraces(res.data.outputLogs ?? [])
    setSending(isConversationRunning(res.data.conversationId))
    setStreamStartedAt(conversationStartedAtRef.current.get(res.data.conversationId) ?? null)
    setOrchestrationChoice(orchestrationChoicesRef.current.get(res.data.conversationId) ?? null)
    setPermissionPrompt(permissionPromptsRef.current.get(res.data.conversationId) ?? null)
    setUserQuestionPrompt(userQuestionPromptsRef.current.get(res.data.conversationId)?.[0] ?? null)
    setError(null)

    // Clean up ghost state: if backend says this conversation isn't running, don't show it as running
    if (!isConversationRunning(res.data.conversationId)) {
      conversationStartedAtRef.current.delete(res.data.conversationId)
      conversationStreamRef.current.delete(res.data.conversationId)
    }

    return true
  }, [applyConversationStreamSnapshot, isConversationRunning, refreshSessionStats, refreshSkills, resetTransientConversationState])

  const renameThread = useCallback(async (threadId: string, title: string) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.renameThread(threadId, title)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setState((current) => current ? { ...current, threadTitle: current.currentThreadId === threadId ? title.trim().slice(0, 80) : current.threadTitle, threads: res.data } : current)
    setError(null)
    return true
  }, [])

  const togglePinThread = useCallback(async (threadId: string) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.togglePinThread(threadId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setState((current) => current ? { ...current, threads: res.data } : current)
    setError(null)
    return true
  }, [])

  const toggleArchiveThread = useCallback(async (threadId: string) => {
    const bridge = getBridge()
    if (!bridge?.app?.toggleArchiveThread) return false
    const res = await bridge.app.toggleArchiveThread(threadId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setState((current) => current ? { ...current, threads: res.data } : current)
    setError(null)
    return true
  }, [])

  const searchThreads = useCallback(async (query: string): Promise<ThreadSummary[]> => {
    const bridge = getBridge()
    if (!bridge?.app?.searchThreads) return []
    const res = await bridge.app.searchThreads(query)
    if (!res.ok) {
      setError(res.error)
      return []
    }
    return res.data
  }, [])

  const deleteThread = useCallback(async (threadId: string) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.deleteThread(threadId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    resetTransientConversationState()
    setState(res.data)
    setToolTraces(res.data.outputLogs ?? [])
    setError(null)
    void refreshSessionStats()
    return true
  }, [refreshSessionStats, resetTransientConversationState])

  const forkThread = useCallback(async (messageId: string) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const currentThreadId = state?.currentThreadId
    if (!currentThreadId) return false
    const res = await bridge.app.forkThread(currentThreadId, messageId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    resetTransientConversationState()
    setState(res.data)
    setToolTraces([])
    setError(null)
    void refreshSessionStats()
    return true
  }, [refreshSessionStats, resetTransientConversationState, state?.currentThreadId])

  const searchWorkspaceContext = useCallback(async (query: string): Promise<WorkspaceEntry[]> => {
    const bridge = getBridge()
    if (!bridge?.workspace) return []
    const res = await bridge.workspace.listContext(query, 80)
    if (!res.ok) {
      setError(res.error)
      return []
    }
    return res.data
  }, [])

  const createDroppedReference = useCallback(async (file: File): Promise<WorkspaceReference | null> => {
    const bridge = getBridge()
    if (!bridge?.workspace) return null
    const droppedPath = bridge.workspace.getDroppedFilePath(file)
    if (!droppedPath) return null
    const res = await bridge.workspace.createReference(droppedPath)
    if (!res.ok) {
      setError(res.error)
      return null
    }
    return res.data
  }, [])

  const respondPermissionPrompt = useCallback(async (
    action: 'allow-once' | 'allow-always' | 'allow-always-session' | 'deny' | 'escalate-once',
    sandboxMode?: 'workspace-write' | 'danger-full-access',
  ) => {
    const bridge = getBridge()
    if (!bridge?.permission?.respondPrompt || !permissionPrompt) return false
    const res = await bridge.permission.respondPrompt(permissionPrompt.id, {
      action,
      ...(sandboxMode ? { sandboxMode } : {}),
    })
    if (!res.ok || !res.data?.ok) return false
    for (const [conversationId, prompt] of permissionPromptsRef.current) {
      if (prompt.id === permissionPrompt.id) permissionPromptsRef.current.delete(conversationId)
    }
    setPermissionPrompt(null)
    return true
  }, [permissionPrompt])

  const answerUserQuestion = useCallback(async (id: string, answer: UserQuestionAnswer) => {
    const bridge = getBridge()
    if (!bridge?.userQuestions?.answer) return false
    const res = await bridge.userQuestions.answer(id, answer)
    if (!res.ok || !res.data.ok) return false
    const conversationId = activeConversationIdRef.current
    if (conversationId) {
      const pending = userQuestionPromptsRef.current.get(conversationId) ?? []
      const remaining = pending.filter(item => item.id !== id)
      if (remaining.length) userQuestionPromptsRef.current.set(conversationId, remaining)
      else userQuestionPromptsRef.current.delete(conversationId)
      setUserQuestionPrompt(remaining[0] ?? null)
    }
    return true
  }, [])

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
  }, [])

  const setBusyEnterModePref = useCallback(async (mode: BusyEnterMode) => {
    const bridge = getBridge()
    if (!bridge?.models?.setBusyEnterMode) return false
    const res = await bridge.models.setBusyEnterMode(mode)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setBusyEnterMode(res.data)
    return true
  }, [])

  const setPermissionMode = useCallback(async (mode: PermissionMode) => {
    const bridge = getBridge()
    if (!bridge?.app?.setPermissionMode) return false
    const res = await bridge.app.setPermissionMode(mode)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setState(res.data)
    setError(null)
    return true
  }, [])

  const setCurrentThreadModel = useCallback(async (modelKey: string, thinkingLevel?: ThinkingLevel) => {
    const bridge = getBridge()
    if (!bridge?.app?.setModelKey) return false

    // 先更新后端 modelKey
    const modelRes = await bridge.app.setModelKey(modelKey)
    if (!modelRes.ok) {
      setError(modelRes.error)
      return false
    }

    // 更新思考等级（如果提供）
    if (thinkingLevel && bridge.app.setThinkingLevel) {
      const thinkingRes = await bridge.app.setThinkingLevel(thinkingLevel)
      if (!thinkingRes.ok) {
        setError(thinkingRes.error)
        return false
      }
      setState(thinkingRes.data)
    } else {
      setState(modelRes.data)
    }

    setError(null)
    return true
  }, [])

  const sendTaskMessage = useCallback(async (taskId: string, text: string) => {
    const bridge = getBridge()
    if (!bridge?.tasks) {
      setError('子任务对话后端不可用')
      return false
    }
    const res = await bridge.tasks.sendMessage(taskId, text, activeConversationIdRef.current)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    return true
  }, [])


  return {
    bridgeReady,
    state,
    messages: displayMessages,
    storedMessages: state?.messages ?? [],
    tasks: (state?.tasks ?? []) as TaskNode[],
    threadTitle: state?.threadTitle ?? '新对话',
    workspacePath: state?.workspacePath ?? null,
    loading,
    error,
    sending,
    streamText,
    streamStartedAt,
    streamThinking,
    streamActivity,
    streamBlocks,
    permissionPrompt,
    respondPermissionPrompt,
    userQuestionPrompt,
    answerUserQuestion,
    liveContext: projectionLiveContext ?? liveContext,
    sessionStats: projectedSessionStats ?? sessionStats,
    hostPlanModeActive,
    hostTodos,
    refreshSessionStats,
    busyEnterMode,
    setBusyEnterMode: setBusyEnterModePref,
    mutateQueue,
    retryBanner,
    toolTraces,
    dshToolRows,
    promptQueue,
    skills,
    skillsLoading,
    refreshSkills,
    threads: state?.threads ?? [],
    currentThreadId: state?.currentThreadId ?? null,
    runningConversationIds,
    completedConversationIds,
    reload,
    sendMessage,
    cancelMessage,
    steerMessage,
    followUpMessage,
    orchestrationChoice,
    confirmOrchestration,
    dismissOrchestrationChoice,
    clearConversation,
    setWorkspace,
    pickWorkspace,
    switchThread,
    renameThread,
    togglePinThread,
    toggleArchiveThread,
    searchThreads,
    deleteThread,
    forkThread,
    searchWorkspaceContext,
    createDroppedReference,
    setPermissionMode,
    sendTaskMessage,
    setCurrentThreadModel,
  }
}
