import { Atom } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useThrottledVisualUpdate } from './useThrottledVisualUpdate'

function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

function latestLine(text: string): string {
  const visible = text.trimEnd()
  const newline = visible.lastIndexOf('\n')
  return newline === -1 ? visible : visible.slice(newline + 1)
}

function extractThinkSummary(thinking?: string, running?: boolean): string {
  if (!thinking || !thinking.trim()) {
    return running ? '正在深入分析…' : '正在深入分析…'
  }
  const clean = thinking.replace(/<\/?think>/gi, '').trim()
  if (running) {
    const tail = latestLine(clean).replace(/^[\s>*·\-]+/, '').trim()
    if (tail) return tail.length > 80 ? `${tail.slice(0, 78)}…` : tail
  }
  const lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('```') && !l.startsWith('---'))
  if (lines.length === 0) return '正在深入分析…'
  const first = lines[0].replace(/^[\s>*·\-]+/, '').trim()
  if (first.length > 50) return `${first.slice(0, 48)}…`
  return first
}

export function DshThinkBlock({
  thinking,
  durationMs: _durationMs,
  isStreaming = false,
}: {
  thinking?: string
  durationMs?: number
  isStreaming?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const summaryRef = useRef<HTMLSpanElement>(null)
  const hasThinking = Boolean(thinking && thinking.trim().length > 0)
  const running = Boolean(isStreaming && (hasThinking || !thinking))

  if (!hasThinking && !isStreaming) return null

  const summary = extractThinkSummary(thinking, running && hasThinking)

  const scheduleSummaryScroll = useThrottledVisualUpdate(() => {
    const element = summaryRef.current
    if (element === null) return
    element.scrollLeft = running ? element.scrollWidth - element.clientWidth : 0
  })

  useEffect(() => {
    scheduleSummaryScroll()
  }, [running, scheduleSummaryScroll, summary])

  const body = thinking ? thinking.replace(/<\/?think>/gi, '').trim() : ''

  return (
    <div className="dsh-think-container" data-variant="think" data-state={running ? 'running' : 'ok'}>
      {running && <span className="dsh-think-a11y-running">正在思考</span>}
      <div
        className="dsh-think-row"
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        title={expanded ? '点击收起思考过程' : '点击展开完整思考过程'}
      >
        <Atom size={14} className="dsh-think-icon" />
        <span className="dsh-think-tag">Think</span>
        <span className="dsh-think-sep">·</span>
        <span
          ref={summaryRef}
          className="dsh-think-summary"
          data-follow-end={running && hasThinking ? true : undefined}
        >
          {summary}
        </span>
        <span className={`dsh-think-chevron ${expanded ? 'open' : ''}`}>▸</span>
      </div>
      {expanded && body && <div className="dsh-think-expanded-content">{body}</div>}
    </div>
  )
}
