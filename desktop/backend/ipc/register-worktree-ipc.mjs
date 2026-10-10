import { ipcHandle } from '../ipc-utils.mjs'
import {
  listTaskWorktrees,
  removeTaskWorktree,
  getTaskWorktreeDiff,
  previewTaskWorktreeMerge,
  applyTaskWorktreeMerge,
} from '../worktree-service.mjs'
import { isGitRepository, createGitCheckpoint } from '../git-service.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   userDataPath: string,
 *   resolveWorktreeContext: (requestedConversationId?: string | null) => Promise<{ conversationId: string, workspacePath: string }>,
 *   assertNotBusy: (conversationId: string) => void,
 *   withWorkspaceOperation: (workspacePath: string, operation: () => Promise<unknown>) => Promise<unknown>,
 * }} ctx
 */
export function registerWorktreeIpc(ctx) {
  const {
    ipcMain,
    userDataPath,
    resolveWorktreeContext,
    assertNotBusy,
    withWorkspaceOperation,
  } = ctx

  ipcHandle(ipcMain, 'worktree:list', async (_event, requestedConversationId) => {
    const { conversationId, workspacePath } = await resolveWorktreeContext(requestedConversationId)
    return listTaskWorktrees({
      workspacePath,
      conversationId,
      userDataPath,
    })
  })

  ipcHandle(ipcMain, 'worktree:remove', async (_event, taskId, force, requestedConversationId, runId) => {
    const { conversationId, workspacePath } = await resolveWorktreeContext(requestedConversationId)
    return removeTaskWorktree({
      workspacePath,
      conversationId,
      runId: runId ?? null,
      taskId,
      userDataPath,
      force: force === true,
    })
  })

  ipcHandle(ipcMain, 'worktree:diff', async (_event, taskId, requestedConversationId, runId) => {
    const { conversationId, workspacePath } = await resolveWorktreeContext(requestedConversationId)
    return getTaskWorktreeDiff({
      workspacePath,
      conversationId,
      runId: runId ?? null,
      taskId,
      userDataPath,
    })
  })

  ipcHandle(ipcMain, 'worktree:previewMerge', async (_event, taskId, requestedConversationId, runId) => {
    const { conversationId, workspacePath } = await resolveWorktreeContext(requestedConversationId)
    return previewTaskWorktreeMerge({
      workspacePath,
      conversationId,
      runId: runId ?? null,
      taskId,
      userDataPath,
    })
  })

  ipcHandle(ipcMain, 'worktree:applyMerge', async (_event, taskId, options, requestedConversationId, runId) => {
    const { conversationId, workspacePath } = await resolveWorktreeContext(requestedConversationId)
    assertNotBusy(conversationId)
    return withWorkspaceOperation(workspacePath, async () => {
      if (await isGitRepository(workspacePath)) {
        await createGitCheckpoint(workspacePath, {
          conversationId,
          summary: 'worktree 合并前快照',
          userDataPath,
        })
      }
      return applyTaskWorktreeMerge({
        workspacePath,
        conversationId,
        runId: runId ?? null,
        taskId,
        userDataPath,
        removeAfter: options?.removeAfter === true,
        files: options?.files ?? null,
      })
    })
  })
}
