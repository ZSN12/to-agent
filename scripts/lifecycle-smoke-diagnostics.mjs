const ERROR_CATEGORIES = [
  ['provider-billing', /\b402\b|insufficient.?balance|billing|quota exceeded/i],
  ['provider-auth', /\b401\b|unauthori[sz]ed|invalid[_ ]api[_ ]key/i],
  ['provider-rate-limit', /\b429\b|rate.?limit|too many requests/i],
  ['provider-model-unavailable', /\b404\b|model.{0,24}(not found|unavailable|unsupported)/i],
  ['timeout', /ETIMEDOUT|timed? ?out|deadline exceeded/i],
  ['network', /ECONN|fetch failed|network error|socket hang.?up/i],
  ['filesystem', /ENOENT|no such file or directory/i],
  ['permission', /EACCES|EPERM|permission denied/i],
  ['cancelled', /cancelled|canceled|aborted/i],
  ['smoke-assertion', /AssertionError|missing actual build command|must really invoke a file tool/i],
]

const SAFE_EVENT_TYPES = new Set([
  'start', 'activity', 'thinking_delta', 'delta', 'tool', 'error', 'done', 'connection', 'retry',
])

function errorText(error) {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : ''
}

export function classifyLifecycleSmokeError(error) {
  const message = errorText(error)
  const category = ERROR_CATEGORIES.find(([, pattern]) => pattern.test(message))?.[0] ?? 'unclassified'
  const statusMatch = message.match(/\b(?:HTTP(?:\/[\d.]+)?\s*|status(?:\s+code)?\s*[:=]?\s*)([45]\d{2})\b/i)
    ?? message.match(/\b([45]\d{2})\b/)
  return {
    errorCategory: category,
    ...(statusMatch ? { httpStatus: Number(statusMatch[1]) } : {}),
  }
}

export function summarizeLifecycleSmokeFailure(error, events = []) {
  const toolEvents = events.filter((event) => event?.type === 'tool' && event.status === 'running')
  const errorEvents = events.filter((event) => event?.type === 'error' || (event?.type === 'tool' && event.status === 'error'))
  const classified = classifyLifecycleSmokeError([
    errorText(error),
    ...errorEvents.flatMap((event) => [event.message, event.resultSummary].filter((value) => typeof value === 'string')),
  ].filter(Boolean).join('\n'))
  const hasOutput = events.some((event) => ['delta', 'thinking_delta'].includes(event?.type))
  const hasStart = events.some((event) => event?.type === 'start')
  const failureStage = errorEvents.length
    ? toolEvents.length
      ? 'agent-terminal-error-after-tool'
      : hasStart
        ? 'agent-terminal-error-before-tool'
        : 'agent-terminal-error'
    : toolEvents.length
      ? 'after-tool-invocation'
      : hasOutput
        ? 'agent-output-without-tool'
        : hasStart
          ? 'turn-started-no-output'
          : 'preflight-before-turn-start'
  const eventCounts = {}
  for (const event of events) {
    if (SAFE_EVENT_TYPES.has(event?.type)) eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1
  }
  return {
    ...classified,
    failureStage,
    confirmedToolCalls: toolEvents.length,
    eventCounts,
  }
}

