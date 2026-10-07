import type { DshConversationView, PromptQueueSnapshot } from '../../shared/app-api'
import { shortStreamActivityLabel } from '../chat/streamActivityLabel'

/** Prompt queue currently present in the main-process DSH projection. */
export function promptQueueFromDshView(view: DshConversationView | null): PromptQueueSnapshot {
  if (!view?.queue) return { steering: [], followUp: [] }
  return {
    steering: [...view.queue.steering],
    followUp: [...view.queue.followUp],
  }
}

export function shouldPreferDshTranscript(
  subscribed: boolean,
  conversationId: string | null | undefined,
  view: DshConversationView | null,
): boolean {
  if (!subscribed || !conversationId || !view) return false
  if (view.conversationId && view.conversationId !== conversationId) return false
  return true
}

export function applyDshProjectionMetadata(
  view: DshConversationView,
  handlers: {
    setStreamActivity: (label: string | null) => void
    setPromptQueue: (queue: PromptQueueSnapshot) => void
  },
) {
  handlers.setPromptQueue(promptQueueFromDshView(view))
  if (view.running || view.streamingText || view.streamingReasoning) {
    handlers.setStreamActivity(shortStreamActivityLabel(view.activityLabel))
  } else if (!view.running) {
    handlers.setStreamActivity(null)
  }
}
