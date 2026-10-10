import fs from 'node:fs/promises'
import path from 'node:path'
import {
  createManualGitCommitSnapshot,
  deleteGitCheckpoint,
  getGitCheckpointDiff,
  getGitStatus,
  listGitCheckpoints,
  previewManualGitCommit,
  restoreGitCheckpoint,
  suggestCommitMessage,
} from './git-service.mjs'
import { assertSafeWorkspacePath } from './security-path.mjs'
import { ipcHandle } from './ipc-utils.mjs'

export function registerWorkspaceGitIpc({
  ipcMain,
  userDataPath,
  resolveActiveRuntime,
  withWorkspaceOperation,
}) {
  ipcHandle(ipcMain, 'workspace:openPath', async (_event, relPath) => {
    if (!relPath || typeof relPath !== 'string') throw new Error('未提供有效的文件路径')
    const { shell } = await import('electron')
    const { workspacePath } = await resolveActiveRuntime()
    try {
      const { realPath, isDirectory } = await assertSafeWorkspacePath(workspacePath, relPath, { mustExist: true })
      const error = await shell.openPath(realPath)
      if (error) return { ok: false, error }
      return { ok: true, path: relPath, isDirectory: Boolean(isDirectory) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcHandle(ipcMain, 'workspace:revertDiff', async (_event, payload) => {
    const { workspacePath } = await resolveActiveRuntime()
    return withWorkspaceOperation(workspacePath, async () => {
      const { path: relPath, reverseEdits, originalContent } = payload || {}
      if (!relPath || typeof relPath !== 'string') throw new Error('未提供有效的文件路径')

      const hasReverseEdits = Array.isArray(reverseEdits) && reverseEdits.length > 0
      const { realPath, relativePath } = await assertSafeWorkspacePath(workspacePath, relPath, {
        mustExist: hasReverseEdits,
      })
      if (hasReverseEdits) {
        let content = await fs.readFile(realPath, 'utf-8')
        for (const edit of reverseEdits) {
          if (content.includes(edit.oldText)) content = content.replace(edit.oldText, edit.newText)
        }
        await fs.writeFile(realPath, content, 'utf-8')
        return { success: true, message: `已还原 ${relativePath}` }
      }
      if (typeof originalContent === 'string') {
        await fs.mkdir(path.dirname(realPath), { recursive: true })
        await fs.writeFile(realPath, originalContent, 'utf-8')
        return { success: true, message: `已还原 ${relativePath}` }
      }
      throw new Error('缺少还原参数')
    })
  })

  ipcHandle(ipcMain, 'workspace:gitStatus', async () => {
    const { workspacePath } = await resolveActiveRuntime()
    return getGitStatus(workspacePath)
  })
  ipcHandle(ipcMain, 'workspace:gitSuggestCommit', async () => {
    const { workspacePath } = await resolveActiveRuntime()
    return suggestCommitMessage(workspacePath)
  })
  ipcHandle(ipcMain, 'workspace:previewManualGitCommit', async () => {
    const { workspacePath } = await resolveActiveRuntime()
    return previewManualGitCommit(workspacePath)
  })
  ipcHandle(ipcMain, 'workspace:createManualGitCommit', async (_event, options) => {
    const { workspacePath, conversationId } = await resolveActiveRuntime()
    return createManualGitCommitSnapshot(workspacePath, {
      ...options,
      conversationId,
      userDataPath,
    })
  })
  ipcHandle(ipcMain, 'workspace:listGitCheckpoints', async () => {
    const { workspacePath, conversationId } = await resolveActiveRuntime()
    return listGitCheckpoints(workspacePath, {
      conversationId,
      userDataPath,
    })
  })
  ipcHandle(ipcMain, 'workspace:getGitCheckpointDiff', async (_event, checkpointId) => {
    const { workspacePath, conversationId } = await resolveActiveRuntime()
    return getGitCheckpointDiff(workspacePath, checkpointId, {
      conversationId,
      userDataPath,
    })
  })
  ipcHandle(ipcMain, 'workspace:restoreGitCheckpoint', async (_event, payload) => {
    const { workspacePath, conversationId } = await resolveActiveRuntime()
    return withWorkspaceOperation(workspacePath, async () => {
      const { checkpointId, force, expectedStateFingerprint } = payload || {}
      if (!checkpointId) throw new Error('缺少检查点 ID')
      return restoreGitCheckpoint(workspacePath, checkpointId, {
        force: Boolean(force),
        expectedStateFingerprint,
        conversationId,
        userDataPath,
      })
    })
  })
  ipcHandle(ipcMain, 'workspace:deleteGitCheckpoint', async (_event, checkpointId) => {
    const { workspacePath, conversationId } = await resolveActiveRuntime()
    return withWorkspaceOperation(workspacePath, async () => {
      if (!checkpointId) throw new Error('缺少检查点 ID')
      return deleteGitCheckpoint(workspacePath, checkpointId, {
        conversationId,
        userDataPath,
      })
    })
  })
}
