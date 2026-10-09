import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type {
  AppState,
  ForkThreadResult,
  OrchestrationChoicePrompt,
  PermissionPromptPayload,
  ThreadSearchResult,
  ToolTraceItem,
  UserQuestionPromptPayload,
} from '../../../shared/app-api'
import type { ConversationStreamSnapshot } from '../../chat/conversation-stream-buffer'
import { getBridge } from '../getBridge'

export type ThreadActionsOptions = {
  state: AppState | null
  setState: Dispatch<SetStateAction<AppState | null>>
  setError: (message: string | null) => void
  resetTransientConversationState: () => void
  refreshSkills: (workspacePath: string | null | undefined) => void
  refreshSessionStats: () => void
  isConversationRunning: (conversationId: string) => boolean
  applyConversationStreamSnapshot: (snapshot: ConversationStreamSnapshot) => void
  activeConversationIdRef: MutableRefObject<string | null>
  conversationStartedAtRef: MutableRefObject<Map<string, number>>
  conversationStreamRef: MutableRefObject<Map<string, ConversationStreamSnapshot>>
  orchestrationChoicesRef: MutableRefObject<Map<string, OrchestrationChoicePrompt>>
  permissionPromptsRef: MutableRefObject<Map<string, PermissionPromptPayload>>
  userQuestionPromptsRef: MutableRefObject<Map<string, UserQuestionPromptPayload[]>>
  setCompletedConversationIds: Dispatch<SetStateAction<string[]>>
  setToolTraces: Dispatch<SetStateAction<ToolTraceItem[]>>
  setSending: Dispatch<SetStateAction<boolean>>
  setStreamStartedAt: Dispatch<SetStateAction<number | null>>
  setOrchestrationChoice: Dispatch<SetStateAction<OrchestrationChoicePrompt | null>>
  setPermissionPrompt: Dispatch<SetStateAction<PermissionPromptPayload | null>>
  setUserQuestionPrompt: Dispatch<SetStateAction<UserQuestionPromptPayload | null>>
}

export function useThreadActions(options: ThreadActionsOptions) {
  const {
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
  } = options

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
    if (!isConversationRunning(res.data.conversationId)) {
      conversationStartedAtRef.current.delete(res.data.conversationId)
      conversationStreamRef.current.delete(res.data.conversationId)
    }
    return true
  }, [
    applyConversationStreamSnapshot,
    isConversationRunning,
    refreshSkills,
    resetTransientConversationState,
    activeConversationIdRef,
    conversationStartedAtRef,
    conversationStreamRef,
    orchestrationChoicesRef,
    permissionPromptsRef,
    userQuestionPromptsRef,
    setCompletedConversationIds,
    setState,
    setError,
    setToolTraces,
    setSending,
    setStreamStartedAt,
    setOrchestrationChoice,
    setPermissionPrompt,
    setUserQuestionPrompt,
  ])

  const renameThread = useCallback(async (threadId: string, title: string) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    const res = await bridge.app.renameThread(threadId, title)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    setState((current) => current ? {
      ...current,
      threadTitle: current.currentThreadId === threadId ? title.trim().slice(0, 80) : current.threadTitle,
      threads: res.data,
    } : current)
    setError(null)
    return true
  }, [setState, setError])

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
  }, [setState, setError])

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
  }, [setState, setError])

  const searchThreads = useCallback(async (query: string): Promise<ThreadSearchResult[]> => {
    const bridge = getBridge()
    if (!bridge?.app?.searchThreads) return []
    const res = await bridge.app.searchThreads(query)
    if (!res.ok) {
      setError(res.error)
      return []
    }
    return res.data
  }, [setError])

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
  }, [refreshSessionStats, resetTransientConversationState, setState, setError, setToolTraces])

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
  }, [
    isConversationRunning,
    refreshSkills,
    resetTransientConversationState,
    activeConversationIdRef,
    conversationStartedAtRef,
    permissionPromptsRef,
    userQuestionPromptsRef,
    setState,
    setError,
    setToolTraces,
    setSending,
    setStreamStartedAt,
    setPermissionPrompt,
    setUserQuestionPrompt,
  ])

  const forkThread = useCallback(async (messageId: string): Promise<ForkThreadResult | null> => {
    const bridge = getBridge()
    if (!bridge?.app) return null
    const currentThreadId = state?.currentThreadId
    if (!currentThreadId) return null
    const res = await bridge.app.forkThread(currentThreadId, messageId)
    if (!res.ok) {
      setError(res.error)
      return null
    }
    resetTransientConversationState()
    setState(res.data.state)
    setToolTraces([])
    setError(null)
    void refreshSessionStats()
    return res.data
  }, [refreshSessionStats, resetTransientConversationState, state?.currentThreadId, setState, setError, setToolTraces])

  return {
    switchThread,
    renameThread,
    togglePinThread,
    toggleArchiveThread,
    searchThreads,
    deleteThread,
    forkThread,
    clearConversation,
  }
}
