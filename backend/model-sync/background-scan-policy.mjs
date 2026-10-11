import fs from 'node:fs/promises'
import net from 'node:net'

export const BACKGROUND_EXPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000

export async function hasFreshExportSnapshot(
  userDataPath,
  { now = Date.now(), maxAgeMs = BACKGROUND_EXPORT_MAX_AGE_MS } = {},
) {
  try {
    const stat = await fs.stat(`${userDataPath}/opencodex-export.json`)
    const age = now - stat.mtimeMs
    return age >= 0 && age < maxAgeMs
  } catch {
    return false
  }
}

/** Probe the legacy local OpenCodex proxy without delaying startup. */
export function probeLegacyOcxProxy({
  host = '127.0.0.1',
  port = 10100,
  timeoutMs = 200,
  connect = net.createConnection,
} = {}) {
  return new Promise((resolve) => {
    let settled = false
    let socket
    const finish = (available) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket?.destroy()
      resolve(available)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    timer.unref?.()
    try {
      socket = connect({ host, port })
      socket.once('connect', () => finish(true))
      socket.once('error', () => finish(false))
    } catch {
      finish(false)
    }
  })
}
