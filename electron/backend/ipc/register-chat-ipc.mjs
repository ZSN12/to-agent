import { ipcHandle } from '../ipc-utils.mjs'
/**
 * Chat/tasks IPC except `chat:send` / steer / followUp (register-chat-send-ipc + turn pipeline).
 */
export function registerChatIpc(ctx) {
  const {
    ipcMain,
    skills,
    chat,
    orchestration,
    conversationHub,
    resolveIpcConversationId,
    getConversationRuntimeContext,
    turnInProgressByConversation,
    withTurnLock,
    chatTurnPipeline,
  } = ctx

  ipcHandle(ipcMain, 'skills:list', async (_event, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    return skills.list({
      workspacePath: runtimeContext.workspacePath,
      workspaceTrusted: runtimeContext.workspaceTrusted,
    })
  })

  ipcHandle(ipcMain, 'chat:cancel', async (_event, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) return { stopped: false }
    const chatStopped = await chat.abort(conversationId)
    const orchestrationStopped = await orchestration.abort(conversationId)
    return { stopped: chatStopped || orchestrationStopped }
  })

  ipcHandle(ipcMain, 'chat:queueMutate', async (event, payload) => {
    const conversationId = await resolveIpcConversationId(payload?.conversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const kind = payload?.kind === 'followUp' ? 'followUp' : 'steering'
    const index = Number(payload?.index)
    const action = payload?.action === 'update' ? 'update' : 'remove'
    const result = await chat.mutateQueue(kind, index, action, payload?.text, conversationId)
    if (result.ok && event.sender && !event.sender.isDestroyed()) {
      event.sender.send('chat:stream', {
        type: 'queue_update',
        conversationId,
        steering: result.steering ?? [],
        followUp: result.followUp ?? [],
      })
    }
    return result
  })

  ipcHandle(ipcMain, 'chat:getLiveContext', async (_event, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) return null
    return chat.getLiveContextUsage(conversationId)
  })

  ipcHandle(ipcMain, 'chat:subscribeMux', async (event, conversationId) => {
    if (!conversationId || typeof conversationId !== 'string') throw new Error('缺少会话标识')
    chat.subscribeMux(conversationId, event.sender)
    const sessionId = chat.getSessionId(conversationId)
    if (sessionId) {
      try {
        await conversationHub.attachSession(conversationId, sessionId, event.sender)
        conversationHub.subscribe(conversationId, event.sender)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[register-ipc] chat:subscribeMux hub:', message)
        return { ok: false, error: message }
      }
    }
    return { ok: true }
  })

  ipcHandle(ipcMain, 'chat:unsubscribeMux', async (event, conversationId) => {
    if (conversationId && typeof conversationId === 'string') {
      chat.unsubscribeMux(conversationId, event.sender)
      conversationHub.detachSession(conversationId)
    }
    return { ok: true }
  })

  ipcHandle(ipcMain, 'chat:getDshView', async (_event, requestedConversationId) => {
    const id = await resolveIpcConversationId(requestedConversationId)
    if (!id) return null
    return conversationHub.getView(id)
  })

  ipcHandle(ipcMain, 'chat:getSessionStats', async (_event, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) return null
    return chat.getSessionStatsSnapshot(conversationId)
  })

  ipcHandle(ipcMain, 'chat:listRunningConversations', async () => {
    const ids = new Set([
      ...chat.listRunningConversationIds(),
      ...orchestration.listRunningConversationIds(),
      ...[...turnInProgressByConversation.entries()].filter(([, busy]) => busy).map(([id]) => id),
    ])
    return [...ids]
  })

  ipcHandle(ipcMain, 'tasks:sendMessage', async (event, taskId, text, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    return withTurnLock(conversationId, () => chatTurnPipeline.runTaskMessage({
      webContents: event.sender,
      taskId,
      text,
      conversationId,
      runtimeContext,
    }))
  })

  ipcHandle(ipcMain, 'tasks:cancel', async (_event, taskId, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId || typeof taskId !== 'string' || !taskId) return { cancelled: false }
    return { cancelled: orchestration.cancelTask(conversationId, taskId) }
  })
}
