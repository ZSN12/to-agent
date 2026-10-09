import { IPC_ERROR_MESSAGE_MAX_LENGTH } from './config.mjs'

/** One durable identity for native completion, delayed IPC and queued turns. */
export function createChatTurnPersistence({ appState, usageStore }) {
  return async ({ conversationId, modelKey, result, errorMessage = null }) => {
    const timestamp = result.startedAt ?? Date.now()
    const id = `z-turn-${result.turnId}`
    const time = new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    const hasPriorOutput = Boolean(result.text?.trim() || result.thinking?.trim() || result.fileChanges?.length || result.turnActivity)
    if (hasPriorOutput) {
      const callout = errorMessage
        ? `执行失败：${errorMessage.slice(0, IPC_ERROR_MESSAGE_MAX_LENGTH)}（已保留此前输出）`
        : undefined
      await appState.upsertMessagesToConversation(conversationId, {
        id, author: 'orchestrator', name: 'TaskWeaver', time, timestamp,
        text: result.text || '', thinking: result.thinking,
        thinkingDurationMs: result.thinkingDurationMs,
        contentBlocks: result.contentBlocks,
        fileChanges: result.fileChanges,
        turnActivity: result.turnActivity ?? undefined,
        modelKey,
        usage: result.usage,
        interrupted: Boolean(errorMessage || result.cancelled),
        ...(callout ? { callout } : {}),
      })
    } else if (errorMessage) {
      await appState.upsertMessagesToConversation(conversationId, {
        id: `${id}-error`, author: 'orchestrator', name: 'TaskWeaver', time,
        timestamp: Date.now(), text: `执行失败：${errorMessage.slice(0, IPC_ERROR_MESSAGE_MAX_LENGTH)}`,
      })
    }
    if (result.usage) {
      await usageStore.record({
        ...result.usage, id: `${id}-usage`, timestamp, conversationId,
        modelKey: modelKey || 'unknown', modelName: modelKey?.split('/').pop() || 'unknown',
      })
    }
  }
}
