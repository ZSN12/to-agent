import type { ToolTraceItem } from '../../shared/app-api'
import type { ModifiedFileSummary, TurnActivitySummary } from '../../types'
import { classifyDshTool } from './dshToolRowModel'

function normalizeToolName(toolName: string): string {
  const raw = toolName.trim()
  if (raw.startsWith('ocx_client_')) return raw.slice('ocx_client_'.length)
  return raw
}

function pathFromTrace(trace: ToolTraceItem): string | null {
  const diffPath = trace.fileDiff?.path
  if (typeof diffPath === 'string' && diffPath) return diffPath
  const summary = trace.inputSummary?.trim()
  if (!summary) return null
  const first = summary.split(/[·,]/)[0]?.trim()
  return first || null
}

/** Live projection from tool traces (streaming / latest turn). */
export function computeTurnActivityFromTraces(
  traces: readonly ToolTraceItem[] | undefined,
  fileChanges?: readonly ModifiedFileSummary[],
): TurnActivitySummary | null {
  const editedPaths = new Set<string>()
  const exploredPaths = new Set<string>()
  let searchCount = 0
  let commandCount = 0

  for (const trace of traces ?? []) {
    if (trace.status === 'cancelled' || trace.status === 'error' || trace.status === 'blocked') continue
    const variant = classifyDshTool(normalizeToolName(trace.toolName))
    const path = pathFromTrace(trace)
    const key = path?.replace(/\\/g, '/').toLocaleLowerCase()
    if (variant === 'edit' || variant === 'write') {
      if (key) editedPaths.add(key)
      continue
    }
    if (variant === 'read') {
      if (key) exploredPaths.add(key)
      continue
    }
    if (variant === 'search') {
      searchCount += 1
      continue
    }
    if (variant === 'bash' || variant === 'code') {
      commandCount += 1
    }
  }

  if (fileChanges?.length) {
    for (const change of fileChanges) {
      editedPaths.add(change.path.replace(/\\/g, '/').toLocaleLowerCase())
    }
  }

  const editedFileCount = editedPaths.size
  const exploredFileCount = exploredPaths.size
  if (!editedFileCount && !exploredFileCount && !searchCount && !commandCount) return null

  let addedLines = 0
  let deletedLines = 0
  let linesComplete = fileChanges?.length ? true : false
  if (fileChanges?.length) {
    for (const change of fileChanges) {
      const has = typeof change.addedLines === 'number' && typeof change.deletedLines === 'number'
      linesComplete &&= has
      if (has) {
        addedLines += change.addedLines ?? 0
        deletedLines += change.deletedLines ?? 0
      }
    }
  } else {
    for (const trace of traces ?? []) {
      if (!trace.fileDiff) continue
      const has = typeof trace.fileDiff.addedLines === 'number' && typeof trace.fileDiff.deletedLines === 'number'
      linesComplete &&= has
      if (has) {
        addedLines += trace.fileDiff.addedLines ?? 0
        deletedLines += trace.fileDiff.deletedLines ?? 0
      }
    }
    if (!traces?.some((t) => t.fileDiff)) linesComplete = false
  }

  return {
    editedFileCount,
    exploredFileCount,
    searchCount,
    commandCount,
    ...(editedFileCount > 0 && linesComplete ? { addedLines, deletedLines, linesComplete: true } : { linesComplete: false }),
  }
}

export function mergeTurnActivity(
  persisted: TurnActivitySummary | undefined,
  live: TurnActivitySummary | null,
): TurnActivitySummary | null {
  if (!persisted && !live) return null
  if (!persisted) return live
  if (!live) return persisted
  const lineSource = persisted.linesComplete ? persisted : live.linesComplete ? live : null
  return {
    editedFileCount: Math.max(persisted.editedFileCount, live.editedFileCount),
    exploredFileCount: Math.max(persisted.exploredFileCount, live.exploredFileCount),
    searchCount: Math.max(persisted.searchCount, live.searchCount),
    commandCount: Math.max(persisted.commandCount, live.commandCount),
    ...(lineSource ? {
      addedLines: lineSource.addedLines ?? 0,
      deletedLines: lineSource.deletedLines ?? 0,
      linesComplete: true,
    } : { linesComplete: false }),
  }
}

export function formatTurnActivityLabel(activity: TurnActivitySummary): string {
  const parts: string[] = []
  if (activity.editedFileCount > 0) {
    parts.push(`已编辑 ${activity.editedFileCount} 个文件`)
  }
  if (activity.exploredFileCount > 0) {
    parts.push(`已查看 ${activity.exploredFileCount} 个文件`)
  }
  if (activity.searchCount > 0) {
    parts.push(`搜索 ${activity.searchCount} 次`)
  }
  if (activity.commandCount > 0) {
    parts.push(`运行命令 ${activity.commandCount} 次`)
  }
  return parts.join(', ')
}
