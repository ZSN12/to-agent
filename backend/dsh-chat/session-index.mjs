import { Z_MAX_TRACKED_SESSIONS } from '../config.mjs'
import { sessionIdForKey } from './prelude.mjs'

/** In-memory session indexes and deterministic eviction of mappable sessions. */
export function createDshSessionIndex({
  sessions,
  observedSequences,
  liveUsage,
  queueSnapshots,
  muxWatchers,
  running,
}) {
  function conversationIdForSession(sessionId) {
    for (const [key, entry] of sessions.entries()) {
      if (entry.sessionId === sessionId) return entry.ownerConversationId || key
    }
    return null
  }

  /** 清掉某个 sessionKey 在所有内存索引里的痕迹（映射表之外的副作用表）。 */
  function dropSessionIndexes(sessionKey) {
    observedSequences.delete(sessions.get(sessionKey)?.sessionId)
    sessions.delete(sessionKey)
    liveUsage.delete(sessionKey)
    queueSnapshots.delete(sessionKey)
    muxWatchers.delete(sessionKey)
  }

  /**
   * 映射表回收：只淘汰「可推导」条目（见 dsh-chat-service 注释）。
   */
  function evictTrackedSessions({ protectKey = null } = {}) {
    if (sessions.size <= Z_MAX_TRACKED_SESSIONS) return []
    const overflow = sessions.size - Z_MAX_TRACKED_SESSIONS
    const candidates = [...sessions.entries()]
      .filter(([key, entry]) => key !== protectKey
        && entry?.sessionId === sessionIdForKey(key)
        && !running.has(key))
      .sort((a, b) => (a[1].lastUsedAt ?? 0) - (b[1].lastUsedAt ?? 0))
    const evicted = []
    for (const [key] of candidates) {
      if (evicted.length >= overflow) break
      dropSessionIndexes(key)
      evicted.push(key)
    }
    return evicted
  }

  return { conversationIdForSession, dropSessionIndexes, evictTrackedSessions }
}
