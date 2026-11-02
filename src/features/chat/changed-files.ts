import type { FileDiffData, ToolTraceItem } from '../../shared/app-api'
import type { ModifiedFileSummary } from '../../types'
import { resolveToolFilePath } from './tool-path'

export interface ChangedFileItem {
  path: string
  openPath: string | null
  addedLines: number
  deletedLines: number
  statsComplete: boolean
  isNewFile: boolean
  diffs: FileDiffData[]
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

/** Merge the durable per-turn summary with transient tool diffs for review. */
export function collectChangedFiles(
  traces: readonly ToolTraceItem[] = [],
  fileChanges: readonly ModifiedFileSummary[] = [],
  workspacePath?: string | null,
): ChangedFileItem[] {
  const byPath = new Map<string, ChangedFileItem>()
  const summaryPaths = new Set<string>()
  const tracePaths = new Set<string>()

  for (const change of fileChanges) {
    const resolved = workspaceDisplayPath(change.path, workspacePath)
    const key = resolved.path.toLocaleLowerCase()
    const hasCounts = typeof change.addedLines === 'number' && typeof change.deletedLines === 'number'
    const existing = byPath.get(key)
    if (existing) {
      existing.statsComplete &&= hasCounts
      if (hasCounts) {
        existing.addedLines += change.addedLines!
        existing.deletedLines += change.deletedLines!
      }
      existing.isNewFile ||= change.isNewFile === true
    } else {
      byPath.set(key, {
        path: resolved.path,
        openPath: resolved.openPath,
        addedLines: change.addedLines ?? 0,
        deletedLines: change.deletedLines ?? 0,
        statsComplete: hasCounts,
        isNewFile: change.isNewFile === true,
        diffs: [],
      })
    }
    if (hasCounts) summaryPaths.add(key)
  }

  for (const trace of traces) {
    if (trace.status !== 'done' || !['edit', 'write', 'str_replace_editor'].includes(trace.toolName) || !trace.fileDiff) continue
    const fullPath = resolveToolFilePath(trace)
    if (!fullPath) continue
    const resolved = workspaceDisplayPath(fullPath, workspacePath)
    const key = resolved.path.toLocaleLowerCase()
    const existing = byPath.get(key)
    const hasCounts = typeof trace.fileDiff.addedLines === 'number' && typeof trace.fileDiff.deletedLines === 'number'
    const file: ChangedFileItem = existing ?? {
      path: resolved.path,
      openPath: resolved.openPath,
      addedLines: 0,
      deletedLines: 0,
      statsComplete: true,
      isNewFile: false,
      diffs: [],
    }
    // Prefer the durable aggregate when it contains line counts; otherwise
    // reconstruct counts from each edit tool call.
    if (!summaryPaths.has(key)) {
      if (!tracePaths.has(key)) file.statsComplete = true
      file.statsComplete &&= hasCounts
      if (hasCounts) {
        file.addedLines += trace.fileDiff.addedLines!
        file.deletedLines += trace.fileDiff.deletedLines!
      }
      tracePaths.add(key)
    }
    file.isNewFile ||= trace.fileDiff.isNewFile === true
    if (trace.fileDiff.diff?.trim()) file.diffs.push(trace.fileDiff)
    byPath.set(key, file)
  }

  return Array.from(byPath.values())
}
