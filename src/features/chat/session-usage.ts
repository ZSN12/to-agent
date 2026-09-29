import type { ChatMessage, ChatUsage } from '../../types'
import type { ContextBreakdownEstimate, LiveContextUsage } from '../../shared/app-api'

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

/** DSH StatsLine `contextOccupancy` over `contextPressure` (view or state). */
export function contextOccupancyFromPressure(pressure: unknown): {
  percent: number
  usedTokens: number
  contextWindow: number
} | null {
  if (!pressure || typeof pressure !== 'object') return null
  const p = pressure as Record<string, unknown>
  const contextWindow = p.contextWindow
  if (typeof contextWindow !== 'number' || !(contextWindow > 0)) return null
  let usedTokens: number | undefined
  if (typeof p.projectedTokens === 'number') usedTokens = p.projectedTokens
  else if (
    typeof p.pressureTokens === 'number'
    && typeof p.surfaceTokens === 'number'
    && typeof p.sampledSurfaceTokens === 'number'
  ) {
    usedTokens = Math.max(0, p.pressureTokens + p.surfaceTokens - p.sampledSurfaceTokens)
  } else if (typeof p.pressureTokens === 'number') {
    usedTokens = p.pressureTokens
  }
  if (typeof usedTokens !== 'number' || !Number.isFinite(usedTokens)) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / contextWindow * 100)),
    usedTokens,
    contextWindow,
  }
}

export function liveContextFromDshProjections(
  projections: Record<string, unknown> | undefined,
): LiveContextUsage | null {
  const rawPressure = projections?.contextPressure
  const occupancy = contextOccupancyFromPressure(rawPressure)
  const pressure = rawPressure && typeof rawPressure === 'object'
    ? rawPressure as Record<string, unknown>
    : null
  const usedTokens = occupancy?.usedTokens
    ?? (typeof pressure?.projectedTokens === 'number' ? pressure.projectedTokens : pressure?.pressureTokens)
  if (typeof usedTokens !== 'number' || !Number.isFinite(usedTokens)) return null
  const raw = projections?.contextBreakdown
  let contextBreakdown: ContextBreakdownEstimate | undefined
  if (raw && typeof raw === 'object') {
    const b = raw as Record<string, unknown>
    if (
      typeof b.systemTokens === 'number'
      && typeof b.toolsTokens === 'number'
      && typeof b.messageTokens === 'number'
    ) {
      contextBreakdown = {
        systemTokens: b.systemTokens,
        toolsTokens: b.toolsTokens,
        messageTokens: b.messageTokens,
      }
    }
  }
  return {
    inputTokens: 0,
    outputTokens: 0,
    contextTokens: usedTokens,
    contextWindow: occupancy?.contextWindow ?? null,
    contextPercent: occupancy?.percent ?? null,
    ...(contextBreakdown ? { contextBreakdown } : {}),
  }
}

/** DSH StatsLine `formatTokens`: 517 / 12.2K / 517K / 1.2M */
export function formatDshCatalogTokens(n: number): string {
  const scaled = (v: number): string =>
    v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

/** DSH StatsLine `formatDuration`: 45.2s / 2m42s */
export function formatDshStatsDuration(ms: number): string {
  const s = Math.max(0, ms) / 1_000
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const whole = Math.round(s)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

/** DSH `formatRunDuration` + locale：用时 9秒 / 1分08秒 */
export function formatDshRunDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0
    ? `${minutes}分${String(seconds).padStart(2, '0')}秒`
    : `${seconds}秒`
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

export interface TurnTimingTotals {
  llmMs: number
  toolMs: number
  avgTtftMs: number | null
}

export function formatWallMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const whole = Math.round(s)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

/** DSH 会话统计面板用的中文时长（如 8 分 50 秒、3.4 秒） */
export function formatDurationZh(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 秒'
  if (ms < 60_000) {
    const s = Math.round((ms / 1000) * 10) / 10
    return `${s} 秒`
  }
  const totalSec = Math.round(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (sec === 0) return `${min} 分`
  return `${min} 分 ${sec} 秒`
}

export function formatTokensFull(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0'
  return count.toLocaleString('zh-CN')
}

/** DSH billedInput：未缓存 + 缓存读 + 缓存写 */
export function billedInputTokens(input: number, cacheRead: number, cacheWrite: number): number {
  return Math.max(0, input) + Math.max(0, cacheRead) + Math.max(0, cacheWrite)
}

/** 整数缓存命中率（与 DSH StatsLine 展示一致，分母为计费输入） */
export function cacheHitPercentDisplay(cacheRead: number, billedInput: number): number | null {
  if (billedInput <= 0) return null
  return Math.min(100, Math.round((cacheRead / billedInput) * 100))
}

/** 从助手气泡 usage 字段汇总轮次耗时（DSH StatsLine 的轻量对应） */
export function summarizeTurnTiming(messages: ChatMessage[]): TurnTimingTotals {
  let llmMs = 0
  let toolMs = 0
  let ttftSum = 0
  let ttftN = 0
  for (const message of messages) {
    if (message.author === 'user' || !message.usage) continue
    const u = message.usage
    if (typeof u.llmMs === 'number' && u.llmMs > 0) llmMs += u.llmMs
    if (typeof u.toolMs === 'number' && u.toolMs > 0) toolMs += u.toolMs
    if (typeof u.ttftMs === 'number' && u.ttftMs > 0) {
      ttftSum += u.ttftMs
      ttftN += 1
    }
  }
  return { llmMs, toolMs, avgTtftMs: ttftN > 0 ? ttftSum / ttftN : null }
}

/** 会话级解码吞吐（输出 token / 解码时长），与 DSH sessionStats 解码分组一致 */
export function summarizeDecodeThroughput(messages: ChatMessage[]): number | null {
  let decodeMs = 0
  let decodeTokens = 0
  for (const message of messages) {
    if (message.author === 'user' || !message.usage) continue
    const u = message.usage
    const out = u.outputTokens ?? 0
    const elapsed = u.elapsedMs ?? 0
    const tps = u.tokensPerSecond ?? 0
    if (out > 0 && elapsed > 0 && tps > 0) {
      decodeTokens += out
      decodeMs += elapsed
    }
  }
  if (decodeMs <= 0 || decodeTokens <= 0) return null
  return Math.round(decodeTokens / (decodeMs / 1000))
}

export function sessionUsageHasData(totals: SessionUsageTotals): boolean {
  return (
    totals.inputTokens > 0 ||
    totals.outputTokens > 0 ||
    totals.cacheReadTokens > 0 ||
    totals.cacheWriteTokens > 0
  )
}
