import { ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { useState } from 'react'
import { AgentMessageMarkdown } from './AgentMessageMarkdown'

export function CompactionRow({
  automatic,
  summary,
  tokensBefore,
}: {
  automatic: boolean
  summary?: string
  tokensBefore?: number | null
}) {
  const [open, setOpen] = useState(false)
  const expandable = Boolean(summary?.trim())
  const title = automatic ? '上下文已自动压缩' : '上下文已手动压缩'
  const meta = tokensBefore ? `约 ${tokensBefore.toLocaleString('zh-CN')} tok 已折叠` : '较早消息已折叠'

  return (
    <div className="compaction-row">
      <button
        type="button"
        className="compaction-row-btn"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Layers size={14} />
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="compaction-title">{title}</span>
        <span className="compaction-sep">·</span>
        <span className="compaction-summary">{meta}</span>
      </button>
      {open && summary && (
        <div className="compaction-body">
          <AgentMessageMarkdown text={summary} />
        </div>
      )}
    </div>
  )
}
