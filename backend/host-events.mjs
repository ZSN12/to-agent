const MODEL_CATALOG_EVENTS = new Set([
  'llm/adapters-updated',
  'credentials/reference-updated',
  'settings/document-updated',
])

function wait(ms, signal) {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    timer.unref?.()
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}

/**
 * Reconnectable Host event consumer for model catalog invalidation. It starts
 * only after app bootstrap has made the runtime profile ready.
 */
export function createHostModelCatalogEventPump({
  hostManager,
  modelService,
  debounceMs = 150,
  retryMs = 500,
  onError = (error) => console.warn('Host 模型目录事件流断开:', error instanceof Error ? error.message : error),
}) {
  const controller = new AbortController()
  let running = false
  let pumpPromise = null
  let debounceTimer = null
  let refreshPromise = null
  let refreshAgain = false

  function scheduleRefresh() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (controller.signal.aborted) return
      if (refreshPromise) {
        refreshAgain = true
        return
      }
      refreshPromise = Promise.resolve(modelService.invalidateCatalogCache())
        .then(() => modelService.refreshCatalogBundle())
        .catch((error) => onError(error))
        .finally(() => {
          refreshPromise = null
          if (refreshAgain && !controller.signal.aborted) {
            refreshAgain = false
            scheduleRefresh()
          }
        })
    }, debounceMs)
    debounceTimer.unref?.()
  }

  async function pump() {
    while (!controller.signal.aborted) {
      try {
        const { api } = await hostManager.start()
        for await (const envelope of api.events.host({}, controller.signal)) {
          if (controller.signal.aborted) break
          const frame = envelope?.payload
          if (frame?.type === 'host/remote-event' && MODEL_CATALOG_EVENTS.has(frame.event)) {
            scheduleRefresh()
          }
          if (frame?.type === 'stream/error') {
            throw new Error(frame.error?.message || 'Host 事件流返回错误')
          }
        }
        if (!controller.signal.aborted) throw new Error('Host 事件流已关闭')
      } catch (error) {
        if (controller.signal.aborted) break
        onError(error)
        await wait(retryMs, controller.signal)
      }
    }
  }

  return {
    start() {
      if (running) return pumpPromise
      running = true
      pumpPromise = pump()
      return pumpPromise
    },
    async stop() {
      controller.abort()
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = null
      await Promise.allSettled([pumpPromise, refreshPromise])
    },
  }
}

export { MODEL_CATALOG_EVENTS }
