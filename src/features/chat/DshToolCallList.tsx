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
import type { TurnActivitySummary } from '../../types'
import { formatTurnActivityLabel } from './turn-activity-stats'

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

function failureHint(status: DshProjectedToolCall['status'], preview?: string): string | null {
  if (status === 'stopped') return '已中断或未返回结果'
  if (status !== 'error') return null
  if (!preview?.trim()) return '工具执行失败（展开查看详情）'
  const oneLine = preview.replace(/\s+/g, ' ').trim()
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine
}

export function DshToolCallList({
  rows,
  traces,
  turnActivity,
  workspacePath,
  isActive = false,
  onShowToolDetails,
  onOpenWorkspacePath,
}: {
  rows?: readonly DshProjectedToolCall[]
  traces?: readonly ToolTraceItem[]
  turnActivity?: TurnActivitySummary
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
  const errorCount = calls.filter((row) => row.status === 'error').length
  const stoppedCount = calls.filter((row) => row.status === 'stopped').length
  const failedCount = errorCount + stoppedCount
  const runningPresentation = runningCall
    ? dshToolRowPresentation(runningCall.toolName, runningCall.argsRaw, workspacePath, 'running')
    : null

  const activityLabel = turnActivity ? formatTurnActivityLabel(turnActivity) : null
  const showDiff = turnActivity && turnActivity.editedFileCount > 0 && turnActivity.linesComplete
    && typeof turnActivity.addedLines === 'number'
    && typeof turnActivity.deletedLines === 'number'

  const batchMeta = runningCall
    ? [runningPresentation?.title, runningPresentation?.summary].filter(Boolean).join(' · ') || '等待工具结果'
    : failedCount > 0
      ? (stoppedCount > 0 && errorCount > 0
        ? `${errorCount} 失败 · ${stoppedCount} 中断`
        : stoppedCount > 0
          ? `${stoppedCount} 次中断`
          : `${errorCount} 次失败`)
      : (activityLabel || null)
  const latestStepKey = stepGroups.at(-1)?.key

  const renderNode = (node: ReturnType<typeof buildDshToolCallTree>[number], depth = 0) => {
    const { row, trace: sourceTrace } = node
    const isRunning = row.status === 'running'
    const { title, summary: rowSummary, variant } = dshToolRowPresentation(row.toolName, row.argsRaw, workspacePath, row.status)
    const summary = sourceTrace.inputSummary || rowSummary
    const failure = failureHint(row.status, row.resultPreview ?? sourceTrace.resultSummary)
    const open = openId === row.callId
    const Icon = rowIcon(variant)
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
          {failure ? (
            <>
              <span className="dsh-tool-summary-sep" aria-hidden />
              <span className="dsh-tool-summary-text dsh-tool-summary-failure" title={failure}>{failure}</span>
            </>
          ) : summary ? (
            <>
              <span className="dsh-tool-summary-sep" aria-hidden />
              <span className="dsh-tool-summary-text" title={summary}>{summary}</span>
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

  // 单工具调用场景：直接平铺内联渲染该工具单行，杜绝多余的「工具调用 1」外层黑框
  if (calls.length === 1 && tree.length === 1 && tree[0].children.length === 0) {
    return (
      <div className="tool-trace-compact dsh-tool-call-list dsh-tool-call-single">
        {renderNode(tree[0], 0)}
      </div>
    )
  }

  // 多工具调用场景：计算语义化工具摘要（如 "read, bash" 或 "read · 2 个文件"）
  const uniqueToolNames = Array.from(new Set(calls.map((c) => c.toolName).filter(Boolean)))
  const toolKindSummary = uniqueToolNames.length === 1
    ? `${uniqueToolNames[0]} (${calls.length})`
    : uniqueToolNames.slice(0, 3).join(', ') + (uniqueToolNames.length > 3 ? '…' : '')

  const firstCallPresentation = calls[0]
    ? dshToolRowPresentation(calls[0].toolName, calls[0].argsRaw, workspacePath, calls[0].status)
    : null
  const subSummary = runningCall
    ? [runningPresentation?.title, runningPresentation?.summary].filter(Boolean).join(' · ') || '执行中…'
    : (firstCallPresentation?.summary ? `· ${firstCallPresentation.summary}` : '')

  return (
    <div className={`tool-trace-compact dsh-tool-call-list dsh-tool-call-batch${batchExpanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className={`dsh-tool-batch-toggle${runningCall ? ' is-running' : ''}${failedCount > 0 && !runningCall ? ' has-errors' : ''}`}
        aria-expanded={batchExpanded}
        aria-label={`${batchExpanded ? '收起' : '展开'} ${calls.length} 个工具调用${failedCount ? `，${failedCount} 个未成功` : ''}`}
        onClick={() => setBatchExpandedOverride((override) => !isDshToolCallBatchExpanded(override, isActive || Boolean(runningCall)))}
      >
        <span className="dsh-tool-batch-leading">
          {runningCall ? (
            <DshStateDot state="ongoing" size={10} />
          ) : (
            <Terminal size={13} aria-hidden className="dsh-tool-batch-icon" />
          )}
        </span>
        <span className="dsh-tool-batch-title">
          <span className="dsh-tool-batch-label">{calls.length} 个工具调用</span>
          <span className="dsh-tool-batch-types">({toolKindSummary})</span>
        </span>
        {subSummary && (
          <span className="dsh-tool-batch-inline-summary" title={subSummary}>{subSummary}</span>
        )}
        {failedCount > 0 && !runningCall && (
          <span className="dsh-tool-batch-meta">
            <DshStateDot state={errorCount > 0 ? 'error' : 'warning'} size={6} />
            {failedCount} 项异常
          </span>
        )}
        <ChevronRight size={13} aria-hidden className={`dsh-tool-batch-chevron${batchExpanded ? ' expanded' : ''}`} />
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
              ? `${group.runningCount} 运行中 · ${group.callCount}次调用`
              : `${group.callCount}次调用`
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
