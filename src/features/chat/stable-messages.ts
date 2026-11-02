import { useState } from 'react'
import type { ChatMessage } from '../../types'

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameMessage(left: ChatMessage, right: ChatMessage): boolean {
  const leftKeys = Object.keys(left) as (keyof ChatMessage)[]
  if (leftKeys.length !== Object.keys(right).length) return false
  return leftKeys.every((key) => sameValue(left[key], right[key]))
}

/**
 * Keep the previous object for every message whose content is unchanged, and
 * the previous array when nothing changed. Projection pushes rebuild every
 * message from JSON; reference stability is what lets memoized rows skip.
 */
export function reuseUnchangedMessages(
  previous: readonly ChatMessage[],
  next: readonly ChatMessage[],
): ChatMessage[] {
  if (!previous.length) return next as ChatMessage[]
  const previousById = new Map(previous.map((message) => [message.id, message]))
  let changed = previous.length !== next.length
  const result = next.map((message, index) => {
    const prior = previousById.get(message.id)
    const reused = prior && (prior === message || sameMessage(prior, message)) ? prior : message
    if (reused !== previous[index]) changed = true
    return reused
  })
  return changed ? result : previous as ChatMessage[]
}

type CacheOwner = string | object

export type StableArrayBinder = {
  <T>(key: string, next: readonly T[] | undefined): readonly T[] | undefined
  /** Keep only keys owned by the current conversation/rendered message set. */
  retain: (owner: CacheOwner, activeKeys: Iterable<string>) => void
  clear: () => void
  readonly size: number
}

/**
 * Equal slices retain identity only while their owner and key remain active.
 * A projection rollback/deletion therefore releases its old row/tool arrays.
 */
export function createStableArrays(): StableArrayBinder {
  const cache = new Map<string, readonly unknown[]>()
  let owner: CacheOwner | undefined
  let activeKeys: Set<string> | undefined
  const clear = () => {
    cache.clear()
    owner = undefined
    activeKeys = undefined
  }
  const bind = <T>(key: string, next: readonly T[] | undefined): readonly T[] | undefined => {
    if (!next || (activeKeys && !activeKeys.has(key))) {
      cache.delete(key)
      return next
    }
    const previous = cache.get(key) as readonly T[] | undefined
    if (previous && previous.length === next.length && previous.every((item, index) => sameValue(item, next[index]))) {
      return previous
    }
    cache.set(key, next)
    return next
  }
  return Object.defineProperty(Object.assign(bind, {
    retain(nextOwner: CacheOwner, nextKeys: Iterable<string>) {
      if (nextOwner !== owner) clear()
      owner = nextOwner
      activeKeys = new Set(nextKeys)
      for (const key of cache.keys()) if (!activeKeys.has(key)) cache.delete(key)
    },
    clear,
  }), 'size', { get: () => cache.size }) as StableArrayBinder
}

export function useStableArrays(owner: CacheOwner, activeKeys: Iterable<string>): StableArrayBinder {
  const [bind] = useState(createStableArrays)
  bind.retain(owner, activeKeys)
  return bind
}
