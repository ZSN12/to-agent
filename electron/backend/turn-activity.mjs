/** @typedef {{ editedFileCount: number; exploredFileCount: number; searchCount: number; commandCount: number; addedLines?: number; deletedLines?: number; linesComplete?: boolean }} TurnActivitySnapshot */

const EDIT_TOOLS = new Set(['edit', 'write', 'str_replace_editor', 'apply_patch'])
const READ_TOOLS = new Set(['read', 'web_fetch'])
const SEARCH_TOOLS = new Set(['grep', 'glob', 'find', 'ls', 'web_search', 'rg'])
const COMMAND_TOOLS = new Set(['bash', 'pwsh', 'shell_command', 'exec_command', 'run_terminal_cmd'])

export function normalizeHostToolName(toolName) {
  const raw = String(toolName ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('ocx_client_')) return raw.slice('ocx_client_'.length)
  return raw
}

function pathFromInput(input) {
  if (!input || typeof input !== 'object') return null
  for (const key of ['file_path', 'path', 'filePath']) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function createEmptyTurnActivity() {
  return {
    editedPaths: new Set(),
    exploredPaths: new Set(),
    searchCount: 0,
    commandCount: 0,
  }
}

/**
 * @param {ReturnType<typeof createEmptyTurnActivity>} activity
 * @param {string} toolName
 * @param {Record<string, unknown> | null | undefined} input
 * @param {{ path?: string } | null | undefined} fileDiff
 * @param {boolean} isError
 */
export function recordTurnActivity(activity, toolName, input, fileDiff, isError) {
  if (!activity || isError) return
  const name = normalizeHostToolName(toolName)
  if (!name) return
  const path = (typeof fileDiff?.path === 'string' && fileDiff.path)
    ? fileDiff.path
    : pathFromInput(input)
  if (EDIT_TOOLS.has(name)) {
    if (path) activity.editedPaths.add(path.replace(/\\/g, '/').toLocaleLowerCase())
    return
  }
  if (READ_TOOLS.has(name)) {
    if (path) activity.exploredPaths.add(path.replace(/\\/g, '/').toLocaleLowerCase())
    return
  }
  if (SEARCH_TOOLS.has(name)) {
    activity.searchCount += 1
    return
  }
  if (COMMAND_TOOLS.has(name) || name === 'run_code') {
    activity.commandCount += 1
  }
}

/**
 * @param {ReturnType<typeof createEmptyTurnActivity>} activity
 * @param {Map<string, { addedLines?: number; deletedLines?: number; statsComplete?: boolean }>} fileChanges
 * @returns {TurnActivitySnapshot | null}
 */
export function serializeTurnActivity(activity, fileChanges) {
  if (!activity) return null
  const editedFromDiffs = fileChanges?.size ?? 0
  const editedFileCount = Math.max(activity.editedPaths.size, editedFromDiffs)
  const exploredFileCount = activity.exploredPaths.size
  const searchCount = activity.searchCount
  const commandCount = activity.commandCount
  if (!editedFileCount && !exploredFileCount && !searchCount && !commandCount) return null

  let addedLines = 0
  let deletedLines = 0
  let linesComplete = true
  if (fileChanges?.size) {
    for (const file of fileChanges.values()) {
      if (file.statsComplete === false) linesComplete = false
      if (Number.isFinite(file.addedLines)) addedLines += Math.max(0, file.addedLines)
      if (Number.isFinite(file.deletedLines)) deletedLines += Math.max(0, file.deletedLines)
    }
  } else {
    linesComplete = false
  }

  return {
    editedFileCount,
    exploredFileCount,
    searchCount,
    commandCount,
    ...(editedFileCount > 0 && linesComplete ? { addedLines, deletedLines, linesComplete: true } : { linesComplete: false }),
  }
}
