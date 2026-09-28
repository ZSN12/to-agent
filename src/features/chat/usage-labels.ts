import type { ChatUsage } from '../../types'

export function formatTokens(count: number): string {
  return new Intl.NumberFormat('zh-CN').format(count)
}

/** 与 `usage-store.getReport` / DSH 用量页同一口径 */
export function dshCacheHitRate(inputTokens: number, cacheReadTokens: number): number {
  const denom = inputTokens + cacheReadTokens
  return denom > 0 ? cacheReadTokens / denom : 0
}

/** 气泡与 DSH 一致：始终展示缓存命中与命中率（无上报时为 0） */
export function formatCacheUsageSuffix(usage: ChatUsage): string {
  const hitPercent = dshCacheHitRate(usage.inputTokens, usage.cacheReadTokens) * 100
  let suffix = ` · 缓存命中 ${formatTokens(usage.cacheReadTokens)} · 命中率 ${hitPercent.toFixed(1)}%`
  if (usage.cacheWriteTokens > 0) {
    suffix += ` · 缓存写入 ${formatTokens(usage.cacheWriteTokens)}`
  }
  return suffix
}
