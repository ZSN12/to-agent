const STATUS_ALIASES = new Map([
  ['completed', 'completed'], ['complete', 'completed'], ['success', 'completed'], ['succeeded', 'completed'], ['done', 'completed'], ['stop', 'completed'], ['passed', 'completed'],
  ['failed', 'failed'], ['failure', 'failed'], ['error', 'failed'],
  ['cancelled', 'cancelled'], ['canceled', 'cancelled'], ['aborted', 'cancelled'],
  ['incomplete', 'incomplete'], ['timeout', 'incomplete'], ['timed_out', 'incomplete'], ['length', 'incomplete'],
])
const SAFE_ERROR_CATEGORIES = new Set([
  'provider-billing', 'provider-auth', 'provider-rate-limit', 'provider-model-unavailable',
  'timeout', 'network', 'filesystem', 'permission', 'cancelled', 'smoke-assertion', 'unclassified',
])
const SAFE_FAILURE_STAGES = new Set([
  'agent-terminal-error-after-tool', 'agent-terminal-error-before-tool', 'agent-terminal-error',
  'after-tool-invocation', 'agent-output-without-tool', 'turn-started-no-output',
  'preflight-before-turn-start', 'smoke-harness-setup',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function integerOrNull(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function safeLabel(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160) || null
}

function countOrNull(value) {
  if (Array.isArray(value)) return value.length
  return integerOrNull(value)
}

function normalizeStatus(value) {
  if (typeof value !== 'string') return null
  return STATUS_ALIASES.get(value.trim().toLowerCase()) ?? null
}

function safeErrorCategory(value) {
  const label = safeLabel(value)
  return label && SAFE_ERROR_CATEGORIES.has(label) ? label : null
}

function safeFailureStage(value) {
  const label = safeLabel(value)
  return label && SAFE_FAILURE_STAGES.has(label) ? label : null
}

function readSmokeStatus(report) {
  if (isRecord(report.result) && report.result.cancelled === true) return 'cancelled'
  const candidates = [
    report.status,
    isRecord(report.result) ? report.result.status : null,
    isRecord(report.turnEnd) && isRecord(report.turnEnd.reason) ? report.turnEnd.reason.kind : null,
    isRecord(report.turnEnd) ? report.turnEnd.reason : null,
  ]
  for (const candidate of candidates) {
    const status = normalizeStatus(candidate)
    if (status) return status
  }
  return 'unknown'
}

function incrementCounts(counts, values, getName) {
  if (!Array.isArray(values)) return
  for (const value of values) {
    const name = safeLabel(getName(value))
    if (name) counts[name] = (counts[name] ?? 0) + 1
  }
}

function summarizeReadSmoke(report, sample) {
  const hostToolCalls = countOrNull(report.toolCalls)
  const nestedToolCalls = countOrNull(report.nestedToolCalls)
  const toolCounts = {}
  incrementCounts(toolCounts, report.toolCalls, (call) => isRecord(call) ? call.name : null)
  incrementCounts(toolCounts, report.nestedToolCalls, (call) => isRecord(call) ? call.name : null)
  return {
    schemaVersion: 2,
    sample,
    reportType: 'read-smoke',
    modelKey: safeLabel(report.modelKey),
    agentPreset: safeLabel(report.agentPreset),
    requestAttemptsEstimated: integerOrNull(report.requestAttemptEstimate),
    requestHeaderSnapshots: integerOrNull(report.requestHeaderSnapshots ?? report.requests),
    retryScheduledCount: integerOrNull(report.retryScheduledCount),
    retryStartedCount: integerOrNull(report.retryStartedCount),
    hostSteps: integerOrNull(report.steps),
    hostStepTimings: Array.isArray(report.hostStepTimings)
      ? report.hostStepTimings.filter(isRecord).map((step) => ({
        turn: integerOrNull(step.turn),
        step: integerOrNull(step.step),
        stepStartedAtMs: numberOrNull(step.startedAtMs),
        firstChunkAfterStepMs: numberOrNull(step.firstChunkAfterStepMs),
        firstChunkType: safeLabel(step.firstChunkType),
        firstTextAfterStepMs: numberOrNull(step.firstTextAfterStepMs),
        assistantMessageAtMs: numberOrNull(step.assistantMessageAtMs),
        stepDurationMs: numberOrNull(step.stepDurationMs),
        retryScheduledCount: integerOrNull(step.retryScheduledCount),
        retryStartedCount: integerOrNull(step.retryStartedCount),
        requestHeaderSnapshotCount: integerOrNull(step.requestHeaderSnapshotCount),
      }))
      : null,
    hostToolCalls,
    nestedToolCalls,
    inspectionToolCalls: hostToolCalls === null || nestedToolCalls === null
      ? null
      : hostToolCalls + nestedToolCalls,
    toolCounts,
    firstAssistantTextMs: numberOrNull(report.firstTextMs),
    elapsedMs: numberOrNull(report.elapsedMs),
    status: readSmokeStatus(report),
  }
}

function summarizeUnknown(report, sample) {
  return {
    schemaVersion: 2,
    sample,
    reportType: 'unknown',
    modelKey: safeLabel(report.modelKey),
    agentPreset: safeLabel(report.agentPreset),
    requestAttemptsEstimated: null,
    requestHeaderSnapshots: null,
    retryScheduledCount: null,
    retryStartedCount: null,
    hostSteps: null,
    hostStepTimings: null,
    hostToolCalls: null,
    nestedToolCalls: null,
    inspectionToolCalls: null,
    toolCounts: {},
    firstAssistantTextMs: null,
    elapsedMs: null,
    status: 'unknown',
  }
}

function sumUsage(records) {
  const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'costUsd']
  const totals = Object.fromEntries(fields.map((field) => [field, 0]))
  const available = Object.fromEntries(fields.map((field) => [field, false]))
  for (const record of records) {
    if (!isRecord(record)) continue
    const usage = isRecord(record.usage) ? record.usage : record
    for (const field of fields) {
      const value = numberOrNull(usage[field])
      if (value === null) continue
      totals[field] += value
      available[field] = true
    }
  }
  return {
    ...Object.fromEntries(fields.map((field) => [field, available[field] ? totals[field] : null])),
    // Runtime usage elapsed may sum concurrent model requests and is not a wall-clock phase duration.
    reportedModelTimeMs: sumReportedModelTime(records),
  }
}

function sumReportedModelTime(records) {
  let total = 0
  let observed = false
  for (const record of records) {
    if (!isRecord(record)) continue
    const usage = isRecord(record.usage) ? record.usage : record
    const value = numberOrNull(usage.elapsedMs)
    if (value === null) continue
    total += value
    observed = true
  }
  return observed ? total : null
}

function elapsedFromTask(task, timing, history) {
  const startedAt = numberOrNull(timing?.startedAtMs)
  const finishedAt = numberOrNull(timing?.finishedAtMs)
  if (startedAt !== null && finishedAt !== null && finishedAt >= startedAt) return finishedAt - startedAt
  const turnDurations = Array.isArray(history?.turns)
    ? history.turns.map((turn) => {
      const start = numberOrNull(turn?.startedAt)
      const finish = numberOrNull(turn?.finishedAt)
      return start !== null && finish !== null && finish >= start ? finish - start : null
    }).filter((duration) => duration !== null)
    : []
  if (turnDurations.length) return turnDurations.reduce((sum, duration) => sum + duration, 0)
  return numberOrNull(task?.elapsedMs)
}

function summarizeTask(task, timing, history) {
  const execution = isRecord(task?.executionEvidence) ? task.executionEvidence : null
  const observed = Array.isArray(execution?.observedToolCalls) ? execution.observedToolCalls : null
  const historyCalls = Array.isArray(history?.calls) ? history.calls : null
  const toolCounts = {}
  incrementCounts(toolCounts, historyCalls, (call) => isRecord(call) ? call.name : null)
  const observedDurations = observed?.map((call) => numberOrNull(call?.durationMs)).filter((value) => value !== null) ?? []
  const observedFailures = observed?.filter((call) => typeof call?.status === 'string' && call.status !== 'done').length ?? null
  return {
    id: safeLabel(task?.id),
    taskType: safeLabel(task?.taskType),
    status: safeLabel(task?.status)?.toLowerCase() ?? null,
    elapsedMs: elapsedFromTask(task, timing, history),
    turns: countOrNull(history?.turns),
    historyToolCalls: countOrNull(historyCalls),
    toolCounts,
    evidenceObservedToolCalls: countOrNull(observed),
    omittedToolCalls: integerOrNull(execution?.omittedToolCalls),
    scopeDeniedToolCalls: integerOrNull(execution?.scopeDeniedToolCalls),
    failedToolCalls: observedFailures,
    modelUsage: isRecord(task?.usage) ? sumUsage([task.usage]) : null,
    observedToolDurationMs: observedDurations.length
      ? observedDurations.reduce((sum, duration) => sum + duration, 0)
      : (observed?.length === 0 ? 0 : null),
  }
}

function dagStatus(report, tasks) {
  if (tasks.some((task) => normalizeStatus(task.status) === 'failed')) return 'failed'
  if (tasks.some((task) => normalizeStatus(task.status) === 'cancelled')) return 'cancelled'
  if (report.checks?.allTasksDone === false) return 'incomplete'
  if (report.checks?.allTasksDone === true) return 'completed'
  if (tasks.length > 0 && tasks.every((task) => normalizeStatus(task.status) === 'completed')) return 'completed'
  return 'incomplete'
}

function summarizeDag(report, sample) {
  const tasks = Array.isArray(report.tasks) ? report.tasks : []
  const histories = new Map((Array.isArray(report.taskHistories) ? report.taskHistories : [])
    .filter(isRecord)
    .map((history) => [String(history.id ?? ''), history]))
  const timings = isRecord(report.taskTimings) ? report.taskTimings : {}
  const taskSummaries = tasks.map((task) => summarizeTask(
    task,
    isRecord(timings[task?.id]) ? timings[task.id] : null,
    histories.get(String(task?.id ?? '')),
  ))
  const toolCounts = {}
  for (const task of taskSummaries) {
    for (const [name, count] of Object.entries(task.toolCounts)) toolCounts[name] = (toolCounts[name] ?? 0) + count
  }
  const plannerRuns = Array.isArray(report.plannerRuns) ? report.plannerRuns : []
  const plannerUsage = sumUsage(plannerRuns)
  const finalAssistantUsage = isRecord(report.synthesis?.usage) ? sumUsage([report.synthesis.usage]) : null
  const allObserved = tasks.flatMap((task) => Array.isArray(task?.executionEvidence?.observedToolCalls)
    ? task.executionEvidence.observedToolCalls
    : [])
  const overallObservedDurationMs = allObserved
    .map((call) => numberOrNull(call?.durationMs))
    .filter((value) => value !== null)
  const hostTurns = taskSummaries.reduce((sum, task) => sum + (task.turns ?? 0), 0)
  return {
    schemaVersion: 2,
    sample,
    reportType: 'dag-live',
    modelKey: safeLabel(report.modelKey),
    plannerMode: report.realPlanner === true ? 'live' : report.realPlanner === false ? 'fixture' : null,
    agentPreset: null,
    requestAttemptsEstimated: null,
    requestHeaderSnapshots: null,
    retryScheduledCount: null,
    retryStartedCount: null,
    hostTurns,
    hostSteps: null,
    hostStepTimings: null,
    hostToolCalls: taskSummaries.some((task) => task.historyToolCalls === null)
      ? null
      : taskSummaries.reduce((sum, task) => sum + task.historyToolCalls, 0),
    nestedToolCalls: null,
    inspectionToolCalls: taskSummaries.some((task) => task.historyToolCalls === null)
      ? null
      : taskSummaries.reduce((sum, task) => sum + task.historyToolCalls, 0),
    toolCounts,
    plannerRunCount: countOrNull(report.plannerRuns),
    plannerUsage,
    finalAssistantUsage,
    taskCount: integerOrNull(tasks.length),
    tasksDone: integerOrNull(tasks.filter((task) => normalizeStatus(task?.status) === 'completed').length),
    tasks: taskSummaries,
    parallelOverlapMs: numberOrNull(report.concurrentAgentTurnOverlapMs),
    schedulerOverlapMs: numberOrNull(report.parallelOverlapMs),
    observedToolDurationMs: overallObservedDurationMs.length
      ? overallObservedDurationMs.reduce((sum, duration) => sum + duration, 0)
      : (allObserved.length === 0 ? 0 : null),
    firstAssistantTextMs: null,
    elapsedMs: numberOrNull(report.elapsedMs),
    status: dagStatus(report, tasks),
    checks: isRecord(report.checks)
      ? Object.fromEntries(['parallelOverlapVerified', 'concurrentAgentTurnsVerified', 'allTasksDone', 'allTasksReturnedText', 'safelyStopped']
        .filter((key) => typeof report.checks[key] === 'boolean')
        .map((key) => [key, report.checks[key]]))
      : {},
  }
}

function summarizeLifecycleCase(row) {
  const sessions = Array.isArray(row?.sessions) ? row.sessions : []
  const completedTurns = Array.isArray(row?.completedTurns) ? row.completedTurns : null
  const turnIds = completedTurns?.map((turn) => safeLabel(turn?.turnId)).filter(Boolean) ?? []
  const continuationFlags = completedTurns?.map((turn) => typeof turn?.continuing === 'boolean' ? turn.continuing : null) ?? null
  const toolCounts = {}
  if (Array.isArray(row?.tools)) {
    for (const tool of row.tools) {
      const name = safeLabel(tool)
      if (name) toolCounts[name] = (toolCounts[name] ?? 0) + 1
    }
  }
  const sessionToolCounts = sessions.map((session) => countOrNull(session?.tools))
  const sessionCountsComplete = sessions.length > 0 && sessionToolCounts.every((count) => count !== null)
  const toolCallCount = Array.isArray(row?.tools) || sessionCountsComplete
    ? (Array.isArray(row?.tools) ? row.tools.length : 0)
      + sessionToolCounts.reduce((sum, count) => sum + (count ?? 0), 0)
    : integerOrNull(row?.confirmedToolCalls)
  const errorCategories = Array.isArray(row?.errors)
    ? row.errors.map(safeErrorCategory).filter(Boolean)
    : (safeErrorCategory(row?.errorCategory) ? [safeErrorCategory(row.errorCategory)] : [])
  return {
    name: safeLabel(row?.name),
    status: normalizeStatus(row?.status) ?? 'unknown',
    elapsedMs: numberOrNull(row?.elapsedMs),
    firstAssistantTextMs: numberOrNull(row?.firstTextMs),
    toolCallCount,
    toolCounts,
    retryCount: countOrNull(row?.retries),
    errorCount: Array.isArray(row?.errors)
      ? row.errors.length
      : (safeLabel(row?.errorCategory) || (typeof row?.error === 'string' && row.error.length > 0) ? 1 : null),
    errorCategories,
    failureStage: safeFailureStage(row?.failureStage),
    httpStatus: Number.isSafeInteger(row?.httpStatus) && row.httpStatus >= 400 && row.httpStatus <= 599 ? row.httpStatus : null,
    misroutedEventCount: integerOrNull(row?.misroutedEvents),
    queuedAccepted: isRecord(row?.accepted) && typeof row.accepted.queued === 'boolean' ? row.accepted.queued : null,
    completedTurnCount: completedTurns ? completedTurns.length : null,
    turnIdsDistinct: completedTurns && turnIds.length === completedTurns.length ? new Set(turnIds).size === turnIds.length : null,
    continuationFlags,
    sessionCount: sessions.length || (row?.accepted ? 1 : null),
    sessionOverlapped: typeof row?.overlapped === 'boolean' ? row.overlapped : null,
  }
}

function summarizeLifecycle(report, sample) {
  const cases = Array.isArray(report.cases) ? report.cases.map(summarizeLifecycleCase) : []
  const failedCases = cases.filter((row) => row.status === 'failed').length
  const unknownCases = cases.filter((row) => row.status === 'unknown').length
  const status = report.failure
    ? 'failed'
    : failedCases > 0
      ? 'failed'
      : cases.length > 0 && unknownCases === 0
        ? 'completed'
        : 'incomplete'
  return {
    schemaVersion: 2,
    sample,
    reportType: 'lifecycle-smoke',
    modelKey: safeLabel(report.modelKey),
    agentPreset: safeLabel(report.agentPreset),
    requestAttemptsEstimated: null,
    requestHeaderSnapshots: null,
    retryScheduledCount: null,
    retryStartedCount: null,
    hostTurns: null,
    hostSteps: null,
    hostStepTimings: null,
    hostToolCalls: cases.some((row) => row.toolCallCount === null)
      ? null
      : cases.reduce((sum, row) => sum + row.toolCallCount, 0),
    nestedToolCalls: null,
    inspectionToolCalls: cases.some((row) => row.toolCallCount === null)
      ? null
      : cases.reduce((sum, row) => sum + row.toolCallCount, 0),
    toolCounts: cases.reduce((counts, row) => {
      for (const [name, count] of Object.entries(row.toolCounts)) counts[name] = (counts[name] ?? 0) + count
      return counts
    }, {}),
    plannerRunCount: null,
    plannerUsage: null,
    finalAssistantUsage: null,
    taskCount: null,
    tasksDone: null,
    tasks: [],
    parallelOverlapMs: null,
    schedulerOverlapMs: null,
    observedToolDurationMs: null,
    firstAssistantTextMs: null,
    elapsedMs: numberOrNull(report.elapsedMs),
    status,
    cases,
    caseCount: cases.length,
    passedCases: cases.filter((row) => row.status === 'completed').length,
    failedCases,
    warningCount: Array.isArray(report.observations)
      ? report.observations.filter((item) => isRecord(item) && item.severity === 'warning').length
      : null,
  }
}

export function summarizeReport(report, sample) {
  if (!isRecord(report)) throw new Error('Expected a JSON object')
  if (Array.isArray(report.cases) && Object.hasOwn(report, 'startedAt')) return summarizeLifecycle(report, sample)
  if (Array.isArray(report.tasks) && Array.isArray(report.taskHistories)) return summarizeDag(report, sample)
  if (['requests', 'requestAttemptEstimate', 'requestHeaderSnapshots', 'hostStepTimings', 'steps', 'toolCalls', 'nestedToolCalls', 'firstTextMs', 'turnEnd']
    .some((key) => Object.hasOwn(report, key))) return summarizeReadSmoke(report, sample)
  return summarizeUnknown(report, sample)
}

function display(value) {
  return value === null || value === undefined ? '—' : String(value)
}

function markdownCell(value) {
  return display(value).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ')
}

function formatSeconds(milliseconds) {
  return milliseconds === null ? '—' : `${(milliseconds / 1000).toFixed(3)} s`
}

const STATUS_LABELS = {
  completed: '完成',
  failed: '失败',
  cancelled: '已取消',
  incomplete: '未完成',
  unknown: '未知',
}

export function renderMarkdown(rows) {
  const lines = [
    '| 样本 | 类型 | 模型 | 预设/计划器 | 请求估算 | Host steps/turns | 工具调用 | Agent turn 重叠 | Planner 耗时 | 首个 assistant 文本 | 总耗时 | 结果 |',
    '|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|',
  ]
  for (const row of rows) {
    const mode = row.reportType === 'dag-live'
      ? `DAG/${row.plannerMode ?? '未知'}`
      : (row.agentPreset ?? '—')
    const hostActivity = row.reportType === 'dag-live'
      ? `${display(row.hostTurns)} turns`
      : row.reportType === 'lifecycle-smoke'
        ? `${display(row.passedCases)} passed / ${display(row.caseCount)} cases`
        : `${display(row.hostSteps)} steps`
    const plannerMs = row.reportType === 'dag-live' ? row.plannerUsage?.reportedModelTimeMs : null
    lines.push(`| ${row.sample} | ${row.reportType} | ${markdownCell(row.modelKey)} | ${markdownCell(mode)} | ${display(row.requestAttemptsEstimated)} | ${markdownCell(hostActivity)} | ${display(row.inspectionToolCalls)} | ${formatSeconds(row.parallelOverlapMs)} | ${formatSeconds(plannerMs)} | ${formatSeconds(row.firstAssistantTextMs)} | ${formatSeconds(row.elapsedMs)} | ${STATUS_LABELS[row.status] ?? '未知'} |`)
  }
  for (const row of rows.filter((item) => item.reportType === 'read-smoke')) {
    const steps = row.hostStepTimings?.map((step) => {
      const firstChunk = step.firstChunkAfterStepMs === null ? '—' : formatSeconds(step.firstChunkAfterStepMs)
      const firstText = step.firstTextAfterStepMs === null ? '—' : formatSeconds(step.firstTextAfterStepMs)
      return `turn ${display(step.turn)}/step ${display(step.step)} 首 chunk ${firstChunk}、首文本 ${firstText}、step ${formatSeconds(step.stepDurationMs)}、已启动重试 ${display(step.retryStartedCount)}`
    }).join('； ')
    lines.push(`\n样本 ${row.sample} read-smoke 时序：估算模型请求 ${display(row.requestAttemptsEstimated)} 次（step starts + 已启动重试），request/header 快照 ${display(row.requestHeaderSnapshots)} 次；${steps || 'Host step 时序未采集'}。request/header 是配置快照，不等于请求次数；请求数仅是按 step/retry 事件推算。`)
  }
  for (const row of rows.filter((item) => item.reportType === 'dag-live')) {
    const taskDetails = row.tasks.map((task) => {
      const counts = Object.entries(task.toolCounts).map(([name, count]) => `${name} ${count}`).join(', ') || '—'
      return `${task.id ?? '?'} ${task.status ?? 'unknown'} (${formatSeconds(task.elapsedMs)}, ${counts}; 历史 ${display(task.historyToolCalls)} 次，证据 ${display(task.evidenceObservedToolCalls)} 次，漏记 ${display(task.omittedToolCalls)})`
    }).join('； ')
    lines.push(`\n样本 ${row.sample} DAG 明细：${taskDetails || '无子任务'}；Planner reported model time ${formatSeconds(row.plannerUsage?.reportedModelTimeMs)}；最终 assistant usage 中 reported model time ${formatSeconds(row.finalAssistantUsage?.reportedModelTimeMs)}；底层文件工具耗时合计 ${formatSeconds(row.observedToolDurationMs)}。模型时间是 Runtime usage 报告值（并发请求可能相加），不可当作阶段墙钟耗时。`)
  }
  for (const row of rows.filter((item) => item.reportType === 'lifecycle-smoke')) {
    const details = row.cases.map((item) => {
      const queue = item.queuedAccepted === null ? '' : `; queued ${item.queuedAccepted ? 'accepted' : 'not accepted'}`
      const turns = item.completedTurnCount === null ? '' : `; completed events ${item.completedTurnCount}`
      const continuation = item.continuationFlags?.length
        ? `; continuing ${item.continuationFlags.map((value) => value === null ? '—' : value ? 'true' : 'false').join('/')}`
        : ''
      const firstText = item.firstAssistantTextMs === null ? '—' : formatSeconds(item.firstAssistantTextMs)
      const failure = item.errorCategories.length || item.failureStage || item.httpStatus !== null
        ? `; ${item.errorCategories.join(', ') || 'error'}${item.httpStatus === null ? '' : ` HTTP ${item.httpStatus}`}${item.failureStage ? ` @ ${item.failureStage}` : ''}`
        : ''
      return `${item.name ?? 'unnamed'} ${item.status} (首文本 ${firstText}${queue}${turns}${continuation}; 工具 ${display(item.toolCallCount)}; retries ${display(item.retryCount)}; errors ${display(item.errorCount)}${failure})`
    }).join('； ')
    lines.push(`\n样本 ${row.sample} lifecycle 明细：${details || '无用例'}。只汇总状态与计数，不包含消息、工具参数、错误正文或会话 ID。`)
  }
  return `${lines.join('\n')}\n`
}
