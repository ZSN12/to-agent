import { ChevronRight, FileText, Search, Terminal, Pencil, Code2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { buildDshToolCallTree } from './dshToolCallTree'
import { DshStateDot } from './DshStateDot'
import { dshToolRowPresentation } from './dshToolRowModel'
import { ToolTraceCard } from './ToolTraceCard'
import type { DshProjectedToolCall, ToolTraceItem } from '../../shared/app-api'

function rowIcon(variant: string) {
  if (variant === 'bash') return Terminal
  if (variant === 'read') return FileText
  if (variant === 'search') return Search
  if (variant === 'write' || variant === 'edit') return Pencil
  if (variant === 'code') return Code2
  return Terminal
}

function dotState(status: DshProjectedToolCall['status']): 'ongoing' | 'done' | 'error' | 'warning' {
  if (status === 'running') return 'ongoing'
  if (status === 'error') return 'error'
  if (status === 'stopped') return 'warning'
  return 'done'
}

export function DshToolCallList({
  rows,
  traces,
  workspacePath,
  onShowToolDetails,
  onOpenWorkspacePath,
}: {
  rows?: readonly DshProjectedToolCall[]
  traces?: readonly ToolTraceItem[]
  workspacePath?: string | null
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  const tree = useMemo(() => buildDshToolCallTree(rows, traces), [rows, traces])

  if (!tree.length) return null

  const renderNode = (node: ReturnType<typeof buildDshToolCallTree>[number], depth = 0) => {
    const { row, trace: sourceTrace } = node
    const { title, summary: rowSummary, variant } = dshToolRowPresentation(row.toolName, row.argsRaw, workspacePath)
    const summary = sourceTrace.inputSummary || rowSummary
    const open = openId === row.callId
    const Icon = rowIcon(variant)
    const isRunning = row.status === 'running'
    const detailTrace: ToolTraceItem = { ...sourceTrace, inputSummary: summary }
    const indentation = Math.min(depth * 18, 90)

    return (
      <div key={row.callId} className="dsh-tool-call-list-item" style={indentation ? { marginLeft: indentation } : undefined}>
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
              item={detailTrace}
              onShowDetails={onShowToolDetails}
              onOpenPath={onOpenWorkspacePath}
            />
          </div>
        )}
        {node.children.length > 0 && (
          <div className="dsh-tool-call-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="tool-trace-compact dsh-tool-call-list">
      {tree.map((node) => renderNode(node))}
    </div>
  )
}
