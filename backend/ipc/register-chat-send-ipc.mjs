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
    chatDocumentAttachments,
    roleChatService,
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

  ipcHandle(ipcMain, 'chat:send', async (event, text, modelKey, skillName, executionModeOverride, workMode = 'code', requestedConversationId, attachments, documentIds) => {
    await appBootstrap.start()
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    const documents = typeof chatDocumentAttachments?.takeDocuments === 'function'
      ? await chatDocumentAttachments.takeDocuments({ ids: documentIds ?? [], conversationId })
      : []

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
      documents,
    }))
  })

  ipcHandle(ipcMain, 'chat:sendAsRoles', async (event, payload) => {
    await appBootstrap.start()
    const conversationId = await resolveIpcConversationId(payload?.conversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    const documents = typeof chatDocumentAttachments?.takeDocuments === 'function'
      ? await chatDocumentAttachments.takeDocuments({ ids: payload?.documentIds ?? [], conversationId })
      : []
    return withTurnLock(conversationId, () => roleChatService.send({
      webContents: event.sender,
      conversationId,
      text: payload?.text,
      roleIds: payload?.roleIds,
      discussionStrategy: payload?.discussionStrategy,
      summarize: payload?.summarize,
      runtimeContext,
      attachments: payload?.attachments,
      documents,
    }))
  })

  ipcHandle(ipcMain, 'chat:steer', async (event, text, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    if (roleChatService?.isRunning?.(conversationId)) {
      return roleChatService.steer({ conversationId, text, webContents: event.sender })
    }
    return runQueuedChatBehavior(event, text, conversationId, 'steer')
  })

  ipcHandle(ipcMain, 'chat:followUp', async (event, text, requestedConversationId) => {
    return runQueuedChatBehavior(event, text, requestedConversationId, 'followUp')
  })
}
