import { ipcHandle } from '../ipc-utils.mjs'
import { resolveForkSelection as resolveForkSelectionForThread } from '../fork-turns.mjs'
import { clearSessionPermissionGrants } from '../permission-service.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   BrowserWindow: import('electron').BrowserWindow,
 *   dialog: import('electron').dialog,
 *   appState: import('../app-state-store.mjs').AppStateStore,
 *   chat: ReturnType<typeof import('../dsh-chat-service.mjs').createDshChatService>,
 *   conversationHub: { detachSession: (id: string) => void, attachSession: (conversationId: string, sessionId: string, sender: unknown) => Promise<void>, getView: (id: string) => Promise<{ transcript?: unknown[] } | null> },
 *   refreshWorkspaceCache: () => Promise<void>,
 *   getCachedWorkspace: () => string | null,
 *   assertNotBusy: (conversationId: string) => void,
 *   validateWorkspace: (workspacePath: string) => Promise<string>,
 * }} ctx
 */
export function registerAppIpc(ctx) {
  const {
    ipcMain,
    BrowserWindow,
    dialog,
    appState,
    chat,
    conversationHub,
    refreshWorkspaceCache,
    getCachedWorkspace,
    assertNotBusy,
    validateWorkspace,
  } = ctx

  const resolveThreadForkSelection = async (sourceConversationId, messageId) => {
    if (!sourceConversationId) return null
    const sourceState = await appState.getConversationState(sourceConversationId).catch(() => null)
    if (!sourceState) return null
    let transcriptRows = []
    try {
      transcriptRows = (await conversationHub.getView(sourceConversationId))?.transcript ?? []
    } catch {
      // A local TaskWeaver message ID can still be resolved without a live view.
    }
    return resolveForkSelectionForThread(sourceState.messages, messageId, transcriptRows)
  }

  ipcHandle(ipcMain, 'app:getState', async () => {
    await refreshWorkspaceCache()
    return appState.getState()
  })

  ipcHandle(ipcMain, 'app:listOutputLogs', async (_event, options) => appState.listOutputLogs(options))

  ipcHandle(ipcMain, 'app:setWorkspace', async (_event, workspacePath) => {
    const current = await appState.getState()
    assertNotBusy(current.conversationId)
    if (!workspacePath) {
      await chat.resetSession()
      const state = await appState.setWorkspace(null)
      await refreshWorkspaceCache()
      return state
    }
    const canonicalWorkspace = await validateWorkspace(workspacePath)
    await chat.resetSession()
    const state = await appState.setWorkspace(canonicalWorkspace)
    await refreshWorkspaceCache()
    return state
  })

  ipcHandle(ipcMain, 'app:pickWorkspace', async () => {
    const current = await appState.getState()
    assertNotBusy(current.conversationId)
    const parent = BrowserWindow?.getFocusedWindow?.() ?? null
    const cachedWorkspace = getCachedWorkspace()
    const options = {
      title: '选择 TaskWeaver 工作区',
      defaultPath: cachedWorkspace,
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths?.[0]) return { cancelled: true, state: await appState.getState() }
    const canonicalWorkspace = await validateWorkspace(result.filePaths[0])
    await chat.resetSession()
    const state = await appState.setWorkspace(canonicalWorkspace)
    await refreshWorkspaceCache()
    return { cancelled: false, state }
  })

  ipcHandle(ipcMain, 'app:listThreads', () => appState.listThreads())

  ipcHandle(ipcMain, 'app:switchThread', async (event, threadId) => {
    const prior = await appState.getState()
    const priorConversationId = prior?.conversationId
    if (priorConversationId) conversationHub.detachSession(priorConversationId)
    await chat.resetSession()
    const state = await appState.switchThread(threadId)
    await refreshWorkspaceCache()
    const conversationId = state?.conversationId
    if (conversationId) {
      const sessionId = chat.getSessionId(conversationId)
      if (sessionId) {
        try {
          await conversationHub.attachSession(conversationId, sessionId, event.sender)
        } catch (error) {
          console.warn(
            '[register-ipc] conversation hub attach:',
            error instanceof Error ? error.message : error,
          )
        }
      }
    }
    return state
  })

  ipcHandle(ipcMain, 'app:renameThread', (_event, threadId, title) => appState.renameThread(threadId, title))
  ipcHandle(ipcMain, 'app:togglePinThread', (_event, threadId) => appState.togglePinThread(threadId))
  ipcHandle(ipcMain, 'app:toggleArchiveThread', (_event, threadId) => appState.toggleArchiveThread(threadId))
  ipcHandle(ipcMain, 'app:searchThreads', (_event, query, options) => appState.searchThreads(query, options))

  ipcHandle(ipcMain, 'app:deleteThread', async (_event, threadId) => {
    const before = await appState.getState()
    const target = (await appState.listThreads()).find((thread) => thread.id === threadId)
    if (target?.conversationId) assertNotBusy(target.conversationId)
    if (before.currentThreadId === threadId) await chat.resetSession()
    const state = await appState.deleteThread(threadId)
    await refreshWorkspaceCache()
    if (target?.conversationId) {
      clearSessionPermissionGrants(target.conversationId)
      try {
        const { removed } = await chat.forgetConversation(target.conversationId)
        for (const conversationId of removed) {
          clearSessionPermissionGrants(conversationId)
          conversationHub.detachSession(conversationId)
        }
      } catch (error) {
        console.warn('[register-ipc] deleteThread 回收 DSH 会话映射失败:', error instanceof Error ? error.message : error)
      }
    }
    return state
  })

  ipcHandle(ipcMain, 'app:forkThread', async (_event, threadId, messageId) => {
    const source = (await appState.listThreads()).find((thread) => thread.id === threadId)
    if (!source) throw new Error('找不到要分支的会话')
    if (!source.conversationId) throw new Error('源会话没有可继承的 Z Host 上下文，无法安全创建分支')
    assertNotBusy(source.conversationId)
    const forkSelection = await resolveThreadForkSelection(source.conversationId, messageId)
    if (!forkSelection) throw new Error('无法在源会话中定位该分支点；为避免意外继承全部历史，已取消分支')
    const previousState = await appState.getState()
    await chat.resetSession()
    const state = await appState.forkThread(threadId, forkSelection.messageId)
    try {
      if (!state?.conversationId) throw new Error('本地分支记录未生成 conversationId')
      const completedTurns = forkSelection.completedTurns
      const result = await chat.forkConversation({
        sourceConversationId: source.conversationId,
        targetConversationId: state.conversationId,
        completedTurns,
      })
      if (!result?.ok) {
        const detail = [result?.reason, result?.error].filter(Boolean).join(': ')
        throw new Error(`Z Host 未能继承源会话上下文${detail ? `（${detail}）` : ''}`)
      }
      await refreshWorkspaceCache()
      return {
        state,
        completedTurns: completedTurns ?? null,
        atSeq: Number.isInteger(result.atSeq) ? result.atSeq : null,
      }
    } catch (error) {
      const cleanupErrors = []
      if (state?.conversationId) {
        try {
          await chat.forgetConversation(state.conversationId)
          conversationHub.detachSession(state.conversationId)
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : String(cleanupError))
        }
      }
      try {
        const beforeRollback = state?.currentThreadId ? await appState.getState() : null
        const branchWasCurrent = beforeRollback?.currentThreadId === state?.currentThreadId
        if (state?.currentThreadId) await appState.deleteThread(state.currentThreadId)
        const remaining = await appState.listThreads()
        if (branchWasCurrent && previousState?.currentThreadId
          && remaining.some((thread) => thread.id === previousState.currentThreadId)) {
          await appState.switchThread(previousState.currentThreadId)
        }
        await refreshWorkspaceCache()
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : String(cleanupError))
      }
      const message = error instanceof Error ? error.message : String(error)
      const cleanupNote = cleanupErrors.length
        ? `；清理未完成：${cleanupErrors.join('；')}`
        : '；未完成的分支记录已回滚'
      throw new Error(`创建会话分支失败：${message}${cleanupNote}`)
    }
  })

  ipcHandle(ipcMain, 'app:setPermissionMode', async (_event, mode) => {
    const state = await appState.setPermissionMode(mode)
    await refreshWorkspaceCache()
    return state
  })

  ipcHandle(ipcMain, 'app:setModelKey', async (_event, modelKey) => {
    return await appState.setModelKey(modelKey)
  })

  ipcHandle(ipcMain, 'app:setThinkingLevel', async (_event, thinkingLevel) => {
    return await appState.setThinkingLevel(thinkingLevel)
  })

  ipcHandle(ipcMain, 'app:clearConversation', async (_event, options) => {
    const current = await appState.getState()
    assertNotBusy(current.conversationId)
    await chat.resetSession()
    const state = await appState.createThread(options)
    await refreshWorkspaceCache()
    return state
  })
}
