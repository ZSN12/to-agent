const DEFAULT_READ_ONLY_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_WRITE_TIMEOUT_MS = 20 * 60 * 1000
const DEFAULT_IDLE_TIMEOUT_MS = 3 * 60 * 1000

function configuredTimeout(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 60 * 60 * 1000
    ? Math.floor(parsed)
    : fallback
}

export function resolveNodeTimeouts(taskType, preferences = {}) {
  const readOnly = ['research', 'review'].includes(taskType)
  return {
    timeoutMs: readOnly
      ? configuredTimeout(preferences.dagReadOnlyTimeoutMs, DEFAULT_READ_ONLY_TIMEOUT_MS)
      : configuredTimeout(preferences.dagWriteTimeoutMs, DEFAULT_WRITE_TIMEOUT_MS),
    idleTimeoutMs: configuredTimeout(preferences.dagIdleTimeoutMs, DEFAULT_IDLE_TIMEOUT_MS),
  }
}

function makeTimeoutError(kind, timeoutMs) {
  const idle = kind === 'idle'
  const error = new Error(idle
    ? `子任务连续 ${Math.ceil(timeoutMs / 1000)} 秒没有流事件，已按空闲超时停止`
    : `子任务超过 ${Math.ceil(timeoutMs / 1000)} 秒运行上限，已停止`)
  error.name = 'TimeoutError'
  error.code = idle ? 'ETASK_IDLE_TIMEOUT' : 'ETASK_TIMEOUT'
  error.kind = 'timeout'
  return error
}

/**
 * A per-attempt deadline. Parent cancellation is propagated, while total and
 * inactivity timeouts remain retryable and do not poison the task controller.
 */
export function createNodeDeadline({
  parentSignal,
  timeoutMs,
  idleTimeoutMs,
  onTimeout,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const controller = new AbortController()
  let timeoutHandle = null
  let idleHandle = null
  let disposed = false

  const abortForTimeout = (kind, budget) => {
    if (disposed || controller.signal.aborted) return
    const error = makeTimeoutError(kind, budget)
    controller.abort(error)
    onTimeout?.(error)
  }
  const abortFromParent = () => {
    if (disposed || controller.signal.aborted) return
    controller.abort(parentSignal?.reason)
  }

  if (parentSignal?.aborted) abortFromParent()
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true })

  if (!controller.signal.aborted && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutHandle = setTimer(() => abortForTimeout('total', timeoutMs), timeoutMs)
  }
  const armIdle = () => {
    if (disposed || controller.signal.aborted || !Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) return
    if (idleHandle) clearTimer(idleHandle)
    idleHandle = setTimer(() => abortForTimeout('idle', idleTimeoutMs), idleTimeoutMs)
  }
  armIdle()

  return {
    signal: controller.signal,
    touch: armIdle,
    dispose() {
      disposed = true
      if (timeoutHandle) clearTimer(timeoutHandle)
      if (idleHandle) clearTimer(idleHandle)
      parentSignal?.removeEventListener('abort', abortFromParent)
    },
  }
}

/** Reject promptly on a signal even if a mocked or third-party turn ignores it. */
export async function waitForNodeTurn(turn, signal, { abortGraceMs = 250 } = {}) {
  if (!signal) return turn
  const trackedTurn = Promise.resolve(turn).then(
    (value) => ({ type: 'fulfilled', value }),
    (error) => ({ type: 'rejected', error }),
  )
  const waitForAbortSettlement = async () => {
    const settled = await Promise.race([
      trackedTurn,
      new Promise((resolve) => setTimeout(() => resolve(null), Math.max(0, abortGraceMs))),
    ])
    if (settled) return
    const reason = signal.reason instanceof Error ? signal.reason : new Error('子任务已中止')
    const unsafeAbort = new Error(reason.message || '子任务已中止', { cause: reason })
    unsafeAbort.name = reason.name || 'Error'
    unsafeAbort.code = reason.code
    unsafeAbort.kind = reason.kind
    unsafeAbort.retryable = false
    unsafeAbort.abortDidNotSettle = true
    throw unsafeAbort
  }
  if (signal.aborted) {
    await waitForAbortSettlement()
    throw signal.reason ?? new Error('子任务已中止')
  }
  let removeAbortListener = () => {}
  const aborted = new Promise((_, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('子任务已中止'))
    signal.addEventListener('abort', onAbort, { once: true })
    removeAbortListener = () => signal.removeEventListener('abort', onAbort)
    if (signal.aborted) onAbort()
  })
  try {
    const outcome = await Promise.race([trackedTurn, aborted])
    if (outcome.type === 'rejected') throw outcome.error
    return outcome.value
  } catch (error) {
    if (signal.aborted) await waitForAbortSettlement()
    throw error
  } finally {
    removeAbortListener()
  }
}
