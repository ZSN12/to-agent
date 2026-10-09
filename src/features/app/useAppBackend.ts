import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ThinkingLevel } from '../../shared/model-api'
import type {
  AppState,
  BusyEnterMode,
  DshConversationRunningCall,
  LiveContextUsage,
  PromptBudgetSnapshot,
  SessionStatsSnapshot,
  OrchestrationChoicePrompt,
  PermissionMode,
  PermissionPromptPayload,
  PromptQueueSnapshot,
  ToolTraceItem,
  UserQuestionPromptPayload,
  WorkspaceTrustState,
} from '../../shared/app-api'
import { useDshConversationView } from '../dsh-runtime/useDshConversationView'
import { matchDshConversationView } from '../dsh-runtime/matchDshConversationView'
import {
  applyDshProjectionMetadata,
  shouldPreferDshTranscript,
} from '../dsh-runtime/projectionStream'
import { mergeStoredMessagesWithDshTranscript } from '../dsh-runtime/dshTranscriptMessages'
import { liveContextFromDshProjections } from '../chat/session-usage'
import { readHostPlanMode, readHostTodos } from '../chat/hostPlanTodoProjection'
import type { AssistantContentBlock, TaskNode } from '../../types'
import { type ConversationStreamSnapshot } from '../chat/conversation-stream-buffer'
import { getBridge } from './getBridge'
import { useThreadActions } from './hooks/useThreadActions'
import { useWorkspaceActions } from './hooks/useWorkspaceActions'
import { usePrompts } from './hooks/usePrompts'
import { useTaskActions } from './hooks/useTaskActions'
import { useSkills } from './hooks/useSkills'
import { useConversationRun } from './hooks/useConversationRun'

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
  const [workspaceTrust, setWorkspaceTrustState] = useState<WorkspaceTrustState | null>(null)
  const [sending, setSending] = useState(false)
  // Host `/compact` in flight per conversation; cleared on compaction event, reply, or turn end.
  const [pendingCompactionIds, setPendingCompactionIds] = useState<string[]>([])
  // Bumped per conversation whenever a compaction lands (stream event or committed reply).
  const [compactedSeqById, setCompactedSeqById] = useState<Record<string, number>>({})
  const clearPendingCompaction = useCallback((conversationId?: string | null) => {
    if (!conversationId) return
    setPendingCompactionIds((current) => current.includes(conversationId) ? current.filter((id) => id !== conversationId) : current)
  }, [])
  const markCompacted = useCallback((conversationId?: string | null) => {
    if (!conversationId) return
    setCompactedSeqById((current) => ({ ...current, [conversationId]: (current[conversationId] ?? 0) + 1 }))
    clearPendingCompaction(conversationId)
  }, [clearPendingCompaction])
  const [streamText, setStreamText] = useState<string | null>(null)
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null)
  const [streamThinking, setStreamThinking] = useState<{ text: string; durationMs?: number; isActive?: boolean } | null>(null)
  const [streamActivity, setStreamActivity] = useState<string | null>(null)
  const [streamBlocks, setStreamBlocks] = useState<AssistantContentBlock[]>([])
  const { skills, skillsLoading, refreshSkills } = useSkills(workspacePathRef)
  const [toolTraces, setToolTraces] = useState<ToolTraceItem[]>([])
  const [promptQueue, setPromptQueue] = useState<PromptQueueSnapshot>({ steering: [], followUp: [] })
  const [orchestrationChoice, setOrchestrationChoice] = useState<OrchestrationChoicePrompt | null>(null)
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptPayload | null>(null)
  const [userQuestionPrompt, setUserQuestionPrompt] = useState<UserQuestionPromptPayload | null>(null)
  const userQuestionPromptsRef = useRef(new Map<string, UserQuestionPromptPayload[]>())
  const [liveContext, setLiveContext] = useState<LiveContextUsage | null>(null)
  const [promptBudget, setPromptBudget] = useState<PromptBudgetSnapshot | null>(null)
  const [sessionStats, setSessionStats] = useState<SessionStatsSnapshot | null>(null)
  const [busyEnterMode, setBusyEnterMode] = useState<BusyEnterMode>('followUp')
  const activeConversationIdRef = useRef<string | null>(null)
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
    setPromptBudget(null)
    setSessionStats(null)
    setPromptQueue(emptyPromptQueue())
    setOrchestrationChoice(null)
    setPermissionPrompt(null)
    setUserQuestionPrompt(null)
    setRetryBanner(null)
  }, [])

  const bridgeReady = Boolean(getBridge()?.app)
  const { view: dshView, subscribed: dshProjectionSubscribed } = useDshConversationView(
    bridgeReady ? state?.conversationId : null,
  )
  const activeDshView = matchDshConversationView(dshView, state?.conversationId)
  const [preferDshTranscriptPref, setPreferDshTranscriptPref] = useState(true)
  useEffect(() => {
    void window.taskweaver?.preferences?.get?.().then((res) => {
      if (res?.ok && res.data) setPreferDshTranscriptPref(res.data.preferDshTranscript !== false)
    })
  }, [])
  const preferDshTranscript = shouldPreferDshTranscript(
    dshProjectionSubscribed,
    state?.conversationId,
    activeDshView,
    preferDshTranscriptPref,
  )
  const dshToolRows = useMemo(() => {
    if (!activeDshView?.toolRows?.length) return []
    return activeDshView.toolRows
  }, [activeDshView])
  const projectionLiveContext = useMemo(
    () => liveContextFromDshProjections(activeDshView?.projections),
    [activeDshView?.projections],
  )
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
      preferDshTranscript,
      sending,
    ),
    [state?.messages, activeDshView?.transcript, preferDshTranscript, sending],
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

  const reloadRef = useRef<() => Promise<void>>(async () => {})

  const {
    refs: conversationRunRefs,
    runningConversationIds,
    completedConversationIds,
    setCompletedConversationIds,
    isConversationRunning,
    syncRunningConversationsFromBackend,
    sendMessage,
    cancelMessage,
    steerMessage,
    followUpMessage,
    confirmOrchestration,
    dismissOrchestrationChoice,
    mutateQueue,
  } = useConversationRun({
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
    reload: () => reloadRef.current(),
    markCompacted,
    clearPendingCompaction,
    setPendingCompactionIds,
    preferDshTranscript,
  })

  const {
    conversationStartedAtRef,
    conversationStreamRef,
    orchestrationChoicesRef,
  } = conversationRunRefs

  const refreshWorkspaceTrust = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.workspace?.getTrust) return
    const res = await bridge.workspace.getTrust()
    if (res.ok) setWorkspaceTrustState(res.data)
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
    void refreshWorkspaceTrust()
    const enterMode = await bridge.models?.getBusyEnterMode?.()
    if (enterMode?.ok) setBusyEnterMode(enterMode.data)
    await refreshSessionStats()
    const runningRes = await bridge.chat?.listRunningConversations?.()
    if (runningRes?.ok && Array.isArray(runningRes.data)) {
      syncRunningConversationsFromBackend(runningRes.data)
    }
  }, [refreshSessionStats, refreshSkills, refreshWorkspaceTrust, syncRunningConversationsFromBackend])

  reloadRef.current = reload

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (state?.conversationId) void refreshSessionStats(state.conversationId)
  }, [refreshSessionStats, state?.conversationId])

  useEffect(() => {
    if (!preferDshTranscript || !activeDshView) return
    applyDshProjectionMetadata(activeDshView, {
      setStreamActivity,
      setPromptQueue,
    })
  }, [preferDshTranscript, activeDshView])

  useEffect(() => {
    if (preferDshTranscript) return
    if (activeDshView?.toolRows?.length) return
    if (!activeDshView?.runningCalls?.length) return
    if (activeDshView.conversationId !== activeConversationIdRef.current) return
    setToolTraces((current) => mergeDshRunningCallsIntoTraces(current, activeDshView.runningCalls))
  }, [activeDshView, preferDshTranscript])


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
    const chat = getBridge()?.chat
    if (!chat?.onPromptBudget) return
    return chat.onPromptBudget((snapshot) => {
      if (snapshot.conversationId !== activeConversationIdRef.current) return
      setPromptBudget(snapshot)
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


  const {
    setWorkspaceTrust,
    setWorkspace,
    pickWorkspace,
    searchWorkspaceContext,
    createDroppedReference,
  } = useWorkspaceActions({
    setState,
    setError,
    setWorkspaceTrustState,
    workspacePathRef,
    activeConversationIdRef,
    resetTransientConversationState,
    refreshSkills,
    refreshWorkspaceTrust,
    isConversationRunning,
    conversationStartedAtRef,
    permissionPromptsRef,
    userQuestionPromptsRef,
    setToolTraces,
    setSending,
    setStreamStartedAt,
    setPermissionPrompt,
    setUserQuestionPrompt,
  })

  const {
    switchThread,
    renameThread,
    togglePinThread,
    toggleArchiveThread,
    searchThreads,
    deleteThread,
    forkThread,
    clearConversation,
  } = useThreadActions({
    state,
    setState,
    setError,
    resetTransientConversationState,
    refreshSkills,
    refreshSessionStats,
    isConversationRunning,
    applyConversationStreamSnapshot,
    activeConversationIdRef,
    conversationStartedAtRef,
    conversationStreamRef,
    orchestrationChoicesRef,
    permissionPromptsRef,
    userQuestionPromptsRef,
    setCompletedConversationIds,
    setToolTraces,
    setSending,
    setStreamStartedAt,
    setOrchestrationChoice,
    setPermissionPrompt,
    setUserQuestionPrompt,
  })

  const { respondPermissionPrompt, answerUserQuestion, cancelUserQuestion } = usePrompts({
    permissionPrompt,
    setPermissionPrompt,
    setUserQuestionPrompt,
    permissionPromptsRef,
    userQuestionPromptsRef,
    activeConversationIdRef,
  })

  const { sendTaskMessage, cancelTask } = useTaskActions(activeConversationIdRef, setError)


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

  return {
    bridgeReady,
    state,
    messages: displayMessages,
    storedMessages: state?.messages ?? [],
    tasks: (state?.tasks ?? []) as TaskNode[],
    threadTitle: state?.threadTitle ?? '新对话',
    workspacePath: state?.workspacePath ?? null,
    workspaceTrust,
    setWorkspaceTrust,
    loading,
    error,
    sending,
    compacting: Boolean(state?.conversationId && pendingCompactionIds.includes(state.conversationId)),
    compactedSeq: state?.conversationId ? compactedSeqById[state.conversationId] ?? 0 : 0,
    streamText,
    streamStartedAt,
    streamThinking,
    streamActivity,
    streamBlocks,
    permissionPrompt,
    respondPermissionPrompt,
    userQuestionPrompt,
    answerUserQuestion,
    cancelUserQuestion,
    liveContext: projectionLiveContext ?? liveContext,
    promptBudget,
    sessionStats,
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
    cancelTask,
    setCurrentThreadModel,
  }
}
