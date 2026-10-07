import type { DshProjectedToolCall, ToolTraceItem } from '../../shared/app-api'

export interface DshToolCallTreeNode {
  row: DshProjectedToolCall
  trace: ToolTraceItem
  children: DshToolCallTreeNode[]
}

interface MergedCall {
  row: DshProjectedToolCall
  trace: ToolTraceItem
}

function traceStatusToRowStatus(status: ToolTraceItem['status']): DshProjectedToolCall['status'] {
  if (status === 'running') return 'running'
  if (status === 'error') return 'error'
  if (status === 'blocked' || status === 'cancelled') return 'stopped'
  return 'done'
}

function rowStatusToTraceStatus(status: DshProjectedToolCall['status']): ToolTraceItem['status'] {
  if (status === 'running') return 'running'
  if (status === 'error') return 'error'
  if (status === 'stopped') return 'cancelled'
  return 'done'
}

function projectedRowToTrace(row: DshProjectedToolCall): ToolTraceItem {
  return {
    id: row.callId,
    parentCallId: row.parentCallId,
    toolName: row.toolName,
    status: rowStatusToTraceStatus(row.status),
    resultSummary: row.resultPreview,
    durationMs: row.durationMs,
    startedAt: row.startedAt,
  }
}

function traceToProjectedRow(trace: ToolTraceItem): DshProjectedToolCall {
  const argsRaw = JSON.stringify({
    description: trace.inputSummary ?? '',
    command: trace.inputSummary ?? '',
    path: trace.inputSummary ?? '',
    query: trace.inputSummary ?? '',
  })
  const status = traceStatusToRowStatus(trace.status)
  return {
    callId: trace.id,
    parentCallId: trace.parentCallId,
    toolName: trace.toolName,
    argsRaw,
    status,
    turn: 0,
    step: 0,
    startedAt: trace.startedAt,
    durationMs: trace.durationMs ?? undefined,
    resultPreview: trace.resultSummary,
    isError: status === 'error',
  }
}

function mergeCall(row: DshProjectedToolCall, trace: ToolTraceItem): MergedCall {
  const traceRowStatus = traceStatusToRowStatus(trace.status)
  // A delayed "running" trace must not undo a completed projection. Terminal
  // trace events remain authoritative and can settle an in-flight projection.
  const status = trace.status === 'running' && row.status !== 'running'
    ? row.status
    : traceRowStatus
  const parentCallId = trace.parentCallId !== undefined ? trace.parentCallId : row.parentCallId
  const resultPreview = trace.resultSummary ?? row.resultPreview
  const mergedRow: DshProjectedToolCall = {
    ...row,
    parentCallId,
    toolName: trace.toolName || row.toolName,
    status,
    startedAt: trace.startedAt ?? row.startedAt,
    durationMs: trace.durationMs ?? row.durationMs,
    resultPreview,
    isError: status === 'error',
  }
  const mergedTrace: ToolTraceItem = {
    ...trace,
    id: row.callId,
    parentCallId,
    toolName: mergedRow.toolName,
    status: rowStatusToTraceStatus(status),
    resultSummary: resultPreview,
    durationMs: mergedRow.durationMs,
    startedAt: mergedRow.startedAt,
  }
  return { row: mergedRow, trace: mergedTrace }
}

function findCycleMembers(parentById: ReadonlyMap<string, string | null | undefined>): Set<string> {
  const settled = new Set<string>()
  const cycleMembers = new Set<string>()

  for (const startId of parentById.keys()) {
    if (settled.has(startId)) continue
    const path: string[] = []
    const positionById = new Map<string, number>()
    let currentId: string | null | undefined = startId

    while (currentId && parentById.has(currentId) && !settled.has(currentId)) {
      const cycleStart = positionById.get(currentId)
      if (cycleStart !== undefined) {
        for (const id of path.slice(cycleStart)) cycleMembers.add(id)
        break
      }
      positionById.set(currentId, path.length)
      path.push(currentId)
      currentId = parentById.get(currentId)
    }
    for (const id of path) settled.add(id)
  }

  return cycleMembers
}

/**
 * Merge DSH projection rows with live traces, then build a safe parent/child
 * tree. Projection order is authoritative; trace-only calls append in trace
 * order. Missing parents and every member of a parent cycle become roots.
 */
export function buildDshToolCallTree(
  rows: readonly DshProjectedToolCall[] = [],
  traces: readonly ToolTraceItem[] = [],
): DshToolCallTreeNode[] {
  const orderedCalls: MergedCall[] = []
  const indexById = new Map<string, number>()

  for (const row of rows) {
    const index = indexById.get(row.callId)
    if (index === undefined) {
      indexById.set(row.callId, orderedCalls.length)
      orderedCalls.push({ row, trace: projectedRowToTrace(row) })
    } else {
      const current = orderedCalls[index]
      orderedCalls[index] = mergeCall({ ...current.row, ...row }, current.trace)
    }
  }

  for (const trace of traces) {
    const index = indexById.get(trace.id)
    if (index === undefined) {
      indexById.set(trace.id, orderedCalls.length)
      const row = traceToProjectedRow(trace)
      orderedCalls.push(mergeCall(row, trace))
    } else {
      const current = orderedCalls[index]
      orderedCalls[index] = mergeCall(current.row, { ...current.trace, ...trace })
    }
  }

  const nodeById = new Map<string, DshToolCallTreeNode>()
  const parentById = new Map<string, string | null | undefined>()
  for (const call of orderedCalls) {
    const id = call.row.callId
    nodeById.set(id, { ...call, children: [] })
    parentById.set(id, call.row.parentCallId)
  }

  const cycleMembers = findCycleMembers(parentById)
  const roots: DshToolCallTreeNode[] = []
  for (const call of orderedCalls) {
    const node = nodeById.get(call.row.callId)!
    const parentId = call.row.parentCallId
    const parent = parentId ? nodeById.get(parentId) : undefined
    if (!parent || cycleMembers.has(node.row.callId)) {
      roots.push(node)
    } else {
      parent.children.push(node)
    }
  }

  return roots
}
