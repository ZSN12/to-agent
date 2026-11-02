import { redactToolOutput } from './tool-trace.mjs'

/** @typedef {{ id: string; toolName: string; inputSummary: string; resultSummary: string; commandSummary?: string; commandOutcome?: object; commandOutputTail?: string; fileDiff?: { type: string; path: string; diff: string; isNewFile?: boolean }; outputId?: string; durationMs?: number }} TurnActivityDetail */
/** @typedef {{ editedFileCount: number; exploredFileCount: number; searchCount: number; commandCount: number; details?: TurnActivityDetail[]; detailsTruncated?: boolean; addedLines?: number; deletedLines?: number; linesComplete?: boolean }} TurnActivitySnapshot */

const EDIT_TOOLS = new Set(['edit', 'write', 'str_replace_editor', 'apply_patch'])
const READ_TOOLS = new Set(['read', 'web_fetch'])
const SEARCH_TOOLS = new Set(['grep', 'glob', 'find', 'ls', 'web_search', 'rg'])
const COMMAND_TOOLS = new Set(['bash', 'pwsh', 'shell_command', 'exec_command', 'run_terminal_cmd'])
const MAX_TURN_ACTIVITY_DETAILS = 100
const MAX_TURN_ACTIVITY_DIFF_CHARS = 4_000
const MAX_TURN_ACTIVITY_TEST_OUTPUT_CHARS = 1_200

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
    details: [],
    detailsTruncated: false,
  }
}

/**
 * @param {ReturnType<typeof createEmptyTurnActivity>} activity
 * @param {string} toolName
 * @param {Record<string, unknown> | null | undefined} input
 * @param {{ path?: string } | null | undefined} fileDiff
 * @param {boolean} isError
 */
export function recordTurnActivity(activity, toolName, input, fileDiff, isError, detail) {
  if (!activity || isError) return
  const name = normalizeHostToolName(toolName)
  if (!name) return
  const path = (typeof fileDiff?.path === 'string' && fileDiff.path)
    ? fileDiff.path
    : pathFromInput(input)
  if (EDIT_TOOLS.has(name)) {
    if (path) activity.editedPaths.add(path.replace(/\\/g, '/').toLocaleLowerCase())
  } else if (READ_TOOLS.has(name)) {
    if (path) activity.exploredPaths.add(path.replace(/\\/g, '/').toLocaleLowerCase())
  } else if (SEARCH_TOOLS.has(name)) {
    activity.searchCount += 1
  } else if (COMMAND_TOOLS.has(name) || name === 'run_code') {
    activity.commandCount += 1
  } else {
    return
  }

  if (!detail || typeof detail.id !== 'string' || !detail.id) return
  const safeDetail = {
    id: detail.id.slice(0, 180),
    toolName: name.slice(0, 100),
    inputSummary: String(detail.inputSummary ?? '').slice(0, 220),
    resultSummary: String(detail.resultSummary ?? '').slice(0, 600),
    ...(typeof detail.commandSummary === 'string' ? { commandSummary: detail.commandSummary.slice(0, 400) } : {}),
    ...(detail.commandOutcome && typeof detail.commandOutcome === 'object'
      ? { commandOutcome: { ...detail.commandOutcome } }
      : {}),
    ...(typeof detail.commandOutputTail === 'string'
      ? { commandOutputTail: redactToolOutput(detail.commandOutputTail).slice(-MAX_TURN_ACTIVITY_TEST_OUTPUT_CHARS) }
      : {}),
    ...(detail.fileDiff && typeof detail.fileDiff.diff === 'string'
      ? {
          fileDiff: {
            type: String(detail.fileDiff.type ?? 'edit'),
            path: String(detail.fileDiff.path ?? '').slice(0, 500),
            diff: redactToolOutput(detail.fileDiff.diff).slice(0, MAX_TURN_ACTIVITY_DIFF_CHARS),
            ...(detail.fileDiff.isNewFile === true ? { isNewFile: true } : {}),
          },
        }
      : {}),
    ...(typeof detail.outputId === 'string' && detail.outputId ? { outputId: detail.outputId.slice(0, 180) } : {}),
    ...(Number.isFinite(detail.durationMs) ? { durationMs: Math.max(0, detail.durationMs) } : {}),
  }
  activity.details ??= []
  const existingIndex = activity.details.findIndex((item) => item.id === safeDetail.id)
  if (existingIndex >= 0) {
    activity.details[existingIndex] = safeDetail
    return
  }
  if (activity.details.length >= MAX_TURN_ACTIVITY_DETAILS) {
    activity.detailsTruncated = true
    return
  }
  activity.details.push(safeDetail)
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
    ...(activity.details?.length ? { details: activity.details } : {}),
    ...(activity.detailsTruncated ? { detailsTruncated: true } : {}),
    ...(editedFileCount > 0 && linesComplete ? { addedLines, deletedLines, linesComplete: true } : { linesComplete: false }),
  }
}
