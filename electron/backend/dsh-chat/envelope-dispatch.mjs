import crypto from 'node:crypto'
import { normalizePermissionMode } from '../dsh-permission-map.mjs'
import { extractFileDiff, normalizeToolResult, summarizeToolInput, summarizeToolResult } from '../tool-trace.mjs'
import { recordTurnActivity } from '../turn-activity.mjs'
import {
  assistantTextStepKey,
  setAssistantStepText,
  textFromMessage,
  normalizeTokenUsage,
  usageFromAssistantEvent,
  mergeLastModelFailure,
  safeModelFailureMessage,
  endThinkingSegment,
  activeThinkingDurationMs,
  recordFileChange,
  resumeThinkingSegment,
} from './prelude.mjs'

/** Mux envelope dispatch (session events + top-level frame types). */
export function createHandleEnvelope(deps) {
  const {
    sessions,
    running,
    observedSequences,
    queueSnapshots,
    pendingQuestions,
    conversationHub,
    fanoutMuxFrame,
    registerPendingApproval,
    settleApproval,
    emitPermission,
    emitUserQuestion,
    getPermissionMode,
    emit,
    finishTurn,
    recoverSession,
  } = deps

  async function handleEnvelope(api, envelope) {
    const frame = envelope?.payload
    if (!frame) return
    if (frame.type === 'stream/error') throw new Error(frame.error?.message || 'Z 事件通道返回错误')
    if (frame.type === 'session/event' && Number.isInteger(frame.event?.seq)) {
      const previous = observedSequences.get(frame.sessionId) ?? -1
      // History replay and live frames can overlap. Sequence, not text or
      // arrival time, is the native identity for exactly-once bridge folding.
      if (frame.event.seq <= previous) return
      observedSequences.set(frame.sessionId, frame.event.seq)
    }
    fanoutMuxFrame(envelope)
    if (conversationHub) {
      void conversationHub.handleMuxEnvelope(envelope)
    }
    if (frame.type === 'session/subscribed') {
      const previous = observedSequences.get(frame.sessionId)
      if (previous === undefined) observedSequences.set(frame.sessionId, frame.lastSeq ?? -1)
      const match = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)
      if (match) {
        const turn = running.get(match[0])
        // Empty queues have no baseline frame. Discard the old generation's
        // mirror, but retain its accepted count while stitching missed turns.
        queueSnapshots.delete(match[0])
        if (turn?.recovering && !turn.command) await recoverSession(api, match[0], turn, frame.lastSeq)
      }
      return
    }
    if (frame.type === 'approval/requested') {
      const sessionMatch = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)
      const sessionKey = sessionMatch?.[0]
      const conversationId = sessionMatch?.[1]?.ownerConversationId || sessionKey
      const id = `dsh-approval-${frame.sessionId}-${frame.approvalId}`
      const permissionMode = normalizePermissionMode(
        conversationId ? await Promise.resolve(getPermissionMode(conversationId)) : 'ask',
      )
      if (!conversationId) {
        const registered = registerPendingApproval(id, {
          rpcId: envelope.rpcId,
          sessionId: frame.sessionId,
          approvalId: frame.approvalId,
          conversationId: null,
        })
        if (!registered) return
        await settleApproval(id, { action: 'deny' })
        return
      }
      const turn = running.get(sessionKey)
      emitPermission(
        turn?.eventConversationId ?? conversationId,
        turn?.webContents,
        { ...frame, rpcId: envelope.rpcId },
        permissionMode,
      )
      return
    }
    if (frame.type === 'question/requested') {
      const sessionMatch = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)
      const sessionKey = sessionMatch?.[0]
      const conversationId = sessionMatch?.[1]?.ownerConversationId || sessionKey
      const turn = running.get(sessionKey)
      emitUserQuestion(turn?.eventConversationId ?? conversationId, turn?.webContents, {
        rpcId: envelope.rpcId,
        payload: frame,
      })
      return
    }
    if (frame.type === 'question/resolved') {
      const pending = pendingQuestions.get(frame.questionRpcId)
      if (pending) {
        pendingQuestions.delete(frame.questionRpcId)
        try {
          pending.webContents?.send('user-question:resolved', {
            id: frame.questionRpcId, conversationId: pending.conversationId,
          })
        } catch {}
      }
      return
    }
    if (frame.type === 'session/queue') {
      const conversationId = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)?.[0]
      if (conversationId) {
        const items = frame.items ?? []
        queueSnapshots.set(conversationId, items)
        const turn = running.get(conversationId)
        if (turn) {
          // Native inbox mutations include removal, replacement and claiming.
          // Counting accepted sends alone leaves phantom work after deletion.
          turn.queueAuthoritative = true
          turn.pendingQueuedTurns = items.filter(item => item.placement === 'queued').length
        }
      }
      return
    }
    if (frame.type !== 'session/event') return
    const event = frame.event
    const sessionMatch = [...sessions.entries()].find(([, entry]) => entry.sessionId === frame.sessionId)
    const sessionKey = sessionMatch?.[0]
    if (!sessionKey) return
    const turn = running.get(sessionKey)
    if (!turn) return
    const ownerConversationId = sessionMatch[1]?.ownerConversationId || sessionKey
    const emitTarget = turn.eventConversationId ?? ownerConversationId
    turn.lastEventAt = event.time || Date.now()
    if (turn.command) {
      // Manual maintenance has compaction/command brackets, not chat turns.
      // The prompt RPC owns settlement; never consume a chat turn/end here.
      if (event?.type === 'compaction/summary') {
        turn.usage = normalizeTokenUsage(event.data?.usage)
        turn.compactionMeta = {
          tokensShadowed: Number(event.data?.shadowedTokenCount) || 0,
          historyItems: Array.isArray(event.data?.shadowedSeqs) ? event.data.shadowedSeqs.length : null,
        }
      }
      return
    }
    if (event?.type === 'turn/start' && turn.awaitingQueuedTurn) {
      turn.awaitingQueuedTurn = false
      // With a native queue stream, the subsequent inbox claim supplies the
      // exact count. Decrement only for old transports without queue frames.
      if (!turn.queueAuthoritative) turn.pendingQueuedTurns = Math.max(0, turn.pendingQueuedTurns - 1)
      turn.turnId = crypto.randomUUID()
      turn.text = ''
      turn.textByStep?.clear()
      turn.currentTextStepKey = null
      turn.currentStep = 1
      turn.stepBlocks = []
      turn.thinking = ''
      turn.thinkingStartedAt = null
      turn.thinkingEndedAt = null
      turn.thinkingActiveMs = 0
      turn.lastReasoningAt = null
      turn.usage = null
      turn.toolCalls = 0
      turn.toolResults = 0
      turn.toolCallsById.clear()
      turn.fileChanges.clear()
      turn.searchCycleBlocked = false
      turn.lastModelFailure = null
      turn.startedAt = event.time || Date.now()
      if (turn.emitLifecycle !== false) {
        emit(emitTarget, turn.webContents, { type: 'start', startedAt: turn.startedAt, turnId: turn.turnId, taskId: turn.taskId })
      }
      return
    }
    if (event?.type === 'step/start') {
      endThinkingSegment(turn, emit, emitTarget, event.time || Date.now())
      turn.lastModelFailure = null
      if (Number.isInteger(event.data?.step)) {
        turn.currentStep = event.data.step
      }
      return
    }
    if (event?.type === 'request/header') {
      return
    }
    if (event?.type === 'llm/retry') {
      const retry = event.data ?? {}
      if (retry.failure && typeof retry.failure === 'object') {
        const message = safeModelFailureMessage(retry.failure.message)
        turn.lastModelFailure = {
          ...(typeof retry.failure.code === 'string' ? { code: retry.failure.code } : {}),
          ...(message ? { message } : {}),
        }
      }
      const failureLabels = {
        TIMEOUT: '模型响应超时',
        TRANSPORT: '模型连接中断',
        RATE_LIMIT: '模型服务限流',
        SERVER: '模型服务端暂时不可用',
        EMPTY_RESPONSE: '模型未返回有效内容',
      }
      const failureLabel = failureLabels[retry.failure?.code] ?? '模型请求失败'
      const retryMessage = `${turn.taskId ? `子任务 ${turn.taskId}：` : ''}${failureLabel}`
      emit(emitTarget, turn.webContents, {
        type: 'retry',
        phase: 'start',
        attempt: retry.retry,
        maxAttempts: retry.maxRetries,
        delayMs: retry.delayMs,
        message: retryMessage,
      })
      return
    }
    if (event?.type === 'llm/retry-started') {
      emit(emitTarget, turn.webContents, {
        type: 'retry',
        phase: 'end',
        attempt: event.data?.retry,
      })
      return
    }
    if (event?.type === 'assistant/chunk') {
      const chunk = event.data?.chunk
      const hostStep = Number.isInteger(event.data?.step) ? event.data.step : (turn.currentStep ?? 1)
      if (chunk?.type === 'text-delta' && chunk.text) {
        endThinkingSegment(turn, emit, emitTarget, event.time || Date.now())
        const stepKey = assistantTextStepKey(turn, event)
        const stepText = turn.textByStep?.get(stepKey) ?? ''
        setAssistantStepText(turn, stepKey, stepText + chunk.text)
        if (turn.progressOnly && turn.plannerPhase !== 'text') {
          turn.plannerPhase = 'text'
          emit(emitTarget, turn.webContents, { type: 'planner_phase', phase: 'text' })
        }

        turn.stepBlocks ??= []
        const textBlockId = `step-${hostStep}-text`
        let textBlock = turn.stepBlocks.find((b) => b.id === textBlockId)
        if (!textBlock) {
          textBlock = { id: textBlockId, step: hostStep, kind: 'text', text: '' }
          turn.stepBlocks.push(textBlock)
        }
        textBlock.text += chunk.text

        // Keep the incremental chat stream as the authoritative live-text path.
        // A DSH projection can be attached while its session is still opening or
        // repairing a mux gap; suppressing these deltas merely because a view is
        // attached makes the answer appear all at once in the terminal `done`.
        if (!turn.silentText) {
          emit(emitTarget, turn.webContents, { type: 'delta', delta: chunk.text })
          emit(emitTarget, turn.webContents, {
            type: 'blocks',
            segments: turn.stepBlocks.map((b) => ({ id: b.id, kind: b.kind, text: b.text })),
          })
        }
      } else if (chunk?.type === 'reasoning-delta' && chunk.text) {
        const now = event.time || Date.now()
        const wasIdle = !turn.thinkingStartedAt || turn.thinkingEndedAt
        resumeThinkingSegment(turn, now)
        if (turn.progressOnly && turn.plannerPhase !== 'reasoning') {
          turn.plannerPhase = 'reasoning'
          emit(emitTarget, turn.webContents, { type: 'planner_phase', phase: 'reasoning' })
        }
        if (wasIdle && !turn.silentText) {
          emit(emitTarget, turn.webContents, { type: 'thinking_start' })
        }
        turn.lastReasoningAt = now
        turn.thinking += chunk.text
        const thinkingDurationMs = activeThinkingDurationMs(turn, now)

        turn.stepBlocks ??= []
        const thinkBlockId = `step-${hostStep}-thinking`
        let thinkBlock = turn.stepBlocks.find((b) => b.id === thinkBlockId)
        if (!thinkBlock) {
          thinkBlock = { id: thinkBlockId, step: hostStep, kind: 'thinking', text: '' }
          turn.stepBlocks.push(thinkBlock)
        }
        thinkBlock.text += chunk.text

        if (!turn.silentText) {
          emit(emitTarget, turn.webContents, {
            type: 'thinking_delta',
            delta: chunk.text,
            durationMs: thinkingDurationMs,
          })
          emit(emitTarget, turn.webContents, {
            type: 'blocks',
            segments: turn.stepBlocks.map((b) => ({ id: b.id, kind: b.kind, text: b.text })),
          })
        }
      }
      return
    }
    if (event?.type === 'assistant/message') {
      const message = event.data?.message
      const hostStep = Number.isInteger(event.data?.step) ? event.data.step : (turn.currentStep ?? 1)
      const finalText = textFromMessage(message)
      if (finalText) {
        const stepKey = assistantTextStepKey(turn, event)
        const streamedStepText = turn.textByStep?.get(stepKey) ?? ''
        if (finalText !== streamedStepText) {
          endThinkingSegment(turn, emit, emitTarget, event.time || Date.now())
          setAssistantStepText(turn, stepKey, finalText)
          if (turn.progressOnly && turn.plannerPhase !== 'text') {
            turn.plannerPhase = 'text'
            emit(emitTarget, turn.webContents, { type: 'planner_phase', phase: 'text' })
          }

          turn.stepBlocks ??= []
          const textBlockId = `step-${hostStep}-text`
          let textBlock = turn.stepBlocks.find((b) => b.id === textBlockId)
          if (!textBlock) {
            textBlock = { id: textBlockId, step: hostStep, kind: 'text', text: finalText }
            turn.stepBlocks.push(textBlock)
          } else {
            textBlock.text = finalText
          }

          // Some adapters expose no token chunks (sourceEventSeqs: []). Their
          // assembled assistant/message is still available before turn/end, so
          // publish it now. The full snapshot also reconciles a streamed prefix
          // without duplicating text or corrupting earlier assistant steps.
          if (!turn.silentText) {
            emit(emitTarget, turn.webContents, {
              type: 'delta',
              delta: finalText,
              full: turn.text,
            })
            emit(emitTarget, turn.webContents, {
              type: 'blocks',
              segments: turn.stepBlocks.map((b) => ({ id: b.id, kind: b.kind, text: b.text })),
            })
          }
        } else {
          turn.text = [...(turn.textByStep?.values() ?? [])].join('')
        }
      }
      const usage = usageFromAssistantEvent(event)
      if (usage) {
        turn.usage = {
          ...usage,
          inputTokens: (turn.usage?.inputTokens ?? 0) + usage.inputTokens,
          outputTokens: (turn.usage?.outputTokens ?? 0) + usage.outputTokens,
          cacheReadTokens: (turn.usage?.cacheReadTokens ?? 0) + usage.cacheReadTokens,
          cacheWriteTokens: (turn.usage?.cacheWriteTokens ?? 0) + usage.cacheWriteTokens,
          costUsd: (turn.usage?.costUsd ?? 0) + usage.costUsd,
        }
      }
      return
    }
    if (event?.type === 'tool/call') {
      endThinkingSegment(turn, emit, emitTarget, event.time || Date.now())
      turn.toolCalls += 1
      const hostTurn = Number.isInteger(event.data?.turn) ? event.data.turn : undefined
      const hostStep = Number.isInteger(event.data?.step) ? event.data.step : undefined
      const input = (() => {
        try { return JSON.parse(event.data?.arguments || '{}') } catch { return {} }
      })()
      const callId = event.data?.callId
      const toolName = event.data?.name || 'tool'
      turn.toolCallsById.set(callId, {
        toolName, input, startedAt: event.time || Date.now(), turn: hostTurn, step: hostStep,
      })
      emit(emitTarget, turn.webContents, {
        type: 'activity',
        phase: 'tools',
        message: `正在执行工具：${toolName}…`,
      })
      emit(emitTarget, turn.webContents, {
        type: 'tool',
        id: callId,
        ...(hostTurn !== undefined ? { turn: hostTurn } : {}),
        ...(hostStep !== undefined ? { step: hostStep } : {}),
        toolName,
        status: 'running',
        inputSummary: summarizeToolInput(toolName, input),
        startedAt: event.time || Date.now(),
        ...(turn.taskId ? { taskId: turn.taskId } : {}),
      })
      return
    }
    if (event?.type === 'tool/result') {
      turn.toolResults += 1
      const message = event.data?.message
      const callId = message?.source?.callId
        ?? message?.content?.find((block) => block?.type === 'tool-result')?.toolCallId
      const call = turn.toolCallsById.get(callId)
      const result = normalizeToolResult({
        content: message?.content ?? [],
        isError: Boolean(event.data?.error || message?.isError),
        details: message?.details,
        meta: event.data?.meta,
        error: event.data?.error?.message || event.data?.error?.code,
      })
      if (result.isError) {
        const resultText = result.content
          .filter((block) => block?.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n')
        if (/Repeated filesystem-search cycle detected|Filesystem search at scope .+ was disabled/i.test(resultText)) {
          turn.searchCycleBlocked = true
        }
      }
      if (call) {
        const fileDiff = extractFileDiff(call.toolName, call.input, result)
        if (fileDiff) recordFileChange(turn, fileDiff)
        recordTurnActivity(turn.turnActivity, call.toolName, call.input, fileDiff, result.isError)
        emit(emitTarget, turn.webContents, {
          type: 'tool',
          id: callId,
          ...(call.turn !== undefined ? { turn: call.turn } : {}),
          ...(call.step !== undefined ? { step: call.step } : {}),
          toolName: call.toolName,
          status: result.isError ? 'error' : 'done',
          inputSummary: summarizeToolInput(call.toolName, call.input),
          resultSummary: summarizeToolResult(result, result.isError),
          durationMs: Math.max(0, (event.time || Date.now()) - call.startedAt),
          fileDiff,
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
        turn.toolCallsById.delete(callId)
      }
      return
    }
    if (event?.type === 'tool/code-dispatch-start') {
      endThinkingSegment(turn, emit, emitTarget, event.time || Date.now())
      const data = event.data ?? {}
      const callId = data.subCallId
      if (typeof callId !== 'string' || !callId) return
      const input = data.arguments && typeof data.arguments === 'object' ? data.arguments : {}
      const toolName = typeof data.name === 'string' && data.name ? data.name : 'tool'
      const parentCall = turn.toolCallsById.get(data.parentCallId)
      const hostTurn = Number.isInteger(data.turn) ? data.turn : parentCall?.turn
      const hostStep = Number.isInteger(data.step) ? data.step : parentCall?.step
      turn.toolCalls += 1
      turn.toolCallsById.set(callId, {
        toolName,
        input,
        startedAt: event.time || Date.now(),
        parentCallId: data.parentCallId ?? null,
        turn: hostTurn,
        step: hostStep,
      })
      emit(emitTarget, turn.webContents, {
        type: 'activity',
        phase: 'tools',
        message: `正在执行工具：${toolName}（批量调用）…`,
        ...(turn.taskId ? { taskId: turn.taskId } : {}),
      })
      emit(emitTarget, turn.webContents, {
        type: 'tool',
        id: callId,
        parentCallId: data.parentCallId ?? null,
        ...(hostTurn !== undefined ? { turn: hostTurn } : {}),
        ...(hostStep !== undefined ? { step: hostStep } : {}),
        toolName,
        status: 'running',
        inputSummary: summarizeToolInput(toolName, input),
        startedAt: event.time || Date.now(),
        ...(turn.taskId ? { taskId: turn.taskId } : {}),
      })
      return
    }
    if (event?.type === 'tool/code-dispatch') {
      const data = event.data ?? {}
      const callId = data.subCallId
      if (typeof callId !== 'string' || !callId) return
      const call = turn.toolCallsById.get(callId)
      const toolName = typeof data.name === 'string' && data.name ? data.name : call?.toolName ?? 'tool'
      const input = data.arguments && typeof data.arguments === 'object' ? data.arguments : call?.input ?? {}
      const result = normalizeToolResult({
        content: Array.isArray(data.content) ? data.content : [],
        isError: Boolean(data.isError),
      })
      turn.toolResults += 1
      if (call) {
        const fileDiff = extractFileDiff(toolName, input, result)
        if (fileDiff) recordFileChange(turn, fileDiff)
        recordTurnActivity(turn.turnActivity, toolName, input, fileDiff, result.isError)
        emit(emitTarget, turn.webContents, {
          type: 'tool',
          id: callId,
          parentCallId: data.parentCallId ?? call.parentCallId ?? null,
          ...(Number.isInteger(data.turn) ? { turn: data.turn } : call.turn !== undefined ? { turn: call.turn } : {}),
          ...(Number.isInteger(data.step) ? { step: data.step } : call.step !== undefined ? { step: call.step } : {}),
          toolName,
          status: result.isError ? 'error' : 'done',
          inputSummary: summarizeToolInput(toolName, input),
          resultSummary: summarizeToolResult(result, result.isError),
          durationMs: Math.max(0, (event.time || Date.now()) - call.startedAt),
          fileDiff,
          ...(turn.taskId ? { taskId: turn.taskId } : {}),
        })
        turn.toolCallsById.delete(callId)
      }
      return
    }
    if (event?.type === 'turn/end') {
      const reason = event.data?.reason
      finishTurn(sessionKey, turn, emitTarget, {
        reason: reason?.kind,
        error: reason?.kind === 'error'
          ? mergeLastModelFailure(reason.error ?? event.data?.error, turn.lastModelFailure)
          : reason?.error ?? event.data?.error,
        continuing: turn.recoveryContinuing,
        endedAt: event.time,
      })
    }
  }

  return handleEnvelope
}
