import type { DshProjectedToolCall, ToolTraceItem } from '../../shared/app-api'

export interface DshToolCallUiState {
  openId: string | null
  batchExpandedOverride: boolean | null
  stepExpandedOverrides: Record<string, boolean>
}

const EMPTY_STATE: DshToolCallUiState = {
  openId: null,
  batchExpandedOverride: null,
  stepExpandedOverrides: {},
}

const MAX_SAVED_SCOPES = 80
const savedStates = new Map<string, DshToolCallUiState>()

/** Scope accordion state to one conversation turn so a new turn still starts collapsed. */
export function dshToolCallUiStateKey(
  conversationId: string | null | undefined,
  rows: readonly DshProjectedToolCall[] = [],
  traces: readonly ToolTraceItem[] = [],
): string | null {
  if (!conversationId) return null
  let latestTurn = 0
  for (const row of rows) {
    if (Number.isSafeInteger(row.turn) && row.turn > latestTurn) latestTurn = row.turn
  }
  for (const trace of traces) {
    if (Number.isSafeInteger(trace.turn) && (trace.turn ?? 0) > latestTurn) latestTurn = trace.turn ?? 0
  }
  return JSON.stringify([conversationId, latestTurn || 'legacy'])
}

/** Read a copy so callers cannot mutate the module's saved UI state in place. */
export function readDshToolCallUiState(key: string | null): DshToolCallUiState {
  if (!key) return { ...EMPTY_STATE, stepExpandedOverrides: {} }
  const state = savedStates.get(key)
  if (!state) return { ...EMPTY_STATE, stepExpandedOverrides: {} }
  savedStates.delete(key)
  savedStates.set(key, state)
  return { ...state, stepExpandedOverrides: { ...state.stepExpandedOverrides } }
}

/** Keep the small, transient accordion state across streaming-to-final-message remounts. */
export function saveDshToolCallUiState(key: string | null, state: DshToolCallUiState): void {
  if (!key) return
  savedStates.delete(key)
  savedStates.set(key, { ...state, stepExpandedOverrides: { ...state.stepExpandedOverrides } })
  while (savedStates.size > MAX_SAVED_SCOPES) {
    const oldest = savedStates.keys().next().value
    if (oldest === undefined) break
    savedStates.delete(oldest)
  }
}
