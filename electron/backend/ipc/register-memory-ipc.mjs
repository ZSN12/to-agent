import { ipcHandle } from '../ipc-utils.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   refreshWorkspaceCache: () => Promise<void>,
 *   appState: { getState: () => Promise<{ conversationId?: string } | null> },
 *   sessionMemory: { load: (conversationId: string) => Promise<unknown>, save: (conversationId: string, payload: unknown) => Promise<void> },
 *   getCachedWorkspace: () => string | null,
 * }} ctx
 */
export function registerMemoryIpc(ctx) {
  const { ipcMain, refreshWorkspaceCache, appState, sessionMemory, getCachedWorkspace } = ctx

  ipcHandle(ipcMain, 'memory:get', async () => {
    await refreshWorkspaceCache()
    const state = await appState.getState()
    const conversationId = state?.conversationId
    if (!conversationId) return null
    return sessionMemory.load(conversationId)
  })

  ipcHandle(ipcMain, 'memory:clear', async () => {
    await refreshWorkspaceCache()
    const state = await appState.getState()
    const conversationId = state?.conversationId
    if (!conversationId) return { ok: true }
    const empty = {
      conversation_id: conversationId,
      workspace_path: getCachedWorkspace(),
      user_goal: '',
      rolling_summary: '',
      dependency_outputs: {},
      facts: [],
      evidence_bundles: [],
      updated_at: new Date().toISOString(),
    }
    await sessionMemory.save(conversationId, empty)
    return { ok: true }
  })
}
