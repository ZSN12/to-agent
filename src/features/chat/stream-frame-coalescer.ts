export type FrameScheduler = (callback: () => void) => () => void

/**
 * Next animation frame, with a timer fallback: WebKit pauses rAF for occluded
 * windows, and a background turn must still reach React state.
 */
export function animationFrameScheduler(fallbackMs = 48): FrameScheduler {
  return (callback) => {
    let done = false
    const run = () => {
      if (done) return
      done = true
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      callback()
    }
    const frame = requestAnimationFrame(run)
    const timer = setTimeout(run, fallbackMs)
    return () => {
      done = true
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }
}

export interface FrameCoalescer<T> {
  push: (item: T) => void
  /** Apply queued items now; callers use this before any order-sensitive item. */
  flush: () => void
  dispose: () => void
}

/** Queue high-frequency items and apply them as one batch per frame. */
export function createFrameCoalescer<T>(
  apply: (items: T[]) => void,
  schedule: FrameScheduler,
): FrameCoalescer<T> {
  let queue: T[] = []
  let cancel: (() => void) | null = null

  const flush = () => {
    cancel?.()
    cancel = null
    if (!queue.length) return
    const batch = queue
    queue = []
    apply(batch)
  }

  return {
    push(item) {
      queue.push(item)
      cancel ??= schedule(flush)
    },
    flush,
    dispose() {
      cancel?.()
      cancel = null
      queue = []
    },
  }
}
