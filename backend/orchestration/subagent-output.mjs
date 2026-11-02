/** Upper bounds keep persisted chat messages and IPC payloads small. */
export const SUBAGENT_OUTPUT_MAX_ITEMS = 50
export const SUBAGENT_OUTPUT_MAX_TEXT_LENGTH = 8_000
export const SUBAGENT_OUTPUT_MAX_TOTAL_TEXT_LENGTH = 60_000
const SUBAGENT_OUTPUT_MAX_LABEL_LENGTH = 500
const TRUNCATION_NOTE = '\n\n…（输出过长，已截断）'

function clipLabel(value) {
  return String(value).slice(0, SUBAGENT_OUTPUT_MAX_LABEL_LENGTH)
}

function clipText(text, limit) {
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - TRUNCATION_NOTE.length))}${TRUNCATION_NOTE}`
}

/**
 * Apply the item and text budgets to an ordered list of outputs. Later outputs
 * get whatever text budget remains; once it is spent they are dropped.
 */
export function boundSubagentOutputs(outputs) {
  if (!Array.isArray(outputs)) return []
  const bounded = []
  let remaining = SUBAGENT_OUTPUT_MAX_TOTAL_TEXT_LENGTH
  for (const output of outputs) {
    if (bounded.length >= SUBAGENT_OUTPUT_MAX_ITEMS || remaining <= 0) break
    const text = clipText(String(output?.text ?? ''), Math.min(SUBAGENT_OUTPUT_MAX_TEXT_LENGTH, remaining))
    if (!text) continue
    remaining -= text.length
    bounded.push({ ...output, text })
  }
  return bounded
}

/** Append outputs from another DAG run in the same turn without exceeding the budgets. */
export function mergeSubagentOutputs(existing, next) {
  return boundSubagentOutputs([...(Array.isArray(existing) ? existing : []), ...(Array.isArray(next) ? next : [])])
}

/** Project final DAG node messages into compact, durable chat display metadata. */
export function subagentOutputsFromTasks(tasks, runIdPrefix = '') {
  if (!Array.isArray(tasks)) return []
  return boundSubagentOutputs(tasks.flatMap((task, index) => {
    const message = Array.isArray(task?.messages)
      ? task.messages.findLast((item) => item?.author === 'agent')
      : null
    const text = typeof message?.text === 'string' ? message.text.trim() : ''
    if (!message || !text) return []
    const modelKey = typeof message.modelKey === 'string' && message.modelKey
      ? message.modelKey
      : (typeof task.modelKey === 'string' ? task.modelKey : undefined)
    const taskId = String(task.id ?? message.id ?? `task-${index + 1}`)
    const runId = typeof task.runId === 'string' && task.runId
      ? task.runId
      : (typeof runIdPrefix === 'string' && runIdPrefix ? runIdPrefix : 'run')
    return [{
      id: clipLabel(`${runId}:${taskId}:${index}`),
      role: clipLabel(task.role || task.title || '子 Agent'),
      title: clipLabel(task.title || task.description || task.role || '子任务'),
      model: clipLabel(task.model || modelKey || '模型信息不可用'),
      ...(modelKey ? { modelKey: clipLabel(modelKey) } : {}),
      ...(typeof task.routeReason === 'string' && task.routeReason.trim()
        ? { routeReason: clipLabel(task.routeReason.trim()) }
        : {}),
      ...(Number.isFinite(task.durationMs) ? { durationMs: Math.max(0, task.durationMs) } : {}),
      ...(typeof task.statusLabel === 'string' ? { status: clipLabel(task.statusLabel) } : {}),
      ...(message.usage && typeof message.usage === 'object' ? { usage: message.usage } : {}),
      text,
    }]
  }))
}
