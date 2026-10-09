import { ipcHandle } from '../ipc-utils.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   probeSandboxSupport: () => unknown,
 *   resolveActiveRuntime: (requestedConversationId?: string | null) => Promise<{
 *     conversationId: string | null,
 *     workspacePath: string | null,
 *     bashSandbox: unknown,
 *     permissionMode: unknown,
 *     sessionSandboxMode: unknown,
 *   }>,
 *   resolveSandboxPolicy: (input: unknown) => unknown,
 *   sandboxSession: { set: (conversationId: string, mode: unknown) => Promise<unknown> },
 *   setUiSessionSandboxMode: (mode: unknown) => void,
 * }} ctx
 */
export function registerSandboxIpc(ctx) {
  const {
    ipcMain,
    probeSandboxSupport,
    resolveActiveRuntime,
    resolveSandboxPolicy,
    sandboxSession,
    setUiSessionSandboxMode,
  } = ctx

  ipcHandle(ipcMain, 'sandbox:probe', () => probeSandboxSupport())

  ipcHandle(ipcMain, 'sandbox:getEffective', async () => {
    const { workspacePath, bashSandbox, permissionMode, sessionSandboxMode } = await resolveActiveRuntime()
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
    const { conversationId } = await resolveActiveRuntime()
    if (!conversationId) throw new Error('当前会话无效')
    const normalized = mode === 'default' || mode === null || mode === '' ? null : mode
    const ev = await sandboxSession.set(conversationId, normalized)
    setUiSessionSandboxMode(normalized)
    const payload = ev || { type: 'sandbox/mode', time: Date.now(), data: { mode: 'workspace-write', source: 'user' } }
    event.sender.send('sandbox:mode', payload)
    return payload
  })
}
