import { ChevronRight, FileText, Search, Terminal, Pencil, Code2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DshProjectedToolCall } from '../../shared/app-api'
import { DshStateDot } from './DshStateDot'
import { dshToolRowPresentation } from './dshToolRowModel'
import { ToolTraceCard } from './ToolTraceCard'
import type { ToolTraceItem } from '../../shared/app-api'

function rowIcon(variant: string) {
  if (variant === 'bash') return Terminal
  if (variant === 'read') return FileText
  if (variant === 'search') return Search
  if (variant === 'write' || variant === 'edit') return Pencil
  if (variant === 'code') return Code2
  return Terminal
}

function dotState(status: DshProjectedToolCall['status']): 'ongoing' | 'done' | 'error' {
  if (status === 'running') return 'ongoing'
  if (status === 'error') return 'error'
  return 'done'
}

function toTraceItem(row: DshProjectedToolCall, inputSummary: string, resultSummary?: string): ToolTraceItem {
  return {
    id: row.callId,
    toolName: row.toolName,
    status: row.status === 'running' ? 'running' : row.status === 'error' ? 'error' : 'done',
    inputSummary,
    resultSummary,
    durationMs: row.durationMs,
    startedAt: row.startedAt,
  }
}

export function DshToolCallList({
  rows,
  workspacePath,
  onShowToolDetails,
  onOpenWorkspacePath,
}: {
  rows: readonly DshProjectedToolCall[]
  workspacePath?: string | null
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  const prepared = useMemo(
    () =>
      rows.map((row) => {
        const { title, summary, variant } = dshToolRowPresentation(row.toolName, row.argsRaw, workspacePath)
        return { row, title, summary, variant }
      }),
    [rows, workspacePath],
  )

  if (!prepared.length) return null

  return (
    <div className="tool-trace-compact dsh-tool-call-list">
      {prepared.map(({ row, title, summary, variant }) => {
        const open = openId === row.callId
        const Icon = rowIcon(variant)
        const isRunning = row.status === 'running'
        const trace = toTraceItem(row, summary, row.resultPreview)
        return (
          <div key={row.callId} className="dsh-tool-call-list-item">
            <button
              type="button"
              className={`dsh-tool-summary-row ${isRunning ? 'is-running' : ''} ${open ? 'is-open' : ''}`}
              onClick={() => setOpenId((id) => (id === row.callId ? null : row.callId))}
              aria-expanded={open}
            >
              <span className="dsh-tool-summary-leading">
                {row.status === 'error' || row.status === 'stopped' ? (
                  <DshStateDot state={dotState(row.status)} size={10} />
                ) : (
                  <Icon size={14} aria-hidden className="dsh-tool-summary-icon" />
                )}
              </span>
              <span className="dsh-tool-summary-title">{title}</span>
              {summary ? (
                <>
                  <span className="dsh-tool-summary-sep" aria-hidden />
                  <span className="dsh-tool-summary-text">{summary}</span>
                </>
              ) : null}
              {typeof row.durationMs === 'number' && row.durationMs > 0 && !isRunning && (
                <span className="dsh-tool-summary-duration">
                  {row.durationMs < 1000 ? `${row.durationMs}ms` : `${(row.durationMs / 1000).toFixed(1)}s`}
                </span>
              )}
              <ChevronRight size={14} className={`dsh-tool-summary-chevron ${open ? 'expanded' : ''}`} aria-hidden />
            </button>
            {open && (
              <div className="tool-trace-dropdown dsh-tool-call-expanded">
                <ToolTraceCard
                  item={trace}
                  onShowDetails={onShowToolDetails}
                  onOpenPath={onOpenWorkspacePath}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
