const COLUMNS = [
  'runId',
  'taskId',
  'title',
  'taskType',
  'status',
  'startedAt',
  'endedAt',
  'durationMs',
  'modelKey',
  'attempts',
  'inputTokens',
  'outputTokens',
  'costUsd',
  'dependencies',
  'routeReason',
]

function cell(value) {
  let text = value == null ? '' : String(value)
  // Prevent spreadsheet formula execution when titles or routing text begin with operators.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

/** Build a spreadsheet-safe timeline and per-model cost breakdown from a DAG run. */
export function buildOrchestrationTraceCsv(tasks) {
  const lines = [COLUMNS.map(cell).join(',')]
  for (const task of tasks) {
    const fallbackUsage = task.messages?.findLast((message) => message.author === 'agent')?.usage
    const models = task.usageSummary?.byModel?.length
      ? task.usageSummary.byModel
      : [{
        modelKey: task.modelKey ?? '',
        attempts: fallbackUsage ? 1 : 0,
        inputTokens: fallbackUsage?.inputTokens ?? 0,
        outputTokens: fallbackUsage?.outputTokens ?? 0,
        costUsd: fallbackUsage?.costUsd ?? 0,
      }]
    for (const usage of models) {
      const row = [
        task.runId,
        task.id,
        task.title,
        task.taskType,
        task.statusLabel || task.status,
        task.startedAt,
        task.endedAt,
        task.durationMs,
        usage.modelKey,
        usage.attempts,
        usage.inputTokens,
        usage.outputTokens,
        usage.costUsd,
        (task.dependsOn ?? []).join(';'),
        task.routeReason,
      ]
      lines.push(row.map(cell).join(','))
    }
  }
  return `${lines.join('\r\n')}\r\n`
}
