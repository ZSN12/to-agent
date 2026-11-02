import crypto from 'node:crypto'
import { normalizePermissionMode } from '../dsh-permission-map.mjs'
import { applySkillInstructions } from '../skill-prompt.mjs'
import { nativeChatCommand } from '../native-chat-command.mjs'
import { createEmptyTurnActivity } from '../turn-activity.mjs'
import { assertBindableWorkspace, logHostUserMessageBytes, normalizeTokenUsage, rpcValue } from './prelude.mjs'

export function createDshChatSend(deps) {
  const {
    ensureReady,
    ensureSession,
    getWorkspacePath,
    getPermissionMode,
    running,
    observedSequences,
    cancellingSessions,
    queueSnapshots,
    logger,
    emit,
    ensurePermissionModeApplied,
    configureModel,
    selectedReasoningEffort,
    ensureSessionModelSelection,
    scheduleIdleHistoryReconciliation,
    getUiVerifyPolicy,
    resolveToolHooks = null,
  } = deps
  const turnAdmissionTails = new Map()
  const abortPromises = new Map()

  function abortError(signal) {
    return signal?.reason instanceof Error ? signal.reason : new Error('任务已停止')
  }

  function awaitWithAbort(value, signal) {
    const pending = Promise.resolve(value)
    if (!signal) return pending
    if (signal.aborted) return Promise.reject(abortError(signal))
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (callback, result) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        callback(result)
      }
      const onAbort = () => finish(reject, abortError(signal))
      signal.addEventListener('abort', onAbort, { once: true })
      pending.then(
        (result) => finish(resolve, result),
        (error) => finish(reject, error),
      )
      if (signal.aborted) onAbort()
    })
  }

  async function acquireTurnAdmission(sessionKey, signal) {
    const previous = turnAdmissionTails.get(sessionKey) ?? Promise.resolve()
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const tail = previous.then(() => gate)
    turnAdmissionTails.set(sessionKey, tail)
    let released = false
    const releaseAdmission = () => {
      if (released) return
      released = true
      if (turnAdmissionTails.get(sessionKey) === tail) turnAdmissionTails.delete(sessionKey)
      release()
    }
    try {
      await awaitWithAbort(previous, signal)
    } catch (error) {
      // Preserve per-session ordering for later sends even if this waiter is
      // cancelled before it acquires the admission slot.
      void previous.then(releaseAdmission, releaseAdmission)
      throw error
    }
    return releaseAdmission
  }

  async function send({
    text,
    textProvider,
    modelKey,
    conversationId,
    webContents,
    behavior = 'followUp',
    sessionKey = conversationId,
    eventConversationId = conversationId,
    cwdOverride,
    agentPreset = 'tw-default',
    skill = null,
    taskId,
    silentText = false,
    progressOnly = false,
    emitLifecycle = true,
    persistTerminal = true,
    parentSessionId,
    permissionMode: requestedPermissionMode,
    attachments = null,
    documents = null,
    outputSchema,
    rolePersona,
    roleToolCallLimit,
    signal,
    activeOnly = false,
    toolOutputMaxChars,
    orchestrationContext,
    sessionMuxVisible = true,
  }) {
    if (textProvider != null && typeof textProvider !== 'function') {
      throw new Error('消息生成器无效')
    }
    if (typeof text !== 'string' || (!text.trim() && typeof textProvider !== 'function'
      && (!Array.isArray(attachments) || attachments.length === 0)
      && (!Array.isArray(documents) || documents.length === 0))) {
      throw new Error('消息不能为空')
    }
    if (!conversationId) throw new Error('当前对话标识无效')
    if (!sessionKey) throw new Error('Z 会话标识无效')
    const throwIfAborted = () => {
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error('任务已停止')
      }
    }
    throwIfAborted()
    // Dynamic role prompts are finalized only after this send owns the DSH
    // turn slot. This lets a steering note either enter that first prompt or
    // wait behind the admission slot and steer the newly active turn.
    const command = typeof textProvider === 'function' ? null : nativeChatCommand(text)
    if (cancellingSessions.has(sessionKey)) throw new Error('当前会话正在停止，请稍后再发送')
    // 先做工作区校验再启动 Host：无效请求不该把 DSH 拉起来。
    const workspacePath = cwdOverride || (await awaitWithAbort(getWorkspacePath(conversationId), signal)) || process.cwd()
    throwIfAborted()
    assertBindableWorkspace(workspacePath)
    const api = await awaitWithAbort(ensureReady(), signal)
    throwIfAborted()
    const permissionMode = normalizePermissionMode(
      requestedPermissionMode ?? await awaitWithAbort(Promise.resolve().then(() => getPermissionMode(conversationId)), signal),
    )
    const entry = await awaitWithAbort(ensureSession(api, sessionKey, {
      cwdOverride,
      agentPreset,
      permissionMode,
      ownerConversationId: conversationId,
      parentSessionId,
      modelKey,
      sessionMuxVisible,
      signal,
    }), signal)
    throwIfAborted()
    let uiVerifyPolicy
    if (typeof getUiVerifyPolicy === 'function') {
      try {
        uiVerifyPolicy = await awaitWithAbort(getUiVerifyPolicy(conversationId, cwdOverride), signal)
      } catch (error) {
        if (signal?.aborted) throw error
        // Keep normal chat available; absence of this snapshot makes the
        // Host clear UI-verification policy and deny the optional tool.
        logger?.warn?.('无法读取 UI 自验证策略；本轮将 fail closed:', error instanceof Error ? error.message : String(error))
      }
    }

    // Queue IPC intentionally bypasses the conversation turn lock so it can
    // reach a live turn. Serialize only admission here: concurrent follow-up
    // requests must not all observe an empty running map while the first turn
    // is still configuring its model and registering its lifecycle record.
    const releaseTurnAdmission = await acquireTurnAdmission(sessionKey, signal)
    try {
      throwIfAborted()
      const activeTurn = running.get(sessionKey)
      if (cancellingSessions.has(sessionKey)) throw new Error('当前会话正在停止，请稍后再发送')
      if (activeTurn?.command || (activeTurn && command)) throw new Error('当前会话正在执行任务或压缩命令，请稍后再发送')
      if (activeOnly && !activeTurn) {
        const error = new Error('目标 Bot 本轮已经结束，纠偏未发送。')
        error.code = 'SESSION_NOT_ACTIVE'
        throw error
      }
      if (activeTurn) {
        if (entry.lastAppliedPermissionMode !== permissionMode) {
          throw new Error('当前会话正在执行，无法安全切换权限模式；请等待本轮结束后再发送，以确保新消息按所选权限运行。')
        }
        // DSH owns queue/steer delivery for a live Agent. Do not reconfigure or
        // replace its lifecycle record: turn/end must still settle the original
        // send and release the caller's per-conversation lock.
        if (behavior !== 'steer') activeTurn.pendingQueuedTurns += 1
        const submittedText = applySkillInstructions(text, skill)
        logHostUserMessageBytes(logger, {
          conversationId,
          sessionKey,
          taskId,
          delivery: behavior === 'steer' ? 'steer' : 'queue',
          inputText: text,
          submittedText,
          skill,
        })
        throwIfAborted()
        const admission = Promise.resolve().then(() => api.sessions.prompt({
          sessionId: entry.sessionId,
          mode: behavior === 'steer' ? 'steer' : 'queue',
          content: [
            { type: 'text', text: submittedText },
            ...(attachments || []).map(a => ({ type: 'image', mediaType: a.mediaType, data: a.data, name: a.name })),
            ...(documents || []).map(document => ({ type: 'document', data: document.data, name: document.name }))
          ],
          clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(uiVerifyPolicy ? { uiVerifyPolicy } : {}),
          ...(outputSchema === undefined ? {} : { outputSchema }),
          ...(rolePersona === undefined ? {} : { rolePersona }),
          ...(roleToolCallLimit === undefined ? {} : { roleToolCallLimit }),
        }))
        activeTurn.pendingPromptAdmissions.add(admission)
        try {
          rpcValue(await admission, '发送消息')
        } catch (error) {
          if (behavior !== 'steer') activeTurn.pendingQueuedTurns = Math.max(0, activeTurn.pendingQueuedTurns - 1)
          throw error
        } finally {
          activeTurn.pendingPromptAdmissions.delete(admission)
        }
        return { accepted: true, queued: behavior !== 'steer' }
      }

      if (!modelKey) throw new Error('请先选择已配置的模型')
      let toolHooks = null
      if (!command && typeof resolveToolHooks === 'function') {
        toolHooks = await awaitWithAbort(resolveToolHooks({ conversationId, workspacePath }), signal)
        throwIfAborted()
      }
      // These setup steps run before the Host has a running turn to cancel.
      // Race the waits with the turn signal and forward it to cancellable RPCs.
      const config = await awaitWithAbort(configureModel(api, modelKey, signal), signal)
      throwIfAborted()
      const explicitReasoningEffort = await awaitWithAbort(selectedReasoningEffort(config, modelKey), signal)
      throwIfAborted()
      await awaitWithAbort(ensureSessionModelSelection(api, sessionKey, entry, config, explicitReasoningEffort, signal), signal)
      throwIfAborted()
      await awaitWithAbort(ensurePermissionModeApplied(api, sessionKey, entry, permissionMode, signal), signal)
      throwIfAborted()
      let historyBaselineSeq = observedSequences.get(entry.sessionId)
      if (historyBaselineSeq === undefined && typeof api.sessions.history === 'function') {
        try {
          const history = rpcValue(await api.sessions.history({ sessionId: entry.sessionId, maxMessages: 1 }, signal), '读取 Z 会话事件基线')
          historyBaselineSeq = history.events?.reduce((max, row) => Math.max(max, row.event?.seq ?? -1), -1) ?? -1
          observedSequences.set(entry.sessionId, historyBaselineSeq)
        } catch (error) {
          // A baseline is only for the recovery fallback; its failure must not
          // block the user prompt or cause an unsafe replay from sequence zero.
          console.warn(`读取 Z 会话事件基线失败，继续正常发送：${error instanceof Error ? error.message : String(error)}`)
        }
      }

      const turnId = crypto.randomUUID()
      throwIfAborted()
      if (emitLifecycle) emit(eventConversationId, webContents, { type: 'start', startedAt: Date.now(), ...(command ? {} : { turnId }), taskId })
      let resolveTurn
      let rejectTurn
      const completed = new Promise((resolve, reject) => {
        resolveTurn = resolve
        rejectTurn = reject
      })
      running.set(sessionKey, {
          turnId,
          modelKey,
          permissionMode,
          persistTerminal: persistTerminal && sessionKey === eventConversationId && !taskId && !silentText,
          command: Boolean(command),
          sessionId: entry.sessionId,
          historyBaselineSeq,
          webContents,
          eventConversationId,
          taskId,
          workspacePath,
          toolHooks,
          toolOutputMaxChars,
          orchestrationContext,
          orchestrationAllowed: orchestrationContext?.allowed === true,
          multiAgentTaskCount: 0,
          silentText,
          progressOnly: Boolean(progressOnly && silentText),
          plannerPhase: null,
          emitLifecycle,
          text: '',
          textByStep: new Map(),
          currentTextStepKey: null,
          thinking: '',
          thinkingStartedAt: null,
          thinkingEndedAt: null,
          thinkingActiveMs: 0,
          lastReasoningAt: null,
          usage: null,
          toolCalls: 0,
          toolResults: 0,
          toolCallsById: new Map(),
          fileChanges: new Map(),
          turnActivity: createEmptyTurnActivity(),
          pendingQueuedTurns: 0,
          queueAuthoritative: false,
          lastModelFailure: null,
          pendingPromptAdmissions: new Set(),
          awaitingQueuedTurn: false,
          initialResolved: false,
          startedAt: Date.now(),
          lastEventAt: Date.now(),
          resolve: resolveTurn,
          reject: rejectTurn,
          completion: completed,
        })
      scheduleIdleHistoryReconciliation(api, sessionKey, running.get(sessionKey))
      try {
        const inputText = typeof textProvider === 'function' ? textProvider() : text
        if (typeof inputText !== 'string' || (!inputText.trim()
          && (!Array.isArray(attachments) || attachments.length === 0)
          && (!Array.isArray(documents) || documents.length === 0))) {
          throw new Error('消息不能为空')
        }
        const submittedText = command || applySkillInstructions(inputText, skill)
        if (!command) {
          logHostUserMessageBytes(logger, {
            conversationId,
            sessionKey,
            taskId,
            delivery: 'new-turn',
            inputText,
            submittedText,
            skill,
          })
        }
        const reply = rpcValue(await api.sessions.prompt({
          sessionId: entry.sessionId,
          mode: behavior === 'steer' ? 'steer' : 'queue',
          content: [
            { type: 'text', text: submittedText },
            ...(attachments || []).map(a => ({ type: 'image', mediaType: a.mediaType, data: a.data, name: a.name })),
            ...(documents || []).map(document => ({ type: 'document', data: document.data, name: document.name }))
          ],
          ...(command ? { commandOnly: true } : {}),
          clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(uiVerifyPolicy ? { uiVerifyPolicy } : {}),
          ...(outputSchema === undefined ? {} : { outputSchema }),
          ...(rolePersona === undefined ? {} : { rolePersona }),
          ...(roleToolCallLimit === undefined ? {} : { roleToolCallLimit }),
        }), '发送消息')
        if (command) {
          if (reply.command?.kind !== 'success') throw new Error('Z Host 未确认执行原生命令')
          const record = running.get(sessionKey)
          // RPC acknowledgement and mux delivery use independent transports.
          // Read the durable tail if the summary's usage has not arrived yet;
          // never borrow usage from a previous maintenance operation.
          if (record && !record.usage) {
            try {
              const history = rpcValue(await api.sessions.history({ sessionId: entry.sessionId, maxMessages: 10 }), '读取压缩用量')
              const summary = history?.events?.map(row => row.event).findLast(event =>
                event.type === 'compaction/summary' && event.time >= record.startedAt)
              if (summary) {
                record.usage = normalizeTokenUsage(summary.data?.usage)
                record.compactionMeta = {
                  tokensShadowed: Number(summary.data?.shadowedTokenCount) || 0,
                  historyItems: Array.isArray(summary.data?.shadowedSeqs) ? summary.data.shadowedSeqs.length : null,
                }
              }
            } catch { /* Successful maintenance must not fail on optional accounting. */ }
          }
          const usage = record?.usage ? { ...record.usage, elapsedMs: Date.now() - record.startedAt } : null
          running.delete(sessionKey)
          if (emitLifecycle) emit(eventConversationId, webContents, { type: 'done', full: '', continuing: false })
          resolveTurn({
            text: reply.command.text || '命令已执行。',
            thinking: '',
            usage,
            cancelled: false,
            command: true,
            compactionMeta: record?.compactionMeta ?? null,
          })
          return completed
        }
      } catch (error) {
        const turn = running.get(sessionKey)
        if (turn) {
          if (turn.reconcileTimer) clearTimeout(turn.reconcileTimer)
          running.delete(sessionKey)
          const partialResult = {
            turnId: turn.turnId,
            startedAt: turn.startedAt,
            text: turn.text,
            thinking: turn.thinking,
            fileChanges: Array.from(turn.fileChanges.values()).map((file) => ({
              path: file.path,
              ...(file.statsComplete ? { addedLines: file.addedLines, deletedLines: file.deletedLines } : {}),
              ...(file.isNewFile ? { isNewFile: true } : {}),
            })),
            usage: turn.usage,
          }
          if (error && typeof error === 'object') {
            error.partialResult ??= partialResult
            error.modelKey ??= turn.modelKey
          }
          if (emitLifecycle) emit(eventConversationId, webContents, {
            type: 'error',
            message: error.message || 'Z Host 未能接收本轮消息',
            turnId: turn.turnId,
            startedAt: turn.startedAt,
            full: turn.text,
            fullThinking: turn.thinking,
            fileChanges: partialResult.fileChanges,
            ...(turn.taskId ? { taskId: turn.taskId } : {}),
          })
        }
        if (command && !turn && emitLifecycle) {
          emit(eventConversationId, webContents, { type: 'error', message: error.message || 'Z Host 原生命令执行失败' })
        }
        throw error
      }
      return completed
    } finally {
      releaseTurnAdmission()
    }
  }

  function abort(conversationId = null) {
    const requestedTargets = conversationId ? [conversationId] : [...running.keys()]
    const targets = requestedTargets.filter((id) => running.has(id) || abortPromises.has(id))
    if (!targets.length) return Promise.resolve(false)
    const existing = targets.map((id) => abortPromises.get(id)).filter(Boolean)
    const pendingTargets = targets.filter((id) => !abortPromises.has(id))
    const operation = pendingTargets.length ? performAbort(pendingTargets) : Promise.resolve(false)
    for (const id of pendingTargets) {
      cancellingSessions.add(id)
      abortPromises.set(id, operation)
    }
    operation.then(
      () => {
        for (const id of pendingTargets) {
          if (abortPromises.get(id) === operation) abortPromises.delete(id)
          cancellingSessions.delete(id)
        }
      },
      () => {
        for (const id of pendingTargets) {
          if (abortPromises.get(id) === operation) abortPromises.delete(id)
          cancellingSessions.delete(id)
        }
      },
    )
    if (existing.length === 0) return operation
    return Promise.all([...existing, operation]).then((results) => results.some(Boolean))
  }

  async function performAbort(targets) {
    const api = await ensureReady()
    let stoppedAny = false
    for (const id of targets) {
      const turn = running.get(id)
      if (!turn) continue
      stoppedAny = true
      cancellingSessions.add(id)
      try {
        // Drain every prompt admission that passed the send-side stopping
        // guard before issuing the Host's atomic clear+cancel. Otherwise a
        // queued prompt can be admitted just after cancel and wake a new turn.
        await Promise.allSettled([...turn.pendingPromptAdmissions])
        try {
          rpcValue(await api.sessions.cancel({
            sessionId: turn.sessionId,
            clearPendingUserInput: true,
          }), '停止 Z 会话')
        }
        catch (error) { if (error.code !== 'session-not-found') throw error }
        // Keep the queue-snapshot cleanup as a compatibility fallback for
        // older Hosts that may ignore clearPendingUserInput. The bundled Host
        // already cleared the user input atomically above.
        const pending = (queueSnapshots.get(id) ?? []).filter(item => ['queued', 'steering'].includes(item.placement))
        for (const item of pending) {
          try {
            rpcValue(await api.sessions.updateQueue({ sessionId: turn.sessionId, itemId: item.id, action: { kind: 'remove' } }), '取消待处理消息')
          } catch (error) {
            // An already claimed/removed occurrence is no longer queued.
            if (!['queue-item-not-found', 'session-not-found'].includes(error.code)) throw error
          }
        }
      } finally {
        cancellingSessions.delete(id)
      }
    }
    return stoppedAny
  }

  return { send, abort }
}
