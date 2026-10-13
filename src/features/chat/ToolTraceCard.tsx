import { FileText, Pencil, Search, Terminal, FolderOpen, PanelRightOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ToolTraceItem } from '../../shared/app-api'
import { CodeExecutionResultCard } from './CodeExecutionResultCard'
import type { CodeOutputImage } from './codeOutputPresentation'
import { readToolOutput, type ToolOutputReadState } from './tool-output-reader'
import { resolveToolFilePath } from './tool-path'

function toolIcon(name: string) {
  if (name === 'bash') return Terminal
  if (name === 'read') return FileText
  if (name === 'edit' || name === 'write') return Pencil
  if (name === 'grep' || name === 'find') return Search
  if (name === 'ls') return FolderOpen
  return Terminal
}

function ToolOutputDisclosure({
  conversationId,
  outputId,
}: {
  conversationId?: string | null
  outputId: string
}) {
  const [outputState, setOutputState] = useState<ToolOutputReadState>({ kind: 'idle' })
  const [expanded, setExpanded] = useState(false)
  const requestActive = useRef(true)
  useEffect(() => {
    requestActive.current = true
    return () => { requestActive.current = false }
  }, [])

  const loadFullOutput = async () => {
    if (outputState.kind === 'loaded') {
      setExpanded((current) => !current)
      return
    }
    setOutputState({ kind: 'loading' })
    const result = await readToolOutput(
      window.taskweaver?.chat?.getToolOutput,
      conversationId,
      outputId,
    )
    if (!requestActive.current) return
    setOutputState(result)
    setExpanded(result.kind === 'loaded')
  }

  return (
    <div className="tool-trace-full-output">
      {outputState.kind === 'loading' ? (
        <div className="tool-trace-output-status" role="status">正在读取完整输出…</div>
      ) : outputState.kind === 'unavailable' ? (
        <div className="tool-trace-output-status" role="status">完整输出已过期，或当前会话无权访问。</div>
      ) : outputState.kind === 'missing-conversation' ? (
        <div className="tool-trace-output-status" role="status">缺少会话标识，无法安全读取完整输出。</div>
      ) : outputState.kind === 'failed' ? (
        <div className="tool-trace-output-status" role="alert">读取完整输出失败，可重试。</div>
      ) : null}
      {outputState.kind === 'loaded' && expanded && (
        <>
          {outputState.output.truncated && (
            <div className="tool-trace-output-status" role="status">输出超过暂存上限，以下为可读取部分。</div>
          )}
          <pre className="tool-trace-output tool-trace-full-output-text" data-testid="tool-full-output">
            {outputState.output.text}
          </pre>
        </>
      )}
      {outputState.kind !== 'unavailable' && outputState.kind !== 'missing-conversation' && (
        <button
          type="button"
          className="tool-trace-full-output-toggle"
          onClick={() => { void loadFullOutput() }}
          disabled={outputState.kind === 'loading'}
          aria-expanded={outputState.kind === 'loaded' && expanded}
        >
          {outputState.kind === 'loading'
            ? '读取中…'
            : outputState.kind === 'loaded'
              ? expanded ? '收起全文' : '展开全文'
              : outputState.kind === 'failed' ? '重试读取全文' : '展开全文'}
        </button>
      )}
    </div>
  )
}

export function ToolTraceCard({
  item,
  conversationId,
  onShowDetails,
  onOpenPath,
  resultImages,
  resultImageCount,
  resultImagesLoading = false,
  codeModeResult = false,
}: {
  item: ToolTraceItem
  /** Canonical conversation ID that owns the tool activity/output reference. */
  conversationId?: string | null
  onShowDetails?: (item: ToolTraceItem) => void
  onOpenPath?: (relativePath: string) => void
  /** Host-fetched image bytes for attachment references in a code-mode result. */
  resultImages?: readonly CodeOutputImage[]
  resultImageCount?: number
  resultImagesLoading?: boolean
  /** Nested Host dispatch result produced from a run_code Python/TypeScript program. */
  codeModeResult?: boolean
}) {
  const Icon = toolIcon(item.toolName)
  const filePath = resolveToolFilePath(item)
  const pathLike = Boolean(filePath) || (item.inputSummary && !item.inputSummary.startsWith('参数：') && !item.inputSummary.startsWith('匹配：'))
  const isBash = item.toolName === 'bash' || item.toolName === 'pwsh'
  const isRead = item.toolName === 'read' || item.toolName === 'web_fetch'
  const isSearch = item.toolName === 'grep' || item.toolName === 'find' || item.toolName === 'glob' || item.toolName === 'web_search'
  const isCode = item.toolName === 'code' || item.toolName === 'run_code'
  const isShell = isBash
  const toolTitle = item.toolName === 'bash' ? 'Shell'
    : item.toolName === 'pwsh' ? 'PowerShell'
      : item.toolName === 'edit' ? '编辑文件'
        : item.toolName === 'write' ? '写入文件' : item.toolName

  return (
    <div className={`tool-trace-card ${item.status}${isShell ? ' tool-trace-shell' : ''}`} data-testid="tool-card" role="group" aria-label={`工具调用：${item.toolName}`}>
      <div className="tool-trace-card-head">
        <Icon size={14} className="tool-trace-card-icon" aria-hidden />
        <strong className="tool-trace-name">{toolTitle}</strong>
        {typeof item.durationMs === 'number' && (
          <time className="tool-trace-time">
            {item.durationMs < 1000 ? `${item.durationMs}ms` : `${(item.durationMs / 1000).toFixed(1)}s`}
          </time>
        )}
        {onShowDetails && (
          <button type="button" className="tool-trace-details-btn" onClick={() => onShowDetails(item)} title="在详情面板查看">
            <PanelRightOpen size={14} />
          </button>
        )}
      </div>
      {(isRead || item.toolName === 'edit' || item.toolName === 'write') && pathLike && !item.fileDiff && (
        <button
          type="button"
          className="tool-trace-card-path tool-trace-card-path-btn"
          title={filePath ?? item.inputSummary}
          disabled={!filePath || !onOpenPath}
          onClick={() => filePath && onOpenPath?.(filePath)}
        >
          {filePath ?? item.inputSummary}
        </button>
      )}
      {isSearch && item.inputSummary && (
        <div className="tool-trace-card-search">{item.inputSummary}</div>
      )}
      {(isBash || isCode) && item.inputSummary && (
        isShell ? (
          <div className="tool-trace-shell-command">
            <span className="tool-trace-shell-prompt" aria-hidden>$</span>
            <pre className="tool-trace-command">{item.inputSummary}</pre>
          </div>
        ) : <pre className="tool-trace-command">{item.inputSummary}</pre>
      )}
      {!isBash && !isRead && !isSearch && !isCode && item.inputSummary && !pathLike && (
        <div className="tool-trace-card-meta">{item.inputSummary}</div>
      )}
      {isCode || codeModeResult ? (
        <CodeExecutionResultCard
          output={item.resultSummary}
          images={resultImages}
          imageCount={resultImageCount}
          imagesLoading={resultImagesLoading}
        />
      ) : item.resultSummary && item.toolName !== 'context-compaction' && (
        <pre className="tool-trace-output">{item.resultSummary}</pre>
      )}
      {item.fileDiff && !isCode && (
        <section className="tool-trace-file-diff" aria-label={`文件差异：${item.fileDiff.path}`}>
          <div className="tool-trace-file-diff-head">
            <span title={item.fileDiff.path}>{item.fileDiff.path}</span>
            <span className="tool-trace-file-diff-counts">
              {typeof item.fileDiff.addedLines === 'number' && <span className="dsh-tool-diff-added">+{item.fileDiff.addedLines}</span>}
              {typeof item.fileDiff.deletedLines === 'number' && <span className="dsh-tool-diff-deleted">−{item.fileDiff.deletedLines}</span>}
            </span>
          </div>
          {item.fileDiff.diff && <pre className="tool-trace-file-diff-text">{item.fileDiff.diff}</pre>}
        </section>
      )}
      {item.outputId && item.toolName !== 'context-compaction' && (
        <ToolOutputDisclosure
          key={`${conversationId ?? ''}:${item.outputId}`}
          conversationId={conversationId}
          outputId={item.outputId}
        />
      )}
    </div>
  )
}
