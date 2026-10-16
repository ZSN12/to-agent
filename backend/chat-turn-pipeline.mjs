import path from 'node:path'
import { appendUserChatEntry } from './message-factory.mjs'
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
import { executeVerificationRunner } from './verification-policy.mjs'
import { runBoundedSelfHealing } from './self-healing-loop.mjs'
import { prefetchChatTurnInputs } from './chat-turn-prefetch.mjs'
import { humanizeBridgeTransportError } from './cursor-tool-guidance.mjs'
import { IPC_ERROR_MESSAGE_MAX_LENGTH } from './config.mjs'

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
    const callout = result.callout
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
      fileChanges: result.fileChanges,
      turnActivity: result.turnActivity ?? undefined,
      verification: result.verification,
      callout,
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
        if (!lastMsg.callout) {
          await appState.upsertMessagesToConversation(conversationId, {
            ...lastMsg,
            interrupted: true,
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

  const executeChatRequest = async (execution, effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, conversationId, runtimeContext, permissionMode = runtimeContext.permissionMode, attachments, documents, dagPlanApprovalOverride, toolOutputMaxChars, orchestrationContext = null) => {
    return permissions.withExecution(permissionMode, webContents, async () => {
      return executeSingleAgent(effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, execution, conversationId, runtimeContext, permissionMode, attachments, documents, toolOutputMaxChars, orchestrationContext)
    }, { conversationId })
  }

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
  }) => {
    const prefs = await appPreferences.get()
    const shouldSelfHeal = prefs.selfHealingLoop === true
      && !requiresReadOnlyPlan(text)
      && !result.cancelled
      && Array.isArray(result.fileChanges)
      && result.fileChanges.length > 0
      && runtimeContext.workspacePath
      && runtimeContext.workspaceTrusted === true
      && runtimeContext.permissionMode !== 'readonly'
      && workMode !== 'plan'

    if (!shouldSelfHeal) return result

    const maxSelfHealingAttempts = Math.max(1, Math.min(3, Number(prefs.selfHealingMaxRetries) || 2))
    const { verification: lastVerification, attempts: healAttempt } = await runBoundedSelfHealing({
      maxAttempts: maxSelfHealingAttempts,
      verify: async ({ attempts }) => {
        if (webContents && !webContents.isDestroyed?.()) {
          webContents.send('chat:stream', {
            type: 'activity',
            phase: 'verification',
            message: attempts === 0 ? '正在对变更代码执行静默轻量自检…' : `第 ${attempts} 次修复完成，正在复检…`,
            conversationId,
          })
        }
        const verifyRes = await executeVerificationRunner(runtimeContext.workspacePath, { timeoutMs: 30_000 })
        if (verifyRes.executed && verifyRes.passed && webContents && !webContents.isDestroyed?.()) {
          webContents.send('chat:stream', {
            type: 'activity',
            phase: 'verification',
            message: `轻量自检通过（${verifyRes.command}，耗时 ${verifyRes.durationMs}ms）。`,
            conversationId,
          })
        }
        return verifyRes
      },
      repair: async (verifyRes, attempt) => {
        const errorDetail = verifyRes.errorSummary || verifyRes.stderr || verifyRes.stdout || '命令执行返回非零状态码'
        const healPrompt = [
          `【自动代码自检失败 - 自愈修复请求 (第 ${attempt}/${maxSelfHealingAttempts} 次尝试)】`,
          `刚刚的代码修改在运行轻量验证命令 \`${verifyRes.command}\` 时未通过，退出码为 ${verifyRes.exitCode}。`,
          `错误摘要如下：\n\`\`\`\n${errorDetail.slice(0, 1500)}\n\`\`\``,
          `请立即检查并修复上述错误，不要停止在报错状态。直接使用工具修改引发错误的代码文件。`,
        ].join('\n\n')

        if (webContents && !webContents.isDestroyed?.()) {
          webContents.send('chat:stream', {
            type: 'activity',
            phase: 'healing',
            message: `自检发现错误（退出码 ${verifyRes.exitCode}），正在启动静默自愈（${attempt}/${maxSelfHealingAttempts}）…`,
            conversationId,
          })
        }

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
          )
          if (healResult && !healResult.accepted) {
            if (healResult.text) result.text = `${result.text}\n\n---\n**[自愈修复第 ${attempt} 轮]**\n${healResult.text}`
            if (Array.isArray(healResult.fileChanges) && healResult.fileChanges.length > 0) {
              const existingPaths = new Set(result.fileChanges.map((file) => file.path))
              for (const fileChange of healResult.fileChanges) {
                if (!existingPaths.has(fileChange.path)) result.fileChanges.push(fileChange)
              }
            }
            if (healResult.usage && result.usage) {
              result.usage.inputTokens = (result.usage.inputTokens || 0) + (healResult.usage.inputTokens || 0)
              result.usage.outputTokens = (result.usage.outputTokens || 0) + (healResult.usage.outputTokens || 0)
              result.usage.costUsd = (result.usage.costUsd || 0) + (healResult.usage.costUsd || 0)
            }
          }
          return true
        } catch (healError) {
          console.warn(`[chat-turn-pipeline] 自愈修复执行轮次 ${attempt} 异常:`, healError instanceof Error ? healError.message : healError)
          return false
        }
      },
    })

    if (lastVerification && lastVerification.executed) {
      result.verification = {
        command: lastVerification.command,
        passed: lastVerification.passed,
        exitCode: lastVerification.exitCode,
        durationMs: lastVerification.durationMs,
        healed: healAttempt > 0 && lastVerification.passed,
        healAttempts: healAttempt,
      }
    }
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
    })
    logPromptPipelineAccounting(conversationId, promptStats, assembled, { scope: 'chat:send' })
    emitPromptBudget(webContents, promptBudgetSnapshotFromStats(conversationId, promptStats, assembled, 'chat:send'))

    const orchestrationPolicy = resolveOrchestrationPolicy({
      text,
      modeOverrides: [effectiveOverride, executionModeOverride],
      workMode,
      skillRequiresDag: selectedSkill?.multiAgent === true,
      preferMultiAgent: prefs.preferMultiAgent === true,
    })
    const execution = { mode: orchestrationPolicy.mode, reason: orchestrationPolicy.reason }
    const orchestrationContext = {
      text: effectivePrompt,
      rawText: text,
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
      )
    } catch (error) {
      await handleChatError(error, messageId, time, conversationId, activeKey)
    }

    if (result.accepted) return { user: userEntry, accepted: true, queued: result.queued }

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
  }
}
