import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { readSessionMap } from './prelude.mjs'

/** Persistent conversationId → DSH session map on disk. */
export function createDshSessionMap({ mapPath, sessions }) {
  let mapLoad = null
  let persistenceQueue = Promise.resolve()

  const loadSessions = () => {
    if (!mapLoad) {
      mapLoad = readSessionMap(mapPath).then((entries) => {
        for (const [conversationId, entry] of Object.entries(entries)) {
          if (typeof entry?.sessionId === 'string' && typeof entry?.cwd === 'string') {
            sessions.set(conversationId, entry)
          }
        }
      })
    }
    return mapLoad
  }

  function persistSessions() {
    const write = persistenceQueue.then(async () => {
      await fs.mkdir(path.dirname(mapPath), { recursive: true })
      const tmp = `${mapPath}.${process.pid}.${crypto.randomUUID()}.tmp`
      const data = Object.fromEntries(sessions.entries())
      await fs.writeFile(tmp, `${JSON.stringify({ version: 1, sessions: data }, null, 2)}\n`, { mode: 0o600 })
      await fs.rename(tmp, mapPath)
    })
    persistenceQueue = write.catch(() => {})
    return write
  }

  return { loadSessions, persistSessions }
}
