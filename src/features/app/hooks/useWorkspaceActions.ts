import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type {
  AppState,
  PermissionPromptPayload,
  UserQuestionPromptPayload,
  WorkspaceEntry,
  WorkspaceReference,
  WorkspaceTrustState,
} from '../../../shared/app-api'
import { getBridge } from '../getBridge'

export type WorkspaceActionsOptions = {
  setState: Dispatch<SetStateAction<AppState | null>>
  setError: (message: string | null) => void
  setWorkspaceTrustState: Dispatch<SetStateAction<WorkspaceTrustState | null>>
  workspacePathRef: MutableRefObject<string | null>
  activeConversationIdRef: MutableRefObject<string | null>
  resetTransientConversationState: () => void
  refreshSkills: (workspacePath: string | null | undefined) => void
  refreshWorkspaceTrust: () => void
  isConversationRunning: (conversationId: string) => boolean
  conversationStartedAtRef: MutableRefObject<Map<string, number>>
  permissionPromptsRef: MutableRefObject<Map<string, PermissionPromptPayload>>
  userQuestionPromptsRef: MutableRefObject<Map<string, UserQuestionPromptPayload[]>>
  setToolTraces: Dispatch<SetStateAction<import('../../../shared/app-api').ToolTraceItem[]>>
  setSending: Dispatch<SetStateAction<boolean>>
  setStreamStartedAt: Dispatch<SetStateAction<number | null>>
  setPermissionPrompt: Dispatch<SetStateAction<PermissionPromptPayload | null>>
  setUserQuestionPrompt: Dispatch<SetStateAction<UserQuestionPromptPayload | null>>
}

export function useWorkspaceActions(options: WorkspaceActionsOptions) {
  const {
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
  } = options

  const setWorkspaceTrust = useCallback(async (trusted: boolean): Promise<void> => {
    const bridge = getBridge()
    if (!bridge?.workspace?.setTrust) return
    const res = await bridge.workspace.setTrust(trusted)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setWorkspaceTrustState(res.data)
    void refreshSkills(workspacePathRef.current)
  }, [refreshSkills, setError, setWorkspaceTrustState, workspacePathRef])

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
    void refreshWorkspaceTrust()
    setToolTraces([])
    return true
  }, [
    refreshSkills,
    refreshWorkspaceTrust,
    resetTransientConversationState,
    activeConversationIdRef,
    setState,
    setError,
    setToolTraces,
  ])

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
    void refreshWorkspaceTrust()
    setToolTraces(res.data.state.outputLogs ?? [])
    setSending(isConversationRunning(res.data.state.conversationId))
    setStreamStartedAt(conversationStartedAtRef.current.get(res.data.state.conversationId) ?? null)
    setPermissionPrompt(permissionPromptsRef.current.get(res.data.state.conversationId) ?? null)
    setUserQuestionPrompt(userQuestionPromptsRef.current.get(res.data.state.conversationId)?.[0] ?? null)
    setError(null)
    return true
  }, [
    isConversationRunning,
    refreshSkills,
    refreshWorkspaceTrust,
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

  const searchWorkspaceContext = useCallback(async (query: string): Promise<WorkspaceEntry[]> => {
    const bridge = getBridge()
    if (!bridge?.workspace) return []
    const res = await bridge.workspace.listContext(query, 80)
    if (!res.ok) {
      setError(res.error)
      return []
    }
    return res.data
  }, [setError])

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
  }, [setError])

  return {
    setWorkspaceTrust,
    setWorkspace,
    pickWorkspace,
    searchWorkspaceContext,
    createDroppedReference,
  }
}
