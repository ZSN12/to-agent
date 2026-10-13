import fs from 'node:fs/promises'
import path from 'node:path'
import { ipcHandle } from '../ipc-utils.mjs'
import { createCodeOutputAttachmentService } from '../code-output-attachment.mjs'
import { createChatImageAttachmentService } from '../chat-image-attachments.mjs'
import { isWorkspacePath } from '../workspace-index.mjs'
/**
 * Chat/tasks IPC except `chat:send` / steer / followUp (register-chat-send-ipc + turn pipeline).
 */
export function registerChatIpc(ctx) {
  const {
    ipcMain,
    dialog,
    skills,
    chat,
    orchestration,
    conversationHub,
    resolveIpcConversationId,
    hostManager,
    getConversationRuntimeContext,
    turnInProgressByConversation,
    withTurnLock,
    chatTurnPipeline,
    chatDocumentAttachments,
  } = ctx
  const codeOutputAttachments = createCodeOutputAttachmentService({
    chat,
    conversationHub,
    hostManager,
    resolveIpcConversationId,
  })
  const chatImageAttachments = createChatImageAttachmentService({
    dialog,
    chat,
    conversationHub,
    hostManager,
    resolveIpcConversationId,
  })
  const workspaceReferenceForPath = async (filePath, conversationId) => {
    const { workspacePath } = await getConversationRuntimeContext(conversationId)
    if (!workspacePath) return null
    const root = await fs.realpath(workspacePath)
    const real = await fs.realpath(path.resolve(filePath))
    if (!isWorkspacePath(root, real)) return null
    const info = await fs.stat(real)
    if (!info.isFile()) return null
    const relative = path.relative(root, real).split(path.sep).join('/')
    const escaped = relative.includes(' ') ? `"${relative.replaceAll('"', '\\"')}"` : relative
    return { path: relative, kind: 'file', token: `@file:${escaped}` }
  }

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

  ipcHandle(ipcMain, 'chat:getToolOutput', async (_event, payload) => {
    if (!payload || typeof payload !== 'object') throw new Error('工具输出请求无效')
    const conversationId = await resolveIpcConversationId(payload.conversationId)
    if (!conversationId) return null
    return chat.getToolOutput({ conversationId, outputId: payload.outputId })
  })

  ipcHandle(ipcMain, 'chat:getResultAttachment', async (_event, payload) => {
    if (!payload || typeof payload !== 'object') throw new Error('图片附件请求无效')
    return codeOutputAttachments.get(payload)
  })

  ipcHandle(ipcMain, 'chat:getImageLimits', async (_event, requestedConversationId) => {
    return chatImageAttachments.getLimits({ conversationId: requestedConversationId })
  })

  ipcHandle(ipcMain, 'chat:readDroppedImage', async (_event, filePath, conversationId) => {
    return chatImageAttachments.readDroppedFile({ filePath, conversationId })
  })

  ipcHandle(ipcMain, 'chat:pickImages', async (_event, requestedConversationId) => {
    return chatImageAttachments.pickImages({ conversationId: requestedConversationId })
  })

  ipcHandle(ipcMain, 'chat:pickAttachments', async (_event, requestedConversationId) => {
    if (!chatDocumentAttachments) throw new Error('文档附件服务尚未就绪')
    return chatDocumentAttachments.pickAttachments({
      conversationId: requestedConversationId,
      imageService: chatImageAttachments,
      workspaceReferenceForPath,
    })
  })

  ipcHandle(ipcMain, 'chat:stageDroppedDocument', async (_event, filePath, requestedConversationId) => {
    if (!chatDocumentAttachments) throw new Error('文档附件服务尚未就绪')
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const reference = await workspaceReferenceForPath(filePath, conversationId)
    if (reference) return { reference }
    return { document: await chatDocumentAttachments.stageDroppedFile({ filePath, conversationId }) }
  })

  ipcHandle(ipcMain, 'chat:releaseDocuments', async (_event, ids, requestedConversationId) => {
    if (!chatDocumentAttachments) return { released: 0 }
    return chatDocumentAttachments.releaseDocuments({ ids, conversationId: requestedConversationId })
  })

  ipcHandle(ipcMain, 'chat:getImageAttachment', async (_event, payload) => {
    return chatImageAttachments.getImage(payload)
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

  ipcHandle(ipcMain, 'tasks:listRuns', async (_event, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) return []
    return orchestration.listRuns(conversationId)
  })

  ipcHandle(ipcMain, 'tasks:resumeCheckpoint', async (event, runId, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId || typeof runId !== 'string' || !runId) throw new Error('运行记录恢复请求无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    return withTurnLock(conversationId, () => orchestration.resumeRunFromCheckpoint({
      conversationId,
      runId,
      webContents: event.sender,
      workspacePath: runtimeContext.workspacePath,
      permissionMode: runtimeContext.permissionMode,
      workspaceTrusted: runtimeContext.workspaceTrusted,
    }))
  })

  ipcHandle(ipcMain, 'tasks:rerunDownstream', async (event, runId, taskId, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId || typeof runId !== 'string' || !runId || typeof taskId !== 'string' || !taskId) {
      throw new Error('DAG 节点重跑请求无效')
    }
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    return withTurnLock(conversationId, () => orchestration.rerunTaskFromRun({
      conversationId,
      runId,
      taskId,
      webContents: event.sender,
      workspacePath: runtimeContext.workspacePath,
      permissionMode: runtimeContext.permissionMode,
      workspaceTrusted: runtimeContext.workspaceTrusted,
    }))
  })

  ipcHandle(ipcMain, 'tasks:cancel', async (_event, taskId, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId || typeof taskId !== 'string' || !taskId) return { cancelled: false }
    return { cancelled: orchestration.cancelTask(conversationId, taskId) }
  })

  ipcHandle(ipcMain, 'tasks:approvePlan', async (_event, runId, changes, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId || typeof runId !== 'string' || !runId) throw new Error('DAG 计划审批请求无效')
    return orchestration.approvePlan(conversationId, runId, changes)
  })

  ipcHandle(ipcMain, 'tasks:pauseRun', async (_event, runId, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId || typeof runId !== 'string' || !runId) return { paused: false }
    return { paused: await orchestration.pauseRun(conversationId, runId) }
  })

  ipcHandle(ipcMain, 'tasks:rejectPlan', async (_event, runId, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId || typeof runId !== 'string' || !runId) return { rejected: false }
    return { rejected: orchestration.rejectPlan(conversationId, runId) }
  })

  ipcHandle(ipcMain, 'tasks:resumeRun', async (_event, runId, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId || typeof runId !== 'string' || !runId) return { resumed: false }
    return { resumed: await orchestration.resumeRun(conversationId, runId) }
  })
}
