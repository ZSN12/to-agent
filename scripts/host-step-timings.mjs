/** Build a content-free timing trace from canonical Z Host session history. */
export function summarizeHostStepTimings(history, originMs) {
  const rows = new Map()
  let activeStep = null
  const getRow = (turn, step) => {
    if (!Number.isSafeInteger(turn) || !Number.isSafeInteger(step)) return null
    const key = `${turn}:${step}`
    if (!rows.has(key)) rows.set(key, { turn, step, firstChunkType: null, retryScheduledCount: 0, retryStartedCount: 0, requestHeaderSnapshotCount: 0 })
    return rows.get(key)
  }
  const relativeTime = (event) => Number.isFinite(event?.time) && event.time >= originMs ? event.time - originMs : null

  for (const event of history) {
    const data = event?.data
    if (event?.type === 'step/start') {
      const row = getRow(data?.turn, data?.step)
      if (row) {
        row.startedAtMs = relativeTime(event)
        activeStep = { turn: data.turn, step: data.step }
      }
    } else if (event?.type === 'step/end') {
      const row = getRow(data?.turn, data?.step)
      if (row) row.endedAtMs = relativeTime(event)
      if (activeStep?.turn === data?.turn && activeStep?.step === data?.step) activeStep = null
    } else if (event?.type === 'assistant/chunk') {
      const row = getRow(data?.turn, data?.step)
      if (!row) continue
      const elapsed = relativeTime(event)
      const chunkType = typeof data?.chunk?.type === 'string' ? data.chunk.type : null
      if (row.firstChunkAfterStepMs === undefined && elapsed !== null && row.startedAtMs !== undefined && row.startedAtMs !== null) {
        row.firstChunkAfterStepMs = Math.max(0, elapsed - row.startedAtMs)
        row.firstChunkType = chunkType
      }
      if (data?.chunk?.type === 'text-delta' && row.firstTextAfterStepMs === undefined && elapsed !== null && row.startedAtMs !== undefined && row.startedAtMs !== null) {
        row.firstTextAfterStepMs = Math.max(0, elapsed - row.startedAtMs)
      }
    } else if (event?.type === 'assistant/message') {
      const row = getRow(data?.turn, data?.step)
      if (row) row.assistantMessageAtMs = relativeTime(event)
    } else if (event?.type === 'llm/retry') {
      const row = getRow(data?.turn, data?.step)
      if (row) row.retryScheduledCount += 1
    } else if (event?.type === 'llm/retry-started') {
      const row = getRow(data?.turn, data?.step)
      if (row) row.retryStartedCount += 1
    } else if (event?.type === 'request/header') {
      const row = getRow(activeStep?.turn, activeStep?.step)
      if (row) row.requestHeaderSnapshotCount += 1
    }
  }

  return [...rows.values()]
    .filter((row) => row.startedAtMs !== undefined)
    .map((row) => ({
      ...row,
      stepDurationMs: row.endedAtMs !== undefined && row.endedAtMs !== null && row.startedAtMs !== null
        ? Math.max(0, row.endedAtMs - row.startedAtMs)
        : null,
      firstChunkAfterStepMs: row.firstChunkAfterStepMs ?? null,
      firstTextAfterStepMs: row.firstTextAfterStepMs ?? null,
      assistantMessageAtMs: row.assistantMessageAtMs ?? null,
    }))
}
