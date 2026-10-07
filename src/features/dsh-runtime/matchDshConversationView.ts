import type { DshConversationView } from '../../shared/app-api'

/** Rejects a delayed snapshot or mux event belonging to a previously selected session. */
export function matchDshConversationView(
  view: DshConversationView | null | undefined,
  conversationId: string | null | undefined,
): DshConversationView | null {
  return conversationId && view?.conversationId === conversationId ? view : null
}

