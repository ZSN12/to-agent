import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThinkingLevel } from '../../shared/model-api'
import type {
  AppState,
  BusyEnterMode,
  ChatStreamEvent,
  LiveContextUsage,
  SessionStatsSnapshot,
  OrchestrationChoicePrompt,
  PermissionMode,
  PermissionPromptPayload,
  PromptQueueSnapshot,
  SkillOption,
  ThreadSummary,
  ToolTraceItem,
  WorkMode,
  WorkspaceEntry,
  WorkspaceReference,
} from '../../shared/app-api'
import type { AssistantContentBlock, ChatMessage, TaskNode } from '../../types'

function getBridge() {
  return window.taskweaver
}

export function useAppBackend() {
  const [state, setState] = useState<AppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [streamText, setStreamText] = useState<string | null>(null)
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null)
  const [streamThinking, setStreamThinking] = useState<{ text: string; durationMs?: number } | null>(null)
  const [streamBlocks, setStreamBlocks] = useState<AssistantContentBlock[]>([])
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [toolTraces, setToolTraces] = useState<ToolTraceItem[]>([])
  const [promptQueue, setPromptQueue] = useState<PromptQueueSnapshot>({ steering: [], followUp: [] })
  const [orchestrationChoice, setOrchestrationChoice] = useState<OrchestrationChoicePrompt | null>(null)
  const orchestrationChoicesRef = useRef(new Map<string, OrchestrationChoicePrompt>())
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptPayload | null>(null)
  const [liveContext, setLiveContext] = useState<LiveContextUsage | null>(null)
  const [sessionStats, setSessionStats] = useState<SessionStatsSnapshot | null>(null)
  const [busyEnterMode, setBusyEnterMode] = useState<BusyEnterMode>('followUp')
  const activeConversationIdRef = useRef<string | null>(null)
  const runningConversationsRef = useRef(new Set<string>())
  const [runningConversationIds, setRunningConversationIds] = useState<string[]>([])
  const syncRunningConversationIds = useCallback(() => {
    setRunningConversationIds([...runningConversationsRef.current])
  }, [])
  const conversationStartedAtRef = useRef(new Map<string, number>())
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

  const resetTransientConversationState = useCallback(() => {
    setStreamText(null)
    setStreamStartedAt(null)
    setStreamThinking(null)
    setStreamBlocks([])
    setLiveContext(null)
    setSessionStats(null)
    setPromptQueue(emptyPromptQueue())
    setOrchestrationChoice(null)
    setPermissionPrompt(null)
    setRetryBanner(null)
  }, [])

  const bridgeReady = Boolean(getBridge()?.app)

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
    const skillResult = await bridge.skills?.list()
    if (skillResult?.ok) setSkills(skillResult.data)
    const enterMode = await bridge.models?.getBusyEnterMode?.()
    if (enterMode?.ok) setBusyEnterMode(enterMode.data)
    await refreshSessionStats()
    const runningRes = await bridge.chat?.listRunningConversations?.()
    if (runningRes?.ok && Array.isArray(runningRes.data)) {
      runningConversationsRef.current = new Set(runningRes.data)
      setRunningConversationIds(runningRes.data)
    }
  }, [refreshSessionStats])

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
      runningConversationsRef.current = new Set(res.data)
      setRunningConversationIds(res.data)
    }
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
    if (!bridge?.chat) return
    return bridge.chat.onStream((event: ChatStreamEvent) => {
      if (event.type === 'start' && event.conversationId) {
        runningConversationsRef.current.add(event.conversationId)
        syncRunningConversationIds()
        const startedAt = event.startedAt ?? Date.now()
        conversationStartedAtRef.current.set(event.conversationId, startedAt)
        if (activeConversationIdRef.current === event.conversationId) {
          setSending(true)
          setStreamStartedAt(startedAt)
        }
      }
      if ((event.type === 'done' || event.type === 'error') && event.conversationId) {
        runningConversationsRef.current.delete(event.conversationId)
        syncRunningConversationIds()
        conversationStartedAtRef.current.delete(event.conversationId)
        if (activeConversationIdRef.current === event.conversationId) {
          setSending(false)
          setStreamStartedAt(null)
        }
      }
      if (event.conversationId && event.conversationId !== activeConversationIdRef.current) return

      if (event.type === 'thinking_start') {
        // 多轮工具循环会重复 thinking_start；勿清空已累积内容
        setStreamThinking((prev) => {
          if (prev?.text?.trim()) return { text: prev.text, durationMs: prev.durationMs ?? 0 }
          return { text: '', durationMs: prev?.durationMs ?? 0 }
        })
      }
      if (event.type === 'thinking_delta') {
        setStreamThinking((prev) => ({
          text: event.fullThinking || prev?.text || '',
          durationMs: prev?.durationMs,
        }))
      }
      if (event.type === 'thinking_end') {
        setStreamThinking((prev) => ({
          text: event.fullThinking || prev?.text || '',
          durationMs: event.durationMs ?? prev?.durationMs,
        }))
      }
      if (event.type === 'delta') setStreamText(event.full)
      if (event.type === 'done') {
        setStreamText(event.full)
        if (event.fullThinking && String(event.fullThinking).trim()) {
          setStreamThinking((prev) => ({
            text: String(event.fullThinking),
            durationMs: event.thinkingDurationMs ?? prev?.durationMs,
          }))
        }
        if (event.contentBlocks?.length) {
          setStreamBlocks(event.contentBlocks)
        }
        setPromptQueue(emptyPromptQueue())
        void refreshSessionStats()
      }
      if (event.type === 'error') {
        setError(event.message)
        setPromptQueue(emptyPromptQueue())
      }
      if (event.type === 'blocks') {
        setStreamBlocks(event.segments)
      }
      if (event.type === 'start') {
        setStreamText('')
        setStreamThinking(null)
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
  }, [refreshSessionStats, syncRunningConversationIds])

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
    if (!sending) {
      setLiveContext(null)
      return
    }
    const bridge = getBridge()
    if (!bridge?.chat?.getLiveContext) return
    const timer = window.setInterval(() => {
      const expectedConversationId = activeConversationIdRef.current
      void bridge.chat.getLiveContext().then((res) => {
        if (res.ok && expectedConversationId === activeConversationIdRef.current) setLiveContext(res.data)
      })
      void bridge.chat.getSessionStats?.().then((res) => {
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
      if (sendConversationId) {
        runningConversationsRef.current.add(sendConversationId)
        syncRunningConversationIds()
      }
      const optimisticStartedAt = Date.now()
      if (sendConversationId) conversationStartedAtRef.current.set(sendConversationId, optimisticStartedAt)
      setStreamStartedAt(optimisticStartedAt)
      setState((current) => current ? { ...current, messages: [...current.messages, optimisticMessage] } : current)
      setSending(true)
      setStreamText(null)
      setStreamThinking(null)
      setStreamBlocks([])
      setToolTraces([])
      setPromptQueue(emptyPromptQueue())
      setError(null)
      const res = await bridge.chat.send(text, modelKey ?? null, skillName ?? null, executionModeOverride ?? null, workMode ?? 'code', sendConversationId)
      if (!res.ok) {
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
          await reload()
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
        setSending(false)
        setStreamText(null)
        setStreamThinking(null)
        setStreamBlocks([])
        await reload()
      }
      return true
    },
    [reload, syncRunningConversationIds],
  )

  const cancelMessage = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.chat) return false
    const res = await bridge.chat.cancel()
    if (!res.ok) {
      setError(res.error)
      return false
    }
    return res.data.stopped
  }, [])

  const steerMessage = useCallback(async (text: string) => {
    const bridge = getBridge()
    if (!bridge?.chat) return false
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
    const res = await bridge.chat.steer(text)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    return true
  }, [])

  const followUpMessage = useCallback(async (text: string) => {
    const bridge = getBridge()
    if (!bridge?.chat) return false
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
    const res = await bridge.chat.followUp(text)
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
    setToolTraces([])
    setSending(isConversationRunning(res.data.conversationId))
    setStreamStartedAt(conversationStartedAtRef.current.get(res.data.conversationId) ?? null)
    setPermissionPrompt(permissionPromptsRef.current.get(res.data.conversationId) ?? null)
    return true
  }, [isConversationRunning, resetTransientConversationState])

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
    setToolTraces([])
    return true
  }, [resetTransientConversationState])

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
    setToolTraces(res.data.state.outputLogs ?? [])
    setSending(isConversationRunning(res.data.state.conversationId))
    setStreamStartedAt(conversationStartedAtRef.current.get(res.data.state.conversationId) ?? null)
    setPermissionPrompt(permissionPromptsRef.current.get(res.data.state.conversationId) ?? null)
    setError(null)
    return true
  }, [isConversationRunning, resetTransientConversationState])

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
    setState(res.data)
    setToolTraces(res.data.outputLogs ?? [])
    setSending(isConversationRunning(res.data.conversationId))
    setStreamStartedAt(conversationStartedAtRef.current.get(res.data.conversationId) ?? null)
    setOrchestrationChoice(orchestrationChoicesRef.current.get(res.data.conversationId) ?? null)
    setPermissionPrompt(permissionPromptsRef.current.get(res.data.conversationId) ?? null)
    setError(null)
    return true
  }, [isConversationRunning, refreshSessionStats, resetTransientConversationState])

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
    action: 'allow-once' | 'allow-always' | 'deny' | 'escalate-once',
    sandboxMode?: 'workspace-write' | 'danger-full-access',
  ) => {
    const bridge = getBridge()
    if (!bridge?.permission?.respondPrompt || !permissionPrompt) return false
    const res = await bridge.permission.respondPrompt(permissionPrompt.id, {
      action,
      ...(sandboxMode ? { sandboxMode } : {}),
    })
    for (const [conversationId, prompt] of permissionPromptsRef.current) {
      if (prompt.id === permissionPrompt.id) permissionPromptsRef.current.delete(conversationId)
    }
    setPermissionPrompt(null)
    return res.ok
  }, [permissionPrompt])

  const mutateQueue = useCallback(async (payload: {
    kind: 'steering' | 'followUp'
    index: number
    action: 'remove' | 'update'
    text?: string
  }) => {
    const bridge = getBridge()
    if (!bridge?.chat?.queueMutate) return false
    const res = await bridge.chat.queueMutate(payload)
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

  const setCurrentThreadModel = useCallback((modelKey: string, thinkingLevel?: ThinkingLevel) => {
    setState((current) => {
      if (!current) return current
      return {
        ...current,
        modelKey,
        ...(thinkingLevel ? { thinkingLevel } : {}),
        threads: current.threads.map((t) => (t.id === current.currentThreadId ? { ...t, modelKey, ...(thinkingLevel ? { thinkingLevel } : {}) } : t)),
      }
    })
  }, [])

  return {
    bridgeReady,
    state,
    messages: state?.messages ?? [],
    tasks: (state?.tasks ?? []) as TaskNode[],
    threadTitle: state?.threadTitle ?? '新对话',
    workspacePath: state?.workspacePath ?? null,
    loading,
    error,
    sending,
    streamText,
    streamStartedAt,
    streamThinking,
    streamBlocks,
    permissionPrompt,
    respondPermissionPrompt,
    liveContext,
    sessionStats,
    refreshSessionStats,
    busyEnterMode,
    setBusyEnterMode: setBusyEnterModePref,
    mutateQueue,
    retryBanner,
    toolTraces,
    promptQueue,
    skills,
    threads: state?.threads ?? [],
    currentThreadId: state?.currentThreadId ?? null,
    runningConversationIds,
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
