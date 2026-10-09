import { appendUserChatEntry } from './message-factory.mjs'
import { PlannerFallbackError, requiresReadOnlyPlan } from './orchestration-service.mjs'
import {
  assembleAndComposeUserPrompt,
  logPromptPipelineAccounting,
  promptBudgetSnapshotFromStats,
} from './assemble-and-compose-user-prompt.mjs'
import { decideExecutionMode, explicitlyDisablesMultiAgent, resolveExecutionMode } from './orchestration-policy.mjs'
import { evaluateOrchestrationGate } from './orchestration-gate.mjs'
import { resolvePrimaryAgentPreset } from './primary-agent-preset.mjs'
import { nativeChatCommand } from './native-chat-command.mjs'
import { loadTaskweaverHooks, runTaskweaverHooks } from './taskweaver-hook-runner.mjs'
import { executeVerificationRunner } from './verification-policy.mjs'
import { humanizeBridgeTransportError } from './cursor-tool-guidance.mjs'
import { IPC_PLANNER_FALLBACK_HINT_MAX_LENGTH, IPC_ERROR_MESSAGE_MAX_LENGTH } from './config.mjs'

/**
 * 聊天回合流水线（阶段 5.3）：send 前校验、执行、错误与自愈。
 */
export function createChatTurnPipeline(deps) {
  const {
    appState,
    profileStore,
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

  const createAssistantMessage = async (result, messageId, time, activeKey, execution, conversationId) => {
    const subTaskCount = typeof result.multiAgentTaskCount === 'number'
      ? result.multiAgentTaskCount
      : (execution.mode === 'multi-agent'
        ? (await appState.getConversationState(conversationId)).tasks.length
        : null)
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
          })
        } catch (persistenceError) {
          error.persistenceError = persistenceError
          console.error('[chat-turn-pipeline] 保存失败轮次失败:', persistenceError instanceof Error ? persistenceError.message : persistenceError)
        }
      }
      throw error
    }
    let message = error instanceof Error ? error.message : String(error)
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

  const executeMultiAgent = async (effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, execution, conversationId, runtimeContext, permissionMode, attachments) => {
    try {
      const outcome = await orchestration.planAndExecute({
        text: effectivePrompt,
        primaryModelKey: activeKey,
        conversationId,
        workspacePath: runtimeContext.workspacePath,
        permissionMode,
        webContents,
        skill: selectedSkill,
        skillAlreadyApplied: true,
        attachments,
      })
      return {
        ...outcome.assistant,
        multiAgentTaskCount: Array.isArray(outcome.tasks) ? outcome.tasks.length : 0,
      }
    } catch (error) {
      if (error instanceof PlannerFallbackError || error?.code === 'PLANNER_FALLBACK') {
        const hint = error instanceof Error ? error.message : String(error)
        const result = await chat.send({
          text: effectivePrompt,
          modelKey: activeKey,
          conversationId,
          cwdOverride: runtimeContext.workspacePath,
          webContents,
          agentPreset: primaryAgentPreset,
          permissionMode,
          skill: null,
          attachments,
        })
        return {
          ...result,
          callout: `多 Agent 规划失败，已自动降级为单 Agent：${hint.slice(0, IPC_PLANNER_FALLBACK_HINT_MAX_LENGTH)}`,
        }
      }
      throw error
    }
  }

  const executeSingleAgent = async (effectivePrompt, primaryAgentPreset, activeKey, _selectedSkill, webContents, _execution, conversationId, runtimeContext, permissionMode, attachments) => {
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
    })
  }

  const executeChatRequest = async (execution, effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, conversationId, runtimeContext, permissionMode = runtimeContext.permissionMode, attachments) => {
    return permissions.withExecution(permissionMode, webContents, async () => {
      if (execution.mode === 'multi-agent') {
        return executeMultiAgent(effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, execution, conversationId, runtimeContext, permissionMode, attachments)
      }
      return executeSingleAgent(effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, webContents, execution, conversationId, runtimeContext, permissionMode, attachments)
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
    let healAttempt = 0
    let lastVerification = null

    while (healAttempt < maxSelfHealingAttempts) {
      if (webContents && !webContents.isDestroyed?.()) {
        webContents.send('chat:stream', {
          type: 'activity',
          phase: 'verification',
          message: healAttempt === 0
            ? '正在对变更代码执行静默轻量自检…'
            : `第 ${healAttempt} 次修复完成，正在复检…`,
          conversationId,
        })
      }

      const verifyRes = await executeVerificationRunner(runtimeContext.workspacePath, {
        timeoutMs: 30_000,
      })
      lastVerification = verifyRes

      if (!verifyRes.executed || verifyRes.passed) {
        if (verifyRes.executed && verifyRes.passed && webContents && !webContents.isDestroyed?.()) {
          webContents.send('chat:stream', {
            type: 'activity',
            phase: 'verification',
            message: `轻量自检通过（${verifyRes.command}，耗时 ${verifyRes.durationMs}ms）。`,
            conversationId,
          })
        }
        break
      }

      healAttempt += 1
      const errorDetail = verifyRes.errorSummary || verifyRes.stderr || verifyRes.stdout || '命令执行返回非零状态码'
      const healPrompt = [
        `【自动代码自检失败 - 自愈修复请求 (第 ${healAttempt}/${maxSelfHealingAttempts} 次尝试)】`,
        `刚刚的代码修改在运行轻量验证命令 \`${verifyRes.command}\` 时未通过，退出码为 ${verifyRes.exitCode}。`,
        `错误摘要如下：\n\`\`\`\n${errorDetail.slice(0, 1500)}\n\`\`\``,
        `请立即检查并修复上述错误，不要停止在报错状态。直接使用工具修改引发错误的代码文件。`,
      ].join('\n\n')

      if (webContents && !webContents.isDestroyed?.()) {
        webContents.send('chat:stream', {
          type: 'activity',
          phase: 'healing',
          message: `自检发现错误（退出码 ${verifyRes.exitCode}），正在启动静默自愈（${healAttempt}/${maxSelfHealingAttempts}）…`,
          conversationId,
        })
      }

      try {
        const healResult = await executeChatRequest(
          execution,
          healPrompt,
          resolvePrimaryAgentPreset(healPrompt, workMode, activeKey),
          activeKey,
          selectedSkill,
          webContents,
          conversationId,
          runtimeContext,
          runtimeContext.permissionMode,
        )

        if (healResult && !healResult.accepted) {
          if (healResult.text) {
            result.text = `${result.text}\n\n---\n**[自愈修复第 ${healAttempt} 轮]**\n${healResult.text}`
          }
          if (Array.isArray(healResult.fileChanges) && healResult.fileChanges.length > 0) {
            const existingPaths = new Set(result.fileChanges.map((f) => f.path))
            for (const fc of healResult.fileChanges) {
              if (!existingPaths.has(fc.path)) {
                result.fileChanges.push(fc)
              }
            }
          }
          if (healResult.usage && result.usage) {
            result.usage.inputTokens = (result.usage.inputTokens || 0) + (healResult.usage.inputTokens || 0)
            result.usage.outputTokens = (result.usage.outputTokens || 0) + (healResult.usage.outputTokens || 0)
            result.usage.costUsd = (result.usage.costUsd || 0) + (healResult.usage.costUsd || 0)
          }
        }
      } catch (healError) {
        console.warn(`[chat-turn-pipeline] 自愈修复执行轮次 ${healAttempt} 异常:`, healError instanceof Error ? healError.message : healError)
        break
      }
    }

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
    const prefs = await appPreferences.get()
    const task = state.tasks?.find((item) => item.id === taskId)
    const taskModelKey = task?.modelKey ?? state.modelKey ?? null
    const {
      effectivePrompt,
      promptStats,
      assembled,
    } = await assembleAndComposeUserPrompt({
      text,
      workMode: 'code',
      workspacePath: runtimeContext.workspacePath,
      sandboxContextLine: sandboxContextLineForContext(runtimeContext),
      modelKey: taskModelKey,
      selectedSkill: null,
      conversationMessages: state.messages ?? [],
      preferences: prefs,
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
    workMode = 'code',
    conversationId,
    runtimeContext,
    attachments,
  }) => {
    const { modelKey: activeKey } = await validateAndResolveModel(text, modelKey, runtimeContext)
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
          agentPreset: resolvePrimaryAgentPreset(command, workMode, activeKey),
          attachments,
        })
      } catch (error) {
        await handleChatError(error, messageId, time, conversationId, activeKey)
      }
      const assistant = await createAssistantMessage(result, messageId, time, activeKey,
        { mode: 'single-agent' }, conversationId)
      return { user: userEntry, assistant }
    }
    await tryAutoSnapshot(runtimeContext)

    const selectedSkill = skillName ? await skills.resolve(skillName, {
      workspacePath: runtimeContext.workspacePath,
      workspaceTrusted: runtimeContext.workspaceTrusted,
    }) : null
    const prefs = await appPreferences.get()
    const conversationState = appState.getConversationState
      ? await appState.getConversationState(conversationId)
      : await appState.getState()
    const {
      effectiveOverride,
      effectivePrompt,
      promptStats,
      assembled,
    } = await assembleAndComposeUserPrompt({
      text,
      workMode,
      workspacePath: runtimeContext.workspacePath,
      sandboxContextLine: sandboxContextLineForContext(runtimeContext),
      modelKey: activeKey,
      selectedSkill,
      conversationMessages: conversationState?.messages ?? [],
      preferences: prefs,
    })
    logPromptPipelineAccounting(conversationId, promptStats, assembled, { scope: 'chat:send' })
    emitPromptBudget(webContents, promptBudgetSnapshotFromStats(conversationId, promptStats, assembled, 'chat:send'))

    const decision = decideExecutionMode(text, selectedSkill)
    const preferMulti = prefs.preferMultiAgent
      && !effectiveOverride
      && !executionModeOverride
      && !explicitlyDisablesMultiAgent(text)
    const modeOverride = effectiveOverride || executionModeOverride || (preferMulti ? 'multi-agent' : null)
    const execution = resolveExecutionMode(decision, modeOverride)
    if (
      execution.mode === 'single-agent'
      && prefs.adaptiveOrchestrationGate
      && !modeOverride
      && !selectedSkill?.multiAgent
    ) {
      const gate = evaluateOrchestrationGate(text)
      if (gate.mode === 'ask-user') {
        return {
          needsOrchestrationChoice: true,
          reason: gate.reason,
          suggestedMode: 'multi-agent',
        }
      }
    }

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
        effectivePrompt,
        resolvePrimaryAgentPreset(text, workMode, activeKey),
        activeKey,
        selectedSkill,
        webContents,
        conversationId,
        runtimeContext,
        permissionMode,
        attachments
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

  const validateAndResolveModel = async (text, modelKey, runtimeContext = null) => {
    if (!text || typeof text !== 'string') throw new Error('消息不能为空')
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
