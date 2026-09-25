import { useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import type { FileDiffData, ToolTraceItem } from '../../shared/app-api'
import { ToolTraceCard } from './ToolTraceCard'
import { resolveToolFilePath } from './tool-path'

export function DetailsPanel({
  item,
  workspacePath,
  onClose,
  onOpenPath,
  renderDiff,
}: {
  item: ToolTraceItem
  workspacePath: string | null
  onClose: () => void
  onOpenPath: (relativePath: string) => Promise<{ ok: boolean; error?: string }>
  renderDiff?: (fileDiff: FileDiffData) => React.ReactNode
}) {
  const filePath = resolveToolFilePath(item)
  const [openError, setOpenError] = useState<string | null>(null)

  const tryOpen = async () => {
    if (!filePath) return
    setOpenError(null)
    const res = await onOpenPath(filePath)
    if (!res.ok) setOpenError(res.error ?? '无法打开文件')
  }

  return (
    <aside className="side-panel details-panel" aria-label="工具详情">
      <div className="panel-header">
        <div className="panel-header-title">
          <strong>Details</strong>
          <span className="details-panel-sub">{item.toolName}</span>
        </div>
        <button type="button" className="panel-close-btn" onClick={onClose} aria-label="关闭详情">
          <X size={15} />
        </button>
      </div>
      <div className="details-panel-body dag-scroll">
        <ToolTraceCard item={item} />
        {filePath && workspacePath && (
          <div className="details-open-row">
            <button type="button" className="details-open-btn" onClick={() => { void tryOpen() }}>
              <ExternalLink size={14} />
              <span>在系统中打开</span>
              <code className="details-open-path">{filePath}</code>
            </button>
            {openError && <p className="details-open-error" role="alert">{openError}</p>}
          </div>
        )}
        {item.fileDiff && renderDiff?.(item.fileDiff)}
      </div>
    </aside>
  )
}
