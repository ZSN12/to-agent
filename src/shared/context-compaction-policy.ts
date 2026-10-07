/** Host 上下文占用达到阈值时，建议用户手动 /compact（不自动执行）。 */

export const COMPACTION_SUGGEST_CONTEXT_PERCENT = 85
export const COMPACTION_SUGGEST_CLEAR_PERCENT = 72

export function shouldSuggestContextCompaction(input: {
  contextPercent?: number | null
  dismissedForConversation?: boolean
  sending?: boolean
}) {
  if (input.sending) return { suggest: false as const, reason: 'busy' }
  if (input.dismissedForConversation) return { suggest: false as const, reason: 'dismissed' }
  const pct = input.contextPercent
  if (!Number.isFinite(pct)) return { suggest: false as const, reason: 'unknown' }
  if (pct! < COMPACTION_SUGGEST_CONTEXT_PERCENT) return { suggest: false as const, reason: 'below-threshold' }
  return {
    suggest: true as const,
    reason: 'context-pressure',
    contextPercent: pct!,
    message: `上下文已用约 ${Math.round(pct!)}%，建议压缩历史以降低成本并留出余量。`,
  }
}
