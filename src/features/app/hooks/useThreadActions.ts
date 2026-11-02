import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type {
  AppState,
  ForkThreadResult,
  RewindThreadResult,
  PermissionPromptPayload,
  ThreadSearchResult,
  ToolTraceItem,
  UserQuestionPromptPayload,
} from '../../../shared/app-api'
import type { ConversationStreamSnapshot } from '../../chat/conversation-stream-buffer'
import { getBridge } from '../getBridge'
import { createNavigationQueue } from './navigation-queue'
import { clearWorkbenchConversationState } from '../../workbench/workbench-file-state'

export type ThreadActionsOptions = {
  state: AppState | null
  setState: Dispatch<SetStateAction<AppState | null>>
  setError: (message: string | null) => void
  invalidateStateReload?: () => void
  resetTransientConversationState: () => void
  refreshSkills: (workspacePath: string | null | undefined) => void
  refreshSessionStats: () => void
  isConversationRunning: (conversationId: string) => boolean
  applyConversationStreamSnapshot: (snapshot: ConversationStreamSnapshot) => void
  activeConversationIdRef: MutableRefObject<string | null>
  conversationStartedAtRef: MutableRefObject<Map<string, number>>
  conversationStreamRef: MutableRefObject<Map<string, ConversationStreamSnapshot>>
  permissionPromptsRef: MutableRefObject<Map<string, PermissionPromptPayload>>
  userQuestionPromptsRef: MutableRefObject<Map<string, UserQuestionPromptPayload[]>>
  setCompletedConversationIds: Dispatch<SetStateAction<string[]>>
  setToolTraces: Dispatch<SetStateAction<ToolTraceItem[]>>
  setSending: Dispatch<SetStateAction<boolean>>
  setStreamStartedAt: Dispatch<SetStateAction<number | null>>
  setPermissionPrompt: Dispatch<SetStateAction<PermissionPromptPayload | null>>
  setUserQuestionPrompt: Dispatch<SetStateAction<UserQuestionPromptPayload | null>>
}

export function useThreadActions(options: ThreadActionsOptions) {
  const navigationQueue = useRef(createNavigationQueue())
  const {
    state,
    setState,
    setError,
    invalidateStateReload,
    resetTransientConversationState,
    refreshSkills,
    refreshSessionStats,
    isConversationRunning,
    applyConversationStreamSnapshot,
    activeConversationIdRef,
    conversationStartedAtRef,
    conversationStreamRef,
    permissionPromptsRef,
    userQuestionPromptsRef,
    setCompletedConversationIds,
    setToolTraces,
    setSending,
    setStreamStartedAt,
    setPermissionPrompt,
    setUserQuestionPrompt,
  } = options

  const switchThread = useCallback(async (threadId: string) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    invalidateStateReload?.()
    const result = await navigationQueue.current.run(() => bridge.app.switchThread(threadId))
    if (!result.current) return false
    if (!result.ok) {
      setError(result.error instanceof Error ? result.error.message : '会话操作失败，请重试')
      return false
    }
    const res = result.value
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
    setPermissionPrompt(permissionPromptsRef.current.get(res.data.conversationId) ?? null)
    setUserQuestionPrompt(userQuestionPromptsRef.current.get(res.data.conversationId)?.[0] ?? null)
    setError(null)
    if (!isConversationRunning(res.data.conversationId)) {
      conversationStartedAtRef.current.delete(res.data.conversationId)
      conversationStreamRef.current.delete(res.data.conversationId)
    }
    return true
  }, [
    invalidateStateReload,
    applyConversationStreamSnapshot,
    isConversationRunning,
    refreshSkills,
    resetTransientConversationState,
    activeConversationIdRef,
    conversationStartedAtRef,
    conversationStreamRef,
    permissionPromptsRef,
    userQuestionPromptsRef,
    setCompletedConversationIds,
    setState,
    setError,
    setToolTraces,
    setSending,
    setStreamStartedAt,
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
    invalidateStateReload?.()
    const result = await navigationQueue.current.run(() => bridge.app.deleteThread(threadId))
    if (!result.current) return false
    if (!result.ok) {
      setError(result.error instanceof Error ? result.error.message : '会话操作失败，请重试')
      return false
    }
    const res = result.value
    if (!res.ok) {
      setError(res.error)
      return false
    }
    const deletedThread = state?.threads.find((thread) => thread.id === threadId)
    if (deletedThread?.conversationId) {
      const id = deletedThread.conversationId
      conversationStartedAtRef.current.delete(id)
      conversationStreamRef.current.delete(id)
      permissionPromptsRef.current.delete(id)
      userQuestionPromptsRef.current.delete(id)
      setCompletedConversationIds((ids) => ids.filter((item) => item !== id))
      try { clearWorkbenchConversationState(window.localStorage, id) } catch { /* optional view storage */ }
    }
    if (state?.currentThreadId === threadId) {
      resetTransientConversationState()
      activeConversationIdRef.current = res.data.conversationId
      setState(res.data)
      const snapshot = conversationStreamRef.current.get(res.data.conversationId)
      if (snapshot) applyConversationStreamSnapshot(snapshot)
      else setToolTraces(res.data.outputLogs ?? [])
      setSending(isConversationRunning(res.data.conversationId))
      setStreamStartedAt(conversationStartedAtRef.current.get(res.data.conversationId) ?? null)
      setPermissionPrompt(permissionPromptsRef.current.get(res.data.conversationId) ?? null)
      setUserQuestionPrompt(userQuestionPromptsRef.current.get(res.data.conversationId)?.[0] ?? null)
      void refreshSkills(res.data.workspacePath)
      void refreshSessionStats()
    } else {
      // Deleting a background thread must not reset the active stream.
      setState((current) => current ? { ...current, threads: res.data.threads } : current)
    }
    setError(null)
    return true
  }, [invalidateStateReload, state?.threads, state?.currentThreadId, activeConversationIdRef, conversationStartedAtRef,
    conversationStreamRef, permissionPromptsRef, userQuestionPromptsRef, setCompletedConversationIds,
    applyConversationStreamSnapshot, isConversationRunning, refreshSkills, setSending, setStreamStartedAt,
    setPermissionPrompt, setUserQuestionPrompt, refreshSessionStats, resetTransientConversationState,
    setState, setError, setToolTraces])

  const clearConversation = useCallback(async (options?: { workspacePath?: string | null }) => {
    const bridge = getBridge()
    if (!bridge?.app) return false
    invalidateStateReload?.()
    const result = await navigationQueue.current.run(() => bridge.app.clearConversation(options))
    if (!result.current) return false
    if (!result.ok) {
      setError(result.error instanceof Error ? result.error.message : '会话操作失败，请重试')
      return false
    }
    const res = result.value
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
    invalidateStateReload,
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
    invalidateStateReload?.()
    const result = await navigationQueue.current.run(() => bridge.app.forkThread(currentThreadId, messageId))
    if (!result.current) return null
    if (!result.ok) {
      setError(result.error instanceof Error ? result.error.message : '会话操作失败，请重试')
      return null
    }
    const res = result.value
    if (!res.ok) {
      setError(res.error)
      return null
    }
    resetTransientConversationState()
    activeConversationIdRef.current = res.data.state.conversationId
    setState(res.data.state)
    setCompletedConversationIds((current) => current.filter((id) => id !== res.data.state.conversationId))
    setToolTraces([])
    setSending(isConversationRunning(res.data.state.conversationId))
    setStreamStartedAt(conversationStartedAtRef.current.get(res.data.state.conversationId) ?? null)
    void refreshSkills(res.data.state.workspacePath)
    setError(null)
    void refreshSessionStats()
    return res.data
  }, [
    invalidateStateReload,
    activeConversationIdRef,
    conversationStartedAtRef,
    isConversationRunning,
    refreshSessionStats,
    refreshSkills,
    resetTransientConversationState,
    setCompletedConversationIds,
    setSending,
    setState,
    setError,
    setStreamStartedAt,
    setToolTraces,
    state?.currentThreadId,
  ])

  const rewindThread = useCallback(async (
    messageId: string,
    mode: RewindThreadResult['mode'],
    confirmationToken?: string | null,
  ): Promise<RewindThreadResult | null> => {
    const bridge = getBridge()
    if (!bridge?.app) return null
    const currentThreadId = state?.currentThreadId
    if (!currentThreadId) return null
    invalidateStateReload?.()
    const result = await navigationQueue.current.run(() => bridge.app.rewindThread(currentThreadId, messageId, mode, confirmationToken))
    if (!result.current) return null
    if (!result.ok) {
      setError(result.error instanceof Error ? result.error.message : '会话操作失败，请重试')
      return null
    }
    const res = result.value
    if (!res.ok) {
      setError(res.error)
      return null
    }
    if (res.data.status === 'done' && res.data.state) {
      resetTransientConversationState()
      activeConversationIdRef.current = res.data.state.conversationId
      setState(res.data.state)
      setCompletedConversationIds((current) => current.filter((id) => id !== res.data.state?.conversationId))
      setToolTraces([])
      setSending(isConversationRunning(res.data.state.conversationId))
      setStreamStartedAt(conversationStartedAtRef.current.get(res.data.state.conversationId) ?? null)
      void refreshSkills(res.data.state.workspacePath)
      void refreshSessionStats()
    }
    setError(null)
    return res.data
  }, [
    invalidateStateReload,
    activeConversationIdRef,
    conversationStartedAtRef,
    isConversationRunning,
    refreshSessionStats,
    refreshSkills,
    resetTransientConversationState,
    setCompletedConversationIds,
    setSending,
    setState,
    setError,
    setStreamStartedAt,
    setToolTraces,
    state?.currentThreadId,
  ])

  return {
    switchThread,
    renameThread,
    togglePinThread,
    toggleArchiveThread,
    searchThreads,
    deleteThread,
    forkThread,
    rewindThread,
    clearConversation,
  }
}
