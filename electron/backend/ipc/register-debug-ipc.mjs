import { ipcHandle } from '../ipc-utils.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   app: { isPackaged: boolean },
 *   resolveIpcConversationId: (requested?: string | null) => Promise<string | null>,
 *   appState: {
 *     getConversationState?: (id: string) => Promise<{ messages?: unknown[] } | null>,
 *     getState: () => Promise<{ messages?: unknown[] } | null>,
 *   },
 *   conversationHub: { getView: (conversationId: string) => { transcript?: unknown[] } | null },
 *   compareConversationTranscripts: (local: unknown[], host: unknown[]) => unknown,
 * }} ctx
 */
export function registerDebugIpc(ctx) {
  const {
    ipcMain,
    app,
    resolveIpcConversationId,
    appState,
    conversationHub,
    compareConversationTranscripts,
  } = ctx

  ipcHandle(ipcMain, 'debug:shadowTranscript', async (_event, requestedConversationId) => {
    if (app.isPackaged) return null
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) return null
    const threadState = appState.getConversationState
      ? await appState.getConversationState(conversationId)
      : await appState.getState()
    const view = conversationHub.getView(conversationId)
    const hostRows = view?.transcript ?? []
    return compareConversationTranscripts(threadState?.messages ?? [], hostRows)
  })
}
