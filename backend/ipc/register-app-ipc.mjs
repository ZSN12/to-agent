import { ipcHandle } from '../ipc-utils.mjs'
import { resolveForkSelection as resolveForkSelectionForThread } from '../fork-turns.mjs'
import { clearSessionPermissionGrants } from '../permission-service.mjs'
import { inspectFirstRunSecrets, dismissFirstRunNotice } from '../legacy-secrets.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   BrowserWindow: import('electron').BrowserWindow,
 *   dialog: import('electron').dialog,
 *   appState: import('../app-state-store.mjs').AppStateStore,
 *   userDataPath: string,
 *   chat: ReturnType<typeof import('../dsh-chat-service.mjs').createDshChatService>,
 *   sessionMemory?: { deleteConversation?: (conversationId: string) => Promise<unknown> },
 *   conversationHub: { detachSession: (id: string) => void, attachSession: (conversationId: string, sessionId: string, sender: unknown) => Promise<void>, getView: (id: string) => Promise<{ transcript?: unknown[] } | null> },
 *   refreshUiSnapshot: () => Promise<void>,
 *   assertNotBusy: (conversationId: string) => void,
 *   validateWorkspace: (workspacePath: string) => Promise<string>,
   *   withWorkspaceOperation?: (workspacePath: string, operation: () => Promise<unknown>) => Promise<unknown>,
 * }} ctx
 */
export function registerAppIpc(ctx) {
  if (typeof ctx.userDataPath !== 'string' || !ctx.userDataPath.trim()) {
    throw new Error('registerAppIpc: userDataPath is required')
  }
  const {
    ipcMain,
    BrowserWindow,
    dialog,
    appState,
    userDataPath,
    chat,
    sessionMemory,
    conversationHub,
    refreshUiSnapshot,
    assertNotBusy,
    validateWorkspace,
    withWorkspaceOperation,
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

  async function cleanupFork(state, previousState) {
    const cleanupErrors = []
    if (state?.conversationId) {
      try {
        await chat.forgetConversation(state.conversationId)
        conversationHub.detachSession(state.conversationId)
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error))
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
      await refreshUiSnapshot()
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error))
    }
    return cleanupErrors
  }

  async function forkThreadAtSelection(threadId, source, forkSelection) {
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
      await refreshUiSnapshot()
      return {
        state,
        completedTurns: completedTurns ?? null,
        atSeq: Number.isInteger(result.atSeq) ? result.atSeq : null,
      }
    } catch (error) {
      const cleanupErrors = await cleanupFork(state, previousState)
      const message = error instanceof Error ? error.message : String(error)
      const cleanupNote = cleanupErrors.length
        ? `；清理未完成：${cleanupErrors.join('；')}`
        : '；未完成的分支记录已回滚'
      throw new Error(`创建会话分支失败：${message}${cleanupNote}`)
    }
  }

  ipcHandle(ipcMain, 'app:getState', async () => {
    await refreshUiSnapshot()
    return appState.getState()
  })

  ipcHandle(ipcMain, 'app:listOutputLogs', async (_event, options) => appState.listOutputLogs(options))

  ipcHandle(ipcMain, 'app:setWorkspace', async (_event, workspacePath) => {
    const current = await appState.getState()
    assertNotBusy(current.conversationId)
    if (!workspacePath) {
      await chat.resetSession()
      const state = await appState.setWorkspace(null)
      await refreshUiSnapshot()
      return state
    }
    const canonicalWorkspace = await validateWorkspace(workspacePath)
    await chat.resetSession()
    const state = await appState.setWorkspace(canonicalWorkspace)
    await refreshUiSnapshot()
    return state
  })

  ipcHandle(ipcMain, 'app:pickWorkspace', async () => {
    const current = await appState.getState()
    assertNotBusy(current.conversationId)
    const parent = BrowserWindow?.getFocusedWindow?.() ?? null
    const options = {
      title: '选择 TaskWeaver 工作区',
      defaultPath: current.workspacePath ?? undefined,
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths?.[0]) return { cancelled: true, state: await appState.getState() }
    const canonicalWorkspace = await validateWorkspace(result.filePaths[0])
    await chat.resetSession()
    const state = await appState.setWorkspace(canonicalWorkspace)
    await refreshUiSnapshot()
    return { cancelled: false, state }
  })

  ipcHandle(ipcMain, 'app:listThreads', () => appState.listThreads())

  ipcHandle(ipcMain, 'app:switchThread', async (event, threadId) => {
    const prior = await appState.getState()
    const priorConversationId = prior?.conversationId
    if (priorConversationId) conversationHub.detachSession(priorConversationId)
    await chat.resetSession()
    const state = await appState.switchThread(threadId)
    await refreshUiSnapshot()
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
    if (target?.conversationId && sessionMemory?.deleteConversation) {
      await sessionMemory.deleteConversation(target.conversationId)
    }
    const state = await appState.deleteThread(threadId)
    await refreshUiSnapshot()
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
    return forkThreadAtSelection(threadId, source, forkSelection)
  })

  ipcHandle(ipcMain, 'app:rewindThread', async (_event, threadId, messageId, mode, confirmationToken = null) => {
    if (!['code', 'chat', 'both'].includes(mode)) throw new Error('回退方式无效')
    const source = (await appState.listThreads()).find((thread) => thread.id === threadId)
    if (!source) throw new Error('找不到要回退的会话')
    if (!source.conversationId) throw new Error('源会话没有可继承的 Z Host 上下文，无法回退对话')
    assertNotBusy(source.conversationId)
    const forkSelection = await resolveThreadForkSelection(source.conversationId, messageId)
    if (!forkSelection) throw new Error('无法定位所选消息对应的对话轮次')
    if ((mode === 'code' || mode === 'both') && !source.workspacePath) {
      throw new Error('当前会话没有工作区，无法回退代码')
    }

    const codeOptions = {
      conversationId: source.conversationId,
      workspacePath: source.workspacePath,
      targetTurn: forkSelection.completedTurns,
    }

    const execute = async () => {
      if (mode === 'code' || mode === 'both') {
        const preview = await chat.previewCodeRewind(codeOptions)
        if (preview.unavailable?.length) {
          throw new Error(`以下文件的回退快照不完整，无法安全恢复：${preview.unavailable.join('、')}`)
        }
        if (preview.conflicts?.length && confirmationToken !== preview.conflictToken) {
          return {
            status: 'conflict',
            mode,
            conflicts: preview.conflicts,
            conflictToken: preview.conflictToken,
            completedTurns: forkSelection.completedTurns ?? null,
          }
        }
      }

      if (mode === 'chat') {
        return { status: 'done', mode, ...await forkThreadAtSelection(threadId, source, forkSelection) }
      }

      if (mode === 'code') {
        const restored = await chat.restoreCodeRewind({ ...codeOptions, confirmationToken })
        if (!restored?.ok && restored?.reason === 'conflicts') {
          return {
            status: 'conflict', mode, conflicts: restored.conflicts,
            conflictToken: restored.conflictToken,
            completedTurns: forkSelection.completedTurns ?? null,
          }
        }
        if (!restored?.ok) throw new Error(`无法回退代码${restored?.unavailable?.length ? `：${restored.unavailable.join('、')}` : ''}`)
        await refreshUiSnapshot()
        return { status: 'done', mode, restoredFiles: restored.restoredFiles, completedTurns: forkSelection.completedTurns ?? null }
      }

      const previousState = await appState.getState()
      const forked = await forkThreadAtSelection(threadId, source, forkSelection)
      try {
        const restored = await chat.restoreCodeRewind({ ...codeOptions, confirmationToken })
        if (!restored?.ok && restored?.reason === 'conflicts') {
          const cleanupErrors = await cleanupFork(forked.state, previousState)
          if (cleanupErrors.length) throw new Error(`回退前发生新冲突，且分支清理未完成：${cleanupErrors.join('；')}`)
          return {
            status: 'conflict', mode, conflicts: restored.conflicts,
            conflictToken: restored.conflictToken,
            completedTurns: forkSelection.completedTurns ?? null,
          }
        }
        if (!restored?.ok) throw new Error(`无法回退代码${restored?.unavailable?.length ? `：${restored.unavailable.join('、')}` : ''}`)
        await refreshUiSnapshot()
        return { status: 'done', mode, ...forked, restoredFiles: restored.restoredFiles }
      } catch (error) {
        const cleanupErrors = await cleanupFork(forked.state, previousState)
        if (cleanupErrors.length) {
          throw new Error(`${error instanceof Error ? error.message : String(error)}；分支清理未完成：${cleanupErrors.join('；')}`)
        }
        throw error
      }
    }

    if (mode === 'chat') return execute()
    if (typeof withWorkspaceOperation === 'function') {
      return withWorkspaceOperation(source.workspacePath, execute)
    }
    return execute()
  })

  ipcHandle(ipcMain, 'app:setPermissionMode', async (_event, mode) => {
    const state = await appState.setPermissionMode(mode)
    await refreshUiSnapshot()
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
    await refreshUiSnapshot()
    return state
  })

  ipcHandle(ipcMain, 'app:getFirstRunNotice', async () => {
    return inspectFirstRunSecrets(userDataPath)
  })

  ipcHandle(ipcMain, 'app:dismissFirstRunNotice', async () => {
    await dismissFirstRunNotice(userDataPath)
    return { ok: true }
  })
}
