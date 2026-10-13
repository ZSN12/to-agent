const DEFAULT_INTERVAL_MS = 16
const DEFAULT_MAX_CHARS_PER_FLUSH = 64 * 1024
const DEFAULT_MAX_PENDING_CHARS = 1024 * 1024

function isLowSurrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff
}

/**
 * Coalesce PTY output into bounded pushes. A runaway command cannot grow the
 * pending buffer or the push channel without limit: the rate is capped per
 * flush and the oldest overflow is dropped with a visible notice.
 */
export function createTerminalOutputThrottle({
  emit,
  intervalMs = DEFAULT_INTERVAL_MS,
  maxCharsPerFlush = DEFAULT_MAX_CHARS_PER_FLUSH,
  maxPendingChars = DEFAULT_MAX_PENDING_CHARS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (typeof emit !== 'function') throw new TypeError('terminal output throttle requires emit()')
  let pending = ''
  let droppedChars = 0
  let timer = null
  let disposed = false

  function cut(text, length) {
    let index = Math.min(length, text.length)
    if (index < text.length && isLowSurrogate(text.charCodeAt(index))) index += 1
    return index
  }

  function takeChunk(limit) {
    const index = cut(pending, limit)
    const chunk = pending.slice(0, index)
    pending = pending.slice(index)
    if (droppedChars === 0) return chunk
    const notice = `\r\n\x1b[33m[TaskWeaver] 输出过快，已省略约 ${droppedChars} 个字符\x1b[0m\r\n`
    droppedChars = 0
    return notice + chunk
  }

  function schedule() {
    if (timer || disposed) return
    timer = setTimer(() => {
      timer = null
      if (pending) emit(takeChunk(maxCharsPerFlush))
      if (pending) schedule()
    }, intervalMs)
    timer?.unref?.()
  }

  return {
    push(data) {
      if (disposed || typeof data !== 'string' || data.length === 0) return
      pending += data
      if (pending.length > maxPendingChars) {
        const drop = cut(pending, pending.length - Math.floor(maxPendingChars / 2))
        droppedChars += drop
        pending = pending.slice(drop)
      }
      schedule()
    },
    /** Deliver everything still pending, e.g. right before the exit event. */
    flush() {
      if (timer) {
        clearTimer(timer)
        timer = null
      }
      if (pending || droppedChars) emit(takeChunk(pending.length))
    },
    dispose() {
      disposed = true
      if (timer) clearTimer(timer)
      timer = null
      pending = ''
      droppedChars = 0
    },
  }
}
