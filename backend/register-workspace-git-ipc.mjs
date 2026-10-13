import fs from 'node:fs/promises'
import path from 'node:path'
import {
  createGitCheckpoint,
  createManualGitCommitSnapshot,
  deleteGitCheckpoint,
  getGitCheckpointDiff,
  getGitStatus,
  isGitRepository,
  listGitCheckpoints,
  previewManualGitCommit,
  restoreGitCheckpoint,
  suggestCommitMessage,
} from './git-service.mjs'
import { assertSafeWorkspacePath } from './security-path.mjs'
import { applyReverseDiffEdits, inspectCreatedFileForRevert } from './workspace-diff-revert.mjs'
import { ipcHandle } from './ipc-utils.mjs'

export function registerWorkspaceGitIpc({
  ipcMain,
  userDataPath,
  resolveActiveRuntime,
  withWorkspaceOperation,
}) {
  ipcHandle(ipcMain, 'workspace:openPath', async (_event, relPath) => {
    if (!relPath || typeof relPath !== 'string') throw new Error('未提供有效的文件路径')
    const { workspacePath } = await resolveActiveRuntime()
    try {
      const { realPath, isDirectory } = await assertSafeWorkspacePath(workspacePath, relPath, { mustExist: true })
      const { execFile } = await import('node:child_process')
      await new Promise((resolve, reject) => {
        execFile('open', [realPath], (err) => (err ? reject(err) : resolve()))
      })
      return { ok: true, path: relPath, isDirectory: Boolean(isDirectory) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  /** Every revert overwrites or deletes user-visible files; keep a restorable snapshot first. */
  async function checkpointBeforeRevert(workspacePath, relativePath, conversationId) {
    if (!(await isGitRepository(workspacePath))) return null
    const result = await createGitCheckpoint(workspacePath, {
      conversationId,
      summary: `还原 ${relativePath} 前自动快照`,
      userDataPath,
    })
    if (!result?.ok) throw new Error(`还原前创建检查点失败，已取消还原：${result?.error || '未知错误'}`)
    return result.checkpoint?.id ?? null
  }

  ipcHandle(ipcMain, 'workspace:revertDiff', async (_event, payload) => {
    const { workspacePath, conversationId } = await resolveActiveRuntime()
    return withWorkspaceOperation(workspacePath, async () => {
      const { path: relPath, reverseEdits, originalContent, createdContentSha256 } = payload || {}
      if (!relPath || typeof relPath !== 'string') throw new Error('未提供有效的文件路径')

      const hasReverseEdits = Array.isArray(reverseEdits) && reverseEdits.length > 0
      const { realPath, relativePath } = await assertSafeWorkspacePath(workspacePath, relPath, {
        mustExist: hasReverseEdits,
      })
      if (hasReverseEdits) {
        const currentContent = await fs.readFile(realPath, 'utf-8')
        const result = applyReverseDiffEdits(currentContent, reverseEdits)
        if (!result.changed) {
          return { success: true, message: `这些变更块已经撤销：${relativePath}`, reverted: 0, alreadyReverted: result.alreadyReverted }
        }
        const checkpointId = await checkpointBeforeRevert(workspacePath, relativePath, conversationId)
        await fs.writeFile(realPath, result.content, 'utf-8')
        return {
          success: true,
          message: `已撤销 ${relativePath} 中的 ${result.reverted} 处变更`,
          reverted: result.reverted,
          alreadyReverted: result.alreadyReverted,
          checkpointId,
        }
      }
      if (typeof createdContentSha256 === 'string') {
        const state = await inspectCreatedFileForRevert(realPath, createdContentSha256)
        if (state === 'missing') return { success: true, message: `新建文件已不存在：${relativePath}` }
        const checkpointId = await checkpointBeforeRevert(workspacePath, relativePath, conversationId)
        await fs.rm(realPath)
        return { success: true, message: `已删除新建文件 ${relativePath}`, checkpointId }
      }
      if (typeof originalContent === 'string') {
        const checkpointId = await checkpointBeforeRevert(workspacePath, relativePath, conversationId)
        await fs.mkdir(path.dirname(realPath), { recursive: true })
        await fs.writeFile(realPath, originalContent, 'utf-8')
        return { success: true, message: `已还原 ${relativePath}`, checkpointId }
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
