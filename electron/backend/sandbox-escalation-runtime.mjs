import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage()

/**
 * One-shot wider sandbox mode for the current tool authorize() call (DSH allowed-once).
 */
export function withSandboxEscalation(mode, fn) {
  if (!mode) return fn()
  return storage.run({ oneShotMode: mode }, fn)
}

export function getOneShotSandboxMode() {
  return storage.getStore()?.oneShotMode ?? null
}

export function consumeOneShotSandboxMode() {
  const store = storage.getStore()
  if (!store?.oneShotMode) return null
  const mode = store.oneShotMode
  store.oneShotMode = null
  return mode
}
