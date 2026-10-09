/** Host 上下文占用达到阈值时，建议用户手动或自动 /compact 瘦身。 */

export const COMPACTION_SUGGEST_CONTEXT_PERCENT = 75
export const COMPACTION_SUGGEST_CLEAR_PERCENT = 60

/** Same shape nativeChatCommand() treats as a Host `/compact`. */
export function isCompactCommandText(text) {
  return typeof text === 'string' && /^\/compact(?:[ \t]+[^\r\n]*)?$/i.test(text.trim())
}

/**
 * 判定是否触发自动压缩
 */
export function shouldAutoCompact(input) {
  if (input.compacting || input.sending || input.autoCompactedForSeq) return false
  const pct = input.contextPercent
  if (!Number.isFinite(pct)) return false
  return pct >= COMPACTION_SUGGEST_CONTEXT_PERCENT
}

/**
 * @param {{
 *   contextPercent?: number | null
 *   dismissedForConversation?: boolean
 *   sending?: boolean
 *   compacting?: boolean
 * }} input
 */
export function shouldSuggestContextCompaction(input) {
  // In-flight /compact keeps the banner visible (disabled) instead of hiding it as "busy".
  if (input.compacting) return { suggest: true, reason: 'compacting', message: '正在压缩上下文…' }
  if (input.sending) return { suggest: false, reason: 'busy' }
  if (input.dismissedForConversation) return { suggest: false, reason: 'dismissed' }
  const pct = input.contextPercent
  if (!Number.isFinite(pct)) return { suggest: false, reason: 'unknown' }
  if (pct < COMPACTION_SUGGEST_CONTEXT_PERCENT) return { suggest: false, reason: 'below-threshold' }
  return {
    suggest: true,
    reason: 'context-pressure',
    contextPercent: pct,
    message: `上下文已用约 ${Math.round(pct)}%（超过 75% 阈值），建议压缩历史以降低成本并留出余量。`,
  }
}
