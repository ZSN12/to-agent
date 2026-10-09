import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { PermissionPromptPayload, UserQuestionAnswer, UserQuestionPromptPayload } from '../../../shared/app-api'
import { getBridge } from '../getBridge'

export type PromptActionsOptions = {
  permissionPrompt: PermissionPromptPayload | null
  setPermissionPrompt: Dispatch<SetStateAction<PermissionPromptPayload | null>>
  setUserQuestionPrompt: Dispatch<SetStateAction<UserQuestionPromptPayload | null>>
  permissionPromptsRef: MutableRefObject<Map<string, PermissionPromptPayload>>
  userQuestionPromptsRef: MutableRefObject<Map<string, UserQuestionPromptPayload[]>>
  activeConversationIdRef: MutableRefObject<string | null>
}

export function usePrompts(options: PromptActionsOptions) {
  const {
    permissionPrompt,
    setPermissionPrompt,
    setUserQuestionPrompt,
    permissionPromptsRef,
    userQuestionPromptsRef,
    activeConversationIdRef,
  } = options

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
  }, [permissionPrompt, permissionPromptsRef, setPermissionPrompt])

  const answerUserQuestion = useCallback(async (id: string, answer: UserQuestionAnswer) => {
    const bridge = getBridge()
    if (!bridge?.userQuestions?.answer) return false
    const res = await bridge.userQuestions.answer(id, answer)
    if (!res.ok || !res.data.ok) return false
    const conversationId = activeConversationIdRef.current
    if (conversationId) {
      const pending = userQuestionPromptsRef.current.get(conversationId) ?? []
      const remaining = pending.filter((item) => item.id !== id)
      if (remaining.length) userQuestionPromptsRef.current.set(conversationId, remaining)
      else userQuestionPromptsRef.current.delete(conversationId)
      setUserQuestionPrompt(remaining[0] ?? null)
    }
    return true
  }, [activeConversationIdRef, setUserQuestionPrompt, userQuestionPromptsRef])

  const cancelUserQuestion = useCallback(async (id: string) => {
    const bridge = getBridge()
    if (!bridge?.userQuestions?.cancel) return false
    const res = await bridge.userQuestions.cancel(id)
    if (!res.ok || !res.data.ok) return false
    for (const [conversationId, pending] of userQuestionPromptsRef.current) {
      const remaining = pending.filter((item) => item.id !== id)
      if (remaining.length === pending.length) continue
      if (remaining.length) userQuestionPromptsRef.current.set(conversationId, remaining)
      else userQuestionPromptsRef.current.delete(conversationId)
      if (conversationId === activeConversationIdRef.current) setUserQuestionPrompt(remaining[0] ?? null)
      break
    }
    return true
  }, [activeConversationIdRef, setUserQuestionPrompt, userQuestionPromptsRef])

  return {
    respondPermissionPrompt,
    answerUserQuestion,
    cancelUserQuestion,
  }
}
