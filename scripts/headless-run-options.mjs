export const DEFAULT_HEADLESS_TASK_TIMEOUT_MS = 15 * 60 * 1000
export const MAX_HEADLESS_TASK_TIMEOUT_MS = 60 * 60 * 1000

export function parseHeadlessTaskTimeout(argv, defaultMs = DEFAULT_HEADLESS_TASK_TIMEOUT_MS) {
  const indexes = []
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--task-timeout') indexes.push(index)
  }
  if (indexes.length > 1) throw new Error('--task-timeout may only be specified once')
  if (indexes.length === 0) return defaultMs

  const value = argv[indexes[0] + 1]
  const timeoutMs = Number(value)
  if (!value || value.startsWith('--') || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1_000 || timeoutMs > MAX_HEADLESS_TASK_TIMEOUT_MS) {
    throw new Error(`--task-timeout must be an integer from 1000 to ${MAX_HEADLESS_TASK_TIMEOUT_MS} milliseconds`)
  }
  return timeoutMs
}
