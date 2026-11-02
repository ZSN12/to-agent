// A small per-plugin workspace budget. File/byte limits still apply to each build.
export const DEFAULT_MAX_INDEXED_WORKSPACES = 2

export function validateIndexCapacity(capacity: number): void {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new Error('maxIndexedWorkspaces must be a positive integer')
  }
}

type Entry<T> = { pending: Promise<T>; controller: AbortController }

/** Owns completed and in-flight indexes; entries never re-register after completion. */
export class WorkspaceIndexCache<T> {
  private readonly entries = new Map<string, Entry<T>>()
  private disposed = false

  constructor(private capacity = DEFAULT_MAX_INDEXED_WORKSPACES) {
    this.setCapacity(capacity)
  }

  setCapacity(capacity: number): void {
    validateIndexCapacity(capacity)
    this.capacity = capacity
    while (this.entries.size > capacity) this.evictOldest()
  }

  get(key: string): Promise<T> | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.pending
  }

  replace(key: string, build: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('Semantic index cache is disposed'))
    if (signal?.aborted) return Promise.reject(signal.reason)
    this.remove(key, new Error('Semantic index build was replaced'))
    while (this.entries.size >= this.capacity) this.evictOldest()

    const controller = new AbortController()
    const buildSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    const entry = { controller } as Entry<T>
    entry.pending = new Promise<T>((resolve, reject) => {
      const forget = () => {
        if (this.entries.get(key) === entry) this.entries.delete(key)
      }
      const onAbort = () => { forget(); reject(buildSignal.reason) }
      buildSignal.addEventListener('abort', onAbort, { once: true })
      // Delay the build so the entry is registered before it can complete or fail.
      void Promise.resolve().then(() => {
        buildSignal.throwIfAborted()
        return build(buildSignal)
      }).then(value => {
        if (buildSignal.aborted) reject(buildSignal.reason)
        else resolve(value)
      }, error => {
        forget()
        reject(error)
      }).finally(() => buildSignal.removeEventListener('abort', onAbort))
    })
    // Teardown may reject a pending entry before a caller starts awaiting it.
    void entry.pending.catch(() => {})
    this.entries.set(key, entry)
    return entry.pending
  }

  clear(): void {
    for (const key of this.entries.keys()) this.remove(key, new Error('Semantic index was reset'))
  }

  dispose(): void {
    this.disposed = true
    this.clear()
  }

  private evictOldest(): void {
    const key = this.entries.keys().next().value
    if (key !== undefined) this.remove(key,
      new Error('Semantic index was evicted; call index_project_for_semantic_search again'))
  }

  private remove(key: string, reason: Error): void {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    entry.controller.abort(reason)
  }
}
