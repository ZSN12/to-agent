/** Keep backend navigation in click order and only apply the latest result. */
export function createNavigationQueue() {
  let tail: Promise<void> = Promise.resolve()
  let version = 0
  return {
    async run<T>(task: () => Promise<T>): Promise<
      | { current: false }
      | { current: true; ok: true; value: T }
      | { current: true; ok: false; error: unknown }
    > {
      const requestVersion = ++version
      const result = tail.then(task)
      tail = result.then(() => undefined, () => undefined)
      try {
        const value = await result
        return requestVersion === version ? { current: true, ok: true, value } : { current: false }
      } catch (error) {
        return requestVersion === version ? { current: true, ok: false, error } : { current: false }
      }
    },
  }
}
