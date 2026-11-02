import { useState } from 'react'

type AnyFunction = (...args: never[]) => unknown
type CacheOwner = string | object

export type StableCallbackBinder = {
  <F extends AnyFunction>(key: string, impl: F | undefined): F | undefined
  /** Keep only keys owned by the current conversation/rendered message set. */
  retain: (owner: CacheOwner, activeKeys: Iterable<string>) => void
  clear: () => void
  readonly size: number
}

/**
 * Keep callback identity while its key remains active. A removed/disabled action
 * is revoked as well as deleted, so a stale row cannot call a new owner's action.
 */
export function createStableCallbacks(): StableCallbackBinder {
  const entries = new Map<string, { impl: AnyFunction | undefined; stable: AnyFunction }>()
  let owner: CacheOwner | undefined
  let activeKeys: Set<string> | undefined

  function remove(key: string) {
    const entry = entries.get(key)
    if (entry) entry.impl = undefined
    entries.delete(key)
  }

  function clear() {
    for (const key of entries.keys()) remove(key)
    owner = undefined
    activeKeys = undefined
  }

  const bind = <F extends AnyFunction>(key: string, impl: F | undefined): F | undefined => {
    if (!impl || (activeKeys && !activeKeys.has(key))) {
      remove(key)
      return undefined
    }
    let entry = entries.get(key)
    if (!entry) {
      const created = {
        impl: impl as AnyFunction | undefined,
        stable: ((...args: never[]) => created.impl?.(...args)) as AnyFunction,
      }
      entries.set(key, created)
      entry = created
    }
    entry.impl = impl
    return entry.stable as F
  }

  return Object.defineProperty(Object.assign(bind, {
    retain(nextOwner: CacheOwner, nextKeys: Iterable<string>) {
      if (nextOwner !== owner) clear()
      owner = nextOwner
      activeKeys = new Set(nextKeys)
      for (const key of entries.keys()) if (!activeKeys.has(key)) remove(key)
    },
    clear,
  }), 'size', { get: () => entries.size }) as StableCallbackBinder
}

export function useStableCallbacks(owner: CacheOwner, activeKeys: Iterable<string>): StableCallbackBinder {
  const [bind] = useState(createStableCallbacks)
  bind.retain(owner, activeKeys)
  return bind
}
