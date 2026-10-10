import { ipcHandle } from '../ipc-utils.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   resolveActiveRuntime: (requestedConversationId?: string | null) => Promise<{
 *     conversationId: string | null,
 *     workspacePath: string | null,
 *   }>,
 *   sessionMemory: { load: (conversationId: string) => Promise<unknown>, save: (conversationId: string, payload: unknown) => Promise<void> },
 * }} ctx
 */
export function registerMemoryIpc(ctx) {
  const { ipcMain, resolveActiveRuntime, sessionMemory } = ctx

  ipcHandle(ipcMain, 'memory:get', async () => {
    const { conversationId } = await resolveActiveRuntime()
    if (!conversationId) return null
    return sessionMemory.load(conversationId)
  })

  ipcHandle(ipcMain, 'memory:clear', async () => {
    const { conversationId, workspacePath } = await resolveActiveRuntime()
    if (!conversationId) return { ok: true }
    const empty = {
      conversation_id: conversationId,
      workspace_path: workspacePath,
      user_goal: '',
      rolling_summary: '',
      runs: {},
      run_order: [],
      facts: [],
      evidence_bundles: [],
      updated_at: new Date().toISOString(),
    }
    await sessionMemory.save(conversationId, empty)
    return { ok: true }
  })
}
