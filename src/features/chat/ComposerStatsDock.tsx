import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Clock, Database } from 'lucide-react'
import type { ChatMessage } from '../../types'
import type { ContextBreakdownEstimate, LiveContextUsage, SessionStatsSnapshot } from '../../shared/app-api'
import {
  billedInputTokens,
  cacheHitPercentDisplay,
  formatDurationZh,
  formatDshCatalogTokens,
  formatTokensFull,
  summarizeDecodeThroughput,
  summarizeTurnTiming,
} from './session-usage'

function HoverDockPanel({
  title,
  titleExtra,
  icon,
  summary,
  children,
  align = 'center',
}: {
  title: string
  titleExtra?: ReactNode
  icon: ReactNode
  summary: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelId = useId()

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setOpen(true)
  }
  const hide = () => {
    hideTimer.current = setTimeout(() => setOpen(false), 120)
  }

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  return (
    <span
      className={`composer-stats-chip-wrap align-${align}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <button
        type="button"
        className="composer-stats-chip"
        aria-expanded={open}
        aria-controls={panelId}
      >
        {icon}
        <span className="composer-stats-chip-text">{summary}</span>
      </button>
      {open && (
        <div
          id={panelId}
          className="composer-stats-panel"
          role="dialog"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <div className="composer-stats-panel-head">
            <span className="composer-stats-panel-title">
              {icon}
              {title}
            </span>
            {titleExtra}
          </div>
          <div className="composer-stats-panel-body">{children}</div>
        </div>
      )}
    </span>
  )
}

function PanelRow({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div className="composer-stats-row">
      <span className="composer-stats-row-label">
        {swatch ? <span className={`composer-stats-swatch ${swatch}`} aria-hidden /> : null}
        {label}
      </span>
      <span className="composer-stats-row-value">{value}</span>
    </div>
  )
}

function ContextBar({
  percent,
  breakdown,
}: {
  percent: number
  breakdown?: ContextBreakdownEstimate
}) {
  const total = breakdown
    ? breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens
    : 0
  const parts = breakdown && total > 0
    ? [
        { key: 'system', className: 'swatch-system', width: percent * breakdown.systemTokens / total },
        { key: 'tools', className: 'swatch-tools', width: percent * breakdown.toolsTokens / total },
        { key: 'messages', className: 'swatch-messages', width: percent * breakdown.messageTokens / total },
      ].filter((p) => p.width > 0)
    : [{ key: 'total', className: '', width: percent }]

  return (
    <div className="composer-stats-context-bar" aria-hidden>
      {parts.map((part) => (
        <div
          key={part.key}
          className={`composer-stats-context-segment ${part.className}`}
          style={{ width: `${part.width}%` }}
        />
      ))}
    </div>
  )
}

export function ComposerStatsDock({
  stats,
  messages,
  liveContext,
  modelContextWindow,
}: {
  stats: SessionStatsSnapshot | null
  messages: ChatMessage[]
  liveContext?: LiveContextUsage | null
  modelContextWindow?: number
}) {
  const computedStats = useMemo(() => {
    if (!stats) return null

    const { tokens, userMessages, assistantMessages, toolCalls } = stats
    const timing = summarizeTurnTiming(messages)
    const tps = summarizeDecodeThroughput(messages)
    const billed = billedInputTokens(tokens.input, tokens.cacheRead, tokens.cacheWrite)
    const totalTok = tokens.total > 0 ? tokens.total : billed + tokens.output
    const cacheHit = cacheHitPercentDisplay(tokens.cacheRead, billed)

    const hasTiming = userMessages > 0 || assistantMessages > 0 || timing.llmMs > 0 || timing.toolMs > 0
    const hasTokens = billed > 0 || tokens.output > 0
    let lastAssistantUsage: Record<string, unknown> | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      const u = messages[i]?.usage as Record<string, unknown> | undefined
      if (u && ((typeof u.contextTokens === 'number' && u.contextTokens > 0) || (typeof u.inputTokens === 'number' && u.inputTokens > 0))) {
        lastAssistantUsage = u
        break
      }
    }
    const fallbackContextTokens = lastAssistantUsage
      ? (typeof lastAssistantUsage.contextTokens === 'number' && lastAssistantUsage.contextTokens > 0
          ? lastAssistantUsage.contextTokens
          : (typeof lastAssistantUsage.inputTokens === 'number' && lastAssistantUsage.inputTokens > 0
              ? (lastAssistantUsage.inputTokens + (typeof lastAssistantUsage.cacheReadTokens === 'number' ? lastAssistantUsage.cacheReadTokens : 0))
              : null))
      : null

    const rawCtxTokens = liveContext?.contextTokens ?? stats.contextTokens
    const ctxTokens = (typeof rawCtxTokens === 'number' && rawCtxTokens > 0)
      ? rawCtxTokens
      : (fallbackContextTokens ?? rawCtxTokens)
    const ctxWindow = liveContext?.contextWindow ?? stats.contextWindow ?? (typeof lastAssistantUsage?.contextWindow === 'number' ? lastAssistantUsage.contextWindow : null) ?? modelContextWindow
    const rawCtxPct = liveContext?.contextPercent ?? stats.contextPercent
    const ctxPct = (typeof ctxTokens === 'number' && ctxTokens > 0 && typeof ctxWindow === 'number' && ctxWindow > 0)
      ? Math.round(ctxTokens / ctxWindow * 100)
      : rawCtxPct
    const occupancy =
      typeof ctxWindow === 'number' && ctxWindow > 0 && typeof ctxTokens === 'number' && ctxTokens > 0
        ? {
            percent: Math.min(100, Math.max(0, Math.round(ctxTokens / ctxWindow * 100))),
            used: ctxTokens,
            window: ctxWindow,
          }
        : typeof ctxWindow === 'number' && ctxWindow > 0 && typeof ctxPct === 'number' && ctxPct > 0
          ? {
              percent: Math.min(100, Math.max(0, Math.round(ctxPct))),
              used: ctxTokens ?? 0,
              window: ctxWindow,
            }
          : null
    const hasContext = occupancy !== null

    const breakdown = liveContext?.contextBreakdown
    const contextPercent = occupancy?.percent ?? 0
    const contextWindow = occupancy?.window ?? 0
    const usedTokens = occupancy?.used ?? 0

    return {
      tokens,
      userMessages,
      assistantMessages,
      toolCalls,
      timing,
      tps,
      billed,
      totalTok,
      cacheHit,
      hasTiming,
      hasTokens,
      hasContext,
      breakdown,
      contextPercent,
      contextWindow,
      usedTokens,
    }
  }, [stats, messages, liveContext, modelContextWindow])

  if (!computedStats) return null
  if (!computedStats.hasTiming && !computedStats.hasTokens && !computedStats.hasContext) return null

  const {
    tokens,
    userMessages,
    assistantMessages,
    toolCalls,
    timing,
    tps,
    billed,
    totalTok,
    cacheHit,
    hasTiming,
    hasTokens,
    hasContext,
    breakdown,
    contextPercent,
    contextWindow,
    usedTokens,
  } = computedStats

  return (
    <footer className="composer-stats-dock" aria-label="会话统计与用量">
      {hasTiming && (
        <HoverDockPanel
          title="会话统计"
          icon={<Clock size={12} strokeWidth={1.75} aria-hidden />}
          summary={
            <>
              {userMessages > 0 ? `${userMessages} 轮 ` : ''}
              {assistantMessages} 步
              {tps !== null ? (
                <>
                  <span className="composer-stats-dot" aria-hidden> · </span>
                  {tps} tok/s
                </>
              ) : null}
            </>
          }
        >
          <PanelRow label="模型用时" value={formatDurationZh(timing.llmMs)} />
          <PanelRow label="工具调用用时" value={formatDurationZh(timing.toolMs)} />
          <PanelRow
            label="首 token 平均 (TTFT)"
            value={timing.avgTtftMs !== null ? formatDurationZh(timing.avgTtftMs) : '—'}
          />
          <PanelRow label="输出速度 (TPS)" value={tps !== null ? `${tps} tok/s` : '—'} />
          {toolCalls > 0 && (
            <PanelRow label="工具调用" value={`${toolCalls} 次`} />
          )}
        </HoverDockPanel>
      )}

      {hasTokens && (
        <HoverDockPanel
          title="Token 用量"
          titleExtra={
            <span className="composer-stats-panel-total">{formatDshCatalogTokens(totalTok)} tok</span>
          }
          icon={<Database size={12} strokeWidth={1.75} aria-hidden />}
          summary={
            <>
              {formatDshCatalogTokens(totalTok)} tok
              {cacheHit !== null ? (
                <>
                  <span className="composer-stats-dot" aria-hidden> · </span>
                  缓存命中 {cacheHit}%
                </>
              ) : null}
            </>
          }
        >
          {cacheHit !== null && <PanelRow label="缓存命中" value={`${cacheHit}%`} />}
          <PanelRow label="未缓存输入" value={`${formatTokensFull(tokens.input)} tok`} />
          <PanelRow label="缓存读取" value={`${formatTokensFull(tokens.cacheRead)} tok`} />
          <PanelRow label="缓存写入" value={`${formatTokensFull(tokens.cacheWrite)} tok`} />
          <PanelRow label="输出" value={`${formatTokensFull(tokens.output)} tok`} />
        </HoverDockPanel>
      )}

      {hasContext && (
        <HoverDockPanel
          title="上下文已用"
          align="end"
          titleExtra={
            <span className="composer-stats-panel-total">
              ~{formatDshCatalogTokens(usedTokens)} / {formatDshCatalogTokens(contextWindow)}
            </span>
          }
          icon={
            <span className="composer-stats-ring" aria-hidden>
              <svg viewBox="0 0 14 14" width="14" height="14">
                <circle className="composer-stats-ring-track" cx="7" cy="7" r="5.5" />
                <circle
                  className="composer-stats-ring-fill"
                  cx="7"
                  cy="7"
                  r="5.5"
                  strokeDasharray={`${2 * Math.PI * 5.5 * contextPercent / 100} ${2 * Math.PI * 5.5}`}
                  transform="rotate(-90 7 7)"
                />
              </svg>
            </span>
          }
          summary={<>{contextPercent}%</>}
        >
          <div className="composer-stats-context-head">
            <span>上下文已用 {contextPercent}%</span>
          </div>
          <ContextBar percent={contextPercent} breakdown={breakdown} />
          {breakdown && (
            <>
              <PanelRow
                label="系统提示词"
                value={`~${formatDshCatalogTokens(breakdown.systemTokens)}`}
                swatch="swatch-system"
              />
              <PanelRow
                label="工具定义"
                value={`~${formatDshCatalogTokens(breakdown.toolsTokens)}`}
                swatch="swatch-tools"
              />
              <PanelRow
                label="对话消息"
                value={`~${formatDshCatalogTokens(breakdown.messageTokens)}`}
                swatch="swatch-messages"
              />
            </>
          )}
        </HoverDockPanel>
      )}
    </footer>
  )
}
