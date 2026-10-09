import fs from 'node:fs/promises'
import path from 'node:path'
import { ipcHandle } from '../ipc-utils.mjs'
import { isWorkspacePath } from '../workspace-index.mjs'
import {
  assertAttachmentInsideDir,
  sanitizeClipboardAttachmentFilename,
} from '../clipboard-attachment.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   userDataPath: string,
 *   resolveActiveRuntime: (requestedConversationId?: string | null) => Promise<{
 *     conversationId: string | null,
 *     workspacePath: string | null,
 *   }>,
 *   setUiWorkspaceTrusted: (trusted: boolean) => void,
 *   workspaceIndex: { list: (opts: { query?: string, limit?: number, workspacePath?: string | null }) => Promise<unknown> },
 *   workspaceTrust: {
 *     get: (workspacePath: string | null) => Promise<unknown>,
 *     set: (workspacePath: string | null, trusted: boolean) => Promise<{ trusted: boolean }>,
 *   },
 *   appState: { getState: () => Promise<{ conversationId?: string }> },
 *   assertNotBusy: (conversationId: string) => void,
 *   chat: { resetSession: () => Promise<void> },
 * }} ctx
 */
export function registerWorkspaceIpc(ctx) {
  const {
    ipcMain,
    userDataPath,
    resolveActiveRuntime,
    setUiWorkspaceTrusted,
    workspaceIndex,
    workspaceTrust,
    assertNotBusy,
    chat,
  } = ctx

  ipcHandle(ipcMain, 'workspace:listContext', async (_event, query, limit) => {
    const { workspacePath } = await resolveActiveRuntime()
    return workspaceIndex.list({ query, limit, workspacePath })
  })

  ipcHandle(ipcMain, 'workspace:getTrust', async () => {
    const { workspacePath } = await resolveActiveRuntime()
    return workspaceTrust.get(workspacePath)
  })

  ipcHandle(ipcMain, 'workspace:setTrust', async (_event, trusted) => {
    const { conversationId, workspacePath } = await resolveActiveRuntime()
    if (!conversationId) throw new Error('当前会话无效')
    assertNotBusy(conversationId)
    const result = await workspaceTrust.set(workspacePath, trusted === true)
    setUiWorkspaceTrusted(result.trusted)
    await chat.resetSession()
    return result
  })

  ipcHandle(ipcMain, 'workspace:createReference', async (_event, droppedPath) => {
    const { workspacePath } = await resolveActiveRuntime()
    if (!workspacePath || typeof droppedPath !== 'string' || !droppedPath) throw new Error('拖入的文件路径无效')
    const root = await fs.realpath(workspacePath)
    const real = await fs.realpath(path.resolve(droppedPath))
    if (!isWorkspacePath(root, real)) throw new Error('只能引用当前工作区内的文件或文件夹')
    const info = await fs.stat(real)
    if (!info.isFile() && !info.isDirectory()) throw new Error('该项目不是可引用的文件或文件夹')
    const relative = path.relative(root, real).split(path.sep).join('/')
    const escaped = relative.includes(' ') ? `"${relative.replaceAll('"', '\\"')}"` : relative
    return { path: relative, kind: info.isDirectory() ? 'directory' : 'file', token: `@${info.isDirectory() ? 'dir' : 'file'}:${escaped}` }
  })

  ipcHandle(ipcMain, 'workspace:saveClipboardImage', async (_event, payload) => {
    const { workspacePath } = await resolveActiveRuntime()
    if (!payload || !payload.base64) throw new Error('剪贴板图片数据无效')
    const buffer = Buffer.from(payload.base64, 'base64')
    const ext = payload.mimeType === 'image/jpeg' ? '.jpg' : payload.mimeType === 'image/webp' ? '.webp' : '.png'
    const name = sanitizeClipboardAttachmentFilename(payload.filename, ext)
    let targetDir
    let isInsideWorkspace = false
    if (workspacePath) {
      targetDir = path.join(workspacePath, '.taskweaver', 'attachments')
      isInsideWorkspace = true
    } else {
      targetDir = path.join(userDataPath, 'attachments')
    }
    await fs.mkdir(targetDir, { recursive: true })
    const targetPath = path.join(targetDir, name)
    assertAttachmentInsideDir(targetDir, targetPath)
    await fs.writeFile(targetPath, buffer)
    if (isInsideWorkspace) {
      const root = await fs.realpath(workspacePath)
      const real = await fs.realpath(targetPath)
      const relative = path.relative(root, real).split(path.sep).join('/')
      const escaped = relative.includes(' ') ? `"${relative.replaceAll('"', '\\"')}"` : relative
      return {
        path: relative,
        kind: 'file',
        token: `@file:${escaped}`,
        fullPath: targetPath,
      }
    }
    const escaped = targetPath.includes(' ') ? `"${targetPath.replaceAll('"', '\\"')}"` : targetPath
    return {
      path: targetPath,
      kind: 'file',
      token: `@file:${escaped}`,
      fullPath: targetPath,
    }
  })
}
