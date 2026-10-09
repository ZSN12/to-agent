import { ipcHandle } from '../ipc-utils.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   probeSandboxSupport: () => unknown,
 *   refreshWorkspaceCache: () => Promise<void>,
 *   resolveSandboxPolicy: (input: unknown) => unknown,
 *   getCachedSandboxState: () => {
 *     workspacePath: string | null,
 *     bashSandbox: unknown,
 *     permissionMode: unknown,
 *     sessionSandboxMode: unknown,
 *   },
 *   appState: { getState: () => Promise<{ conversationId?: string } | null> },
 *   sandboxSession: { set: (conversationId: string, mode: unknown) => Promise<unknown> },
 *   setCachedSessionSandboxMode: (mode: unknown) => void,
 * }} ctx
 */
export function registerSandboxIpc(ctx) {
  const {
    ipcMain,
    probeSandboxSupport,
    refreshWorkspaceCache,
    resolveSandboxPolicy,
    getCachedSandboxState,
    appState,
    sandboxSession,
    setCachedSessionSandboxMode,
  } = ctx

  ipcHandle(ipcMain, 'sandbox:probe', () => probeSandboxSupport())

  ipcHandle(ipcMain, 'sandbox:getEffective', async () => {
    await refreshWorkspaceCache()
    const { workspacePath, bashSandbox, permissionMode, sessionSandboxMode } = getCachedSandboxState()
    return {
      ...resolveSandboxPolicy({
        workspacePath,
        bashSandbox,
        permissionMode,
        sessionSandboxMode,
      }),
      sessionSandboxMode,
    }
  })

  ipcHandle(ipcMain, 'sandbox:setSessionMode', async (event, mode) => {
    await refreshWorkspaceCache()
    const state = await appState.getState()
    const conversationId = state?.conversationId
    if (!conversationId) throw new Error('当前会话无效')
    const normalized = mode === 'default' || mode === null || mode === '' ? null : mode
    const ev = await sandboxSession.set(conversationId, normalized)
    setCachedSessionSandboxMode(normalized)
    const payload = ev || { type: 'sandbox/mode', time: Date.now(), data: { mode: 'workspace-write', source: 'user' } }
    event.sender.send('sandbox:mode', payload)
    return payload
  })
}
