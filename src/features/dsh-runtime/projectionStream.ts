import type { DshConversationView, PromptQueueSnapshot } from '../../shared/app-api'
import { shortStreamActivityLabel } from '../chat/streamActivityLabel'

/** Live assistant copy from main-process DSH projection (replaces chat:stream delta/thinking for main lane). */
export function promptQueueFromDshView(view: DshConversationView | null): PromptQueueSnapshot {
  if (!view?.queue) return { steering: [], followUp: [] }
  return {
    steering: [...view.queue.steering],
    followUp: [...view.queue.followUp],
  }
}

export function shouldPreferProjectionStream(
  subscribed: boolean,
  conversationId: string | null | undefined,
  view: DshConversationView | null,
): boolean {
  if (!subscribed || !conversationId || !view) return false
  if (view.conversationId && view.conversationId !== conversationId) return false
  return true
}

export function applyDshProjectionToStreamState(
  view: DshConversationView,
  handlers: {
    setStreamText: (text: string) => void
    setStreamThinking: (updater: (prev: { text: string; durationMs?: number } | null) => { text: string; durationMs?: number } | null) => void
    setStreamActivity: (label: string | null) => void
    setPromptQueue: (queue: PromptQueueSnapshot) => void
  },
) {
  handlers.setPromptQueue(promptQueueFromDshView(view))
  const text = view.streamingText ?? ''
  const reasoning = (view.streamingReasoning ?? '').trim()
  if (view.running || text || reasoning) {
    handlers.setStreamText(text)
    if (reasoning) {
      handlers.setStreamThinking((prev) => ({
        text: reasoning,
        durationMs: prev?.durationMs,
      }))
    }
    handlers.setStreamActivity(shortStreamActivityLabel(view.activityLabel))
  } else if (!view.running) {
    handlers.setStreamActivity(null)
  }
}

/** Main chat lane: skip duplicate chat:stream payloads when hub projection is active. */
export function isStreamEventSupersededByProjection(
  event: { type: string; taskId?: string },
  projectionActive: boolean,
): boolean {
  if (!projectionActive || event.taskId) return false
  switch (event.type) {
    case 'delta':
    case 'thinking_start':
    case 'thinking_delta':
    case 'thinking_end':
    case 'activity':
    case 'blocks':
    case 'tool':
    case 'queue_update':
    case 'steering_queued':
    case 'followup_queued':
      return true
    default:
      return false
  }
}
