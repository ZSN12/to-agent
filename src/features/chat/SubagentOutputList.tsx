import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { SubagentOutput } from '../../types'
import { AssistantTurnBody } from './AssistantTurnBody'
import { billedInputTokens, formatDshCatalogTokens } from './session-usage'

/** Rows shown before the "show more" control; the rest stay one click away. */
const INITIAL_VISIBLE_OUTPUTS = 4
const PREVIEW_MAX_LENGTH = 140
const COMPLETED_STATUSES = new Set(['已完成', '完成', 'done', 'completed'])

function formatSubagentDuration(durationMs?: number | null): string | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) return null
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`
  return `${(durationMs / 1000).toFixed(1)} s`
}

/** One plain-text line for the collapsed row, without Markdown syntax noise. */
function previewLine(text: string): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > PREVIEW_MAX_LENGTH ? `${plain.slice(0, PREVIEW_MAX_LENGTH)}…` : plain
}

function SubagentOutputCard({ output }: { output: SubagentOutput }) {
  const [open, setOpen] = useState(false)
  const usage = output.usage
  const totalTokens = usage
    ? billedInputTokens(usage.inputTokens ?? 0, usage.cacheReadTokens ?? 0, usage.cacheWriteTokens ?? 0)
      + (usage.outputTokens ?? 0)
    : 0
  const duration = formatSubagentDuration(output.durationMs)
  const status = output.status?.trim() ?? ''
  const showStatus = Boolean(status && !COMPLETED_STATUSES.has(status.toLocaleLowerCase()))
  const bodyId = `subagent-output-body-${output.id}`

  return (
    <article className={`subagent-output-card${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="subagent-output-header"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight size={14} className="subagent-output-chevron" aria-hidden />
        <span className="subagent-output-identity">
          <strong>{output.role}</strong>
          {output.title && output.title !== output.role && <span>{output.title}</span>}
        </span>
        <span className="subagent-output-badges">
          <span className="subagent-output-badge is-model" title={output.modelKey || undefined}>{output.model}</span>
          {showStatus && <span className="subagent-output-badge is-status">{status}</span>}
          {duration && <span className="subagent-output-badge">{duration}</span>}
          {totalTokens > 0 && <span className="subagent-output-badge">{formatDshCatalogTokens(totalTokens)} tok</span>}
        </span>
        {!open && <span className="subagent-output-preview">{previewLine(output.text)}</span>}
      </button>
      {open && (
        <div className="subagent-output-body" id={bodyId}>
          {output.routeReason && (
            <p className="subagent-output-reason">路由依据：{output.routeReason}</p>
          )}
          <AssistantTurnBody fallbackText={output.text} />
        </div>
      )}
    </article>
  )
}

/** DAG child-agent results, collapsed so the parent reply stays the focus. */
export function SubagentOutputList({ outputs }: { outputs: readonly SubagentOutput[] }) {
  const [showAll, setShowAll] = useState(false)
  if (outputs.length === 0) return null
  const visible = showAll ? outputs : outputs.slice(0, INITIAL_VISIBLE_OUTPUTS)
  const hiddenCount = outputs.length - visible.length

  return (
    <section className="subagent-output-list" aria-label="子 Agent 执行结果">
      <div className="subagent-output-list-heading">
        <span>子 Agent 结果</span>
        <span className="subagent-output-count">{outputs.length}</span>
      </div>
      {visible.map((output) => <SubagentOutputCard key={output.id} output={output} />)}
      {(hiddenCount > 0 || (showAll && outputs.length > INITIAL_VISIBLE_OUTPUTS)) && (
        <button type="button" className="subagent-output-more" onClick={() => setShowAll((value) => !value)}>
          {hiddenCount > 0 ? `显示其余 ${hiddenCount} 个` : '收起'}
        </button>
      )}
    </section>
  )
}
