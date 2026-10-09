import { Z_IDLE_HISTORY_RECONCILE_MS, Z_MAX_HISTORY_RECONCILE_MS } from './constants.mjs'
import { rpcValue } from './prelude.mjs'
import { readMissingEvents } from './session-history.mjs'

export function createSessionRecovery({
  observedSequences,
  running,
  emit,
  finishTurn,
  dispatchEnvelope,
  setReconnectAttempt,
  getStopped,
}) {
  async function recoverSession(api, sessionKey, turn, subscribedSeq) {
    const sessionId = turn.sessionId
    const emitTarget = turn.eventConversationId ?? sessionKey
    const before = observedSequences.get(sessionId) ?? -1
    let missing = await readMissingEvents(api, sessionId, before)
    const list = rpcValue(await api.sessions.list({}), '确认 Z Agent 运行状态')
    if (!Array.isArray(list.items)) throw new Error('Z 会话列表格式无效，无法确认任务状态')
    const nativeRunning = list.items?.some(item => item.sessionId === sessionId && item.running)
    if (!nativeRunning) missing = await readMissingEvents(api, sessionId, before)
    if (!turn.silentText) emit(emitTarget, turn.webContents, { type: 'connection', state: 'restored',
      message: nativeRunning ? '连接已恢复，任务仍在执行…' : '会话连接已恢复。' })
    const acceptedBeforeGap = turn.pendingQueuedTurns
    turn.pendingQueuedTurns = 0
    turn.queueAuthoritative = false
    for (let index = 0; index < missing.length; index++) {
      const row = missing[index]
      if (row.event.type === 'turn/end') {
        turn.recoveryContinuing = !['error', 'aborted', 'cancelled', 'interrupted'].includes(row.event.data?.reason?.kind)
          && (missing.slice(index + 1).some(next => next.event.type === 'turn/start')
            || Boolean(nativeRunning && acceptedBeforeGap > 0))
      }
      await dispatchEnvelope(api, { payload: { type: 'session/event', sessionId, ...row } })
      delete turn.recoveryContinuing
    }
    turn.recovering = false
    turn.connectionFailed = false
    if (![...running.values()].some(record => record.recovering)) setReconnectAttempt(0)
    if (running.get(sessionKey) !== turn) return
    if (!nativeRunning) {
      if (Number.isInteger(subscribedSeq) && subscribedSeq < before) observedSequences.set(sessionId, subscribedSeq)
      finishTurn(sessionKey, turn, emitTarget, { reason: 'error', error: {
        message: 'Z Agent 已停止，未找到完整结束事件；已保留此前输出，未自动重新执行任务。',
        code: 'HOST_INTERRUPTED',
      } })
    }
  }

  function scheduleIdleHistoryReconciliation(api, sessionKey, turn) {
    if (turn.command || typeof api.sessions.history !== 'function' || getStopped() || running.get(sessionKey) !== turn || turn.reconcileTimer) return
    const delay = turn.reconcileDelayMs ?? Z_IDLE_HISTORY_RECONCILE_MS
    turn.reconcileTimer = setTimeout(async () => {
      turn.reconcileTimer = null
      if (getStopped() || running.get(sessionKey) !== turn) return
      if (Date.now() - turn.lastEventAt >= delay) {
        try {
          const afterSeq = observedSequences.get(turn.sessionId) ?? turn.historyBaselineSeq
          if (Number.isInteger(afterSeq)) {
            const missing = await readMissingEvents(api, turn.sessionId, afterSeq)
            for (const row of missing) {
              await dispatchEnvelope(api, { payload: { type: 'session/event', sessionId: turn.sessionId, ...row } })
              if (running.get(sessionKey) !== turn) break
            }
          }
        } catch (error) {
          console.warn(`Z 会话 ${turn.sessionId} 的静默历史对账失败：${error instanceof Error ? error.message : String(error)}`)
        }
        turn.reconcileDelayMs = Math.min(delay * 2, Z_MAX_HISTORY_RECONCILE_MS)
      }
      scheduleIdleHistoryReconciliation(api, sessionKey, turn)
    }, delay)
    turn.reconcileTimer.unref?.()
  }

  return { recoverSession, scheduleIdleHistoryReconciliation }
}
