import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '../src/client/contract/store.ts'

interface State {
  a: { n: number }
  b: { list: string[] }
}

const init = (): State => ({ a: { n: 1 }, b: { list: ['x'] } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createSnapshotStore', () => {
  it('applies draft updates and preserves untouched branch references', () => {
    const store = createSnapshotStore(init())
    const before = store.getSnapshot()
    store.update((draft) => { draft.a.n = 2 })
    const after = store.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.a.n).toBe(2)
    expect(after.b).toBe(before.b)
  })

  it('notifies synchronously for each update by default', () => {
    const store = createSnapshotStore(init())
    const seen: number[] = []
    store.subscribe(() => { seen.push(store.getSnapshot().a.n) })
    store.update((draft) => { draft.a.n = 2 })
    store.update((draft) => { draft.a.n = 3 })
    expect(seen).toEqual([2, 3])
  })

  it('coalesces raf-mode updates into one notification per frame', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    const store = createSnapshotStore(init(), { flush: 'raf' })
    const notify = vi.fn()
    store.subscribe(notify)
    store.update((draft) => { draft.a.n = 2 })
    store.update((draft) => { draft.a.n = 3 })
    expect(notify).not.toHaveBeenCalled()
    expect(frames).toHaveLength(1)
    frames.shift()?.(0)
    expect(notify).toHaveBeenCalledOnce()
    expect(store.getSnapshot().a.n).toBe(3)
  })

  it('falls back to one microtask notification when raf is unavailable', async () => {
    const store = createSnapshotStore(init(), { flush: 'raf' })
    const notify = vi.fn()
    store.subscribe(notify)
    store.update((draft) => { draft.a.n = 2 })
    store.update((draft) => { draft.a.n = 3 })
    expect(notify).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(notify).toHaveBeenCalledOnce()
  })

  it('unsubscribes raf-mode listeners before a scheduled flush', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    const store = createSnapshotStore(init(), { flush: 'raf' })
    const notify = vi.fn()
    const unsubscribe = store.subscribe(notify)
    store.update((draft) => { draft.a.n = 2 })
    unsubscribe()
    frames.shift()?.(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('replaces the state wholesale and freezes state outside production', () => {
    const store = createSnapshotStore(init())
    const next = init()
    store.set(next)
    expect(store.getSnapshot()).toBe(next)
    expect(() => { store.getSnapshot().a.n = 9 }).toThrow()
  })

  it('persists and rehydrates primitive state without object-spreading it', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
    })
    const store = createSnapshotStore('', { persist: { name: 'runtime-draft' } })
    store.set('hello')
    const revived = createSnapshotStore('', { persist: { name: 'runtime-draft' } })
    expect(revived.getSnapshot()).toBe('hello')
  })
})
