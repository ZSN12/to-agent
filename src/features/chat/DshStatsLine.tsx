import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage } from '../../types'
import type { SessionStatsSnapshot } from '../../shared/app-api'
import {
  billedInputTokens,
  cacheHitPercentDisplay,
  formatDshCatalogTokens,
  formatDshStatsDuration,
  summarizeDecodeThroughput,
  summarizeTurnTiming,
} from './session-usage'

/**
 * DSH ChatView StatsLine: pipe-separated groups under the composer.
 * Context occupancy stays on ContextMeter, not here.
 */
export function DshStatsLine({
  stats,
  messages,
}: {
  stats: SessionStatsSnapshot | null
  messages: ChatMessage[]
}) {
  const groups = useMemo(() => {
    const turns = stats?.userMessages ?? messages.filter((m) => m.author === 'user').length
    const steps = stats?.assistantMessages ?? messages.filter((m) => m.author !== 'user' && !m.compaction).length
    const timing = summarizeTurnTiming(messages)
    const tps = summarizeDecodeThroughput(messages)
    const line: string[] = []

    if (steps > 0 || turns > 0) {
      line.push(`${turns} 轮 · ${steps} 步`)
      const durations: string[] = []
      if (timing.llmMs > 0) durations.push(`LLM ${formatDshStatsDuration(timing.llmMs)}`)
      if (timing.toolMs > 0) durations.push(`工具调用 ${formatDshStatsDuration(timing.toolMs)}`)
      if (durations.length > 0) line.push(durations.join(' · '))
      const speeds: string[] = []
      if (timing.avgTtftMs !== null) {
        speeds.push(`首 token 平均 ${formatDshStatsDuration(timing.avgTtftMs)}`)
      }
      if (tps !== null && tps > 0) speeds.push(`${tps} tok/s`)
      if (speeds.length > 0) line.push(speeds.join(' · '))
    }

    const tokens = stats?.tokens
    if (tokens) {
      const billed = billedInputTokens(tokens.input, tokens.cacheRead, tokens.cacheWrite)
      if (billed > 0 || tokens.output > 0) {
        const cacheHit = cacheHitPercentDisplay(tokens.cacheRead, billed)
        if (cacheHit !== null) line.push(`缓存命中 ${cacheHit}%`)
        line.push(`输入 ${formatDshCatalogTokens(billed)} tok · 输出 ${formatDshCatalogTokens(tokens.output)} tok`)
      }
    }

    return line
  }, [stats, messages])

  const line = groups.join(' | ')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [truncated, setTruncated] = useState(false)

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => {
      setTruncated(el.scrollWidth > el.clientWidth)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [line])

  if (groups.length === 0) return null

  return (
    <div
      ref={rootRef}
      className="dsh-stats-line"
      aria-label="会话统计"
      title={truncated ? line : undefined}
    >
      {groups.map((group, i) => (
        <span key={`${i}-${group}`}>
          {i > 0 && (
            <>
              <span className="dsh-stats-line-sep" aria-hidden>
                |
              </span>{' '}
            </>
          )}
          {group}
        </span>
      ))}
    </div>
  )
}
