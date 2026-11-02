import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Check, Copy } from 'lucide-react'
import { IconChevronDownOutline14, IconThinkOutline14 } from './DshIcons'
import { firstLine, latestLine } from './reasoning-heuristics'
import { useThrottledVisualUpdate } from './useThrottledVisualUpdate'

function normalizeThinkingText(text?: string): string {
  return (text ?? '')
    .replace(/<\/?think>/gi, '')
    .replace(/\r\n?/g, '\n')
    // Providers often close each summary part with a blank-line separator.
    // Keep a single soft break so consecutive updates read as one compact stream.
    .replace(/[\t ]*\n(?:[\t ]*\n)+/g, '\n')
    .trim()
}

function plainTextSummary(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

const THINK_MARKDOWN_COMPONENTS = {
  a({ children }: any) {
    return <span>{children}</span>
  },
  img({ alt }: any) {
    return alt ? <span>{alt}</span> : null
  },
}

export function DshThinkBlock({
  thinking,
  isStreaming = false,
}: {
  thinking?: string
  isStreaming?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const summaryRef = useRef<HTMLSpanElement>(null)
  const body = useMemo(() => normalizeThinkingText(thinking), [thinking])
  const hasThinking = body.length > 0
  const running = Boolean(isStreaming && (hasThinking || !thinking))
  const summary = plainTextSummary(running ? latestLine(body) : firstLine(body))
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

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!body) return
    navigator.clipboard.writeText(body)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (!hasThinking) {
    if (!isStreaming) return null
    return (
      <div className="dsh-think-pending" role="status" aria-live="polite">
        <span className="dsh-think-leading is-running" aria-hidden="true">
          <IconThinkOutline14 size={14} />
        </span>
        <span>正在思考...</span>
      </div>
    )
  }

  return (
    <div
      className="dsh-think-container"
      data-variant="think"
      data-state={running ? 'running' : 'ok'}
      data-open={expanded ? 'true' : undefined}
    >
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
        aria-label={expanded ? '收起思考过程' : '展开思考过程'}
      >
        <div className="dsh-think-header-left">
          <span className={`dsh-think-leading ${running ? 'is-running' : ''}`}>
            <IconThinkOutline14 size={14} className="dsh-think-icon-idle" />
          </span>
          <span className="dsh-think-title">
            {running ? '正在思考...' : '思考过程'}
          </span>
          {showSummary && (
            <>
              <span className="dsh-think-separator" aria-hidden="true" />
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

        <div className="dsh-think-header-right">
          {expanded && body && (
            <button
              type="button"
              className="dsh-think-copy-btn"
              onClick={handleCopy}
              aria-label={copied ? '已复制思考过程' : '复制思考内容'}
            >
              {copied ? <Check size={12} className="dsh-think-copy-check" /> : <Copy size={12} />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>
          )}
          <span className="dsh-think-toggle-label">
            {expanded ? '收起' : '展开'}
          </span>
          <span className={`dsh-think-chevron ${expanded ? 'is-open' : ''}`}>
            <IconChevronDownOutline14 size={13} />
          </span>
        </div>
      </div>

      {expanded && body && (
        <div className="dsh-think-body" role="region" aria-label="完整思考过程">
          <div className="dsh-think-body-inner">
            <ReactMarkdown components={THINK_MARKDOWN_COMPONENTS}>
              {body}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
