import { FileCode } from 'lucide-react'
import { useMemo } from 'react'
import type { ToolTraceItem } from '../../shared/app-api'
import type { ModifiedFileSummary } from '../../types'
import { resolveToolFilePath } from './tool-path'

interface ChangedFile {
  path: string
  openPath: string | null
  addedLines: number
  deletedLines: number
  statsComplete: boolean
  isNewFile: boolean
}

function workspaceDisplayPath(filePath: string, workspacePath?: string | null): { path: string; openPath: string | null } {
  const normalized = filePath.replace(/\\/g, '/')
  const root = workspacePath?.replace(/\\/g, '/').replace(/\/$/, '')
  if (root && normalized.toLocaleLowerCase().startsWith(`${root}/`.toLocaleLowerCase())) {
    const relative = normalized.slice(root.length + 1)
    if (relative.split('/').includes('..')) return { path: normalized, openPath: null }
    return { path: relative, openPath: relative }
  }
  if (/^(?:[A-Za-z]:\/|\/)/.test(normalized)) return { path: normalized, openPath: null }
  const relative = normalized.replace(/^\.\//, '')
  return { path: relative, openPath: relative && !relative.split('/').includes('..') ? relative : null }
}

export function ChangedFilesSummary({
  traces,
  fileChanges,
  workspacePath,
  onOpenWorkspacePath,
  compactListOnly = false,
}: {
  traces?: readonly ToolTraceItem[]
  fileChanges?: readonly ModifiedFileSummary[]
  workspacePath?: string | null
  onOpenWorkspacePath?: (relativePath: string) => void
  /** When true, hide the summary chip (TurnActivitySummaryRow owns the one-liner). */
  compactListOnly?: boolean
}) {
  const files = useMemo(() => {
    const byPath = new Map<string, ChangedFile>()
    if (fileChanges?.length) {
      for (const change of fileChanges) {
        const resolved = workspaceDisplayPath(change.path, workspacePath)
        byPath.set(resolved.path.toLocaleLowerCase(), {
          path: resolved.path,
          openPath: resolved.openPath,
          addedLines: change.addedLines ?? 0,
          deletedLines: change.deletedLines ?? 0,
          statsComplete: typeof change.addedLines === 'number' && typeof change.deletedLines === 'number',
          isNewFile: change.isNewFile === true,
        })
      }
      return Array.from(byPath.values())
    }
    for (const trace of traces ?? []) {
      if (trace.status !== 'done' || !['edit', 'write', 'str_replace_editor'].includes(trace.toolName) || !trace.fileDiff) continue
      const fullPath = resolveToolFilePath(trace)
      if (!fullPath) continue
      const resolved = workspaceDisplayPath(fullPath, workspacePath)
      const key = resolved.path.toLocaleLowerCase()
      const existing = byPath.get(key)
      const hasCounts = typeof trace.fileDiff?.addedLines === 'number'
        && typeof trace.fileDiff?.deletedLines === 'number'
      const file: ChangedFile = existing ?? {
        path: resolved.path,
        openPath: resolved.openPath,
        addedLines: 0,
        deletedLines: 0,
        statsComplete: true,
        isNewFile: false,
      }
      file.statsComplete &&= hasCounts
      if (hasCounts) {
        file.addedLines += trace.fileDiff!.addedLines!
        file.deletedLines += trace.fileDiff!.deletedLines!
      }
      file.isNewFile ||= trace.fileDiff?.isNewFile === true
      byPath.set(key, file)
    }
    return Array.from(byPath.values())
  }, [traces, fileChanges, workspacePath])

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
                disabled={!file.openPath || !onOpenWorkspacePath}
                title={file.path}
                onClick={() => file.openPath && onOpenWorkspacePath?.(file.openPath)}
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
          <p className="changed-files-note">行数按本轮 edit/write 工具返回的 diff 累计；不等同于 Git 工作区净差异。</p>
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
              disabled={!file.openPath || !onOpenWorkspacePath}
              title={file.path}
              onClick={() => file.openPath && onOpenWorkspacePath?.(file.openPath)}
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
        <p className="changed-files-note">行数按本轮 edit/write 工具返回的 diff 累计；不等同于 Git 工作区净差异。</p>
      </div>
    </details>
  )
}
