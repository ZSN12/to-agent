import { resolveSandboxPolicy, renderFileSandboxContext } from '../sandbox-policy.mjs'

/**
 * 当前线程 UI 快照 + 按会话 runtime 上下文（阶段 5.2 续 / 5.4）。
 * 业务 IPC 应使用 getConversationRuntimeContext；UI 快照仅供 app:getState 等快速读取。
 */
export function createIpcRuntimeContext({
  appState,
  fallbackWorkspace,
  workspaceTrust,
  appPreferences,
  sandboxSession,
  usageStore,
}) {
  let uiWorkspacePath = fallbackWorkspace
  let uiConversationId = null
  let uiWorkspaceTrusted = false
  let uiPermissionMode = 'ask'
  let uiBashSandbox = 'auto'
  let uiSessionSandboxMode = null

  const refreshUiSnapshot = async () => {
    const state = await appState.getState()
    uiWorkspacePath = state.workspacePath || fallbackWorkspace
    uiConversationId = state.conversationId
    uiWorkspaceTrusted = (await workspaceTrust.get(uiWorkspacePath)).trusted
    uiPermissionMode = state.permissionMode || 'ask'
    const prefs = await appPreferences.get()
    uiBashSandbox = prefs.bashSandbox || 'auto'
    const sessionRow = uiConversationId ? await sandboxSession.get(uiConversationId) : null
    uiSessionSandboxMode = sessionRow?.mode ?? null
    if (state?.messages?.length) {
      void Promise.resolve(usageStore.importHistoricalIfEmpty(state.messages)).catch((err) => {
        console.error('导入历史消息失败:', err)
      })
    }
  }

  const getConversationRuntimeContext = async (conversationId) => {
    const state = conversationId && appState.getConversationState
      ? await appState.getConversationState(conversationId)
      : await appState.getState()
    const workspaceBound = typeof state.workspacePath === 'string' && state.workspacePath.length > 0
    const workspacePath = workspaceBound ? state.workspacePath : fallbackWorkspace
    const prefs = await appPreferences.get()
    const sessionRow = conversationId ? await sandboxSession.get(conversationId) : null
    const trusted = await workspaceTrust.get(workspacePath)
    return {
      conversationId: state.conversationId,
      workspacePath,
      workspaceBound,
      modelKey: state.modelKey ?? null,
      permissionMode: state.permissionMode || 'ask',
      workspaceTrusted: trusted.trusted === true,
      bashSandbox: prefs.bashSandbox || 'auto',
      sessionSandboxMode: sessionRow?.mode ?? null,
    }
  }

  const sandboxContextLineForContext = (context) => {
    const resolved = resolveSandboxPolicy({
      workspacePath: context.workspacePath,
      bashSandbox: context.bashSandbox,
      permissionMode: context.permissionMode,
      sessionSandboxMode: context.sessionSandboxMode,
    })
    if (resolved.file.mode === 'off') return null
    return renderFileSandboxContext(resolved.file, resolved.workspaceRoot)
  }

  return {
    refreshUiSnapshot,
    getConversationRuntimeContext,
    sandboxContextLineForContext,
    getUiWorkspacePath: () => uiWorkspacePath,
    getUiConversationId: () => uiConversationId,
    getUiWorkspaceTrusted: () => uiWorkspaceTrusted,
    setUiWorkspaceTrusted: (trusted) => { uiWorkspaceTrusted = trusted },
    getUiBashSandbox: () => uiBashSandbox,
    getUiPermissionMode: () => uiPermissionMode,
    getUiSessionSandboxMode: () => uiSessionSandboxMode,
    setUiSessionSandboxMode: (mode) => { uiSessionSandboxMode = mode },
  }
}
