import {
  dshAgentPresetForPermissionMode,
  normalizePermissionMode,
} from '../dsh-permission-map.mjs'
import { sessionIdForKey, assertBindableWorkspace, rpcValue } from './prelude.mjs'

export function createDshSessionRegistry(deps) {
  const {
    sessions,
    loadSessions,
    persistSessions,
    evictTrackedSessions,
    dropSessionIndexes,
    muxWatchers,
    conversationHub,
    getWorkspacePath,
    getPermissionMode,
    alignLegacyComposerPreset,
    ensureReady,
    rejectPendingApprovals,
  } = deps

  async function ensureSession(api, conversationId, {
    cwdOverride,
    agentPreset,
    permissionMode,
    ownerConversationId,
    parentSessionId,
    modelKey = null,
  } = {}) {
    await loadSessions()
      let entry = sessions.get(conversationId)
      const lookupConversationId = ownerConversationId ?? conversationId
      const requestedCwd = cwdOverride || (await getWorkspacePath(lookupConversationId)) || process.cwd()
      // 未绑定工作区时 `process.cwd()` 会退化成 `/`，而 DSH 用会话 cwd 当沙箱边界。
      assertBindableWorkspace(requestedCwd)
      if (entry) assertBindableWorkspace(entry.cwd)
      const mode = normalizePermissionMode(permissionMode ?? await Promise.resolve(getPermissionMode(conversationId)))
      const resolvedPreset = agentPreset || dshAgentPresetForPermissionMode(mode)
      if (entry && entry.cwd !== requestedCwd) {
        throw new Error('此对话绑定的工作区与当前工作区不同。为保持 Z 会话上下文一致，请在原工作区继续，或新建对话。')
      }
      if (entry) {
        entry = await alignLegacyComposerPreset(api, conversationId, entry, resolvedPreset, modelKey)
      }
      if (!entry) {
        const sessionId = sessionIdForKey(conversationId)
        let created
        try {
          created = rpcValue(await api.sessions.create({
            sessionId,
            cwd: requestedCwd,
            agentPreset: resolvedPreset,
            ...(parentSessionId ? { parentSessionId } : {}),
          }), '创建 Z 会话')
        } catch (error) {
          // 映射表可能因 LRU/恢复丢失，但确定性 sessionId 对应的 Host 日志仍在。
          // Host 用 agent-preset-conflict 明确表示“这是旧会话，预设不可覆盖”；
          // 去掉 agentPreset 重试会采用日志中真实预设，不改写历史会话配置。
          if (error?.code !== 'agent-preset-conflict') throw error
          created = rpcValue(await api.sessions.create({
            sessionId,
            cwd: requestedCwd,
            ...(parentSessionId ? { parentSessionId } : {}),
          }), '恢复已有 Z 会话')
        }
        entry = {
          sessionId: created.sessionId || sessionId,
          cwd: requestedCwd,
          agentPreset: created.agentPreset || resolvedPreset,
          ...(parentSessionId ? { parentSessionId } : {}),
          ownerConversationId: ownerConversationId || conversationId,
          permissionModeAtCreate: mode,
          lastUsedAt: Date.now(),
        }
        entry = await alignLegacyComposerPreset(api, conversationId, entry, resolvedPreset, modelKey)
        sessions.set(conversationId, entry)
        evictTrackedSessions({ protectKey: conversationId })
        await persistSessions()
      } else {
        if (!entry.ownerConversationId) {
          entry.ownerConversationId = ownerConversationId || conversationId
          sessions.set(conversationId, entry)
          await persistSessions()
        }
        // `create` with an explicit id is DSH's attach/resume path for persisted sessions.
        rpcValue(await api.sessions.create({
          sessionId: entry.sessionId,
          cwd: entry.cwd,
          ...(entry.agentPreset ? { agentPreset: entry.agentPreset } : {}),
        }), '恢复 Z 会话')
        // LRU 用：只在时间戳明显推进时落盘，避免每轮都写一次映射表。
        const now = Date.now()
        if (now - (entry.lastUsedAt ?? 0) > 60_000) {
          entry.lastUsedAt = now
          sessions.set(conversationId, entry)
          await persistSessions()
        }
      }
      if (conversationHub) {
        const watchers = muxWatchers.get(conversationId)
        const wc = watchers?.size ? [...watchers].at(-1) : null
        if (wc) void conversationHub.attachSession(conversationId, entry.sessionId, wc)
      }
    return entry
  }

  async function forgetConversation(conversationId) {
  if (!conversationId) return { removed: [] }
  await loadSessions()
  await rejectPendingApprovals({ conversationId, reason: 'conversation-removed' }).catch(() => 0)
  const removed = []
  for (const [key, entry] of [...sessions.entries()]) {
    if (key !== conversationId && entry?.ownerConversationId !== conversationId) continue
    dropSessionIndexes(key)
    removed.push(key)
  }
  if (removed.length) await persistSessions()
    return { removed }
  }

  async function collectTurnEndSeqs(api, sessionId) {
  const seqs = []
  let beforeSeq
  for (let page = 0; page < 40; page += 1) {
    const value = rpcValue(await api.sessions.history({
      sessionId,
      maxMessages: 500,
      ...(beforeSeq === undefined ? {} : { beforeSeq }),
    }), '读取 Z 会话历史')
    const events = value?.events ?? []
    if (!events.length) break
    for (const item of events) {
      const event = item?.event
      if (event?.type === 'turn/end' && Number.isInteger(event.seq)) seqs.push(event.seq)
    }
    if (!value?.hasMore) break
    const firstSeq = events[0]?.event?.seq
    if (!Number.isInteger(firstSeq) || firstSeq === beforeSeq) break
    beforeSeq = firstSeq
  }
    return seqs.sort((a, b) => a - b)
  }

  async function forkConversation({ sourceConversationId, targetConversationId, completedTurns } = {}) {
  if (!sourceConversationId || !targetConversationId) return { ok: false, reason: 'missing-args' }
  await loadSessions()
  const source = sessions.get(sourceConversationId)
  if (!source?.sessionId) return { ok: false, reason: 'no-source-session' }
  const api = await ensureReady()
  let atSeq
  if (Number.isInteger(completedTurns) && completedTurns > 0) {
    try {
      const turnEndSeqs = await collectTurnEndSeqs(api, source.sessionId)
      if (turnEndSeqs.length < completedTurns) {
        return { ok: false, reason: 'fork-point-unavailable' }
      }
      atSeq = turnEndSeqs[completedTurns - 1]
    } catch (error) {
      return {
        ok: false,
        reason: 'fork-history-unavailable',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  let childSessionId
  try {
    const value = rpcValue(await api.sessions.fork({
      sessionId: source.sessionId,
      ...(atSeq === undefined ? {} : { atSeq }),
    }), '分叉 Z 会话')
    childSessionId = value?.sessionId ?? null
  } catch (error) {
    return { ok: false, reason: 'fork-failed', error: error instanceof Error ? error.message : String(error) }
  }
  if (!childSessionId) return { ok: false, reason: 'fork-failed' }
  const previousTarget = sessions.get(targetConversationId)
  sessions.set(targetConversationId, {
    sessionId: childSessionId,
    cwd: source.cwd,
    ...(source.agentPreset ? { agentPreset: source.agentPreset } : {}),
    ownerConversationId: targetConversationId,
    lastAppliedPermissionMode: source.lastAppliedPermissionMode ?? null,
    forkedFromSessionId: source.sessionId,
    ...(atSeq === undefined ? {} : { forkedAtSeq: atSeq }),
    lastUsedAt: Date.now(),
  })
  try {
    // Persist the non-derivable child session mapping before reporting fork
    // success. If this write fails, the UI must not retain a branch whose
    // random Host session ID cannot be recovered after restart.
    await persistSessions()
  } catch (error) {
    if (previousTarget) sessions.set(targetConversationId, previousTarget)
    else dropSessionIndexes(targetConversationId)
    return {
      ok: false,
      reason: 'mapping-persist-failed',
      error: error instanceof Error ? error.message : String(error),
    }
  }
  const evicted = evictTrackedSessions({ protectKey: targetConversationId })
  if (evicted.length) {
    try { await persistSessions() }
    catch (error) {
      // Eviction is only a size optimization. Keep the successful fork and
      // its durable mapping even if pruning older derivable entries fails.
      console.warn('[dsh-chat-service] fork 后清理旧会话映射失败:', error instanceof Error ? error.message : error)
    }
  }
    return { ok: true, sessionId: childSessionId, atSeq: atSeq ?? null }
  }

  return { ensureSession, forgetConversation, collectTurnEndSeqs, forkConversation }
}
