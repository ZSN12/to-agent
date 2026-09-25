import type { ChatMessage, ChatUsage } from '../../types'

export interface SessionUsageTotals {
  rounds: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cacheHitRatePercent: number | null
}

/** 紧凑显示大 token 数（与 pi 终端 footer 类似） */
export function formatTokensCompact(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0'
  if (count < 1000) return count.toString()
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  return `${Math.round(count / 1_000_000)}M`
}

function normalizeUsage(raw: ChatUsage | Record<string, unknown> | undefined): ChatUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as Record<string, unknown>
  const num = (key: string, alt?: string) => {
    const v = u[key] ?? (alt ? u[alt] : undefined)
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  return {
    inputTokens: num('inputTokens', 'input_tokens'),
    outputTokens: num('outputTokens', 'output_tokens'),
    cacheReadTokens: num('cacheReadTokens', 'cache_read_tokens'),
    cacheWriteTokens: num('cacheWriteTokens', 'cache_write_tokens'),
    costUsd: num('costUsd', 'cost_usd'),
    elapsedMs: num('elapsedMs', 'elapsed_ms'),
    tokensPerSecond: num('tokensPerSecond', 'tokens_per_second'),
    contextTokens: typeof u.contextTokens === 'number' ? u.contextTokens : null,
    contextWindow: typeof u.contextWindow === 'number' ? u.contextWindow : null,
    contextPercent: typeof u.contextPercent === 'number' ? u.contextPercent : null,
  }
}

function addUsage(totals: SessionUsageTotals, usage: ChatUsage) {
  totals.rounds += 1
  totals.inputTokens += usage.inputTokens ?? 0
  totals.outputTokens += usage.outputTokens ?? 0
  totals.cacheReadTokens += usage.cacheReadTokens ?? 0
  totals.cacheWriteTokens += usage.cacheWriteTokens ?? 0
}

/** 汇总主对话里每条助手回复附带的 usage（单条气泡逻辑不变，此处为累加）。 */
export function summarizeSessionUsage(messages: ChatMessage[]): SessionUsageTotals {
  const totals: SessionUsageTotals = {
    rounds: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheHitRatePercent: null,
  }
  for (const message of messages) {
    if (message.author === 'user') continue
    const usage = normalizeUsage(message.usage)
    if (!usage) continue
    addUsage(totals, usage)
  }
  if (totals.rounds > 0) {
    const denom = totals.inputTokens + totals.cacheReadTokens
    totals.cacheHitRatePercent = denom > 0 ? (totals.cacheReadTokens / denom) * 100 : 0
  }
  return totals
}

export function sessionUsageHasData(totals: SessionUsageTotals): boolean {
  return (
    totals.inputTokens > 0 ||
    totals.outputTokens > 0 ||
    totals.cacheReadTokens > 0 ||
    totals.cacheWriteTokens > 0
  )
}
