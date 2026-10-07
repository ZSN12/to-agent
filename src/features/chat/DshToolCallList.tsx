import { ChevronRight, FileText, Search, Terminal, Pencil, Code2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  buildDshToolCallTree,
  groupDshToolCallTree,
  isDshToolCallBatchExpanded,
  isDshToolCallStepExpanded,
} from './dshToolCallTree'
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
  isActive = false,
  onShowToolDetails,
  onOpenWorkspacePath,
}: {
  rows?: readonly DshProjectedToolCall[]
  traces?: readonly ToolTraceItem[]
  workspacePath?: string | null
  isActive?: boolean
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [batchExpandedOverride, setBatchExpandedOverride] = useState<boolean | null>(null)
  const [stepExpandedOverrides, setStepExpandedOverrides] = useState<Record<string, boolean>>({})

  const tree = useMemo(() => buildDshToolCallTree(rows, traces), [rows, traces])
  const stepGroups = useMemo(() => groupDshToolCallTree(tree), [tree])
  const calls = useMemo(() => {
    const flattened: DshProjectedToolCall[] = []
    const visit = (nodes: typeof tree) => {
      for (const node of nodes) {
        flattened.push(node.row)
        visit(node.children)
      }
    }
    visit(tree)
    return flattened
  }, [tree])

  if (!calls.length) return null

  const runningCall = [...calls].reverse().find((row) => row.status === 'running')
  const batchExpanded = isDshToolCallBatchExpanded(batchExpandedOverride, isActive || Boolean(runningCall))
  const failedCount = calls.filter((row) => row.status === 'error' || row.status === 'stopped').length
  const runningPresentation = runningCall
    ? dshToolRowPresentation(runningCall.toolName, runningCall.argsRaw, workspacePath)
    : null
  const batchMeta = runningCall
    ? [runningPresentation?.title, runningPresentation?.summary].filter(Boolean).join(' · ') || '等待工具结果'
    : failedCount > 0
      ? `${failedCount} 未成功`
      : null
  const latestStepKey = stepGroups.at(-1)?.key

  const renderNode = (node: ReturnType<typeof buildDshToolCallTree>[number], depth = 0) => {
    const { row, trace: sourceTrace } = node
    const { title, summary: rowSummary, variant } = dshToolRowPresentation(row.toolName, row.argsRaw, workspacePath)
    const summary = sourceTrace.inputSummary || rowSummary
    const open = openId === row.callId
    const Icon = rowIcon(variant)
    const isRunning = row.status === 'running'
    const detailTrace: ToolTraceItem = { ...sourceTrace, inputSummary: summary }

    return (
      <div key={row.callId} className={`dsh-tool-call-list-item${depth === 0 ? ' is-root' : ' is-nested'}`}>
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
          <div className="dsh-tool-call-children" aria-label={`${node.children.length} 个嵌套工具调用`}>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`tool-trace-compact dsh-tool-call-list dsh-tool-call-batch${batchExpanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className={`dsh-tool-batch-toggle${runningCall ? ' is-running' : ''}${failedCount > 0 && !runningCall ? ' has-errors' : ''}`}
        aria-expanded={batchExpanded}
        aria-label={`${batchExpanded ? '收起' : '展开'} ${calls.length} 次工具调用${failedCount ? `，${failedCount} 次未成功` : ''}`}
        onClick={() => setBatchExpandedOverride((override) => !isDshToolCallBatchExpanded(override, isActive || Boolean(runningCall)))}
      >
        <span className="dsh-tool-batch-leading">
          {runningCall ? (
            <DshStateDot state="ongoing" size={10} />
          ) : (
            <Terminal size={14} aria-hidden className="dsh-tool-batch-icon" />
          )}
        </span>
        <span className="dsh-tool-batch-title">
          <span className="dsh-tool-batch-label">工具调用</span>
          <span className="dsh-tool-batch-count" aria-hidden>{calls.length}</span>
        </span>
        {batchMeta ? (
          <span className="dsh-tool-batch-meta">{batchMeta}</span>
        ) : (
          <span className="dsh-tool-batch-meta is-placeholder" aria-hidden />
        )}
        <ChevronRight size={14} aria-hidden className={`dsh-tool-batch-chevron${batchExpanded ? ' expanded' : ''}`} />
      </button>
      {batchExpanded && (
        <div className="dsh-tool-call-batch-body">
          {stepGroups.map((group) => {
            const isLatestStep = group.key === latestStepKey
            const expanded = isDshToolCallStepExpanded(
              stepExpandedOverrides[group.key],
              group.runningCount > 0,
              isLatestStep,
            )
            const stepLabel = group.turn !== null || group.step !== null
              ? `第 ${group.turn ?? '—'} 轮 · 第 ${group.step ?? '—'} 步`
              : '工具执行组'
            const groupStatus = group.runningCount > 0
              ? `${group.runningCount} 个运行中 · ${group.callCount} 次调用`
              : `${group.callCount} 次调用`
            const groupTime = group.startedAt !== null
              ? new Date(group.startedAt).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              })
              : null

            return (
              <section className={`dsh-tool-step-group${group.runningCount > 0 ? ' is-running' : ''}`} key={group.key}>
                <button
                  type="button"
                  className="dsh-tool-step-toggle"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? '收起' : '展开'}${stepLabel}，${groupStatus}`}
                  onClick={() => setStepExpandedOverrides((current) => ({
                    ...current,
                    [group.key]: !isDshToolCallStepExpanded(
                      current[group.key],
                      group.runningCount > 0,
                      isLatestStep,
                    ),
                  }))}
                >
                  <ChevronRight size={13} aria-hidden className={`dsh-tool-step-chevron${expanded ? ' expanded' : ''}`} />
                  <span className="dsh-tool-step-title">{stepLabel}</span>
                  {groupTime && <span className="dsh-tool-step-time">{groupTime}</span>}
                  <span className="dsh-tool-step-status">{groupStatus}</span>
                </button>
                {expanded && (
                  <div className="dsh-tool-step-body">
                    {group.nodes.map((node) => renderNode(node))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
