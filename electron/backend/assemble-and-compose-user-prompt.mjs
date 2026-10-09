import {
  assembleWorkspaceContext,
  isFirstConversationTurn,
  shouldAttachRepoMap,
  workspaceContextLimits,
} from './context-assembler.mjs'
import { calculateDynamicContextBudget } from './context-compactor.mjs'
import { setToolTraceCompactionLimits } from './tool-trace.mjs'
import { composePromptPipeline } from './prompt-pipeline.mjs'
import { buildSkillPromptPrefix } from './skill-prompt.mjs'
import { CURSOR_TOOL_GUIDANCE_TEXT, shouldInjectCursorToolGuidance } from './cursor-tool-guidance.mjs'
import { detectVerificationCommands } from './verification-policy.mjs'
import {
  analyzeUserIntent,
  injectIntentGuidelines,
  USER_INTENTS,
} from './user-intent.mjs'
import { workModeExecutionOverride } from './orchestration-policy.mjs'

/**
 * 主聊天与 DAG 子任务共用的：工作区组装 + Prompt Pipeline + 意图/Skill/Cursor 层。
 */
export async function assembleAndComposeUserPrompt({
  text,
  workMode = 'code',
  workspacePath,
  sandboxContextLine,
  modelKey = null,
  selectedSkill = null,
  conversationMessages = [],
  preferences = {},
}) {
  const dynamicBudget = calculateDynamicContextBudget(workMode)
  const injectionByteCap = preferences.promptInjectionLimitBytes ?? dynamicBudget.workspaceContextBytes
  const isFirstTurn = isFirstConversationTurn(conversationMessages)
  const hasNonConversationIntent = analyzeUserIntent(text, workMode) !== USER_INTENTS.CONVERSATION
  setToolTraceCompactionLimits({ maxChars: dynamicBudget.toolOutputMaxChars })

  const assembled = await assembleWorkspaceContext(text, workspacePath, {
    sandboxContextLine,
    maxInjectionBytes: injectionByteCap,
    includeRules: isFirstTurn,
    rulesTaskWeaverOnly: true,
    includeRepoMap: shouldAttachRepoMap(text, workMode, {
      enableRepoMap: preferences.enableRepoMap !== false,
      isFirstTurn,
      hasNonConversationIntent,
    }),
    repoMapTokens: dynamicBudget.repoMapTokens,
  })

  const prepared = await preparePromptByWorkMode({
    text,
    workMode,
    assembled,
    modelKey,
    injectionByteCap,
    selectedSkill,
    workspacePath,
    autoVerifyAfterMutation: preferences.autoVerifyAfterMutation === true,
  })

  return {
    ...prepared,
    assembled,
    dynamicBudget,
    injectionByteCap,
  }
}

async function preparePromptByWorkMode({
  text,
  workMode,
  assembled,
  modelKey,
  injectionByteCap,
  selectedSkill,
  workspacePath,
  autoVerifyAfterMutation,
}) {
  const effectiveOverride = workModeExecutionOverride(workMode)
  const intent = workMode === 'goal' ? null : analyzeUserIntent(text, workMode)
  let guidanceText = ''

  if (workMode !== 'goal') {
    const policy = detectVerificationCommands(workspacePath)
    const guidedPrompt = injectIntentGuidelines(assembled.prompt, intent, policy, {
      autoVerifyAfterMutation,
    })
    if (!guidedPrompt.startsWith(assembled.prompt)) {
      throw new Error('意图指引必须以可单独记账的后缀形式追加')
    }
    guidanceText = guidedPrompt.slice(assembled.prompt.length)
  }

  const injectedLayers = assembled.layers
  if (!injectedLayers || !Array.isArray(injectedLayers.prefix) || !Array.isArray(injectedLayers.suffix)) {
    throw new Error('工作区上下文缺少可审计的注入层明细，已阻止发送')
  }
  const guidanceLayerId = intent === USER_INTENTS.CODE_MUTATION
    ? 'verification-guidance'
    : 'intent-guidance'
  const prefixLayers = [...injectedLayers.prefix]
  const suffixLayers = [...injectedLayers.suffix]
  const skillPrefix = buildSkillPromptPrefix(selectedSkill)
  if (skillPrefix) {
    prefixLayers.push({ id: 'selected-skill', text: skillPrefix, required: true })
  }
  if (shouldInjectCursorToolGuidance(modelKey)) {
    prefixLayers.push({
      id: 'cursor-tool-guidance',
      text: CURSOR_TOOL_GUIDANCE_TEXT,
      required: false,
      priority: 20,
    })
  }
  if (guidanceText) {
    suffixLayers.push({
      id: guidanceLayerId,
      text: guidanceText,
      required: false,
      priority: intent === USER_INTENTS.CODE_MUTATION ? 10 : 30,
    })
  }
  const composed = composePromptPipeline({
    userText: text,
    prefixLayers,
    suffixLayers,
    maxInjectedBytes: injectionByteCap,
  })
  const userBytes = Buffer.byteLength(text, 'utf8')
  const layerBytes = composed.layerBytes
  const contextBytes = (layerBytes['workspace-context'] ?? 0) + (layerBytes['repo-map'] ?? 0)
  const guidanceBytes = (layerBytes['intent-guidance'] ?? 0) + (layerBytes['cursor-tool-guidance'] ?? 0)
  return {
    effectiveOverride,
    effectivePrompt: composed.prompt,
    promptStats: {
      userBytes,
      contextBytes,
      sandboxPolicyBytes: layerBytes['sandbox-policy'] ?? 0,
      guidanceBytes,
      skillInstructionBytes: layerBytes['selected-skill'] ?? 0,
      intentGuidanceBytes: layerBytes['intent-guidance'] ?? 0,
      cursorGuidanceBytes: layerBytes['cursor-tool-guidance'] ?? 0,
      verificationGuidanceBytes: layerBytes['verification-guidance'] ?? 0,
      totalInjectedBytes: composed.injectedBytes,
      budgetBytes: composed.diagnostics.budgetBytes,
      injectedEstimatedTokens: composed.diagnostics.injectedEstimatedTokens,
      estimatedTokens: composed.diagnostics.estimatedTokens,
      remainingBudgetBytes: composed.diagnostics.remainingBudgetBytes,
      layerBytes,
      droppedLayers: composed.droppedLayers,
    },
    injectionByteCap,
  }
}

export function promptBudgetSnapshotFromStats(conversationId, promptStats, assembled, scope = 'task') {
  const injectionUtilization = promptStats.budgetBytes > 0
    ? Number((promptStats.totalInjectedBytes / promptStats.budgetBytes).toFixed(4))
    : 0
  return {
    conversationId,
    scope,
    budgetBytes: promptStats.budgetBytes,
    injectedBytes: promptStats.totalInjectedBytes,
    injectedEstimatedTokens: promptStats.injectedEstimatedTokens,
    estimatedTokens: promptStats.estimatedTokens,
    remainingBudgetBytes: promptStats.remainingBudgetBytes,
    utilization: injectionUtilization,
    contextTruncated: assembled.contextTruncated === true,
    layerBytes: promptStats.layerBytes,
    droppedLayers: promptStats.droppedLayers,
  }
}

export function logPromptPipelineAccounting(conversationId, promptStats, assembled, { scope = 'chat:send' } = {}) {
  console.debug('[prompt-pipeline] injection byte accounting', {
    conversationId,
    scope,
    maxInjectedBytes: promptStats.budgetBytes,
    ...promptStats,
    ratioToUserText: promptStats.userBytes ? Number((promptStats.totalInjectedBytes / promptStats.userBytes).toFixed(2)) : null,
    contextTruncated: assembled.contextTruncated === true,
  })
  const injectionUtilization = promptStats.budgetBytes > 0
    ? promptStats.totalInjectedBytes / promptStats.budgetBytes
    : 0
  if (injectionUtilization >= 0.9) {
    console.warn('[prompt-pipeline] 本轮注入接近预算上限', {
      conversationId,
      scope,
      utilization: Number(injectionUtilization.toFixed(4)),
      droppedLayers: promptStats.droppedLayers,
      contextTruncated: assembled.contextTruncated === true,
    })
  }
}

export { workspaceContextLimits }
