export const DEFAULT_PROVIDER_DISCOVERY_TIMEOUT_MS = 3_000

function raceWithAbort(promise, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('模型发现已取消'))
      return
    }

    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason ?? new Error('模型发现已取消'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/** Create the discoverProviderModels IPC handler with an injectable timeout for focused tests. */
export function createDiscoverProviderModelsHandler({
  modelService,
  timeoutMs = DEFAULT_PROVIDER_DISCOVERY_TIMEOUT_MS,
}) {
  if (typeof modelService?.discoverProviderModels !== 'function') {
    throw new TypeError('modelService.discoverProviderModels must be a function')
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError('timeoutMs must be a positive integer')
  }

  return async (_event, payload) => {
    const providerId = String(payload?.providerId ?? '').trim()
    if (!providerId) throw new Error('缺少提供方 ID')

    const signal = AbortSignal.timeout(timeoutMs)
    try {
      const result = await raceWithAbort(modelService.discoverProviderModels({
        providerId,
        force: payload?.force === true,
        signal,
      }), signal)
      return {
        providerId,
        status: 'ok',
        models: Array.isArray(result)
          ? result
          : (Array.isArray(result?.models) ? result.models : []),
      }
    } catch (error) {
      const isTimeout = signal.reason?.name === 'TimeoutError'
        || error?.name === 'TimeoutError'
        || /超时|timeout/i.test(error?.message ?? '')
      return {
        providerId,
        status: isTimeout ? 'timeout' : 'error',
        models: [],
        error: isTimeout
          ? `模型发现超过 ${timeoutMs / 1_000} 秒，已停止等待`
          : error instanceof Error ? error.message : String(error),
      }
    }
  }
}
