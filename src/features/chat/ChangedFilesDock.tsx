import { FileCode2 } from 'lucide-react'
import { useMemo } from 'react'
import type { ToolTraceItem } from '../../shared/app-api'
import type { ModifiedFileSummary } from '../../types'
import { collectChangedFiles, type ChangedFileItem } from './changed-files'

export function ChangedFilesDock({
  traces,
  fileChanges,
  workspacePath,
  onOpenReview,
}: {
  traces?: readonly ToolTraceItem[]
  fileChanges?: readonly ModifiedFileSummary[]
  workspacePath?: string | null
  onOpenReview: (file: ChangedFileItem) => void
}) {
  const files = useMemo(
    () => collectChangedFiles(traces, fileChanges, workspacePath),
    [traces, fileChanges, workspacePath],
  )
  if (!files.length) return null

  const complete = files.every((file) => file.statsComplete)
  const added = files.reduce((sum, file) => sum + file.addedLines, 0)
  const deleted = files.reduce((sum, file) => sum + file.deletedLines, 0)

  return (
    <section className="changed-files-dock" aria-label="本轮代码更改">
      <div className="changed-files-dock-summary">
        <FileCode2 size={15} aria-hidden="true" />
        <strong>{files.length} 个文件已更改</strong>
        {complete && <span className="changed-files-dock-total"><span>+{added}</span> <span>−{deleted}</span></span>}
      </div>
      <div className="changed-files-dock-list">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            className="changed-files-dock-file"
            title={`查看 ${file.path} 的代码差异`}
            onClick={() => onOpenReview(file)}
          >
            <span className="changed-files-dock-path">{file.path}</span>
            {file.statsComplete && <span className="changed-files-dock-counts"><span>+{file.addedLines}</span> <span>−{file.deletedLines}</span></span>}
          </button>
        ))}
      </div>
    </section>
  )
}
