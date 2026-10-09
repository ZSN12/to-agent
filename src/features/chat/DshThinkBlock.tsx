import { useEffect, useRef, useState } from 'react'
import { IconChevronDownOutline14, IconThinkOutline14 } from './DshIcons'
import { firstLine, latestLine } from './reasoning-heuristics'
import { useThrottledVisualUpdate } from './useThrottledVisualUpdate'

export function DshThinkBlock({
  thinking,
  isStreaming = false,
}: {
  thinking?: string
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
    <div className="dsh-think-container" data-variant="think" data-state={running ? 'running' : 'ok'} data-open={expanded || undefined}>
      {running && <span className="dsh-think-a11y-running">正在思考</span>}
      <div
        className="dsh-think-row"
        data-expandable="true"
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
        <span className="dsh-think-leading">
          {expanded ? (
            <IconChevronDownOutline14 size={14} className="dsh-think-chevron-open" />
          ) : (
            <>
              <IconThinkOutline14 size={14} className="dsh-think-icon-idle" />
              <IconChevronDownOutline14 size={14} className="dsh-think-chevron-hover" />
            </>
          )}
        </span>
        <span className="dsh-think-title">思考</span>
        {showSummary && (
          <>
            <span className="dsh-think-separator" aria-hidden />
            <span
              ref={summaryRef}
              className="dsh-think-summary"
              data-follow-end={running && hasThinking ? true : undefined}
            >
              {summary}
            </span>
          </>
        )}
      </div>
      {expanded && body && (
        <div className="dsh-think-body" role="region" aria-label="完整思考过程">{body}</div>
      )}
    </div>
  )
}
