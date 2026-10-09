import { ipcHandle } from '../ipc-utils.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   appBootstrap: { start: () => Promise<void> },
 *   resolveIpcConversationId: (requested?: string | null) => Promise<string | null>,
 *   getConversationRuntimeContext: (conversationId: string) => Promise<unknown>,
 *   withTurnLock: (conversationId: string, fn: () => Promise<unknown>) => Promise<unknown>,
 *   chatTurnPipeline: { runTurn: Function },
 * }} ctx
 */
export function registerChatSendIpc(ctx) {
  const {
    ipcMain,
    appBootstrap,
    resolveIpcConversationId,
    getConversationRuntimeContext,
    withTurnLock,
    chatTurnPipeline,
  } = ctx

  const runQueuedChatBehavior = async (event, text, requestedConversationId, behavior) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    return chatTurnPipeline.runQueuedBehavior({
      webContents: event.sender,
      text,
      conversationId,
      runtimeContext,
      behavior,
    })
  }

  ipcHandle(ipcMain, 'chat:send', async (event, text, modelKey, skillName, executionModeOverride, workMode = 'code', requestedConversationId, attachments) => {
    await appBootstrap.start()
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)

    return withTurnLock(conversationId, () => chatTurnPipeline.runTurn({
      webContents: event.sender,
      text,
      modelKey,
      skillName,
      executionModeOverride,
      workMode,
      conversationId,
      runtimeContext,
      attachments,
    }))
  })

  ipcHandle(ipcMain, 'chat:steer', async (event, text, requestedConversationId) => {
    return runQueuedChatBehavior(event, text, requestedConversationId, 'steer')
  })

  ipcHandle(ipcMain, 'chat:followUp', async (event, text, requestedConversationId) => {
    return runQueuedChatBehavior(event, text, requestedConversationId, 'followUp')
  })
}
