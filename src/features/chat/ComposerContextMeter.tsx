import { Minimize2, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LiveContextUsage, PromptBudgetSnapshot, SessionStatsSnapshot } from '../../shared/app-api'
import type { ChatMessage } from '../../types'
import { formatDshCatalogTokens } from './session-usage'

const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** DSH InputBar ContextMeter: 显式水位计胶囊 (带百分比与色彩等级) */
export function ComposerContextMeter({
  liveContext,
  sessionStats,
  promptBudget,
  messages,
  onCompact,
  compacting = false,
}: {
  liveContext?: LiveContextUsage | null
  sessionStats?: SessionStatsSnapshot | null
  promptBudget?: PromptBudgetSnapshot | null
  messages?: ChatMessage[]
  onCompact?: () => void
  compacting?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)

  let lastAssistantUsage: Record<string, unknown> | null = null
  if (messages && messages.length > 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const u = messages[i]?.usage as Record<string, unknown> | undefined
      if (u && ((typeof u.contextTokens === 'number' && u.contextTokens > 0) || (typeof u.inputTokens === 'number' && u.inputTokens > 0))) {
        lastAssistantUsage = u
        break
      }
    }
  }
  const fallbackTokens = lastAssistantUsage
    ? (typeof lastAssistantUsage.contextTokens === 'number' && lastAssistantUsage.contextTokens > 0
        ? lastAssistantUsage.contextTokens
        : (typeof lastAssistantUsage.inputTokens === 'number' && lastAssistantUsage.inputTokens > 0
            ? (lastAssistantUsage.inputTokens + (typeof lastAssistantUsage.cacheReadTokens === 'number' ? lastAssistantUsage.cacheReadTokens : 0))
            : null))
    : null
  const fallbackWindow = typeof lastAssistantUsage?.contextWindow === 'number' && lastAssistantUsage.contextWindow > 0
    ? (lastAssistantUsage.contextWindow as number)
    : null

  const rawCtxTokens = liveContext?.contextTokens ?? sessionStats?.contextTokens
  const ctxTokens = (typeof rawCtxTokens === 'number' && rawCtxTokens > 0)
    ? rawCtxTokens
    : (fallbackTokens ?? rawCtxTokens)
  const ctxWindow = liveContext?.contextWindow ?? sessionStats?.contextWindow ?? fallbackWindow
  const rawCtxPct = liveContext?.contextPercent ?? sessionStats?.contextPercent
  const ctxPct = (typeof ctxTokens === 'number' && ctxTokens > 0 && typeof ctxWindow === 'number' && ctxWindow > 0)
    ? Math.round(ctxTokens / ctxWindow * 100)
    : rawCtxPct
  const breakdown = liveContext?.contextBreakdown

  const hostUsageAvailable =
    ctxPct !== null &&
    ctxPct !== undefined &&
    ctxWindow !== null &&
    ctxWindow !== undefined &&
    ctxWindow > 0
  const budgetAvailable = Boolean(promptBudget)
  const available = hostUsageAvailable || budgetAvailable
  const hostPercent = hostUsageAvailable ? Math.min(100, Math.max(0, Math.round(ctxPct!))) : 0
  const budgetPercent = promptBudget && promptBudget.budgetBytes > 0
    ? Math.min(100, Math.max(0, Math.round((promptBudget.injectedBytes / promptBudget.budgetBytes) * 100)))
    : 0
  const percent = hostUsageAvailable ? hostPercent : budgetPercent
  const hostPressure = hostUsageAvailable && hostPercent >= 75
  const budgetPressure = Boolean(
    promptBudget && (promptBudget.utilization ?? 0) >= 0.85
      || (promptBudget?.budgetBytes && promptBudget.injectedBytes / promptBudget.budgetBytes >= 0.85),
  )

  const levelClass = percent >= 75
    ? 'is-danger is-pressure'
    : percent >= 50
      ? 'is-warning'
      : 'is-healthy'

  const triggerLabel = hostUsageAvailable
    ? `上下文已用 ${percent}%`
    : `本轮注入占预算 ${percent}%`

  useEffect(() => {
    if (!available && open) setOpen(false)
  }, [available, open])

  useEffect(() => {
    if (!open || !available) return
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && rootRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [available, open])

  if (!available) return null
  const dash = (CIRCUMFERENCE * percent) / 100

  return (
    <span className={`dsh-context-meter ${levelClass}`} ref={rootRef}>
      <button
        type="button"
        className="dsh-context-meter-trigger"
        aria-label={triggerLabel}
        title={`${triggerLabel}（点击查看详情或压缩历史）`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden className="dsh-context-meter-svg">
          <circle className="dsh-context-meter-track" cx="7" cy="7" r={RADIUS} />
          <circle
            className="dsh-context-meter-fill"
            cx="7"
            cy="7"
            r={RADIUS}
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            transform="rotate(-90 7 7)"
          />
        </svg>
        <span className="dsh-context-meter-text">{percent}%</span>
      </button>
      {open && (
        <div className="dsh-context-meter-panel" role="dialog">
          {hostUsageAvailable && (
            <>
              <div className="dsh-context-meter-header-row">
                <div>
                  <div className="dsh-context-meter-head">上下文已用 {hostPercent}%</div>
                  <div className="dsh-context-meter-sub">
                    ~{formatDshCatalogTokens(ctxTokens ?? 0)} / {formatDshCatalogTokens(ctxWindow ?? 0)} tokens
                  </div>
                </div>
                {onCompact && (
                  <button
                    type="button"
                    className="dsh-context-meter-compact-btn"
                    disabled={compacting}
                    onClick={() => {
                      setOpen(false)
                      onCompact()
                    }}
                  >
                    {compacting ? (
                      <><Loader2 size={12} className="spin" /> 压缩中…</>
                    ) : (
                      <><Minimize2 size={12} /> 压缩瘦身</>
                    )}
                  </button>
                )}
              </div>
              {hostPressure && (
                <p className="dsh-context-meter-tip is-danger">
                  ⚠️ 上下文占用已达 {hostPercent}%（超过 75% 预警线），系统将自动或建议立即压缩瘦身，避免超出模型上限或增加延迟。
                </p>
              )}
            </>
          )}
          {hostUsageAvailable && breakdown && (
            <dl className="dsh-context-meter-rows">
              <div>
                <dt>系统提示词</dt>
                <dd>~{formatDshCatalogTokens(breakdown.systemTokens)}</dd>
              </div>
              <div>
                <dt>工具</dt>
                <dd>~{formatDshCatalogTokens(breakdown.toolsTokens)}</dd>
              </div>
              <div>
                <dt>对话消息</dt>
                <dd>~{formatDshCatalogTokens(breakdown.messageTokens)}</dd>
              </div>
            </dl>
          )}
          {promptBudget && (
            <section className="dsh-prompt-budget" aria-label="本轮提示词注入估算">
              <div className="dsh-context-meter-head">本轮提示词注入（估算）</div>
              {budgetPressure && (
                <p className="dsh-context-meter-tip">
                  TaskWeaver 预载已接近 {formatPromptBytes(promptBudget.budgetBytes)} 上限
                  {promptBudget.contextTruncated ? '（工作区内容已截断）' : ''}。减少 <code>@dir</code> 或调低设置中的注入上限。
                </p>
              )}
              <dl className="dsh-context-meter-rows">
                <div>
                  <dt>注入 tokens</dt>
                  <dd>~{formatDshCatalogTokens(promptBudget.injectedEstimatedTokens)}</dd>
                </div>
                <div>
                  <dt>注入预算</dt>
                  <dd>{formatPromptBytes(promptBudget.injectedBytes)} / {formatPromptBytes(promptBudget.budgetBytes)}</dd>
                </div>
                <div>
                  <dt>预算剩余</dt>
                  <dd>{formatPromptBytes(promptBudget.remainingBudgetBytes)}</dd>
                </div>
                <div>
                  <dt>提示词估算</dt>
                  <dd>~{formatDshCatalogTokens(promptBudget.estimatedTokens)} tokens</dd>
                </div>
              </dl>
              <div className="dsh-context-meter-sub dsh-prompt-budget-label">保留注入层</div>
              {Object.entries(promptBudget.layerBytes).length > 0 ? (
                <dl className="dsh-context-meter-rows dsh-prompt-budget-layers">
                  {Object.entries(promptBudget.layerBytes).map(([layerId, bytes]) => (
                    <div key={layerId}>
                      <dt title={layerId}>{layerId}</dt>
                      <dd>{formatPromptBytes(bytes)}</dd>
                    </div>
                  ))}
                </dl>
              ) : <div className="dsh-context-meter-sub">无保留层数据</div>}
              <div className="dsh-context-meter-sub dsh-prompt-budget-label">已丢弃层 ID</div>
              {promptBudget.droppedLayers.length > 0 ? (
                <ul className="dsh-prompt-budget-dropped">
                  {promptBudget.droppedLayers.map((layerId) => <li key={layerId}>{layerId}</li>)}
                </ul>
              ) : <div className="dsh-context-meter-sub">无</div>}
            </section>
          )}
        </div>
      )}
    </span>
  )
}

function formatPromptBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}
