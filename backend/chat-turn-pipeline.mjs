import path from 'node:path'
import { appendUserChatEntry, clockLabelZh } from './message-factory.mjs'
import { requiresReadOnlyPlan } from './orchestration-service.mjs'
import {
  assembleAndComposeUserPrompt,
  logPromptPipelineAccounting,
  promptBudgetSnapshotFromStats,
} from './assemble-and-compose-user-prompt.mjs'
import { resolveOrchestrationPolicy } from './orchestration-policy.mjs'
import { resolvePrimaryAgentPreset } from './primary-agent-preset.mjs'
import { nativeChatCommand } from './native-chat-command.mjs'
import { loadTaskweaverHooks, runTaskweaverHooks } from './taskweaver-hook-runner.mjs'
import { runAutoVerification } from './verification-policy.mjs'
import { verificationSandboxPolicy } from './sandbox-policy.mjs'
import { runBoundedSelfHealing } from './self-healing-loop.mjs'
import { prefetchChatTurnInputs } from './chat-turn-prefetch.mjs'
import { humanizeBridgeTransportError } from './cursor-tool-guidance.mjs'
import { IPC_ERROR_MESSAGE_MAX_LENGTH } from './config.mjs'
import { appendChatErrorDiagnostic } from './chat-error-diagnostics.mjs'
import { compactToolOutput } from './context-compactor.mjs'
import { subagentOutputsFromTasks } from './orchestration/subagent-output.mjs'

/**
 * First line of every repair prompt the verification loop sends. The renderer
 * matches it to label these turns as automatic rather than as the user's words.
 */
export const AUTO_VERIFICATION_PROMPT_MARKER = '[TaskWeaver 自动验证]'

/** Durable verification evidence for the reply; only runner records count as proof. */
export function verificationEvidence(verification, healAttempts = 0) {
  if (!verification) return undefined
  const commands = (verification.commands ?? []).map((item) => ({
    command: item.command,
    status: item.status,
    source: 'workspace-runner',
    exitCode: item.exitCode,
    background: false,
    timedOut: item.timedOut === true,
    sandboxDenied: item.sandboxDenied === true,
  }))
  if (!verification.executed) {
    return {
      status: verification.cancelled ? 'incomplete' : 'not_run',
      executed: false,
      passed: false,
      command: verification.command ?? null,
      exitCode: null,
      source: 'workspace-runner',
      reason: verification.errorSummary || '未检测到可执行的验证命令。',
      commands,
      healAttempts,
    }
  }
  const status = verification.passed
    ? 'passed'
    : verification.repairable === false ? 'incomplete' : 'failed'
  return {
    status,
    executed: true,
    passed: verification.passed === true,
    command: verification.command,
    exitCode: verification.exitCode,
    durationMs: verification.durationMs,
    timedOut: verification.timedOut === true,
    source: 'workspace-runner',
    ...(status !== 'passed' && verification.errorSummary ? { reason: verification.errorSummary } : {}),
    commands,
    healAttempts,
  }
}

function hasFailureCallout(message) {
  return Boolean(message?.errorCode) || /^执行失败/.test(String(message?.callout ?? '').trim())
}

/**
 * 聊天回合流水线（阶段 5.3）：send 前校验、执行、错误与自愈。
 */
export function createChatTurnPipeline(deps) {
  const {
    appState,
    profileStore,
    modelService,
    usageStore,
    resolveModelKeyForChat,
    appPreferences,
    createGitCheckpoint,
    userDataPath,
    chat,
    contextInjectionLedger = null,
    orchestration,
    permissions,
    skills,
    persistNativeTurn,
    workspaceHooksTrusted,
    sandboxContextLineForContext,
  } = deps

  const getModelContextWindow = async (modelKey) => {
    if (!modelKey || typeof modelService?.getModelContextWindow !== 'function') return null
    try { return await modelService.getModelContextWindow(modelKey) } catch { return null }
  }

  const createAssistantMessage = async (result, messageId, time, activeKey, execution, conversationId) => {
    const subTaskCount = typeof result.multiAgentTaskCount === 'number'
      ? result.multiAgentTaskCount
      : null
    const statusNote = result.callout
      ?? (subTaskCount != null
        ? `由 TaskWeaver 拆分并执行 ${subTaskCount} 个子任务`
        : undefined)
    const agentEntry = {
      id: result.turnId ? `z-turn-${result.turnId}` : `${messageId}-a`,
      author: 'orchestrator',
      name: 'TaskWeaver',
      time,
      timestamp: Date.now(),
      text: result.cancelled ? (result.text || '任务已停止。') : (result.text || '（模型未返回文本）'),
      thinking: result.thinking,
      thinkingDurationMs: result.thinkingDurationMs,
      contentBlocks: Array.isArray(result.contentBlocks) ? result.contentBlocks : undefined,
      modelKey: activeKey,
      usage: result.usage,
      ...(Array.isArray(result.subagentOutputs) && result.subagentOutputs.length > 0
        ? { subagentOutputs: result.subagentOutputs }
        : {}),
      fileChanges: result.fileChanges,
      turnActivity: result.turnActivity ?? undefined,
      verification: result.verification,
      statusNote,
      interrupted: Boolean(result.cancelled),
    }
    await appState.upsertMessagesToConversation(conversationId, agentEntry)
    const usage = result.usage
    if (!result.nativePersisted && usage && typeof usage === 'object') {
      try {
        await usageStore.record({
          id: `${messageId}-usage`,
          timestamp: agentEntry.timestamp,
          modelKey: activeKey || 'unknown',
          modelName: activeKey?.split('/')?.pop() || activeKey || 'unknown',
          conversationId,
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          cacheReadTokens: usage.cacheReadTokens || 0,
          cacheWriteTokens: usage.cacheWriteTokens || 0,
          reasoningTokens: usage.reasoningTokens || 0,
          costUsd: usage.costUsd || 0,
          elapsedMs: usage.elapsedMs || 0,
        })
      } catch (error) {
        console.warn('[chat-turn-pipeline] 记录本轮模型用量失败:', error instanceof Error ? error.message : error)
      }
    }
    return agentEntry
  }

  const handleChatError = async (error, messageId, time, conversationId, modelKey = null) => {
    await appendChatErrorDiagnostic({ userDataPath, error, scope: 'chat-turn' })
    if (error?.runContinues) throw error
    if (error?.partialResult?.turnId) {
      if (!error.partialResult.nativePersisted) {
        try {
          await persistNativeTurn({
            conversationId,
            modelKey: error.modelKey,
            result: error.partialResult,
            errorMessage: error.message,
            errorCode: error.code ?? null,
          })
        } catch (persistenceError) {
          error.persistenceError = persistenceError
          console.error('[chat-turn-pipeline] 保存失败轮次失败:', persistenceError instanceof Error ? persistenceError.message : persistenceError)
        }
      }
      throw error
    }
    const attachmentReason = error?.code === 'attachment-error' ? error?.details?.reason : null
    const imageErrorMessages = {
      MODEL_DOES_NOT_SUPPORT_IMAGES: '当前模型不支持图片输入，请切换到支持视觉的模型或移除图片。',
      TOO_MANY_IMAGES: '图片数量超过限制，请移除部分图片后重试。',
      IMAGES_TOO_LARGE: '图片总大小超过限制，请移除部分图片后重试。',
      IMAGE_TOO_LARGE: '单张图片超过大小限制。',
      IMAGE_TOO_MANY_PIXELS: '图片分辨率超过限制。',
      IMAGE_DIMENSION_TOO_LARGE: '图片尺寸超过限制。',
      UNSUPPORTED_IMAGE_TYPE: '图片格式不受支持，仅支持 PNG、JPEG、WebP 和 GIF。',
      IMAGE_TYPE_MISMATCH: '图片格式与文件内容不匹配，请重新选择图片。',
      INVALID_IMAGE: '图片数据无效或文件已损坏。',
    }
    let message = imageErrorMessages[attachmentReason]
      ?? (error instanceof Error ? error.message : String(error))
    const cause = error && typeof error === 'object' ? error.cause : null
    if (cause && typeof cause === 'object') {
      const code = typeof cause.code === 'string' ? cause.code : null
      const detail = typeof cause.message === 'string' ? cause.message : null
      const diagnostic = code ?? detail
      if (diagnostic && !message.includes(diagnostic)) message = `${message}（底层原因：${diagnostic}）`
    }
    message = humanizeBridgeTransportError(message, modelKey ?? error?.modelKey)

    try {
      const currentState = await appState.getConversationState(conversationId)
      const messages = currentState?.messages || []
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && lastMsg.author === 'orchestrator' && (lastMsg.callout || lastMsg.interrupted || lastMsg.text?.trim() || lastMsg.id.startsWith('z-turn-'))) {
        if (!hasFailureCallout(lastMsg)) {
          await appState.upsertMessagesToConversation(conversationId, {
            ...lastMsg,
            interrupted: true,
            statusNote: undefined,
            ...(error?.code ? { errorCode: error.code } : {}),
            callout: `执行失败：${message.slice(0, IPC_ERROR_MESSAGE_MAX_LENGTH)}（已保留此前输出）`,
          })
        }
        throw error
      }
    } catch (checkErr) {
      if (checkErr === error) throw error
      console.warn('[chat-turn-pipeline] 检查已有会话消息失败，继续兜底错误处理:', checkErr)
    }

    await appState.appendMessagesToConversation(conversationId, {
      id: `${messageId}-error`,
      author: 'orchestrator',
      name: 'TaskWeaver',
      time,
      timestamp: Date.now(),
      text: `${message === '任务已停止' ? '执行已停止' : '执行失败'}：${message.slice(0, IPC_ERROR_MESSAGE_MAX_LENGTH)}`,
    })
    throw error
  }

  const executeSingleAgent = async (effectivePrompt, primaryAgentPreset, activeKey, _selectedSkill, webContents, _execution, conversationId, runtimeContext, permissionMode, attachments, documents, toolOutputMaxChars, orchestrationContext = null) => {
    return chat.send({
      text: effectivePrompt,
      modelKey: activeKey,
      conversationId,
      cwdOverride: runtimeContext.workspacePath,
      webContents,
      agentPreset: primaryAgentPreset,
      permissionMode,
      skill: null,
      attachments,
      documents,
      toolOutputMaxChars,
      orchestrationContext,
    })
  }

  const executeChatRequest = async (execution, effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, conversationId, runtimeContext, permissionMode = runtimeContext.permissionMode, attachments, documents, dagPlanApprovalOverride, toolOutputMaxChars, orchestrationContext = null, toolHooks = null) => {
    return permissions.withExecution(permissionMode, webContents, async () => {
      return executeSingleAgent(effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, execution, conversationId, runtimeContext, permissionMode, attachments, documents, toolOutputMaxChars, orchestrationContext)
    }, {
      conversationId,
      workspacePath: runtimeContext.workspacePath,
      workspaceTrusted: runtimeContext.workspaceTrusted === true,
      toolHooks,
    })
  }

  /** Abort controllers for automatic verification that is running, by conversation. */
  const verificationAborts = new Map()

  /** Stop automatic verification for a conversation; returns whether one was running. */
  const abortVerification = (conversationId) => {
    const controller = verificationAborts.get(conversationId)
    if (!controller) return false
    controller.abort(new Error('验证已取消'))
    return true
  }

  const sendVerificationActivity = (webContents, conversationId, phase, message) => {
    if (!webContents || webContents.isDestroyed?.()) return
    webContents.send('chat:stream', { type: 'activity', phase, message, conversationId })
  }

  /**
   * Verify code changes with the workspace's own check/test commands and let the
   * model repair real failures a bounded number of times. Runs by default; the
   * commands use the same OS sandbox as the Agent's bash tool.
   */
  const runSelfHealingLoop = async ({
    webContents,
    text,
    workMode,
    activeKey,
    selectedSkill,
    execution,
    conversationId,
    runtimeContext,
    result,
    toolOutputMaxChars,
    modelContextWindow = null,
    toolHooks,
  }) => {
    const prefs = await appPreferences.get()
    const shouldSelfHeal = prefs.selfHealingLoop === true
      && !(Number.isInteger(result.multiAgentTaskCount) && result.multiAgentTaskCount > 0)
      && !requiresReadOnlyPlan(text)
      && !result.cancelled
      && Array.isArray(result.fileChanges)
      && result.fileChanges.length > 0
      && runtimeContext.workspacePath
      && runtimeContext.workspaceTrusted === true
      && runtimeContext.permissionMode !== 'readonly'
      && workMode !== 'plan'

    if (!shouldSelfHeal) return result

    const sandboxPolicy = verificationSandboxPolicy(runtimeContext)
    const maxSelfHealingAttempts = Math.max(1, Math.min(3, Number(prefs.selfHealingMaxRetries) || 2))
    const abortController = new AbortController()
    verificationAborts.set(conversationId, abortController)
    let healAttempt = 0
    let lastVerification = null
    let lastRepairTurn = null
    try {
      const outcome = await runBoundedSelfHealing({
        maxAttempts: maxSelfHealingAttempts,
        verify: async ({ attempts }) => {
          sendVerificationActivity(webContents, conversationId, 'verification', attempts === 0
            ? '正在运行工作区检查与测试，确认本轮修改…'
            : `第 ${attempts} 轮修复完成，正在重新验证…`)
          const verifyRes = await runAutoVerification(runtimeContext.workspacePath, {
            sandboxPolicy,
            signal: abortController.signal,
          })
          if (verifyRes.executed && verifyRes.passed) {
            sendVerificationActivity(webContents, conversationId, 'verification',
              `验证通过（${verifyRes.commands.map((item) => item.command).join('、')}，耗时 ${verifyRes.durationMs}ms）。`)
          }
          return verifyRes
        },
        repair: async (verifyRes, attempt) => {
          if (abortController.signal.aborted) return false
          const errorDetail = verifyRes.errorSummary || verifyRes.stderr || verifyRes.stdout || '命令执行返回非零状态码'
          const compacted = compactToolOutput(errorDetail, {
            contextWindow: modelContextWindow,
            toolName: verifyRes.command || 'verification',
          })
          const healPrompt = [
            `${AUTO_VERIFICATION_PROMPT_MARKER} 第 ${attempt}/${maxSelfHealingAttempts} 轮修复`,
            `本轮修改后，TaskWeaver 在工作区运行 \`${verifyRes.command}\`，退出码 ${verifyRes.exitCode}，未通过。`,
            `错误摘要：\n\`\`\`\n${compacted.text}\n\`\`\``,
            [
              '请修复导致失败的代码，然后结束本轮；TaskWeaver 会自动重新验证。',
              '- 如果失败在本轮修改之前就已存在、与本轮修改无关，不要改动无关代码，直接说明。',
              '- 不要通过删除或跳过测试、放宽断言、关闭检查来让验证通过。',
            ].join('\n'),
          ].join('\n\n')

          sendVerificationActivity(webContents, conversationId, 'healing',
            `验证未通过（${verifyRes.command}，退出码 ${verifyRes.exitCode}），正在自动修复（${attempt}/${maxSelfHealingAttempts}）…`)
          healAttempt = attempt

          try {
            const healResult = await executeChatRequest(
              execution,
              healPrompt,
              resolvePrimaryAgentPreset(),
              activeKey,
              selectedSkill,
              webContents,
              conversationId,
              runtimeContext,
              runtimeContext.permissionMode,
              undefined,
              undefined,
              undefined,
              toolOutputMaxChars,
              null,
              toolHooks,
            )
            // Each repair is its own native turn, persisted and shown with its
            // own text, usage and file changes; keep the original turn intact.
            if (healResult?.turnId && !healResult.accepted) lastRepairTurn = healResult
            return !healResult?.cancelled && !abortController.signal.aborted
          } catch (healError) {
            console.warn(`[chat-turn-pipeline] 自动修复第 ${attempt} 轮异常:`, healError instanceof Error ? healError.message : healError)
            return false
          }
        },
      })
      lastVerification = outcome.verification
    } finally {
      if (verificationAborts.get(conversationId) === abortController) verificationAborts.delete(conversationId)
    }

    const evidence = verificationEvidence(lastVerification, healAttempt)
    if (!lastRepairTurn) {
      result.verification = evidence
      return result
    }
    // Report the outcome on the last turn that changed code. Native persistence
    // writes the same id; upsert merges, so either write may land first.
    const timestamp = lastRepairTurn.startedAt ?? Date.now()
    await appState.upsertMessagesToConversation(conversationId, {
      id: `z-turn-${lastRepairTurn.turnId}`,
      author: 'orchestrator',
      name: 'TaskWeaver',
      time: clockLabelZh(timestamp),
      timestamp,
      text: lastRepairTurn.text || '',
      modelKey: activeKey,
      verification: evidence,
    })
    return result
  }

  /** steer / followUp：只追加用户消息并投递到 DSH 队列，不走编排与 prompt 组装。 */
  const runQueuedBehavior = async ({
    webContents,
    text,
    conversationId,
    runtimeContext,
    behavior,
  }) => {
    if (!text || typeof text !== 'string') throw new Error('内容不能为空')
    if (behavior !== 'steer' && behavior !== 'followUp') {
      throw new Error(`无效的投递行为: ${String(behavior)}`)
    }
    const { modelKey: activeKey } = await validateAndResolveModel(text, null, runtimeContext)
    await appendUserChatEntry(text, conversationId, { appState, behavior })
    const permissionMode = requiresReadOnlyPlan(text) ? 'readonly' : runtimeContext.permissionMode
    return permissions.withExecution(permissionMode, webContents, () => chat.send({
      text,
      modelKey: activeKey,
      conversationId,
      cwdOverride: runtimeContext.workspacePath,
      webContents,
      permissionMode,
      behavior,
    }), { conversationId })
  }

  const runTaskMessage = async ({
    webContents,
    taskId,
    text,
    conversationId,
    runtimeContext,
  }) => {
    if (!text || typeof text !== 'string') throw new Error('消息不能为空')
    const state = appState.getConversationState
      ? await appState.getConversationState(conversationId)
      : await appState.getState()
    if (!state) throw new Error('目标会话不存在')
    const task = state.tasks?.find((item) => item.id === taskId)
    const taskModelKey = task?.modelKey ?? state.modelKey ?? null
    const [prefs, modelContextWindow] = await Promise.all([
      appPreferences.get(),
      getModelContextWindow(taskModelKey),
    ])
    const {
      effectivePrompt,
      promptStats,
      assembled,
    } = await assembleAndComposeUserPrompt({
      text,
      workMode: 'code',
      modelContextWindow,
      workspacePath: runtimeContext.workspacePath,
      sandboxContextLine: sandboxContextLineForContext(runtimeContext),
      modelKey: taskModelKey,
      selectedSkill: null,
      conversationMessages: state.messages ?? [],
      preferences: prefs,
      repoMapCacheDirectory: userDataPath ? path.join(userDataPath, 'taskweaver', 'repo-map-cache') : null,
    })
    logPromptPipelineAccounting(conversationId, promptStats, assembled, { scope: 'tasks:sendMessage' })
    emitPromptBudget(webContents, promptBudgetSnapshotFromStats(conversationId, promptStats, assembled, 'tasks:sendMessage'))
    return permissions.withExecution(runtimeContext.permissionMode, webContents, () => orchestration.sendTaskMessage({
      taskId,
      text: effectivePrompt,
      conversationId,
      webContents,
      workspacePath: runtimeContext.workspacePath,
    }), { conversationId })
  }

  const runTurn = async ({
    webContents,
    text,
    modelKey,
    skillName,
    executionModeOverride,
    dagPlanApprovalOverride,
    workMode = 'code',
    conversationId,
    runtimeContext,
    attachments,
    documents,
  }) => {
    const { modelKey: activeKey } = await validateAndResolveModel(text, modelKey, runtimeContext, attachments, documents)
    const command = nativeChatCommand(text)
    if (command) {
      contextInjectionLedger?.invalidateConversation?.(conversationId)
      const { messageId, time, userEntry } = await createUserMessage(command, conversationId)
      let result
      try {
        result = await chat.send({
          text: command,
          modelKey: activeKey,
          conversationId,
          cwdOverride: runtimeContext.workspacePath,
          webContents,
          agentPreset: resolvePrimaryAgentPreset(),
          attachments,
          documents,
        })
      } catch (error) {
        await handleChatError(error, messageId, time, conversationId, activeKey)
      }
      const assistant = await createAssistantMessage(result, messageId, time, activeKey,
        { mode: 'single-agent' }, conversationId)
      return { user: userEntry, assistant }
    }
    await tryAutoSnapshot(runtimeContext)

    const {
      selectedSkill,
      preferences: prefs,
      modelContextWindow,
      conversationState,
    } = await prefetchChatTurnInputs({
      skillName,
      workspacePath: runtimeContext.workspacePath,
      workspaceTrusted: runtimeContext.workspaceTrusted,
      activeKey,
      conversationId,
      skills,
      appPreferences,
      modelService,
      appState,
    })
    const {
      effectiveOverride,
      effectivePrompt,
      fullPrompt,
      promptContextLayers,
      sentPromptLayerIds,
      contextInjectionReceipt,
      promptStats,
      assembled,
      dynamicBudget,
    } = await assembleAndComposeUserPrompt({
      text,
      workMode,
      modelContextWindow,
      workspacePath: runtimeContext.workspacePath,
      sandboxContextLine: sandboxContextLineForContext(runtimeContext),
      modelKey: activeKey,
      selectedSkill,
      conversationMessages: conversationState?.messages ?? [],
      preferences: prefs,
      repoMapCacheDirectory: userDataPath ? path.join(userDataPath, 'taskweaver', 'repo-map-cache') : null,
      workspaceTrusted: runtimeContext.workspaceTrusted === true,
      contextInjectionLedger,
      conversationId,
      hostSessionId: chat.getSessionId?.(conversationId) ?? null,
    })
    logPromptPipelineAccounting(conversationId, promptStats, assembled, { scope: 'chat:send' })
    emitPromptBudget(webContents, promptBudgetSnapshotFromStats(conversationId, promptStats, assembled, 'chat:send'))

    const orchestrationPolicy = resolveOrchestrationPolicy({
      modeOverrides: [effectiveOverride, executionModeOverride],
      workMode,
      skillRequiresDag: selectedSkill?.multiAgent === true,
      preferMultiAgent: prefs.preferMultiAgent === true,
    })
    const execution = { mode: orchestrationPolicy.mode, reason: orchestrationPolicy.reason }
    const orchestrationContext = {
      text: fullPrompt,
      rawText: text,
      promptContextLayers,
      primaryModelKey: activeKey,
      workspacePath: runtimeContext.workspacePath,
      workspaceTrusted: runtimeContext.workspaceTrusted === true,
      permissionMode: requiresReadOnlyPlan(text) ? 'readonly' : runtimeContext.permissionMode,
      skill: selectedSkill,
      skillAlreadyApplied: true,
      attachments,
      documents,
      dagPlanApprovalOverride,
      allowed: orchestrationPolicy.allowed,
    }
    const routedPrompt = orchestrationPolicy.required
      ? `${effectivePrompt}\n\n【TaskWeaver 执行模式】用户已要求使用多 Agent DAG。现在调用 orchestrate 工具，将完整目标和约束交给 DAG 规划器；不要通过 subagent 工具自行拆分。`
      : !orchestrationPolicy.allowed
        ? `${effectivePrompt}\n\n【TaskWeaver 执行模式】本回合已限制为单 Agent/计划模式，不得调用 orchestrate。`
        : effectivePrompt

    const hooksWorkspaceTrusted = runtimeContext.workspaceTrusted === true
      && await workspaceHooksTrusted(runtimeContext.workspacePath, true)
    const turnHooks = await loadTaskweaverHooks(userDataPath, runtimeContext.workspacePath, {
      workspaceTrusted: hooksWorkspaceTrusted,
    })
    await runTaskweaverHooks('beforeTurn', turnHooks, {
      workspacePath: runtimeContext.workspacePath,
      conversationId,
      text: effectivePrompt,
      executionMode: execution.mode,
    })

    const { messageId, time, userEntry } = await createUserMessage(text, conversationId)

    let result
    try {
      const permissionMode = requiresReadOnlyPlan(text) ? 'readonly' : runtimeContext.permissionMode
      if (orchestrationPolicy.direct) {
        const outcome = await orchestration.planAndExecute({
          text: fullPrompt,
          rawText: text,
          contextLayers: promptContextLayers,
          primaryModelKey: activeKey,
          conversationId,
          webContents,
          skill: selectedSkill,
          skillAlreadyApplied: true,
          workspacePath: runtimeContext.workspacePath,
          permissionMode,
          workspaceTrusted: runtimeContext.workspaceTrusted === true,
          attachments,
          documents,
          dagPlanApprovalOverride,
        })
        result = {
          ...(outcome?.assistant ?? {}),
          multiAgentTaskCount: Array.isArray(outcome?.tasks) ? outcome.tasks.length : 0,
          subagentOutputs: subagentOutputsFromTasks(outcome?.tasks, outcome?.runId),
        }
      } else {
        result = await executeChatRequest(
          execution,
          routedPrompt,
          resolvePrimaryAgentPreset(),
          activeKey,
          selectedSkill,
          webContents,
          conversationId,
          runtimeContext,
          permissionMode,
          attachments,
          documents,
          dagPlanApprovalOverride,
          dynamicBudget.toolOutputMaxChars,
          orchestrationContext,
          turnHooks,
        )
      }
    } catch (error) {
      await handleChatError(error, messageId, time, conversationId, activeKey)
    }

    if (result.accepted) return { user: userEntry, accepted: true, queued: result.queued }
    if (!orchestrationPolicy.direct && !result.cancelled) {
      contextInjectionLedger?.commit?.(
        contextInjectionReceipt,
        sentPromptLayerIds,
        chat.getSessionId?.(conversationId) ?? null,
      )
    }

    result = await runSelfHealingLoop({
      webContents,
      text,
      workMode,
      activeKey,
      selectedSkill,
      execution,
      conversationId,
      runtimeContext,
      result,
      toolOutputMaxChars: dynamicBudget.toolOutputMaxChars,
      modelContextWindow,
      toolHooks: turnHooks,
    })

    const agentEntry = await createAssistantMessage(result, messageId, time, activeKey, execution, conversationId)
    await runTaskweaverHooks('afterTurn', turnHooks, {
      workspacePath: runtimeContext.workspacePath,
      conversationId,
      text: effectivePrompt,
      executionMode: execution.mode,
    })
    return { user: userEntry, assistant: agentEntry }
  }

  const createUserMessage = (text, conversationId) => appendUserChatEntry(text, conversationId, { appState })

  const validateAndResolveModel = async (text, modelKey, runtimeContext = null, attachments = null, documents = null) => {
    const hasAttachments = (Array.isArray(attachments) && attachments.length > 0)
      || (Array.isArray(documents) && documents.length > 0)
    if ((!text || typeof text !== 'string') && !hasAttachments) throw new Error('消息不能为空')
    return resolveModelKeyForChat({
      requestedKey: modelKey ?? runtimeContext?.modelKey,
      profileStore,
    })
  }

  const emitPromptBudget = (webContents, snapshot) => {
    if (!webContents || webContents.isDestroyed?.() || typeof webContents.send !== 'function') return
    webContents.send('chat:promptBudget', snapshot)
  }

  const tryAutoSnapshot = async (context) => {
    const prefs = await appPreferences.get()
    if (prefs.autoSnapshotOnTurn && context.workspacePath) {
      try {
        await createGitCheckpoint(context.workspacePath, {
          conversationId: context.conversationId,
          summary: '本轮对话开始前（自动）',
          userDataPath,
        })
      } catch (err) {
        console.error('自动创建 Git 快照失败:', err)
      }
    }
  }

  return {
    createUserMessage,
    createAssistantMessage,
    validateAndResolveModel,
    tryAutoSnapshot,
    emitPromptBudget,
    handleChatError,
    runQueuedBehavior,
    runTaskMessage,
    runTurn,
    abortVerification,
  }
}
