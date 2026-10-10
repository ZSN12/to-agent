/** Prevent the scheduler from starting new nodes until the user resumes the run. */
export function createDagPauseControl(signal) {
  let paused = false
  const waiters = new Set()

  const wakeWaiters = () => {
    for (const wake of [...waiters]) wake()
  }

  return {
    get paused() { return paused },
    pause() {
      if (paused || signal?.aborted) return false
      paused = true
      return true
    },
    resume() {
      if (!paused) return false
      paused = false
      wakeWaiters()
      return true
    },
    async waitUntilResumed() {
      while (paused && !signal?.aborted) {
        await new Promise((resolve) => {
          const wake = () => {
            waiters.delete(wake)
            signal?.removeEventListener('abort', wake)
            resolve()
          }
          waiters.add(wake)
          signal?.addEventListener('abort', wake, { once: true })
        })
      }
    },
  }
}
