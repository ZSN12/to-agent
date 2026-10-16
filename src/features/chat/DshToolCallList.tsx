import { ArrowUpRight, ChevronRight, FileText, Search, Terminal, Pencil, Code2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildDshToolCallTree,
  isDshToolCallBatchExpanded,
  type DshToolCallTreeNode,
} from './dshToolCallTree'
import { DshStateDot } from './DshStateDot'
import { classifyDshTool, dshToolRowPresentation } from './dshToolRowModel'
import { ToolTraceCard } from './ToolTraceCard'
import { dshToolCallUiStateKey, readDshToolCallUiState, saveDshToolCallUiState } from './dshToolCallUiState'
import type { DshProjectedToolCall, ToolTraceItem } from '../../shared/app-api'
import type { CodeOutputImage } from './codeOutputPresentation'
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

function formatToolDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`
  const seconds = Math.round(durationMs / 100) / 10
  if (seconds < 60) return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`
  const wholeSeconds = Math.floor(durationMs / 1000)
  return `${Math.floor(wholeSeconds / 60)}m ${wholeSeconds % 60}s`
}

function fileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? path
}

function summarizeToolBatch(
  calls: readonly DshProjectedToolCall[],
  nodesById: ReadonlyMap<string, DshToolCallTreeNode>,
): string {
  const counts = new Map<string, { done: number; running: number; failed: number }>()
  const editedPaths = new Set<string>()
  for (const call of calls) {
    const variant = classifyDshTool(call.toolName)
    const countsForVariant = counts.get(variant) ?? { done: 0, running: 0, failed: 0 }
    if (call.status === 'running') countsForVariant.running += 1
    else if (call.status === 'error' || call.status === 'stopped') countsForVariant.failed += 1
    else countsForVariant.done += 1
    counts.set(variant, countsForVariant)
    const path = nodesById.get(call.callId)?.trace.fileDiff?.path
    if ((variant === 'edit' || variant === 'write') && path) editedPaths.add(path)
  }

  const labels: string[] = []
  const addLabel = (variant: string, singular: string, plural?: (count: number) => string) => {
    const value = counts.get(variant)
    if (!value) return
    if (value.done > 0) {
      const count = variant === 'edit' || variant === 'write'
        ? Math.max(value.done, editedPaths.size)
        : value.done
      labels.push(plural && count > 1 ? plural(count) : singular)
    }
    if (value.running > 0) {
      labels.push(variant === 'bash' ? '正在运行命令'
        : variant === 'edit' || variant === 'write' ? '正在编辑文件'
          : variant === 'read' ? '正在读取文件'
            : variant === 'search' ? '正在搜索' : '正在执行代码')
    }
    if (value.failed > 0 && value.done === 0 && value.running === 0) {
      labels.push(variant === 'bash' ? '命令执行失败'
        : variant === 'edit' || variant === 'write' ? '文件修改失败'
          : variant === 'read' ? '文件读取失败' : '工具执行失败')
    }
  }

  addLabel('edit', '编辑了文件', (count) => `编辑了 ${count} 个文件`)
  addLabel('write', '写入了文件', (count) => `写入了 ${count} 个文件`)
  addLabel('bash', '运行了命令', (count) => `运行了 ${count} 条命令`)
  addLabel('read', '查看了文件', (count) => `查看了 ${count} 个文件`)
  addLabel('search', '搜索了内容', (count) => `搜索了 ${count} 次`)
  addLabel('code', '运行了代码', (count) => `运行了 ${count} 段代码`)
  const otherCount = counts.get('others')
  if (otherCount) labels.push(otherCount.running > 0 ? '正在调用工具' : '调用了工具')
  return labels.join(' · ') || `${calls.length} 个工具调用`
}

export function DshToolCallList({
  rows,
  traces,
  workspacePath,
  conversationId,
  dagTaskCount = 0,
  onOpenDagPanel,
  onShowToolDetails,
  onOpenWorkspacePath,
}: {
  rows?: readonly DshProjectedToolCall[]
  traces?: readonly ToolTraceItem[]
  workspacePath?: string | null
  conversationId?: string | null
  dagTaskCount?: number
  onOpenDagPanel?: () => void
  onShowToolDetails?: (item: ToolTraceItem) => void
  onOpenWorkspacePath?: (relativePath: string) => void
}) {
  const uiStateKey = dshToolCallUiStateKey(conversationId, rows, traces)
  const scopeKey = uiStateKey ?? 'local'
  const [uiStateByScope, setUiStateByScope] = useState<Record<string, ReturnType<typeof readDshToolCallUiState>>>({})
  const uiState = uiStateByScope[scopeKey] ?? readDshToolCallUiState(uiStateKey)
  const updateUiState = (update: (current: ReturnType<typeof readDshToolCallUiState>) => ReturnType<typeof readDshToolCallUiState>) => {
    setUiStateByScope((currentByScope) => {
      const next = update(currentByScope[scopeKey] ?? readDshToolCallUiState(uiStateKey))
      saveDshToolCallUiState(uiStateKey, next)
      return { ...currentByScope, [scopeKey]: next }
    })
  }
  const openId = uiState.openId
  const [resultImages, setResultImages] = useState<CodeOutputImage[]>([])
  const [resultImagesLoading, setResultImagesLoading] = useState(false)
  const resultImageCache = useRef(new Map<string, Promise<CodeOutputImage | null>>())
  const batchExpandedOverride = uiState.batchExpandedOverride

  const tree = useMemo(() => buildDshToolCallTree(rows, traces), [rows, traces])
  const nodesById = useMemo(() => {
    const byId = new Map<string, DshToolCallTreeNode>()
    const visit = (nodes: readonly DshToolCallTreeNode[]) => {
      for (const node of nodes) {
        byId.set(node.row.callId, node)
        visit(node.children)
      }
    }
    visit(tree)
    return byId
  }, [tree])
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

  const openCall = calls.find((row) => row.callId === openId)
  const openImageRefs = openCall?.resultImages?.slice(0, 4) ?? []
  const openImageIdsKey = openImageRefs.map((image) => image.attachmentId).join('\n')
  useEffect(() => {
    if (!openId || !openImageIdsKey || !conversationId) {
      setResultImages([])
      setResultImagesLoading(false)
      return
    }

    const attachmentIds = openImageIdsKey.split('\n')
    const refs = new Map(openImageRefs.map((image) => [image.attachmentId, image]))
    let current = true
    setResultImages([])
    setResultImagesLoading(true)
    const pending = attachmentIds.map((attachmentId) => {
      const cacheKey = `${conversationId}\n${attachmentId}`
      const cached = resultImageCache.current.get(cacheKey)
      if (cached) return cached
      const request = (async (): Promise<CodeOutputImage | null> => {
        const load = window.taskweaver?.chat.getResultAttachment
        if (typeof load !== 'function') return null
        try {
          const result = await load({ conversationId, attachmentId })
          if (!result?.ok || result.data.attachment.attachmentId !== attachmentId) return null
          const ref = refs.get(attachmentId)
          return {
            mediaType: result.data.attachment.mediaType,
            data: result.data.data,
            bytes: result.data.attachment.bytes,
            name: ref?.name ?? result.data.attachment.name,
            width: ref?.width ?? result.data.attachment.width,
            height: ref?.height ?? result.data.attachment.height,
          }
        } catch {
          return null
        }
      })()
      resultImageCache.current.set(cacheKey, request)
      return request
    })
    void Promise.all(pending).then((images) => {
      if (!current) return
      setResultImages(images.filter((image): image is CodeOutputImage => image !== null))
      setResultImagesLoading(false)
    })
    return () => { current = false }
  // Projected snapshots recreate objects during streaming; stable IDs prevent repeated IPC reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, conversationId, openImageIdsKey])

  if (!calls.length) return null

  const runningCall = [...calls].reverse().find((row) => row.status === 'running')
  const batchExpanded = isDshToolCallBatchExpanded(batchExpandedOverride)
  const errorCount = calls.filter((row) => row.status === 'error').length
  const stoppedCount = calls.filter((row) => row.status === 'stopped').length
  const failedCount = errorCount + stoppedCount
  const runningPresentation = runningCall
    ? dshToolRowPresentation(runningCall.toolName, runningCall.argsRaw, workspacePath, 'running')
    : null

  const renderNode = (node: ReturnType<typeof buildDshToolCallTree>[number], depth = 0) => {
    const { row, trace: sourceTrace } = node
    const isRunning = row.status === 'running'
    const isOrchestration = row.toolName === 'orchestrate'
    const { title, summary: rowSummary, variant } = dshToolRowPresentation(row.toolName, row.argsRaw, workspacePath, row.status)
    const fileDiff = sourceTrace.fileDiff
    const filePath = fileDiff?.path
    const summary = filePath ? fileName(filePath) : (sourceTrace.inputSummary || rowSummary)
    const isShell = variant === 'bash'
    const failure = failureHint(row.status, row.resultPreview ?? sourceTrace.resultSummary)
    const open = openId === row.callId
    const Icon = rowIcon(variant)
    // The live trace only carries a compact status summary for run_code; the
    // DSH projection carries the bounded rendered text/JSON for its result.
    const isCodeModeResult = row.toolName === 'run_code' || Boolean(row.parentCallId)
    const resultSummary = isCodeModeResult
      ? row.resultPreview ?? sourceTrace.resultSummary
      : sourceTrace.resultSummary ?? row.resultPreview
    const shellCommand = isShell ? sourceTrace.commandSummary || sourceTrace.inputSummary : null
    const detailTrace: ToolTraceItem = {
      ...sourceTrace,
      inputSummary: isShell ? (shellCommand ?? undefined) : summary,
      resultSummary,
    }

    return (
      <div key={row.callId} className={`dsh-tool-call-list-item${depth === 0 ? ' is-root' : ' is-nested'}`}>
        <button
          type="button"
          className={`dsh-tool-summary-row ${isRunning ? 'is-running' : ''} ${open ? 'is-open' : ''}`}
          onClick={() => updateUiState((current) => ({
            ...current,
            openId: current.openId === row.callId ? null : row.callId,
          }))}
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
          ) : !isShell && summary ? (
            <>
              <span className="dsh-tool-summary-sep" aria-hidden />
              <span className="dsh-tool-summary-text" title={filePath ?? summary}>{summary}</span>
            </>
          ) : null}
          {!failure && fileDiff && (
            <span className="dsh-tool-diff-counts" aria-label={`新增 ${fileDiff.addedLines ?? 0} 行，删除 ${fileDiff.deletedLines ?? 0} 行`}>
              {typeof fileDiff.addedLines === 'number' && <span className="dsh-tool-diff-added">+{fileDiff.addedLines}</span>}
              {typeof fileDiff.deletedLines === 'number' && <span className="dsh-tool-diff-deleted">−{fileDiff.deletedLines}</span>}
            </span>
          )}
          {typeof row.durationMs === 'number' && row.durationMs > 0 && !isRunning && (
            <span className="dsh-tool-summary-duration">
              {formatToolDuration(row.durationMs)}
            </span>
          )}
          <ChevronRight size={14} className={`dsh-tool-summary-chevron ${open ? 'expanded' : ''}`} aria-hidden />
        </button>
        {isOrchestration && (
          <div className="dsh-orchestration-tool-action">
            {isRunning && (
              <span className="dsh-orchestration-tool-progress" role="status">
                <DshStateDot state="ongoing" size={7} />
                {dagTaskCount > 0 ? `DAG 执行中 · ${dagTaskCount} 个任务` : '正在规划任务 DAG'}
              </span>
            )}
            <button type="button" onClick={onOpenDagPanel} disabled={!onOpenDagPanel}>
              查看任务图 <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          </div>
        )}
        {open && (
          <div className="tool-trace-dropdown dsh-tool-call-expanded">
            <ToolTraceCard
              item={detailTrace}
              conversationId={conversationId}
              onShowDetails={onShowToolDetails}
              onOpenPath={onOpenWorkspacePath}
              resultImages={resultImages}
              resultImageCount={row.resultImages?.length}
              resultImagesLoading={resultImagesLoading}
              codeModeResult={Boolean(row.parentCallId)}
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
  const batchSummary = summarizeToolBatch(calls, nodesById)

  return (
    <div className={`tool-trace-compact dsh-tool-call-list dsh-tool-call-batch${batchExpanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className={`dsh-tool-batch-toggle${runningCall ? ' is-running' : ''}${failedCount > 0 && !runningCall ? ' has-errors' : ''}`}
        aria-expanded={batchExpanded}
        aria-label={`${batchExpanded ? '收起' : '展开'} ${calls.length} 个工具调用${failedCount ? `，${failedCount} 个未成功` : ''}`}
        onClick={() => updateUiState((current) => ({
          ...current,
          batchExpandedOverride: !isDshToolCallBatchExpanded(current.batchExpandedOverride),
        }))}
      >
        <span className="dsh-tool-batch-leading">
          {runningCall ? (
            <DshStateDot state="ongoing" size={10} />
          ) : (
            <Terminal size={13} aria-hidden className="dsh-tool-batch-icon" />
          )}
        </span>
        <span className="dsh-tool-batch-title">
          <span className="dsh-tool-batch-label">{batchSummary}</span>
        </span>
        {runningCall && runningPresentation?.summary && classifyDshTool(runningCall.toolName) !== 'bash' && (
          <span className="dsh-tool-batch-inline-summary" title={runningPresentation.summary}>{runningPresentation.summary}</span>
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
          {tree.map((node) => renderNode(node))}
        </div>
      )}
    </div>
  )
}
