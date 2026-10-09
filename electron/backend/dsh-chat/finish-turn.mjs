import { humanizeBridgeTransportError } from '../cursor-tool-guidance.mjs'
import { serializeTurnActivity } from '../turn-activity.mjs'
import { activeThinkingDurationMs, pauseThinkingSegment } from './prelude.mjs'

export function createFinishTurn({
  emit,
  liveUsage,
  running,
  modelService,
  onTurnCompleted,
}) {
  return function finishTurn(sessionKey, turn, emitTarget, ending = {}) {
    if (turn.reconcileTimer) clearTimeout(turn.reconcileTimer)
    turn.reconcileTimer = null
    const reason = ending.reason
    const cancelled = reason === 'aborted' || reason === 'cancelled' || reason === 'interrupted'
    const turnFailure = reason === 'error'
      ? (ending.error ?? { message: 'Z Agent 执行失败' })
      : reason === 'blocked'
        ? {
          code: 'AGENT_BLOCKED',
          message: turn.searchCycleBlocked
            ? '检测到重复的文件搜索循环，已停止本轮以避免继续消耗；本轮没有生成最终答案。请基于已读取内容总结，或在新消息中指定更窄的搜索范围。'
            : 'Z Agent 本轮被工具或安全策略阻止，未生成最终答案。请检查工具调用记录后重试。',
        }
        : reason === 'completed' && !turn.text.trim()
          ? {
            code: 'AGENT_EMPTY_RESPONSE',
            message: 'Z Agent 本轮结束但没有生成最终文本；不会将空响应记为成功。请查看工具记录后再决定是否继续。',
          }
        : null
    const turnFailureMessage = turnFailure
      ? humanizeBridgeTransportError(
        turnFailure.message || 'Z Agent 执行失败',
        turn.modelKey,
      )
      : null
    const continuing = ending.continuing ?? (!turnFailure && !cancelled && turn.pendingQueuedTurns > 0)
    const endedAt = Number.isFinite(ending.endedAt) ? ending.endedAt : Date.now()
    const elapsedMs = Math.max(0, endedAt - turn.startedAt)
    pauseThinkingSegment(turn, endedAt)
    const thinkingDurationMs = activeThinkingDurationMs(turn, endedAt)
    const modelConfig = turn.modelKey && modelService?.getModelConfig ? modelService.getModelConfig(turn.modelKey) : null
    const fallbackWindow = modelConfig?.contextWindow || (turn.modelKey && modelService?.getModel ? modelService.getModel(turn.modelKey)?.contextWindow : null) || null
    const turnContextTokens = turn.usage?.contextTokens
      ?? (turn.usage?.inputTokens ? (turn.usage.inputTokens + (turn.usage.cacheReadTokens ?? 0)) : null)
    const turnContextWindow = turn.usage?.contextWindow || fallbackWindow || null
    const turnContextPercent = turnContextTokens && turnContextWindow
      ? Math.round(turnContextTokens / turnContextWindow * 100)
      : null
    const result = {
      turnId: turn.turnId,
      startedAt: turn.startedAt,
      text: turn.text,
      thinking: turn.thinking,
      thinkingDurationMs,
      contentBlocks: Array.isArray(turn.stepBlocks) && turn.stepBlocks.length > 0
        ? turn.stepBlocks.map((b) => ({ id: b.id, kind: b.kind, text: b.text }))
        : undefined,
      fileChanges: Array.from(turn.fileChanges.values()).map((file) => ({
        path: file.path,
        ...(file.statsComplete ? { addedLines: file.addedLines, deletedLines: file.deletedLines } : {}),
        ...(file.isNewFile ? { isNewFile: true } : {}),
      })),
      turnActivity: serializeTurnActivity(turn.turnActivity, turn.fileChanges),
      usage: {
        inputTokens: turn.usage?.inputTokens ?? 0,
        outputTokens: turn.usage?.outputTokens ?? 0,
        cacheReadTokens: turn.usage?.cacheReadTokens ?? 0,
        cacheWriteTokens: turn.usage?.cacheWriteTokens ?? 0,
        costUsd: turn.usage?.costUsd ?? 0,
        elapsedMs,
        tokensPerSecond: elapsedMs > 0 ? Math.round((turn.usage?.outputTokens ?? 0) * 1000 / elapsedMs) : 0,
        contextTokens: turnContextTokens,
        contextWindow: turnContextWindow,
        contextPercent: turnContextPercent,
      },
      cancelled,
    }
    liveUsage.set(sessionKey, result.usage)
    const persisted = turn.persistTerminal && onTurnCompleted
      ? Promise.resolve().then(() => onTurnCompleted({
        conversationId: emitTarget, modelKey: turn.modelKey, result,
        errorMessage: turnFailureMessage,
      })).then(() => { result.nativePersisted = true })
      : Promise.resolve()
    void persisted.catch(error => console.error('[chat] 保存本轮结果失败:', error instanceof Error ? error.message : error))
    if (turn.emitLifecycle !== false) {
      if (result.thinking && thinkingDurationMs > 0) {
        emit(emitTarget, turn.webContents, {
          type: 'thinking_end',
          fullThinking: result.thinking,
          durationMs: thinkingDurationMs,
        })
      }
      if (turnFailure) {
        emit(emitTarget, turn.webContents, {
          type: 'error',
          message: turnFailureMessage,
          turnId: turn.turnId,
          startedAt: turn.startedAt,
          full: result.text,
          fullThinking: result.thinking,
          thinkingDurationMs,
          fileChanges: result.fileChanges,
          turnActivity: result.turnActivity,
          usage: result.usage,
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
      } else {
        emit(emitTarget, turn.webContents, {
          type: 'done',
          turnId: turn.turnId,
          startedAt: turn.startedAt,
          continuing,
          full: result.text,
          fullThinking: result.thinking,
          thinkingDurationMs,
          fileChanges: result.fileChanges,
          turnActivity: result.turnActivity,
          interrupted: cancelled,
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
      }
    }
    if (!turn.initialResolved) {
      turn.initialResolved = true
      if (turnFailure) {
        const error = new Error(turnFailureMessage)
        if (turnFailure.code) error.code = turnFailure.code
        error.partialResult = result
        error.modelKey = turn.modelKey
        void persisted.then(() => turn.reject(error), persistenceError => {
          error.persistenceError = persistenceError
          turn.reject(error)
        })
      } else {
        void persisted.then(() => turn.resolve(result), error => {
          error.partialResult = result
          error.modelKey = turn.modelKey
          turn.reject(error)
        })
      }
    }
    if (continuing) {
      turn.awaitingQueuedTurn = true
    } else {
      turn.pendingQueuedTurns = 0
      running.delete(sessionKey)
    }
  }
}
