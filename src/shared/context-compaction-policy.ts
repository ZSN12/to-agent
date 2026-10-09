/** Host 上下文占用达到阈值时，触发上下文压缩瘦身。 */

export const COMPACTION_SUGGEST_CONTEXT_PERCENT = 75
export const COMPACTION_SUGGEST_CLEAR_PERCENT = 60

/** Same shape nativeChatCommand() treats as a Host `/compact`. */
export function isCompactCommandText(text: unknown): boolean {
  return typeof text === 'string' && /^\/compact(?:[ \t]+[^\r\n]*)?$/i.test(text.trim())
}

/** 判定是否应当触发自动压缩（水位超过 75% 且非忙碌） */
export function shouldAutoCompact(input: {
  contextPercent?: number | null
  sending?: boolean
  compacting?: boolean
  autoCompactedForSeq?: boolean
}): boolean {
  if (input.compacting || input.sending || input.autoCompactedForSeq) return false
  const pct = input.contextPercent
  if (!Number.isFinite(pct)) return false
  return pct! >= COMPACTION_SUGGEST_CONTEXT_PERCENT
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
    message: `上下文已用约 ${Math.round(pct!)}%（超过 75% 阈值），正在自动瘦身或建议压缩历史以留出余量。`,
  }
}
