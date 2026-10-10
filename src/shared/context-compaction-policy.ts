/** Host 上下文占用较高时，显示手动压缩建议。实际自动压缩只由 DSH 处理。 */

export const COMPACTION_SUGGEST_CONTEXT_PERCENT = 75
export const COMPACTION_SUGGEST_CLEAR_PERCENT = 60

/** Same shape nativeChatCommand() treats as a Host `/compact`. */
export function isCompactCommandText(text: unknown): boolean {
  return typeof text === 'string' && /^\/compact(?:[ \t]+[^\r\n]*)?$/i.test(text.trim())
}

export function shouldSuggestContextCompaction(input: {
  contextPercent?: number | null
  dismissedForConversation?: boolean
  sending?: boolean
  compacting?: boolean
}) {
  // In-flight /compact keeps the banner visible (disabled) instead of hiding it as "busy".
  if (input.compacting) return { suggest: true as const, reason: 'compacting' as const, message: '正在压缩上下文…' }
  if (input.sending) return { suggest: false as const, reason: 'busy' }
  if (input.dismissedForConversation) return { suggest: false as const, reason: 'dismissed' }
  const pct = input.contextPercent
  if (!Number.isFinite(pct)) return { suggest: false as const, reason: 'unknown' }
  if (pct! < COMPACTION_SUGGEST_CONTEXT_PERCENT) return { suggest: false as const, reason: 'below-threshold' }
  return {
    suggest: true as const,
    reason: 'context-pressure' as const,
    contextPercent: pct!,
    message: `上下文已用约 ${Math.round(pct!)}%，可以手动压缩历史以留出余量。`,
  }
}
