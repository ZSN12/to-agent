/**
 * Run lifecycle listeners in registration order and wait for asynchronous
 * cleanup. EventEmitter.emit() does not wait for promise-returning listeners.
 */
export function emitLifecycleAndWait(emitter, event, ...args) {
  const listeners = emitter?.rawListeners?.(event) ?? []
  const results = listeners.map((listener) => {
    try {
      return Promise.resolve(listener.apply(emitter, args))
    } catch (error) {
      return Promise.reject(error)
    }
  })
  return Promise.allSettled(results)
}
