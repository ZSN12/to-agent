import { FileText, Pencil, Search, Terminal, FolderOpen, PanelRightOpen } from 'lucide-react'
import type { ToolTraceItem } from '../../shared/app-api'
import { resolveToolFilePath } from './tool-path'

function toolIcon(name: string) {
  if (name === 'bash') return Terminal
  if (name === 'read') return FileText
  if (name === 'edit' || name === 'write') return Pencil
  if (name === 'grep' || name === 'find') return Search
  if (name === 'ls') return FolderOpen
  return Terminal
}

export function ToolTraceCard({
  item,
  onShowDetails,
  onOpenPath,
}: {
  item: ToolTraceItem
  onShowDetails?: (item: ToolTraceItem) => void
  onOpenPath?: (relativePath: string) => void
}) {
  const Icon = toolIcon(item.toolName)
  const filePath = resolveToolFilePath(item)
  const pathLike = Boolean(filePath) || (item.inputSummary && !item.inputSummary.startsWith('参数：') && !item.inputSummary.startsWith('匹配：'))
  const isBash = item.toolName === 'bash'
  const isRead = item.toolName === 'read'
  const isSearch = item.toolName === 'grep' || item.toolName === 'find'

  return (
    <div className={`tool-trace-card ${item.status}`}>
      <div className="tool-trace-card-head">
        <Icon size={14} className="tool-trace-card-icon" aria-hidden />
        <strong className="tool-trace-name">{item.toolName}</strong>
        {typeof item.durationMs === 'number' && (
          <time className="tool-trace-time">
            {item.durationMs < 1000 ? `${item.durationMs}ms` : `${(item.durationMs / 1000).toFixed(1)}s`}
          </time>
        )}
        {onShowDetails && (
          <button type="button" className="tool-trace-details-btn" onClick={() => onShowDetails(item)} title="在 Details 面板查看">
            <PanelRightOpen size={13} />
          </button>
        )}
      </div>
      {(isRead || item.toolName === 'edit' || item.toolName === 'write') && pathLike && (
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
      {isBash && item.inputSummary && (
        <pre className="tool-trace-command">{item.inputSummary}</pre>
      )}
      {!isBash && !isRead && !isSearch && item.inputSummary && !pathLike && (
        <div className="tool-trace-card-meta">{item.inputSummary}</div>
      )}
      {item.resultSummary && item.toolName !== 'context-compaction' && (
        <pre className="tool-trace-output">{item.resultSummary}</pre>
      )}
    </div>
  )
}
