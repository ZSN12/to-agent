import { Atom } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatDurationZh } from './session-usage'
import { firstLine, latestLine } from './reasoning-heuristics'
import { useThrottledVisualUpdate } from './useThrottledVisualUpdate'

export function DshThinkBlock({
  thinking,
  durationMs,
  isStreaming = false,
}: {
  thinking?: string
  durationMs?: number
  isStreaming?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const summaryRef = useRef<HTMLSpanElement>(null)
  const body = thinking ? thinking.replace(/<\/?think>/gi, '').trim() : ''
  const hasThinking = body.length > 0
  const running = Boolean(isStreaming && (hasThinking || !thinking))

  if (!hasThinking && !isStreaming) return null

  const summary = running ? latestLine(body) : firstLine(body)
  const showSummary = summary.trim().length > 0 && !expanded

  const scheduleSummaryScroll = useThrottledVisualUpdate(() => {
    const element = summaryRef.current
    if (element === null) return
    element.scrollLeft = running ? element.scrollWidth - element.clientWidth : 0
  })

  useEffect(() => {
    scheduleSummaryScroll()
  }, [running, scheduleSummaryScroll, summary, expanded])

  const toggle = () => setExpanded((prev) => !prev)

  return (
    <div className="dsh-think-container" data-variant="think" data-state={running ? 'running' : 'ok'}>
      {running && <span className="dsh-think-a11y-running">正在思考</span>}
      <div
        className="dsh-think-row"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        title={expanded ? '点击收起思考过程' : '点击展开完整思考过程'}
      >
        <Atom size={16} className="dsh-think-icon" aria-hidden />
        <span className="dsh-think-tag">Think</span>
        {!running && typeof durationMs === 'number' && durationMs > 0 && (
          <>
            <span className="dsh-think-sep" aria-hidden>·</span>
            <span className="dsh-think-duration">用时 {formatDurationZh(durationMs)}</span>
          </>
        )}
        {showSummary && (
          <>
            <span className="dsh-think-sep" aria-hidden>·</span>
            <span
              ref={summaryRef}
              className="dsh-think-summary"
              data-follow-end={running && hasThinking ? true : undefined}
            >
              {summary}
            </span>
          </>
        )}
        <span className={`dsh-think-chevron ${expanded ? 'open' : ''}`} aria-hidden>▸</span>
      </div>
      {expanded && body && (
        <div className="dsh-think-expanded-content dsh-think-body-plain">{body}</div>
      )}
    </div>
  )
}
