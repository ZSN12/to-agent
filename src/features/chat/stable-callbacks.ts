import { useState } from 'react'

type AnyFunction = (...args: never[]) => unknown

export type StableCallbackBinder = <F extends AnyFunction>(key: string, impl: F | undefined) => F | undefined

/**
 * Per-key callbacks whose identity never changes while the latest
 * implementation is always the one invoked. Presence still changes identity
 * (undefined stays undefined) so rows hide or show their actions correctly.
 */
export function createStableCallbacks(): StableCallbackBinder {
  const entries = new Map<string, { impl: AnyFunction; stable: AnyFunction }>()
  return <F extends AnyFunction>(key: string, impl: F | undefined): F | undefined => {
    if (!impl) return undefined
    let entry = entries.get(key)
    if (!entry) {
      const created = {
        impl: impl as AnyFunction,
        stable: ((...args: never[]) => created.impl(...args)) as AnyFunction,
      }
      entries.set(key, created)
      entry = created
    }
    entry.impl = impl
    return entry.stable as F
  }
}

export function useStableCallbacks(): StableCallbackBinder {
  const [bind] = useState(createStableCallbacks)
  return bind
}
