import { useEffect, useRef, useState } from 'react'
import type { LiveContextUsage, SessionStatsSnapshot } from '../../shared/app-api'
import { formatDshCatalogTokens } from './session-usage'

const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** DSH InputBar ContextMeter: 14px ring beside send, occupancy only. */
export function ComposerContextMeter({
  liveContext,
  sessionStats,
}: {
  liveContext?: LiveContextUsage | null
  sessionStats?: SessionStatsSnapshot | null
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const ctxPct = liveContext?.contextPercent ?? sessionStats?.contextPercent
  const ctxTokens = liveContext?.contextTokens ?? sessionStats?.contextTokens
  const ctxWindow = liveContext?.contextWindow ?? sessionStats?.contextWindow
  const breakdown = liveContext?.contextBreakdown

  const available =
    ctxPct !== null &&
    ctxPct !== undefined &&
    ctxWindow !== null &&
    ctxWindow !== undefined &&
    ctxWindow > 0

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
  const percent = Math.min(100, Math.max(0, Math.round(ctxPct!)))
  const dash = (CIRCUMFERENCE * percent) / 100

  return (
    <span className="dsh-context-meter" ref={rootRef}>
      <button
        type="button"
        className="dsh-context-meter-trigger"
        aria-label={`上下文已用 ${percent}%`}
        title={`上下文已用 ${percent}%`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden>
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
      </button>
      {open && (
        <div className="dsh-context-meter-panel" role="dialog">
          <div className="dsh-context-meter-head">上下文已用 {percent}%</div>
          <div className="dsh-context-meter-sub">
            ~{formatDshCatalogTokens(ctxTokens ?? 0)} / {formatDshCatalogTokens(ctxWindow ?? 0)}
          </div>
          {breakdown && (
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
        </div>
      )}
    </span>
  )
}
