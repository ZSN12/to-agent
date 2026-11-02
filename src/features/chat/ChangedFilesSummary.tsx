import { FileCode } from 'lucide-react'
import { useMemo } from 'react'
import type { ToolTraceItem } from '../../shared/app-api'
import type { ModifiedFileSummary } from '../../types'
import { collectChangedFiles, type ChangedFileItem } from './changed-files'

export function ChangedFilesSummary({
  traces,
  fileChanges,
  workspacePath,
  onOpenWorkspacePath,
  onOpenReview,
  compactListOnly = false,
}: {
  traces?: readonly ToolTraceItem[]
  fileChanges?: readonly ModifiedFileSummary[]
  workspacePath?: string | null
  onOpenWorkspacePath?: (relativePath: string) => void
  onOpenReview?: (file: ChangedFileItem) => void
  /** When true, hide the summary chip (TurnActivitySummaryRow owns the one-liner). */
  compactListOnly?: boolean
}) {
  const files = useMemo(() => collectChangedFiles(traces, fileChanges, workspacePath), [traces, fileChanges, workspacePath])

  if (!files.length) return null
  const complete = files.every((file) => file.statsComplete)
  const totalAdded = files.reduce((sum, file) => sum + file.addedLines, 0)
  const totalDeleted = files.reduce((sum, file) => sum + file.deletedLines, 0)
  const summaryLabel = complete
    ? `本轮修改 ${files.length} 个文件，增加 ${totalAdded} 行，删除 ${totalDeleted} 行`
    : `本轮修改 ${files.length} 个文件，部分行数暂不可用`

  if (compactListOnly) {
    return (
      <details className="changed-files-summary changed-files-summary--list-only">
        <summary aria-label={summaryLabel}>
          <FileCode size={15} aria-hidden />
          <span>查看 {files.length} 个已改文件</span>
          <span className="changed-files-hint">展开</span>
        </summary>
        <div className="changed-files-list">
          {files.map((file) => (
            <div className="changed-files-item" key={file.path}>
              <button
                type="button"
                className="changed-files-path"
                disabled={!onOpenReview && (!file.openPath || !onOpenWorkspacePath)}
                title={file.path}
                onClick={() => {
                  if (onOpenReview) onOpenReview(file)
                  else if (file.openPath) onOpenWorkspacePath?.(file.openPath)
                }}
              >
                {file.path}
              </button>
              <div className="changed-files-item-stats">
                {file.isNewFile && <span className="changed-files-new">新建</span>}
                {file.statsComplete ? <>
                  <span className="changed-files-added">+{file.addedLines}</span>
                  <span className="changed-files-deleted">−{file.deletedLines}</span>
                </> : <span className="changed-files-unavailable">行数未知</span>}
              </div>
            </div>
          ))}
        </div>
      </details>
    )
  }

  return (
    <details className="changed-files-summary">
      <summary aria-label={summaryLabel}>
        <FileCode size={15} aria-hidden />
        <span>已修改 {files.length} 个文件</span>
        {complete ? (
          <span className="changed-files-totals" aria-label={`增加 ${totalAdded} 行，删除 ${totalDeleted} 行`}>
            <span className="changed-files-added">+{totalAdded}</span>
            <span className="changed-files-deleted">−{totalDeleted}</span>
          </span>
        ) : <span className="changed-files-unavailable">部分行数暂不可用</span>}
        <span className="changed-files-hint">展开</span>
      </summary>
      <div className="changed-files-list">
        {files.map((file) => (
          <div className="changed-files-item" key={file.path}>
            <button
              type="button"
              className="changed-files-path"
              disabled={!onOpenReview && (!file.openPath || !onOpenWorkspacePath)}
              title={file.path}
              onClick={() => {
                if (onOpenReview) onOpenReview(file)
                else if (file.openPath) onOpenWorkspacePath?.(file.openPath)
              }}
            >
              {file.path}
            </button>
            <div className="changed-files-item-stats">
              {file.isNewFile && <span className="changed-files-new">新建</span>}
              {file.statsComplete ? <>
                <span className="changed-files-added">+{file.addedLines}</span>
                <span className="changed-files-deleted">−{file.deletedLines}</span>
              </> : <span className="changed-files-unavailable">行数未知</span>}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
