import fs from 'node:fs/promises'
import path from 'node:path'
import { ipcHandle } from '../ipc-utils.mjs'
import { isWorkspacePath } from '../workspace-index.mjs'

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

}
