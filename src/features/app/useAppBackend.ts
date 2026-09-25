import { useCallback, useEffect, useRef, useState } from 'react'
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
  ToolTraceItem,
  WorkMode,
  WorkspaceEntry,
  WorkspaceReference,
} from '../../shared/app-api'
import type { ChatMessage, TaskNode } from '../../types'

function getBridge() {
  return window.taskweaver
}

export function useAppBackend() {
  const [state, setState] = useState<AppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [streamText, setStreamText] = useState<string | null>(null)
  const [streamThinking, setStreamThinking] = useState<{ text: string; durationMs?: number } | null>(null)
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [toolTraces, setToolTraces] = useState<ToolTraceItem[]>([])
  const [promptQueue, setPromptQueue] = useState<PromptQueueSnapshot>({ steering: [], followUp: [] })
  const [orchestrationChoice, setOrchestrationChoice] = useState<OrchestrationChoicePrompt | null>(null)
  const [streamStalled, setStreamStalled] = useState(false)
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptPayload | null>(null)
  const [liveContext, setLiveContext] = useState<LiveContextUsage | null>(null)
  const [sessionStats, setSessionStats] = useState<SessionStatsSnapshot | null>(null)
  const [busyEnterMode, setBusyEnterMode] = useState<BusyEnterMode>('steer')
  const [retryBanner, setRetryBanner] = useState<{
    attempt: number
    maxAttempts?: number
    delayMs?: number
    message?: string
  } | null>(null)
  const lastStreamActivityRef = useRef(0)

  const STREAM_STALL_MS = 45_000

  const bumpStreamActivity = useCallback(() => {
    lastStreamActivityRef.current = Date.now()
    setStreamStalled(false)
  }, [])

  const emptyPromptQueue = (): PromptQueueSnapshot => ({ steering: [], followUp: [] })

  const bridgeReady = Boolean(getBridge()?.app)

  const refreshSessionStats = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.chat?.getSessionStats) return
    const res = await bridge.chat.getSessionStats()
    if (res.ok) setSessionStats(res.data)
  }, [])

  const reload = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.app) {
      setLoading(false)
      setError('请在 Electron 桌面应用中运行以加载后端状态。')
      return
    }
    setLoading(true)
    const res = await bridge.app.getState()
    if (!res.ok) {
      setError(res.error)
      setLoading(false)
      return
    }
    setState(res.data)
    setToolTraces(res.data.outputLogs ?? [])
    setError(null)
    setLoading(false)
    const skillResult = await bridge.skills?.list()
    if (skillResult?.ok) setSkills(skillResult.data)
    const enterMode = await bridge.models?.getBusyEnterMode?.()
    if (enterMode?.ok) setBusyEnterMode(enterMode.data)
    await refreshSessionStats()
  }, [refreshSessionStats])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge?.chat) return
    return bridge.chat.onStream((event: ChatStreamEvent) => {
      const activityEvents = new Set([
        'start',
        'delta',
        'thinking_start',
        'thinking_delta',
        'thinking_end',
        'progress',
        'tool',
      ])
      if (activityEvents.has(event.type)) bumpStreamActivity()

      if (event.type === 'thinking_start') {
        setStreamThinking({ text: '', durationMs: 0 })
      }
      if (event.type === 'thinking_delta') {
        setStreamThinking((prev) => ({ text: event.fullThinking, durationMs: prev?.durationMs }))
      }
      if (event.type === 'thinking_end') {
        setStreamThinking({ text: event.fullThinking, durationMs: event.durationMs })
      }
      if (event.type === 'delta') setStreamText(event.full)
      if (event.type === 'done') {
        setStreamText(event.full)
        if (event.fullThinking) {
          setStreamThinking((prev) => ({ text: event.fullThinking!, durationMs: prev?.durationMs }))
        }
        setPromptQueue(emptyPromptQueue())
        setStreamStalled(false)
        void refreshSessionStats()
      }
      if (event.type === 'error') {
        setError(event.message)
        setPromptQueue(emptyPromptQueue())
        setStreamStalled(false)
      }
      if (event.type === 'start') {
        setStreamText('')
        setStreamThinking(null)
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
        const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
        const entry: ChatMessage = {
          id: `compact-${Date.now()}`,
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
        setState((current) => (current ? { ...current, messages: [...current.messages, entry] } : current))
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
  }, [bumpStreamActivity, refreshSessionStats])

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge?.permission?.onPrompt) return
    return bridge.permission.onPrompt((payload) => {
      setPermissionPrompt(payload)
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
      void bridge.chat.getLiveContext().then((res) => {
        if (res.ok) setLiveContext(res.data)
      })
      void bridge.chat.getSessionStats?.().then((res) => {
        if (res?.ok) setSessionStats(res.data)
      })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [sending])

  useEffect(() => {
    if (!sending) {
      setStreamStalled(false)
      return
    }
    bumpStreamActivity()
    const timer = window.setInterval(() => {
      if (!sending) return
      if (Date.now() - lastStreamActivityRef.current >= STREAM_STALL_MS) {
        setStreamStalled(true)
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [bumpStreamActivity, sending])

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
      const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
      const optimisticMessage: ChatMessage = {
        id: `optimistic-u-${Date.now()}`,
        author: 'user',
        name: '你',
        time,
        text,
      }
      setState((current) => current ? { ...current, messages: [...current.messages, optimisticMessage] } : current)
      setSending(true)
      setStreamStalled(false)
      setStreamText(null)
      setStreamThinking(null)
      setToolTraces([])
      lastStreamActivityRef.current = Date.now()
      setPromptQueue(emptyPromptQueue())
      setError(null)
      const res = await bridge.chat.send(text, modelKey ?? null, skillName ?? null, executionModeOverride ?? null, workMode ?? 'code')
      if (!res.ok) {
        setSending(false)
        setStreamText(null)
        await reload()
        setError(res.error)
        return false
      }
      if (res.data.needsOrchestrationChoice) {
        setOrchestrationChoice({
          text,
          modelKey,
          skillName,
          reason: res.data.reason ?? '是否启用多 Agent 编排？',
          suggestedMode: res.data.suggestedMode ?? 'multi-agent',
        })
        setSending(false)
        setStreamText(null)
        return false
      }
      setOrchestrationChoice(null)
      setSending(false)
      setStreamText(null)
      await reload()
      return true
    },
    [reload],
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
      setOrchestrationChoice(null)
      return sendMessage(text, modelKey, skillName, mode)
    },
    [orchestrationChoice, sendMessage],
  )

  const dismissOrchestrationChoice = useCallback(() => {
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
    setState(res.data)
    setToolTraces([])
    return true
  }, [])

  const setWorkspace = useCallback(async (workspacePath: string | null) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.setWorkspace(workspacePath)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setState(res.data)
    setToolTraces([])
    return true
  }, [])

  const pickWorkspace = useCallback(async () => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.pickWorkspace()
    if (!res.ok) {
      setError(res.error)
      return false
    }
    if (res.data.cancelled) return false
    setState(res.data.state)
    setToolTraces(res.data.state.outputLogs ?? [])
    setError(null)
    return true
  }, [])

  const switchThread = useCallback(async (threadId: string) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.switchThread(threadId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setState(res.data)
    setToolTraces(res.data.outputLogs ?? [])
    setStreamText(null)
    setError(null)
    return true
  }, [])

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

  const deleteThread = useCallback(async (threadId: string) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.deleteThread(threadId)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setState(res.data)
    setToolTraces(res.data.outputLogs ?? [])
    setStreamText(null)
    setError(null)
    return true
  }, [])

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
    setState(res.data)
    setToolTraces([])
    setStreamText(null)
    setError(null)
    return true
  }, [state?.currentThreadId])

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

  const respondPermissionPrompt = useCallback(async (action: 'allow-once' | 'allow-always' | 'deny') => {
    const bridge = getBridge()
    if (!bridge?.permission?.respondPrompt || !permissionPrompt) return false
    const res = await bridge.permission.respondPrompt(permissionPrompt.id, { action })
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
    const res = await bridge.tasks.sendMessage(taskId, text)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    return true
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
    streamStalled,
    streamText,
    streamThinking,
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
    deleteThread,
    forkThread,
    searchWorkspaceContext,
    createDroppedReference,
    setPermissionMode,
    sendTaskMessage,
  }
}
