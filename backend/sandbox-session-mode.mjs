import path from 'node:path'
import { createJsonStore } from './json-store.mjs'

/** @typedef {'read-only' | 'workspace-write' | 'danger-full-access' | null} SessionSandboxMode */

/**
 * Per-conversation sandbox/mode override (DSH session-mode fold).
 */
export function createSandboxSessionStore(userDataPath) {
  const store = createJsonStore(path.join(userDataPath, 'sandbox-session-modes.json'), {})

  return {
    async get(conversationId) {
      if (!conversationId) return null
      const raw = await store.read()
      const row = raw[conversationId]
      if (!row || !row.mode) return null
      return {
        mode: row.mode,
        source: row.source || 'user',
        updatedAt: row.updatedAt || 0,
      }
    },
    async set(conversationId, mode, source = 'user') {
      if (!conversationId) throw new Error('conversationId required')
      const raw = await store.read()
      if (!mode) {
        delete raw[conversationId]
      } else {
        raw[conversationId] = { mode, source, updatedAt: Date.now() }
      }
      await store.write(raw)
      return makeSandboxModeEvent(mode, source)
    },
    async clear(conversationId) {
      return this.set(conversationId, null)
    },
  }
}

/** Cordis-shaped event for UI / transcript hooks */
export function makeSandboxModeEvent(mode, source = 'user') {
  return {
    type: 'sandbox/mode',
    time: Date.now(),
    data: { mode: mode || 'workspace-write', source },
  }
}

/**
 * @param {string} baseMode file/bash base from preferences
 * @param {SessionSandboxMode} sessionOverride
 */
export function effectiveSandboxMode(baseMode, sessionOverride) {
  if (sessionOverride) return sessionOverride
  if (baseMode === 'off' || baseMode === 'danger-full-access') return baseMode === 'off' ? 'off' : 'danger-full-access'
  return baseMode
}
