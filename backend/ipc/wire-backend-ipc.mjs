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
import { createChatDocumentAttachmentService } from '../chat-document-attachments.mjs'

/**
 * 在 compose 完成后注册各领域 IPC、定时任务与终端生命周期。
 * @param {{ ipcMain: import('electron').IpcMain, app: import('electron').App, dialog: import('electron').Dialog, BrowserWindow: typeof import('electron').BrowserWindow, ctx: Awaited<ReturnType<import('../compose-services.mjs').composeBackendServices>> }} deps
 */
export function wireBackendIpc({ ipcMain, app, dialog, BrowserWindow, shell, ctx }) {
  const {
    userData,
    fallbackWorkspace,
    profileStore,
    approvalAudit,
    mcp,
    hostManager,
    hostNodeExecutable,
    conversationHub,
    modelRegistryUpdater,
    modelService,
    appBootstrap,
    startHostModelCatalogEvents,
    appState,
    usageStore,
    workspaceTrust,
    webSearch,
    appPreferences,
    permissionRulesStore,
    sandboxSession,
    getUiConversationId,
    setUiWorkspaceTrusted,
    setUiSessionSandboxMode,
    refreshUiSnapshot,
    getConversationRuntimeContext,
    sandboxContextLineForContext,
    skills,
    sessionMemory,
    workspaceIndex,
    turnInProgressByConversation,
    withTurnLock,
    withMcpHostRestartLock,
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
    contextInjectionLedger,
    orchestration,
    scheduledJobsStore,
    pricingSync,
    credentialStore,
  } = ctx

  const resolveActiveRuntime = async (requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId ?? null)
    const runtime = await getConversationRuntimeContext(conversationId)
    return { conversationId, ...runtime }
  }

  const chatTurnPipeline = createChatTurnPipeline({
    appState,
    profileStore,
    modelService,
    usageStore,
    resolveModelKeyForChat,
    appPreferences,
    createGitCheckpoint,
    userDataPath: userData,
    chat,
    contextInjectionLedger,
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
      getWorkspacePathForJob: async (conversationId) => {
        const runtime = await getConversationRuntimeContext(
          conversationId ?? (await resolveIpcConversationId(null)),
        )
        return runtime.workspacePath
      },
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

  registerMcpIpc({ ipcMain, dialog, BrowserWindow, shell, mcp, assertMcpHostRestartSafe, reloadMcpRuntime, withMcpHostRestartLock })

  registerAppIpc({
    ipcMain,
    BrowserWindow,
    dialog,
    appState,
    userDataPath: userData,
    chat,
    sessionMemory,
    conversationHub,
    refreshUiSnapshot,
    assertNotBusy,
    validateWorkspace,
    withWorkspaceOperation,
  })

  registerWorkspaceIpc({
    ipcMain,
    userDataPath: userData,
    resolveActiveRuntime,
    setUiWorkspaceTrusted,
    workspaceIndex,
    workspaceTrust,
    assertNotBusy,
    chat,
  })

  registerModelsIpc({
    ipcMain,
    BrowserWindow,
    shell,
    userDataPath: userData,
    appPath: app.getAppPath(),
    appBootstrap,
    startHostModelCatalogEvents,
    modelService,
    modelRegistryUpdater,
    credentialStore,
    hostManager,
    profileStore,
    pricingSync,
    usageStore,
    appPreferences,
    chat,
    getUiConversationId,
    customProviderService,
  })

  registerPermissionsIpc({
    ipcMain,
    resolveActiveRuntime,
    permissionRulesStore,
    approvalAudit,
    resolveIpcConversationId,
    chat,
  })

  registerWorkspaceGitIpc({
    ipcMain,
    userDataPath: userData,
    resolveActiveRuntime,
    withWorkspaceOperation,
  })

  const assertCompactionSettingsChangeSafe = () => {
    if (turnInProgressByConversation.size > 0 || chat.isBusyAny() || orchestration.isBusy()) {
      throw new Error('有任务正在执行，不能此时重载自动压缩设置。请等所有会话任务结束后再保存。')
    }
  }

  const chatDocumentAttachments = createChatDocumentAttachmentService({ dialog, resolveIpcConversationId })

  registerPreferencesIpc({
    ipcMain,
    appPreferences,
    webSearch,
    listGithubPullRequests,
    getGitHubPersonalAccessToken: () => mcp.getGitHubPersonalAccessToken(),
    assertCompactionSettingsChangeSafe,
    onCompactionSettingsChanged: () => hostManager.restart(),
  })

  registerScheduledJobsIpc({
    ipcMain,
    store: scheduledJobsStore,
    runner: scheduledJobsRunner,
    userDataPath: userData,
    getWorkspacePath: async (conversationId) => (await resolveActiveRuntime(conversationId)).workspacePath,
    launchAgentRuntime: {
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      nodePath: hostNodeExecutable,
      path: process.env.PATH,
    },
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
    resolveActiveRuntime,
    resolveSandboxPolicy,
    sandboxSession,
    setUiSessionSandboxMode,
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
    resolveActiveRuntime,
    sessionMemory,
  })

  registerChatIpc({
    ipcMain,
    dialog,
    hostManager,
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
    chatDocumentAttachments,
  })

  registerChatSendIpc({
    ipcMain,
    appBootstrap,
    resolveIpcConversationId,
    getConversationRuntimeContext,
    withTurnLock,
    chatTurnPipeline,
    chatDocumentAttachments,
  })

  const terminalService = registerTerminalIpc({
    ipcMain,
    resolveRuntimeContext: () => resolveActiveRuntime(),
    resolveTerminalPolicy: (context) => {
      const policy = resolveSandboxPolicy(context).bash
      // `auto` means sandbox when supported. Do not let the terminal turn an
      // unavailable runner into an unrestricted shell by silently resolving
      // the effective policy to `off`.
      if (context.permissionMode !== 'full'
        && context.sessionSandboxMode !== 'danger-full-access'
        && context.bashSandbox === 'auto'
        && policy.mode === 'off') {
        return { mode: 'workspace-write', workspaceRoot: context.workspacePath }
      }
      return policy
    },
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
