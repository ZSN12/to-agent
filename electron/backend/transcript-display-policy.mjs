/** Node 侧与 `src/shared/transcript-display-policy.ts` 保持语义一致。 */

export function resolvePreferDshTranscript(options) {
  if (options.preferDshTranscript === false) return false
  if (!options.subscribed || !options.conversationId || !options.view) return false
  if (options.view.conversationId && options.view.conversationId !== options.conversationId) return false
  return true
}
