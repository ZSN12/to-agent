/**
 * Host session model route comparison (DSH Web semantics).
 * Exported for regression tests — keep in sync with dsh-chat-service selection gate.
 */
export function sessionModelMatches(current, config, explicitReasoningEffort, lastAppliedSelection = null) {
  if (!current || current.provider !== config.provider || current.model !== config.id) return false
  if (explicitReasoningEffort == null || explicitReasoningEffort === '') return true
  // The default session route may match provider/model while having no explicit
  // effort. That is not proof that the Composer's requested effort was applied.
  // Host versions/adapters that omit effort on readback need a persisted record
  // of our successful selectModel call to avoid selecting again every turn.
  if (current.reasoningEffort == null) {
    return lastAppliedSelection?.provider === config.provider
      && lastAppliedSelection?.model === config.id
      && lastAppliedSelection?.reasoningEffort === explicitReasoningEffort
  }
  return current.reasoningEffort === explicitReasoningEffort
}
