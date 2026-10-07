import type { DshConversationView } from './app-api'

/** 展示层以 DSH transcript 为准（TaskWeaver 线程库仅保留编排 callout / 错误等扩展行）。 */
export function resolvePreferDshTranscript(options: {
  subscribed: boolean
  conversationId: string | null | undefined
  view: DshConversationView | null
  preferDshTranscript?: boolean
}): boolean {
  if (options.preferDshTranscript === false) return false
  if (!options.subscribed || !options.conversationId || !options.view) return false
  if (options.view.conversationId && options.view.conversationId !== options.conversationId) return false
  return true
}
