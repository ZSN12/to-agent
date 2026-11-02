import { IPC_ERROR_MESSAGE_MAX_LENGTH } from './config.mjs'
import { clockLabelZh } from './message-factory.mjs'

/** One durable identity for native completion, delayed IPC and queued turns. */
export function createChatTurnPersistence({ appState, usageStore }) {
  return async ({
    conversationId,
    modelKey,
    result,
    errorMessage = null,
    errorCode = null,
    speakerId = null,
    speakerName = null,
    roleMode = false,
    roleSummary = false,
  }) => {
    const timestamp = result.startedAt ?? Date.now()
    const id = `z-turn-${result.turnId}`
    const time = clockLabelZh(timestamp)
    const hasPriorOutput = Boolean(result.text?.trim() || result.thinking?.trim() || result.fileChanges?.length || result.turnActivity || result.subagentOutputs?.length)
    let message
    if (hasPriorOutput || errorMessage) {
      const callout = errorMessage
        ? `执行失败：${errorMessage.slice(0, IPC_ERROR_MESSAGE_MAX_LENGTH)}${hasPriorOutput ? '（已保留此前输出）' : ''}`
        : undefined
      message = {
        id, author: 'orchestrator', name: speakerName || 'TaskWeaver', time, timestamp,
        text: result.text || '', thinking: result.thinking,
        thinkingDurationMs: result.thinkingDurationMs,
        contentBlocks: result.contentBlocks,
        fileChanges: result.fileChanges,
        turnActivity: result.turnActivity ?? undefined,
        subagentOutputs: result.subagentOutputs,
        modelKey,
        usage: result.usage,
        ...(speakerId ? { speakerId } : {}),
        ...(roleMode ? { roleMode: true } : {}),
        ...(roleSummary ? { roleSummary: true } : {}),
        ...(errorCode ? { errorCode } : {}),
        interrupted: Boolean(errorMessage || result.cancelled),
        ...(callout ? { callout } : {}),
      }
      await appState.upsertMessagesToConversation(conversationId, { ...message })
    }
    if (result.usage) {
      await usageStore.record({
        ...result.usage, id: `${id}-usage`, timestamp, conversationId,
        modelKey: modelKey || 'unknown', modelName: modelKey?.split('/').pop() || 'unknown',
      })
    }
    return message ?? null
  }
}
