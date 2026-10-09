import path from 'node:path'
import { registerScheduledJobsIpc } from '../register-scheduled-jobs-ipc.mjs'
import { registerTerminalIpc } from '../register-terminal-ipc.mjs'
import { registerWorkspaceGitIpc } from '../register-workspace-git-ipc.mjs'
import { resolveModelKeyForChat } from '../chat-model-resolver.mjs'
import { compareConversationTranscripts } from '../conversation-shadow-compare.mjs'
import { createScheduledJobsRunner } from '../scheduled-jobs-runner.mjs'
import { probeSandboxSupport } from '../sandbox-service.mjs'
import { resolveSandboxPolicy } from '../sandbox-policy.mjs'
import { listGithubPullRequests } from '../github-pull-requests.mjs'
import { createGitCheckpoint } from '../git-service.mjs'
import { registerWorktreeIpc } from './register-worktree-ipc.mjs'
import { registerPreferencesIpc } from './register-preferences-ipc.mjs'
import { registerMemoryIpc } from './register-memory-ipc.mjs'
import { registerSandboxIpc } from './register-sandbox-ipc.mjs'
import { registerDebugIpc } from './register-debug-ipc.mjs'
import { registerWorkspaceIpc } from './register-workspace-ipc.mjs'
import { registerAppIpc } from './register-app-ipc.mjs'
import { registerMcpIpc } from './register-mcp-ipc.mjs'
import { registerModelsIpc } from './register-models-ipc.mjs'
import { registerPermissionsIpc } from './register-permissions-ipc.mjs'
import { registerChatIpc } from './register-chat-ipc.mjs'
import { registerChatSendIpc } from './register-chat-send-ipc.mjs'
import { createChatTurnPipeline } from '../chat-turn-pipeline.mjs'
import { createScheduledJobRunHandler } from '../scheduled-job-run.mjs'

/**
 * 在 compose 完成后注册各领域 IPC、定时任务与终端生命周期。
 * @param {{ ipcMain: import('electron').IpcMain, app: import('electron').App, dialog: import('electron').Dialog, BrowserWindow: typeof import('electron').BrowserWindow, ctx: Awaited<ReturnType<import('../compose-services.mjs').composeBackendServices>> }} deps
 */
export function wireBackendIpc({ ipcMain, app, dialog, BrowserWindow, ctx }) {
  const {
    userData,
    fallbackWorkspace,
    profileStore,
    approvalAudit,
    mcp,
    hostManager,
    conversationHub,
    modelRegistryUpdater,
    modelService,
    appBootstrap,
    appState,
    usageStore,
    workspaceTrust,
    webSearch,
    appPreferences,
    permissionRulesStore,
    sandboxSession,
    getCachedWorkspace,
    getCachedConversationId,
    setCachedWorkspaceTrusted,
    cachedBashSandbox,
    cachedPermissionMode,
    cachedSessionSandboxMode,
    setCachedSessionSandboxMode,
    refreshWorkspaceCache,
    getConversationRuntimeContext,
    sandboxContextLineForContext,
    skills,
    sessionMemory,
    workspaceIndex,
    turnInProgressByConversation,
    withTurnLock,
    resolveWorktreeContext,
    workspaceHooksTrusted,
    resolveIpcConversationId,
    assertNotBusy,
    withWorkspaceOperation,
    validateWorkspace,
    permissions,
    customProviderService,
    persistNativeTurn,
    chat,
    orchestration,
    scheduledJobsStore,
    pricingSync,
    credentialStore,
  } = ctx

  const chatTurnPipeline = createChatTurnPipeline({
    appState,
    profileStore,
    usageStore,
    resolveModelKeyForChat,
    appPreferences,
    createGitCheckpoint,
    userDataPath: userData,
    chat,
    orchestration,
    permissions,
    skills,
    persistNativeTurn,
    workspaceHooksTrusted,
    sandboxContextLineForContext,
  })

  const scheduledJobsRunner = createScheduledJobsRunner({
    store: scheduledJobsStore,
    lockDirectory: path.join(userData, 'scheduled-job-locks'),
    runJob: createScheduledJobRunHandler({
      profileStore,
      getCachedWorkspace,
      appState,
      permissions,
      getConversationRuntimeContext,
      withTurnLock,
      chatTurnPipeline,
    }),
  })
  scheduledJobsRunner.start()

  const assertMcpHostRestartSafe = () => {
    if (turnInProgressByConversation.size > 0 || chat.isBusyAny() || orchestration.isBusy()) {
      throw new Error('有任务正在执行，不能此时重载 MCP 工具。请等所有会话任务结束后再保存或启用 MCP。')
    }
  }

  const reloadMcpRuntime = async () => {
    await mcp.prepareRuntimeIntegration()
    await hostManager.restart()
    await chat.resetSession()
  }

  registerMcpIpc({ ipcMain, mcp, assertMcpHostRestartSafe, reloadMcpRuntime })

  registerAppIpc({
    ipcMain,
    BrowserWindow,
    dialog,
    appState,
    chat,
    conversationHub,
    refreshWorkspaceCache,
    getCachedWorkspace,
    assertNotBusy,
    validateWorkspace,
  })

  registerWorkspaceIpc({
    ipcMain,
    userDataPath: userData,
    refreshWorkspaceCache,
    getCachedWorkspace,
    setCachedWorkspaceTrusted,
    workspaceIndex,
    workspaceTrust,
    appState,
    assertNotBusy,
    chat,
  })

  registerModelsIpc({
    ipcMain,
    userDataPath: userData,
    appBootstrap,
    modelService,
    modelRegistryUpdater,
    credentialStore,
    hostManager,
    profileStore,
    pricingSync,
    usageStore,
    appPreferences,
    chat,
    getCachedConversationId,
    customProviderService,
    refreshWorkspaceCache,
  })

  registerPermissionsIpc({
    ipcMain,
    refreshWorkspaceCache,
    getCachedWorkspace,
    permissionRulesStore,
    approvalAudit,
    resolveIpcConversationId,
    chat,
  })

  registerWorkspaceGitIpc({
    ipcMain,
    appState,
    userDataPath: userData,
    refreshWorkspaceCache,
    getWorkspacePath: getCachedWorkspace,
    withWorkspaceOperation,
  })

  registerPreferencesIpc({
    ipcMain,
    appPreferences,
    webSearch,
    listGithubPullRequests,
    getGitHubPersonalAccessToken: () => mcp.getGitHubPersonalAccessToken(),
  })

  registerScheduledJobsIpc({
    ipcMain,
    store: scheduledJobsStore,
    runner: scheduledJobsRunner,
    userDataPath: userData,
    getWorkspacePath: getCachedWorkspace,
  })

  registerDebugIpc({
    ipcMain,
    app,
    resolveIpcConversationId,
    appState,
    conversationHub,
    compareConversationTranscripts,
  })

  registerSandboxIpc({
    ipcMain,
    probeSandboxSupport,
    refreshWorkspaceCache,
    resolveSandboxPolicy,
    getCachedSandboxState: () => ({
      workspacePath: getCachedWorkspace(),
      bashSandbox: cachedBashSandbox(),
      permissionMode: cachedPermissionMode(),
      sessionSandboxMode: cachedSessionSandboxMode(),
    }),
    appState,
    sandboxSession,
    setCachedSessionSandboxMode,
  })

  registerWorktreeIpc({
    ipcMain,
    userDataPath: userData,
    resolveWorktreeContext,
    assertNotBusy,
    withWorkspaceOperation,
  })

  registerMemoryIpc({
    ipcMain,
    refreshWorkspaceCache,
    appState,
    sessionMemory,
    getCachedWorkspace,
  })

  registerChatIpc({
    ipcMain,
    skills,
    chat,
    orchestration,
    conversationHub,
    appState,
    resolveIpcConversationId,
    getConversationRuntimeContext,
    turnInProgressByConversation,
    withTurnLock,
    chatTurnPipeline,
  })

  registerChatSendIpc({
    ipcMain,
    appBootstrap,
    resolveIpcConversationId,
    getConversationRuntimeContext,
    withTurnLock,
    chatTurnPipeline,
  })

  const terminalService = registerTerminalIpc({
    ipcMain,
    getWorkspacePath: getCachedWorkspace,
    fallbackWorkspace,
  })

  app.on('before-quit', () => {
    scheduledJobsRunner.stop()
    terminalService.dispose()
  })

  return {
    modelService,
    profileStore,
    appState,
    chatService: chat,
    orchestrationService: orchestration,
    permissionService: permissions,
    permissionRulesStore,
    mcpService: mcp,
    terminalService,
  }
}
