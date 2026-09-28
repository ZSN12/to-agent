import type { ChatMessage } from '../../types'
import type { SessionStatsSnapshot } from '../../shared/app-api'
import { formatTokensCompact, formatWallMs, summarizeTurnTiming } from './session-usage'

export function SessionStatsLine({
  stats,
  messages = [],
}: {
  stats: SessionStatsSnapshot | null
  messages?: ChatMessage[]
}) {
  if (!stats) return null
  const { tokens, userMessages, assistantMessages, toolCalls } = stats
  const hasTokens =
    tokens.input > 0 || tokens.output > 0 || tokens.cacheRead > 0 || tokens.cacheWrite > 0
  if (!hasTokens && userMessages === 0 && assistantMessages === 0) return null

  const denom = tokens.input + tokens.cacheRead
  const cacheHit = denom > 0 ? (tokens.cacheRead / denom) * 100 : null
  const timing = messages?.length ? summarizeTurnTiming(messages) : null
  const hasTiming = timing && (timing.llmMs > 0 || timing.toolMs > 0 || timing.avgTtftMs !== null)

  return (
    <footer className="conversation-usage-footer session-stats-line" aria-label="会话统计（含压缩后历史）">
      {userMessages > 0 && (
        <>
          <span>{userMessages} 轮对话</span>
          <span className="conversation-usage-sep" aria-hidden="true">·</span>
        </>
      )}
      {(assistantMessages > 0 || toolCalls > 0) && (
        <>
          <span title="助手步数与工具调用次数">
            {assistantMessages} 步
            {toolCalls > 0 ? ` · ${toolCalls} 次工具` : ''}
          </span>
          <span className="conversation-usage-sep" aria-hidden="true">·</span>
        </>
      )}
      {hasTokens && (
        <>
          <span>输入 {formatTokensCompact(tokens.input)} tok</span>
          <span className="conversation-usage-sep" aria-hidden="true">·</span>
          <span>输出 {formatTokensCompact(tokens.output)} tok</span>
        </>
      )}
      {tokens.cacheRead > 0 && (
        <>
          <span className="conversation-usage-sep" aria-hidden="true">·</span>
          <span title="与 DSH 一致：含压缩折叠的累计缓存读取">缓存 {formatTokensCompact(tokens.cacheRead)} tok</span>
        </>
      )}
      {cacheHit !== null && (
        <>
          <span className="conversation-usage-sep" aria-hidden="true">·</span>
          <span>命中率 {cacheHit.toFixed(1)}%</span>
        </>
      )}
      {stats.contextPercent !== null && stats.contextPercent !== undefined && (
        <>
          <span className="conversation-usage-sep" aria-hidden="true">·</span>
          <span>上下文 {Math.round(stats.contextPercent)}%</span>
        </>
      )}
      {hasTiming && timing && (
        <>
          <span className="conversation-usage-sep" aria-hidden="true">·</span>
          <span title="各轮 usage 汇总">
            LLM {formatWallMs(timing.llmMs)}
            {timing.toolMs > 0 ? ` · 工具 ${formatWallMs(timing.toolMs)}` : ''}
            {timing.avgTtftMs !== null ? ` · TTFT ${formatWallMs(timing.avgTtftMs)}` : ''}
          </span>
        </>
      )}
    </footer>
  )
}
