import path from 'node:path'
import { homedir } from 'node:os'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import { createProfileStore } from './profile-store.mjs'
import { createModelService } from './model-service.mjs'
import { createModelRegistryUpdater } from './model-registry-updater.mjs'
import { createAppStateStore } from './app-state-store.mjs'
import { createDshChatService } from './dsh-chat-service.mjs'
import { createChatTurnPersistence } from './chat-turn-persistence.mjs'
import { createOrchestrationService, PlannerFallbackError } from './orchestration-service.mjs'
import { createSkillService } from './skill-service.mjs'
import { decideExecutionMode, resolveExecutionMode } from './orchestration-policy.mjs'
import { evaluateOrchestrationGate } from './orchestration-gate.mjs'
import { createPermissionService, clearSessionPermissionGrants } from './permission-service.mjs'
import { routePermissionPromptResponse } from './permission-prompt-bridge.mjs'
import { createPermissionRulesStore } from './permission-rules-store.mjs'
import { createWorkspaceIndex } from './workspace-index.mjs'
import { isWorkspacePath } from './workspace-index.mjs'
import {
  assembleAndComposeUserPrompt,
  logPromptPipelineAccounting,
  promptBudgetSnapshotFromStats,
} from './assemble-and-compose-user-prompt.mjs'
import { createWorkspaceTrustService } from './workspace-trust-service.mjs'
import { createMcpService } from './mcp-service.mjs'
import {
  isGitRepository,
  getGitStatus,
  suggestCommitMessage,
  createGitCheckpoint,
  previewManualGitCommit,
  createManualGitCommitSnapshot,
  deleteGitCheckpoint,
  listGitCheckpoints,
  getGitCheckpointDiff,
  restoreGitCheckpoint,
} from './git-service.mjs'
import { createUsageStore } from './usage-store.mjs'
import { createPricingSyncService } from './pricing-sync-service.mjs'
import { assertSafeWorkspacePath } from './security-path.mjs'
import { detectVerificationCommands, executeVerificationRunner } from './verification-policy.mjs'
import { resolvePrimaryAgentPreset } from './primary-agent-preset.mjs'
import { humanizeOpenCodexTransportError } from './opencodex-health.mjs'
import { createTerminalService } from './terminal-service.mjs'
import { diagnoseEnvironment, diagnoseTool } from './env-service.mjs'
import {
  loadRoutingPortfolio,
  saveRoutingPortfolio,
  resetRoutingPortfolioToBundled,
  loadBundledRoutingPortfolio,
  resolveDisplayName,
} from './routing-portfolio-service.mjs'
import { resolveModelKeyForChat } from './chat-model-resolver.mjs'
import { createWebSearchService } from './web-search-service.mjs'
import { createAppPreferencesStore } from './app-preferences.mjs'
import { compareConversationTranscripts } from './conversation-shadow-compare.mjs'
import { createScheduledJobsStore } from './scheduled-jobs-store.mjs'
import { createScheduledJobsRunner } from './scheduled-jobs-runner.mjs'
import { loadTaskweaverHooks, runTaskweaverHooks } from './taskweaver-hook-runner.mjs'
import {
  installJobLaunchAgent,
  isJobLaunchAgentInstalled,
  removeJobLaunchAgent,
} from './launchd-scheduler.mjs'
import { probeSandboxSupport } from './sandbox-service.mjs'
import { resolveSandboxPolicy, renderFileSandboxContext } from './sandbox-policy.mjs'
import { createSandboxSessionStore } from './sandbox-session-mode.mjs'
import { createCredentialStore } from './credential-store.mjs'
import { listMcpCatalog } from './mcp-catalog.mjs'
import { listGithubPullRequests } from './github-pull-requests.mjs'
import { getMarketplaceManifest, listMarketplaceEntries, catalogEntryToServerConfig } from './mcp-marketplace.mjs'
import { createTaskWorktree, listTaskWorktrees, removeTaskWorktree, getTaskWorktreeDiff } from './worktree-service.mjs'
import { createMemoryStore } from './memory-store.mjs'
import { createCustomProviderService } from './custom-provider-service.mjs'
import { listModelsFromExport, syncOpenCodexFromCli } from './opencodex-sync.mjs'
import { resolveOcxExecutable, setOcxRuntimeContext } from './opencodex-binary.mjs'
import { autoStartOpenCodexIfNeeded, writeOpenCodexExportSnapshot } from './opencodex-lifecycle.mjs'
import {
  ensureOpenCodexProxy,
  getOpenCodexSetupStatus,
  openOpenCodexDashboard,
  startOpenCodexProviderLogin,
} from './opencodex-service.mjs'
import { migrateLegacyModelsJson, resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'
import { ensureModelsJsonSyncedToDshHost } from './sync-models-json-to-host.mjs'
import { IPC_PLANNER_FALLBACK_HINT_MAX_LENGTH, IPC_ERROR_MESSAGE_MAX_LENGTH } from './config.mjs'
import { resolveConversationId } from './conversation-id-routing.mjs'
import { nativeChatCommand } from './native-chat-command.mjs'
import { createWorkspaceOperationGuard } from './workspace-operation-guard.mjs'

function ipcHandle(ipcMain, channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const data = await fn(event, ...args)
      return { ok: true, data }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message,
        ...(error?.partialResult?.turnId || error?.turnId ? { turnId: error.partialResult?.turnId ?? error.turnId } : {}),
        ...(error?.runContinues ? { runContinues: true } : {}) }
    }
  })
}

/**
 * 注册全部主进程 IPC（模型 + 应用状态 + 单 Agent 对话）。
 */
export async function registerIpc({ ipcMain, app, dialog, BrowserWindow, safeStorage, net }) {
  const { configureCodexOAuthNetwork } = await import('./codex-oauth.mjs')
  const { configureGitHubMcpOAuthNetwork } = await import('./github-mcp-oauth.mjs')
  if (net?.fetch) {
    const electronFetch = (input, init) => net.fetch(input, init)
    configureCodexOAuthNetwork({ fetch: electronFetch })
    configureGitHubMcpOAuthNetwork({ fetch: electronFetch })
  }
  const userData = app.getPath('userData')
  // 为无项目对话创建默认工作区目录（类似 Codex 的做法）
  const fallbackWorkspace = path.join(app.getPath('documents'), 'TaskWeaver-Scratch')

  // 确保默认工作区目录存在
  try {
    await fs.mkdir(fallbackWorkspace, { recursive: true })
  } catch (err) {
    console.warn('Failed to create fallback workspace:', err)
  }

  const profileStore = createProfileStore(userData)
  const agentDataPath = path.join(userData, 'taskweaver-agent')
  const dshHomePath = path.join(userData, 'dsh')
  const agentsHomePath = process.env.DSH_AGENTS_HOME || path.join(homedir(), '.agents')
  const builtInSkillsPath = path.join(app.getAppPath(), 'vendor', 'z-runtime', '.agents', 'skills')
  const builtInExtensionsPath = path.join(app.getAppPath(), 'electron', 'extensions', 'taskweaver-permissions.ts')
  const extensionsDir = path.join(app.getAppPath(), 'electron', 'extensions')
  const builtInExtensionsPaths = fsSync.existsSync(extensionsDir)
    ? fsSync
      .readdirSync(extensionsDir)
      .filter((name) => name.endsWith('.ts') || name.endsWith('.js'))
      .map((name) => path.join(extensionsDir, name))
    : [builtInExtensionsPath]
  const bundledRegistryPath = path.join(app.getAppPath(), 'pricing', 'registry.json')
  const pricingSync = createPricingSyncService({
    userDataPath: userData,
    bundledRegistryPath,
  })
  pricingSync.start()

  const credentialStore = createCredentialStore({
    filePath: path.join(userData, 'credentials.enc'),
    safeStorage,
  })

  const mcp = createMcpService({ userData, safeStorage })
  const { createZHostManager, resolveTaskWeaverRuntimeRoot } = await import('../agent/z-host/index.mjs')
  const runtimeRoot = resolveTaskWeaverRuntimeRoot({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
  })
  setOcxRuntimeContext({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
  })

  const hostManager = createZHostManager({
    runtimeRoot,
    userDataPath: userData,
    executable: process.execPath,
    isPackaged: app.isPackaged,
    getMcpRuntimeIntegration: () => mcp.prepareRuntimeIntegration(),
  })
  const { createZConversationHub } = await import('./z-conversation-hub.mjs')
  const conversationHub = createZConversationHub({ runtimeRoot })
  void migrateLegacyModelsJson(userData).catch((error) => {
    console.warn('models.json 迁移失败:', error instanceof Error ? error.message : error)
  })
  const modelsPath = resolveTaskWeaverModelsPath(userData)
  void hostManager.start()
    .then(() => ensureModelsJsonSyncedToDshHost({
      hostManager,
      userDataPath: userData,
      credentialStore,
    }))
    .catch((error) => {
      console.error('Z Host 预启动或 models.json 同步失败（模型目录将重试）:', error instanceof Error ? error.message : error)
    })

  const modelRegistryUpdater = createModelRegistryUpdater({
    userDataPath: userData,
    bundledRegistryPath: path.join(app.getAppPath(), 'registry', 'model-registry.v1.json'),
    currentAppVersion: app.getVersion(),
    runtimeLockPath: path.join(app.getAppPath(), 'runtime-lock.json'),
    publicKeyDer: fsSync.readFileSync(
      path.join(app.getAppPath(), 'registry', 'model-registry-public-key.der.b64'),
      'utf8',
    ).trim(),
    fetchImpl: net?.fetch ? (input, init) => net.fetch(input, init) : globalThis.fetch,
    onStatus: (status) => {
      for (const win of BrowserWindow?.getAllWindows?.() ?? []) {
        if (!win.isDestroyed()) win.webContents.send('models:updateStatus', status)
      }
    },
  })

  const modelService = createModelService({
    profileStore,
    priceRegistryPath: pricingSync.resolveReadPath(),
    dshHostManager: hostManager,
    userDataPath: userData,
    dshRuntimeRoot: runtimeRoot,
    modelRegistryUpdater,
  })
  modelRegistryUpdater.setMappingValidator((registry) => modelService.validateRegistryMapping(registry))
  void modelService.listCatalog()
    .then((catalog) => autoStartOpenCodexIfNeeded({ userDataPath: userData, catalog }))
    .then((status) => {
      if (status?.started) {
        console.info('[opencodex] 已自动确保本机代理就绪', status.baseUrl, status.bundled ? '(bundled ocx)' : status.ocx)
      }
      if (status?.started && status.composerContinuationOk === false) {
        console.warn(
          '[opencodex] 代理版本过旧（',
          status.proxyVersion ?? 'unknown',
          '），Composer 2.5 工具续写可能卡住。请在「模型与来源」点击「启动 OpenCodex」升级。',
        )
      }
    })
    .catch((error) => {
      console.warn('[opencodex] 自动启动检查失败:', error instanceof Error ? error.message : error)
    })
  void modelRegistryUpdater.hydrateStatus()
    .then(() => modelRegistryUpdater.checkForUpdates({ force: false }))
    .then((status) => {
      if (status.state === 'updated' || status.state === 'rolled-back') return modelService.refreshCatalog()
      return null
    })
    .catch((error) => console.warn('模型目录后台更新失败:', error instanceof Error ? error.message : error))
  const appState = createAppStateStore(userData, fallbackWorkspace)
  const usageStore = createUsageStore(userData)
  const workspaceTrust = createWorkspaceTrustService(userData)
  const webSearch = createWebSearchService({ userData })
  const appPreferences = createAppPreferencesStore(userData)
  const permissionRulesStore = createPermissionRulesStore({ userDataPath: userData })
  app.on('before-quit', () => { void mcp.stopAll() })

  let cachedWorkspace = fallbackWorkspace
  let cachedConversationId = null
  let cachedWorkspaceTrusted = false
  let cachedPermissionMode = 'ask'
  let cachedBashSandbox = 'auto'
  let cachedSessionSandboxMode = null
  const sandboxSession = createSandboxSessionStore(userData)
  const refreshWorkspaceCache = async () => {
    const state = await appState.getState()
    cachedWorkspace = state.workspacePath || fallbackWorkspace
    cachedConversationId = state.conversationId
    cachedWorkspaceTrusted = (await workspaceTrust.get(cachedWorkspace)).trusted
    cachedPermissionMode = state.permissionMode || 'ask'
    const prefs = await appPreferences.get()
    cachedBashSandbox = prefs.bashSandbox || 'auto'
    const sessionRow = cachedConversationId ? await sandboxSession.get(cachedConversationId) : null
    cachedSessionSandboxMode = sessionRow?.mode ?? null
    if (state?.messages?.length) {
      void Promise.resolve(usageStore.importHistoricalIfEmpty(state.messages)).catch((err) => {
        console.error('导入历史消息失败:', err)
      })
    }
  }
  await refreshWorkspaceCache()
  const getConversationRuntimeContext = async (conversationId) => {
    const state = conversationId && appState.getConversationState
      ? await appState.getConversationState(conversationId)
      : await appState.getState()
    // 区分「用户没选工作区」和「工作区恰好是某个路径」：只有前者会退化成 process.cwd()。
    const workspaceBound = typeof state.workspacePath === 'string' && state.workspacePath.length > 0
    const workspacePath = workspaceBound ? state.workspacePath : fallbackWorkspace
    const prefs = await appPreferences.get()
    const sessionRow = conversationId ? await sandboxSession.get(conversationId) : null
    const trusted = await workspaceTrust.get(workspacePath)
    return {
      conversationId: state.conversationId,
      workspacePath,
      workspaceBound,
      permissionMode: state.permissionMode || 'ask',
      workspaceTrusted: trusted.trusted === true,
      bashSandbox: prefs.bashSandbox || 'auto',
      sessionSandboxMode: sessionRow?.mode ?? null,
    }
  }
  // TaskWeaver 改造：允许无工作区对话
  // DSH 原本强制要求工作区以确保沙箱边界，但 TaskWeaver 放宽此限制：
  // - 无工作区时使用 fallbackWorkspace (~/Documents/TaskWeaver-Scratch)
  // - 用户可以随时与 AI 对话，即使没有选择项目
  // - 沙箱策略仍然生效（基于 fallbackWorkspace）
  const assertWorkspaceBound = (context) => {
    // 不再强制要求 workspaceBound，允许使用 fallbackWorkspace
    // if (!context?.workspaceBound) throw new Error('无工作区')
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
  const skills = createSkillService({
    agentDataPath,
    builtInSkillsPath,
    globalSkillPaths: [path.join(dshHomePath, 'skills'), path.join(agentsHomePath, 'skills')],
    getWorkspacePath: () => cachedWorkspace,
    getWorkspaceTrusted: () => cachedWorkspaceTrusted,
    hostManager
  })
  const sessionMemory = createMemoryStore({ agentDataPath })
  const workspaceIndex = createWorkspaceIndex({ getWorkspacePath: () => cachedWorkspace })
  const turnInProgressByConversation = new Map()
  const workspaceOperationGuard = createWorkspaceOperationGuard(getConversationRuntimeContext)

  const withTurnLock = async (conversationId, fn) => {
    if (!conversationId) throw new Error('缺少会话标识')
    if (turnInProgressByConversation.get(conversationId)) throw new Error('该会话的上一条任务仍在处理中')
    turnInProgressByConversation.set(conversationId, true)
    try {
      const runtimeContext = await getConversationRuntimeContext(conversationId)
      await workspaceOperationGuard.assertConversationCanRun(conversationId, runtimeContext.workspacePath)
      return await fn()
    } finally {
      turnInProgressByConversation.delete(conversationId)
    }
  }

  const resolveIpcConversationId = async (requestedConversationId) => {
    const state = requestedConversationId === undefined ? await appState.getState() : null
    return resolveConversationId(
      requestedConversationId,
      state?.conversationId ?? cachedConversationId,
    )
  }

  const assertNotBusy = (targetConversationId) => {
    // 只检查目标会话是否忙碌，允许其他会话并发运行
    if (targetConversationId && (
      turnInProgressByConversation.get(targetConversationId)
      || chat.isBusy(targetConversationId)
      || orchestration.isBusy(targetConversationId)
    )) {
      throw new Error('目标会话仍在执行任务，结束后再切换')
    }
    // 移除全局忙碌检查以支持多会话并发
  }
  const withWorkspaceOperation = (workspacePath, operation) => workspaceOperationGuard.withWorkspaceOperation(
    workspacePath,
    [...turnInProgressByConversation].filter(([, busy]) => busy).map(([conversationId]) => conversationId),
    operation,
  )
  const validateWorkspace = async (workspacePath) => {
    if (!workspacePath || typeof workspacePath !== 'string') throw new Error('工作区路径无效')
    const canonical = await fs.realpath(path.resolve(workspacePath))
    const info = await fs.stat(canonical)
    if (!info.isDirectory()) throw new Error('请选择一个文件夹作为工作区')
    return canonical
  }
  const permissions = createPermissionService({
    dialog,
    getParentWindow: (contents) => BrowserWindow?.fromWebContents(contents) ?? null,
    getWorkspacePath: async (conversationId) => (await getConversationRuntimeContext(conversationId)).workspacePath,
    getWorkspaceTrusted: () => cachedWorkspaceTrusted,
    getFileSandboxPolicy: async (conversationId) => {
      const context = await getConversationRuntimeContext(conversationId)
      return resolveSandboxPolicy(context).file
    },
    appState,
    rulesStore: permissionRulesStore,
    onPreMutation: async (ws, conversationId) => {
      if (await isGitRepository(ws)) {
        const res = await createGitCheckpoint(ws, {
          conversationId,
          summary: 'Agent 执行代码修改前自动快照',
          userDataPath: userData,
        })
        if (!res.ok) {
          return { ok: false, error: res.error || '创建代码修改前 Git 快照失败' }
        }
        return { ok: true, checkpoint: res.checkpoint }
      }
      return { ok: true }
    },
  })

  // hostManager already created above, reuse it here
  // No need to recreate - just ensure modelService has reference

  const customProviderService = createCustomProviderService({
    modelsPath,
    credentials: credentialStore,
    refreshRuntime: async () => {
      if (hostManager.isRunning()) {
        await ensureModelsJsonSyncedToDshHost({
          hostManager,
          userDataPath: userData,
          credentialStore,
        })
      }
    },
  })

  const persistNativeTurn = createChatTurnPersistence({ appState, usageStore })
  const chat = createDshChatService({
    hostManager,
    conversationHub,
    userDataPath: userData,
    getWorkspacePath: () => cachedWorkspace,
    profileStore,
    modelService,
    onTurnCompleted: persistNativeTurn,
    logger: console,
    getPermissionMode: async (conversationId) => {
      const state = conversationId && appState.getConversationState
        ? await appState.getConversationState(conversationId)
        : await appState.getState()
      return state.permissionMode || 'ask'
    },
  })

  app.on('before-quit', () => { void chat.stop() })
  const scheduledJobsStore = createScheduledJobsStore(userData)

  const orchestration = createOrchestrationService({
    modelService,
    profileStore,
    appState,
    mcpService: mcp,
    webSearchService: webSearch,
    getWorkspacePath: () => cachedWorkspace,
    getWorkspaceTrusted: () => cachedWorkspaceTrusted,
    agentDataPath,
    builtInSkillsPath,
    builtInExtensionsPath,
    builtInExtensionsPaths,
    userDataPath: userData,
    getAppPreferences: () => appPreferences.get(),
    dshRuntime: chat,
  })

  const scheduledJobsRunner = createScheduledJobsRunner({
    store: scheduledJobsStore,
    runJob: async (job) => {
      const modelKey = await profileStore.getActiveModelKey()
      const workspacePath = job.workspacePath || cachedWorkspace
      const conversationId = `scheduled-job-${job.id}`
      const executionMode = job.multiAgent ? 'multi-agent' : 'single-agent'
      const hooks = await loadTaskweaverHooks(userData, workspacePath)
      await runTaskweaverHooks('beforeTurn', hooks, {
        workspacePath,
        conversationId,
        text: job.prompt,
        executionMode,
      })
      if (job.multiAgent) {
        await orchestration.planAndExecute({
          text: job.prompt,
          primaryModelKey: modelKey,
          conversationId,
          workspacePath,
          webContents: null,
          skill: null,
          skillAlreadyApplied: false,
          synthesize: async (prompt) => chat.send({
            text: prompt,
            modelKey,
            conversationId,
            cwdOverride: workspacePath,
            webContents: null,
            agentPreset: resolvePrimaryAgentPreset(job.prompt, 'code', modelKey),
            skill: null,
            persistTerminal: false,
          }),
        })
      } else {
        await chat.send({
          text: job.prompt,
          modelKey,
          conversationId,
          cwdOverride: workspacePath,
          webContents: null,
          agentPreset: resolvePrimaryAgentPreset(job.prompt, 'code', modelKey),
          skill: null,
        })
      }
      await runTaskweaverHooks('afterTurn', hooks, {
        workspacePath,
        conversationId,
        text: job.prompt,
        executionMode,
      })
    },
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

  ipcHandle(ipcMain, 'app:getState', async () => {
    await refreshWorkspaceCache()
    return appState.getState()
  })

  ipcHandle(ipcMain, 'app:listOutputLogs', async (_event, options) => appState.listOutputLogs(options))

  ipcHandle(ipcMain, 'app:setWorkspace', async (_event, workspacePath) => {
    const current = await appState.getState()
    assertNotBusy(current.conversationId)
    if (!workspacePath) {
      await chat.resetSession()
      const state = await appState.setWorkspace(null)
      await refreshWorkspaceCache()
      return state
    }
    const canonicalWorkspace = await validateWorkspace(workspacePath)
    await chat.resetSession()
    const state = await appState.setWorkspace(canonicalWorkspace)
    await refreshWorkspaceCache()
    return state
  })

  ipcHandle(ipcMain, 'app:pickWorkspace', async () => {
    const current = await appState.getState()
    assertNotBusy(current.conversationId)
    const parent = BrowserWindow?.getFocusedWindow?.() ?? null
    const options = {
      title: '选择 TaskWeaver 工作区',
      defaultPath: cachedWorkspace,
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths?.[0]) return { cancelled: true, state: await appState.getState() }
    const canonicalWorkspace = await validateWorkspace(result.filePaths[0])
    await chat.resetSession()
    const state = await appState.setWorkspace(canonicalWorkspace)
    await refreshWorkspaceCache()
    return { cancelled: false, state }
  })

  ipcHandle(ipcMain, 'app:createThread', async (_event, options) => {
    await chat.resetSession()
    const state = await appState.createThread(options)
    await refreshWorkspaceCache()
    return state
  })

  ipcHandle(ipcMain, 'app:listThreads', () => appState.listThreads())

  ipcHandle(ipcMain, 'app:switchThread', async (event, threadId) => {
    const prior = await appState.getState()
    const priorConversationId = prior?.conversationId
    if (priorConversationId) conversationHub.detachSession(priorConversationId)
    await chat.resetSession()
    const state = await appState.switchThread(threadId)
    await refreshWorkspaceCache()
    const conversationId = state?.conversationId
    if (conversationId) {
      const sessionId = chat.getSessionId(conversationId)
      if (sessionId) {
        try {
          await conversationHub.attachSession(conversationId, sessionId, event.sender)
        } catch (error) {
          console.warn(
            '[register-ipc] conversation hub attach:',
            error instanceof Error ? error.message : error,
          )
        }
      }
    }
    return state
  })

  ipcHandle(ipcMain, 'app:renameThread', (_event, threadId, title) => appState.renameThread(threadId, title))
  ipcHandle(ipcMain, 'app:togglePinThread', (_event, threadId) => appState.togglePinThread(threadId))
  ipcHandle(ipcMain, 'app:toggleArchiveThread', (_event, threadId) => appState.toggleArchiveThread(threadId))
  ipcHandle(ipcMain, 'app:searchThreads', (_event, query, options) => appState.searchThreads(query, options))

  ipcHandle(ipcMain, 'app:deleteThread', async (_event, threadId) => {
    const before = await appState.getState()
    const target = (await appState.listThreads()).find((thread) => thread.id === threadId)
    if (target?.conversationId) assertNotBusy(target.conversationId)
    if (before.currentThreadId === threadId) await chat.resetSession()
    const state = await appState.deleteThread(threadId)
    await refreshWorkspaceCache()
    // 回收 DSH 侧：删掉映射条目（含编排子会话）并断开 hub 订阅。
    // 磁盘上的会话日志保留 —— 删除不可逆，日志仍可用于排查与恢复。
    if (target?.conversationId) {
      clearSessionPermissionGrants(target.conversationId)
      try {
        const { removed } = await chat.forgetConversation(target.conversationId)
        for (const conversationId of removed) {
          clearSessionPermissionGrants(conversationId)
          conversationHub.detachSession(conversationId)
        }
      } catch (error) {
        console.warn('[register-ipc] deleteThread 回收 DSH 会话映射失败:', error instanceof Error ? error.message : error)
      }
    }
    return state
  })

  /**
   * 把 UI 上的分支点换算成「保留前几轮」。
   * 一个 user 消息对应 DSH 日志里的一个 turn，因此切片里的 user 消息数就是轮数。
   */
  const resolveForkCompletedTurns = async (sourceConversationId, messageId) => {
    if (!sourceConversationId) return undefined
    const sourceState = await appState.getConversationState(sourceConversationId).catch(() => null)
    const messages = Array.isArray(sourceState?.messages) ? sourceState.messages : []
    if (!messages.length) return undefined
    let slice = messages
    if (messageId) {
      const index = messages.findIndex((message) => message.id === messageId)
      if (index >= 0) slice = messages.slice(0, index + 1)
    }
    const userTurns = slice.filter((message) => message.author === 'user').length
    return userTurns > 0 ? userTurns : undefined
  }

  ipcHandle(ipcMain, 'app:forkThread', async (_event, threadId, messageId) => {
    const source = (await appState.listThreads()).find((thread) => thread.id === threadId)
    if (!source) throw new Error('找不到要分支的会话')
    if (!source.conversationId) throw new Error('源会话没有可继承的 Z Host 上下文，无法安全创建分支')
    assertNotBusy(source.conversationId)
    const previousState = await appState.getState()
    await chat.resetSession()
    const state = await appState.forkThread(threadId, messageId)
    // fork 出来的对话此前是「UI 有消息、模型是空的」：Z Host 侧是新建的空会话。
    // 这里同步 fork 源 DSH 会话，让分支真正继承上下文。
    try {
      if (!state?.conversationId) throw new Error('本地分支记录未生成 conversationId')
      const completedTurns = await resolveForkCompletedTurns(source.conversationId, messageId)
      const result = await chat.forkConversation({
        sourceConversationId: source.conversationId,
        targetConversationId: state.conversationId,
        completedTurns,
      })
      if (!result?.ok) {
        const detail = [result?.reason, result?.error].filter(Boolean).join(': ')
        throw new Error(`Z Host 未能继承源会话上下文${detail ? `（${detail}）` : ''}`)
      }
      await refreshWorkspaceCache()
      return state
    } catch (error) {
      // appState.forkThread writes the visible branch before the Host can
      // create/persist its non-derivable child session ID. Roll the UI branch
      // back on any Host failure so users never see inherited messages paired
      // with an empty model session.
      const cleanupErrors = []
      if (state?.conversationId) {
        try {
          await chat.forgetConversation(state.conversationId)
          conversationHub.detachSession(state.conversationId)
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : String(cleanupError))
        }
      }
      try {
        const beforeRollback = state?.currentThreadId ? await appState.getState() : null
        const branchWasCurrent = beforeRollback?.currentThreadId === state?.currentThreadId
        if (state?.currentThreadId) await appState.deleteThread(state.currentThreadId)
        const remaining = await appState.listThreads()
        if (branchWasCurrent && previousState?.currentThreadId
          && remaining.some((thread) => thread.id === previousState.currentThreadId)) {
          await appState.switchThread(previousState.currentThreadId)
        }
        await refreshWorkspaceCache()
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : String(cleanupError))
      }
      const message = error instanceof Error ? error.message : String(error)
      const cleanupNote = cleanupErrors.length
        ? `；清理未完成：${cleanupErrors.join('；')}`
        : '；未完成的分支记录已回滚'
      throw new Error(`创建会话分支失败：${message}${cleanupNote}`)
    }
  })

  ipcHandle(ipcMain, 'app:setPermissionMode', async (_event, mode) => {
    const state = await appState.setPermissionMode(mode)
    await refreshWorkspaceCache()
    return state
  })

  ipcHandle(ipcMain, 'app:setModelKey', async (_event, modelKey) => {
    return await appState.setModelKey(modelKey)
  })

  ipcHandle(ipcMain, 'app:setThinkingLevel', async (_event, thinkingLevel) => {
    return await appState.setThinkingLevel(thinkingLevel)
  })

  ipcHandle(ipcMain, 'workspace:listContext', async (_event, query, limit) => {
    await refreshWorkspaceCache()
    return workspaceIndex.list({ query, limit })
  })

  ipcHandle(ipcMain, 'workspace:getTrust', async () => {
    await refreshWorkspaceCache()
    return workspaceTrust.get(cachedWorkspace)
  })

  ipcHandle(ipcMain, 'workspace:setTrust', async (_event, trusted) => {
    const current = await appState.getState()
    assertNotBusy(current.conversationId)
    await refreshWorkspaceCache()
    const result = await workspaceTrust.set(cachedWorkspace, trusted === true)
    cachedWorkspaceTrusted = result.trusted
    await chat.resetSession()
    return result
  })

  ipcHandle(ipcMain, 'workspace:createReference', async (_event, droppedPath) => {
    await refreshWorkspaceCache()
    if (!cachedWorkspace || typeof droppedPath !== 'string' || !droppedPath) throw new Error('拖入的文件路径无效')
    const root = await fs.realpath(cachedWorkspace)
    const real = await fs.realpath(path.resolve(droppedPath))
    if (!isWorkspacePath(root, real)) throw new Error('只能引用当前工作区内的文件或文件夹')
    const info = await fs.stat(real)
    if (!info.isFile() && !info.isDirectory()) throw new Error('该项目不是可引用的文件或文件夹')
    const relative = path.relative(root, real).split(path.sep).join('/')
    const escaped = relative.includes(' ') ? `"${relative.replaceAll('"', '\\"')}"` : relative
    return { path: relative, kind: info.isDirectory() ? 'directory' : 'file', token: `@${info.isDirectory() ? 'dir' : 'file'}:${escaped}` }
  })

  ipcHandle(ipcMain, 'app:clearConversation', async (_event, options) => {
    assertNotBusy()
    await chat.resetSession()
    const state = await appState.createThread(options)
    await refreshWorkspaceCache()
    return state
  })

  ipcHandle(ipcMain, 'models:loadBundle', () => modelService.loadModelBundle())
  ipcHandle(ipcMain, 'models:list', () => modelService.listCatalog())
  ipcHandle(ipcMain, 'models:refresh', async () => modelService.refreshCatalog())
  ipcHandle(ipcMain, 'models:getUpdateStatus', () => modelRegistryUpdater.getStatus())
  ipcHandle(ipcMain, 'models:checkForUpdates', async (_event, options) => {
    const status = await modelRegistryUpdater.checkForUpdates({ force: options?.force === true })
    if (status.state === 'updated' || status.state === 'rolled-back') await modelService.refreshCatalog()
    return status
  })
  ipcHandle(ipcMain, 'models:rollbackRegistry', async () => {
    const status = await modelRegistryUpdater.rollbackRegistry()
    await modelService.refreshCatalog()
    return status
  })
  async function enrichScannedOpenCodexModels(exportDoc, providerIds) {
    const catalog = await modelService.listCatalog()
    const added = new Set((catalog?.models ?? []).map((row) => row.key))
    return listModelsFromExport(exportDoc, providerIds).map((row) => ({
      key: row.key,
      name: row.name,
      id: row.id,
      provider: row.provider,
      source: row.source,
      available: true,
      alreadyAdded: added.has(row.key),
    }))
  }

  ipcHandle(ipcMain, 'opencodex:getSetupStatus', async () => {
    const modelsPath = resolveTaskWeaverModelsPath(userData)
    return getOpenCodexSetupStatus(modelsPath)
  })
  ipcHandle(ipcMain, 'opencodex:ensure', async () => {
    const modelsPath = resolveTaskWeaverModelsPath(userData)
    const result = await ensureOpenCodexProxy(modelsPath)
    return { ...result, ...(await getOpenCodexSetupStatus(modelsPath)) }
  })
  ipcHandle(ipcMain, 'opencodex:loginCursor', async () => {
    startOpenCodexProviderLogin('cursor')
    return { ok: true, message: '已在系统浏览器打开 Cursor 登录；完成后回到此处点击「扫描本地模型」。' }
  })
  ipcHandle(ipcMain, 'opencodex:openDashboard', async () => {
    const modelsPath = resolveTaskWeaverModelsPath(userData)
    const status = await getOpenCodexSetupStatus(modelsPath)
    const url = await openOpenCodexDashboard(status.baseUrl)
    return { url }
  })

  ipcHandle(ipcMain, 'models:scanLocal', async () => {
    const modelsPath = resolveTaskWeaverModelsPath(userData)
    try {
      const ensureResult = await ensureOpenCodexProxy(modelsPath)
      const { up } = ensureResult
      if (!up) {
        return {
          models: [],
          proxyUrl: null,
          providerIds: [],
          syncedAt: new Date().toISOString(),
          error: '本机 OpenCodex 代理未启动。请点击下方「启动 OpenCodex」或重启 TaskWeaver（已内置 ocx 时会自动尝试）。',
        }
      }
      let setup = await getOpenCodexSetupStatus(modelsPath)
      if (!setup.composerContinuationOk) {
        return {
          models: [],
          proxyUrl: setup.baseUrl,
          providerIds: [],
          syncedAt: new Date().toISOString(),
          error: [
            `本机 OpenCodex 代理版本过旧（${setup.proxyVersion ?? '未知'}，需要 ≥ ${setup.composerContinuationMinVersion ?? '2.79.0'}）。`,
            'Composer 2.5 工具调用会卡住。请点击「启动 OpenCodex」自动升级并重启服务。',
            ensureResult.upgradeError ? `升级尝试：${ensureResult.upgradeError}` : '',
          ].filter(Boolean).join(' '),
        }
      }
      if (!setup.cursorLoggedIn) {
        startOpenCodexProviderLogin('cursor')
        return {
          models: [],
          proxyUrl: setup.baseUrl,
          providerIds: [],
          syncedAt: new Date().toISOString(),
          error: '需要登录 Cursor：已在浏览器打开授权页。完成登录后请再次点击「扫描本地模型」（无需打开终端）。',
          cursorLoginStarted: true,
        }
      }
      const { exportDoc, baseUrl, providerIds } = await syncOpenCodexFromCli({
        modelsPath,
        credentials: credentialStore,
        ensureProxy: false,
      })
      await writeOpenCodexExportSnapshot(userData, exportDoc)
      await hostManager.start()
      await ensureModelsJsonSyncedToDshHost({
        hostManager,
        userDataPath: userData,
        credentialStore,
      })
      await modelService.refreshCatalog()
      const models = await enrichScannedOpenCodexModels(exportDoc, providerIds)
      return {
        models,
        proxyUrl: baseUrl ?? setup.baseUrl,
        providerIds,
        syncedAt: new Date().toISOString(),
      }
    } catch (err) {
      console.error('同步 OpenCodex 模型失败:', err)
      const raw = err instanceof Error ? err.message : String(err)
      const message = humanizeOpenCodexTransportError(raw, 'opencodex/cursor/composer-2.5')
      return {
        models: [],
        proxyUrl: null,
        providerIds: [],
        syncedAt: new Date().toISOString(),
        error: message,
      }
    }
  })
  ipcHandle(ipcMain, 'pricing:getStatus', () => pricingSync.getStatus())
  ipcHandle(ipcMain, 'pricing:sync', async () => {
    const result = await pricingSync.syncNow()
    modelService.reloadPriceRegistry()
    return { ...result, status: pricingSync.getStatus() }
  })
  ipcHandle(ipcMain, 'models:providersAuth', () => modelService.listProvidersAuth())
  ipcHandle(ipcMain, 'models:setProviderApiKey', async (_event, providerId, apiKey) =>
    modelService.setProviderApiKey(providerId, apiKey),
  )
  ipcHandle(ipcMain, 'models:add', async (_event, modelKey) => modelService.addModel(modelKey))
  ipcHandle(ipcMain, 'models:remove', async (_event, modelKey) => modelService.removeModel(modelKey))
  ipcHandle(ipcMain, 'models:removeProviderCredentials', async (_event, providerId) => modelService.removeProviderCredentials(providerId))
  ipcHandle(ipcMain, 'models:getActive', () => profileStore.getActiveModelKey())
  ipcHandle(ipcMain, 'models:setActive', async (_event, modelKey) => {
    const key = await profileStore.setActiveModelKey(modelKey)
    if (cachedConversationId) await chat.applyComposerModel(cachedConversationId, key)
    return key
  })
  ipcHandle(ipcMain, 'models:getThinkingLevel', () => modelService.getThinkingLevel())
  ipcHandle(ipcMain, 'models:setThinkingLevel', async (_event, level) => {
    const res = await modelService.setThinkingLevel(level)
    const activeKey = await profileStore.getActiveModelKey()
    if (cachedConversationId && activeKey) await chat.applyComposerModel(cachedConversationId, activeKey)
    return res
  })
  ipcHandle(ipcMain, 'models:getBusyEnterMode', () => profileStore.getBusyEnterMode())
  ipcHandle(ipcMain, 'models:setBusyEnterMode', (_event, mode) => profileStore.setBusyEnterMode(mode))
  ipcHandle(ipcMain, 'usage:getStats', () => usageStore.getStats())
  ipcHandle(ipcMain, 'usage:getReport', (_event, query) => usageStore.getReport(query))
  ipcHandle(ipcMain, 'usage:clear', () => usageStore.clear())
  ipcHandle(ipcMain, 'models:upsertProfile', async (_event, modelKey, patch) =>
    profileStore.upsertProfile(modelKey, patch),
  )
  ipcHandle(ipcMain, 'models:removeProfile', (_event, modelKey) => profileStore.removeProfile(modelKey))
  ipcHandle(ipcMain, 'portfolio:get', () => loadRoutingPortfolio({ userDataPath: userData }))
  ipcHandle(ipcMain, 'portfolio:save', (_event, portfolio) => saveRoutingPortfolio(portfolio, { userDataPath: userData }))
  ipcHandle(ipcMain, 'portfolio:resetToBundled', async () => resetRoutingPortfolioToBundled({ userDataPath: userData }))
  ipcHandle(ipcMain, 'portfolio:getBundledTemplate', () => loadBundledRoutingPortfolio())
  ipcHandle(ipcMain, 'portfolio:getDisplayName', (_event, modelKey) => {
    const portfolio = loadRoutingPortfolio({ userDataPath: userData })
    return resolveDisplayName(modelKey, portfolio)
  })
  ipcHandle(ipcMain, 'models:startOAuth', async (event, providerId = 'openai-codex') => {
    await modelService.startProviderAuthorization(providerId, async (statusInfo) => {
      if (statusInfo?.url) {
        try {
          const { shell } = await import('electron')
          await shell.openExternal(statusInfo.url)
        } catch (err) {
          console.error('打开外部链接失败:', err)
        }
      }
      try {
        event.sender.send('models:oauthStatus', statusInfo)
      } catch (err) {
        console.error('发送 OAuth 状态失败:', err)
      }
    })
    return modelService.listCatalog()
  })
  ipcHandle(ipcMain, 'models:cancelOAuth', async () => {
    await modelService.cancelProviderAuthorization()
    return true
  })
  ipcHandle(ipcMain, 'models:submitOAuthCode', async (_event, code) => {
    await modelService.submitOAuthCode(code)
    return true
  })
  ipcHandle(ipcMain, 'models:logoutOAuth', async (_event, providerId) => modelService.logoutProvider(providerId))
  ipcHandle(ipcMain, 'skills:list', () => skills.list())
  ipcHandle(ipcMain, 'mcp:getRuntimeBinding', () => mcp.getDshRuntimeBinding())
  ipcHandle(ipcMain, 'mcp:list', () => mcp.listServers())
  ipcHandle(ipcMain, 'mcp:save', async (_event, server) => {
    assertMcpHostRestartSafe()
    const saved = await mcp.saveServer(server)
    await reloadMcpRuntime()
    return saved
  })
  ipcHandle(ipcMain, 'mcp:remove', async (_event, id) => {
    assertMcpHostRestartSafe()
    const removed = await mcp.removeServer(id)
    await reloadMcpRuntime()
    return removed
  })
  ipcHandle(ipcMain, 'mcp:setEnabled', async (_event, id, enabled) => {
    assertMcpHostRestartSafe()
    const saved = await mcp.setEnabled(id, enabled)
    await reloadMcpRuntime()
    return saved
  })
  ipcHandle(ipcMain, 'mcp:testConnection', (_event, id) => mcp.testConnection(id))
  ipcHandle(ipcMain, 'mcp:configureGitHub', async (_event, token) => {
    assertMcpHostRestartSafe()
    const saved = await mcp.configureGitHub(token)
    await reloadMcpRuntime()
    return saved
  })
  ipcHandle(ipcMain, 'mcp:getGitHubOAuthAvailability', () => mcp.getGitHubOAuthAvailability())
  ipcHandle(ipcMain, 'mcp:startGitHubOAuth', async (event) => {
    assertMcpHostRestartSafe()
    const { shell } = await import('electron')
    const result = await mcp.loginGitHubWithOAuth({
      onStatus: (statusInfo) => {
        try {
          if (statusInfo?.url) shell.openExternal(statusInfo.url).catch(() => {})
          event.sender.send('mcp:githubOAuthStatus', statusInfo)
        } catch (err) {
          console.error('GitHub OAuth 状态推送失败:', err)
        }
      },
      openExternal: (url) => shell.openExternal(url),
    })
    await reloadMcpRuntime()
    return result
  })
  ipcHandle(ipcMain, 'mcp:cancelGitHubOAuth', () => mcp.cancelGitHubOAuth())
  ipcHandle(ipcMain, 'mcp:disconnect', async (_event, id) => mcp.disconnect(id))
  ipcHandle(ipcMain, 'mcp:refresh', async () => {
    assertNotBusy()
    return mcp.getCustomTools()
      .then(({ statuses }) => statuses)
  })
  ipcHandle(ipcMain, 'permission:listRules', async () => {
    await refreshWorkspaceCache()
    return permissionRulesStore.listRules({ workspacePath: cachedWorkspace })
  })
  ipcHandle(ipcMain, 'permission:addRule', async (_event, rule) => {
    await refreshWorkspaceCache()
    const enriched = {
      ...rule,
      workspacePath: rule?.scope === 'workspace' ? (rule.workspacePath || cachedWorkspace) : null,
    }
    return permissionRulesStore.addRule(enriched)
  })
  ipcHandle(ipcMain, 'permission:removeRule', async (_event, ruleId) => {
    return permissionRulesStore.removeRule(ruleId)
  })
  ipcHandle(ipcMain, 'permission:clearRules', async (_event, options) => {
    await refreshWorkspaceCache()
    return permissionRulesStore.clearRules({
      workspacePath: options?.workspaceOnly ? cachedWorkspace : undefined,
      globalOnly: options?.globalOnly,
    })
  })
  ipcHandle(ipcMain, 'workspace:openPath', async (_event, relPath) => {
    if (!relPath || typeof relPath !== 'string') throw new Error('未提供有效的文件路径')
    await refreshWorkspaceCache()
    const { shell } = await import('electron')
    try {
      const { realPath, isDirectory } = await assertSafeWorkspacePath(cachedWorkspace, relPath, { mustExist: true })
      const err = await shell.openPath(realPath)
      if (err) return { ok: false, error: err }
      return { ok: true, path: relPath, isDirectory: Boolean(isDirectory) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  })

  ipcHandle(ipcMain, 'workspace:revertDiff', async (_event, payload) => {
    await refreshWorkspaceCache()
    const workspacePath = cachedWorkspace
    return withWorkspaceOperation(workspacePath, async () => {
      const { path: relPath, reverseEdits, originalContent } = payload || {}
      if (!relPath || typeof relPath !== 'string') throw new Error('未提供有效的文件路径')

      const hasReverseEdits = Array.isArray(reverseEdits) && reverseEdits.length > 0
      // 严格安全路径校验：防范同前缀兄弟目录、.. 相对逃逸与符号链接越界
      const { realPath, relativePath } = await assertSafeWorkspacePath(workspacePath, relPath, {
        mustExist: hasReverseEdits,
      })

      if (hasReverseEdits) {
        let content = await fs.readFile(realPath, 'utf-8')
        for (const edit of reverseEdits) {
          if (content.includes(edit.oldText)) {
            content = content.replace(edit.oldText, edit.newText)
          }
        }
        await fs.writeFile(realPath, content, 'utf-8')
        return { success: true, message: `已还原 ${relativePath}` }
      } else if (typeof originalContent === 'string') {
        await fs.mkdir(path.dirname(realPath), { recursive: true })
        await fs.writeFile(realPath, originalContent, 'utf-8')
        return { success: true, message: `已还原 ${relativePath}` }
      }
      throw new Error('缺少还原参数')
    })
  })

  ipcHandle(ipcMain, 'workspace:gitStatus', async () => {
    await refreshWorkspaceCache()
    return getGitStatus(cachedWorkspace)
  })

  ipcHandle(ipcMain, 'workspace:gitSuggestCommit', async () => {
    await refreshWorkspaceCache()
    return suggestCommitMessage(cachedWorkspace)
  })

  ipcHandle(ipcMain, 'workspace:createGitCheckpoint', async (_event, options) => {
    await refreshWorkspaceCache()
    const state = await appState.getState()
    const conversationId = state?.conversationId
    return createGitCheckpoint(cachedWorkspace, {
      ...options,
      conversationId,
      userDataPath: userData,
    })
  })

  ipcHandle(ipcMain, 'workspace:previewManualGitCommit', async () => {
    await refreshWorkspaceCache()
    return previewManualGitCommit(cachedWorkspace)
  })

  ipcHandle(ipcMain, 'workspace:createManualGitCommit', async (_event, options) => {
    await refreshWorkspaceCache()
    const state = await appState.getState()
    const conversationId = state?.conversationId
    return createManualGitCommitSnapshot(cachedWorkspace, {
      ...options,
      conversationId,
      userDataPath: userData,
    })
  })

  ipcHandle(ipcMain, 'workspace:listGitCheckpoints', async () => {
    await refreshWorkspaceCache()
    const state = await appState.getState()
    const conversationId = state?.conversationId
    return listGitCheckpoints(cachedWorkspace, {
      conversationId,
      userDataPath: userData,
    })
  })

  ipcHandle(ipcMain, 'workspace:getGitCheckpointDiff', async (_event, checkpointId) => {
    await refreshWorkspaceCache()
    return getGitCheckpointDiff(cachedWorkspace, checkpointId, {
      userDataPath: userData,
    })
  })

  ipcHandle(ipcMain, 'workspace:restoreGitCheckpoint', async (_event, payload) => {
    await refreshWorkspaceCache()
    const workspacePath = cachedWorkspace
    return withWorkspaceOperation(workspacePath, async () => {
      const { checkpointId, force, expectedStateFingerprint } = payload || {}
      if (!checkpointId) throw new Error('缺少检查点 ID')
      return restoreGitCheckpoint(workspacePath, checkpointId, {
        force: Boolean(force),
        expectedStateFingerprint,
        userDataPath: userData,
      })
    })
  })

  ipcHandle(ipcMain, 'workspace:deleteGitCheckpoint', async (_event, checkpointId) => {
    await refreshWorkspaceCache()
    const workspacePath = cachedWorkspace
    return withWorkspaceOperation(workspacePath, async () => {
      if (!checkpointId) throw new Error('缺少检查点 ID')
      return deleteGitCheckpoint(workspacePath, checkpointId, {
        userDataPath: userData,
      })
    })
  })

  ipcHandle(ipcMain, 'chat:cancel', async (_event, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) return { stopped: false }
    const chatStopped = await chat.abort(conversationId)
    const orchestrationStopped = await orchestration.abort(conversationId)
    return { stopped: chatStopped || orchestrationStopped }
  })

  ipcHandle(ipcMain, 'chat:queueMutate', async (event, payload) => {
    const conversationId = await resolveIpcConversationId(payload?.conversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const kind = payload?.kind === 'followUp' ? 'followUp' : 'steering'
    const index = Number(payload?.index)
    const action = payload?.action === 'update' ? 'update' : 'remove'
    const result = await chat.mutateQueue(kind, index, action, payload?.text, conversationId)
    if (result.ok && event.sender && !event.sender.isDestroyed()) {
      event.sender.send('chat:stream', {
        type: 'queue_update',
        conversationId,
        steering: result.steering ?? [],
        followUp: result.followUp ?? [],
      })
    }
    return result
  })

  ipcHandle(ipcMain, 'chat:getLiveContext', async (_event, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) return null
    return chat.getLiveContextUsage(conversationId)
  })

  ipcHandle(ipcMain, 'chat:subscribeMux', async (event, conversationId) => {
    if (!conversationId || typeof conversationId !== 'string') throw new Error('缺少会话标识')
    chat.subscribeMux(conversationId, event.sender)
    const sessionId = chat.getSessionId(conversationId)
    if (sessionId) {
      try {
        await conversationHub.attachSession(conversationId, sessionId, event.sender)
        conversationHub.subscribe(conversationId, event.sender)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[register-ipc] chat:subscribeMux hub:', message)
        return { ok: false, error: message }
      }
    }
    return { ok: true }
  })

  ipcHandle(ipcMain, 'chat:unsubscribeMux', async (event, conversationId) => {
    if (conversationId && typeof conversationId === 'string') {
      chat.unsubscribeMux(conversationId, event.sender)
      conversationHub.detachSession(conversationId)
    }
    return { ok: true }
  })

  ipcHandle(ipcMain, 'chat:getDshView', async (_event, requestedConversationId) => {
    const id = await resolveIpcConversationId(requestedConversationId)
    if (!id) return null
    return conversationHub.getView(id)
  })

  ipcHandle(ipcMain, 'chat:getSessionStats', async (_event, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) return null
    const stats = await chat.getSessionStatsSnapshot(conversationId)
    return stats
  })

  ipcHandle(ipcMain, 'permission:respondPrompt', async (_event, id, response) => {
    const ok = await routePermissionPromptResponse(id, response, {
      respondHostApproval: (approvalId, decision) => chat.respondApproval(approvalId, decision),
    })
    return { ok }
  })

  ipcHandle(ipcMain, 'userQuestions:answer', async (_event, id, answer) => ({
    ok: await chat.answerUserQuestion(id, answer),
  }))

  ipcHandle(ipcMain, 'userQuestions:cancel', async (_event, id) => ({
    ok: await chat.cancelUserQuestion(id),
  }))

  ipcHandle(ipcMain, 'chat:steer', async (event, text, requestedConversationId) => {
    if (!text || typeof text !== 'string') throw new Error('内容不能为空')
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    const userEntry = {
      id: `m-steer-${Date.now()}`,
      author: 'user',
      name: '你',
      time,
      text,
      behavior: 'steer',
    }
    await appState.appendMessagesToConversation(conversationId, userEntry)
    const activeKey = await profileStore.getActiveModelKey()
    return permissions.withExecution(runtimeContext.permissionMode, event.sender, () => chat.send({
      text,
      modelKey: activeKey,
      conversationId,
      cwdOverride: runtimeContext.workspacePath,
      webContents: event.sender,
      behavior: 'steer',
    }), { conversationId })
  })

  ipcHandle(ipcMain, 'chat:followUp', async (event, text, requestedConversationId) => {
    if (!text || typeof text !== 'string') throw new Error('内容不能为空')
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    const userEntry = {
      id: `m-followup-${Date.now()}`,
      author: 'user',
      name: '你',
      time,
      text,
      behavior: 'followUp',
    }
    await appState.appendMessagesToConversation(conversationId, userEntry)
    const activeKey = await profileStore.getActiveModelKey()
    return permissions.withExecution(runtimeContext.permissionMode, event.sender, () => chat.send({
      text,
      modelKey: activeKey,
      conversationId,
      cwdOverride: runtimeContext.workspacePath,
      webContents: event.sender,
      behavior: 'followUp',
    }), { conversationId })
  })

  ipcHandle(ipcMain, 'preferences:get', () => appPreferences.get())
  ipcHandle(ipcMain, 'preferences:set', (_event, patch) => appPreferences.set(patch ?? {}))

  ipcHandle(ipcMain, 'jobs:list', () => scheduledJobsStore.list())
  ipcHandle(ipcMain, 'jobs:upsert', (_event, job) => scheduledJobsStore.upsert(job ?? {}))
  ipcHandle(ipcMain, 'jobs:remove', async (_event, jobId) => {
    await removeJobLaunchAgent(jobId)
    return { removed: await scheduledJobsStore.remove(jobId) }
  })
  ipcHandle(ipcMain, 'jobs:runNow', async (_event, jobId) => {
    await scheduledJobsRunner.runNow(jobId)
    return { ok: true }
  })

  ipcHandle(ipcMain, 'jobs:installLaunchAgent', async (_event, jobId) => {
    const jobs = await scheduledJobsStore.list()
    const job = jobs.find((row) => row.id === jobId)
    if (!job) throw new Error('找不到定时任务')
    return installJobLaunchAgent(job, userData)
  })

  ipcHandle(ipcMain, 'jobs:removeLaunchAgent', async (_event, jobId) => removeJobLaunchAgent(jobId))

  ipcHandle(ipcMain, 'jobs:launchAgentInstalled', async (_event, jobId) => ({
    installed: await isJobLaunchAgentInstalled(jobId),
    platform: process.platform,
  }))

  ipcHandle(ipcMain, 'github:listPullRequests', async (_event, workspacePath) =>
    listGithubPullRequests(workspacePath ?? null, () => mcp.getGitHubPersonalAccessToken()),
  )

  ipcHandle(ipcMain, 'debug:shadowTranscript', async (_event, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) return null
    const threadState = appState.getConversationState
      ? await appState.getConversationState(conversationId)
      : await appState.getState()
    const view = conversationHub.getView(conversationId)
    const hostRows = view?.transcript ?? []
    return compareConversationTranscripts(threadState?.messages ?? [], hostRows)
  })

  ipcHandle(ipcMain, 'sandbox:probe', () => probeSandboxSupport())
  ipcHandle(ipcMain, 'sandbox:getEffective', async () => {
    await refreshWorkspaceCache()
    return {
      ...resolveSandboxPolicy({
        workspacePath: cachedWorkspace,
        bashSandbox: cachedBashSandbox,
        permissionMode: cachedPermissionMode,
        sessionSandboxMode: cachedSessionSandboxMode,
      }),
      sessionSandboxMode: cachedSessionSandboxMode,
    }
  })
  ipcHandle(ipcMain, 'sandbox:setSessionMode', async (event, mode) => {
    await refreshWorkspaceCache()
    const state = await appState.getState()
    const conversationId = state?.conversationId
    if (!conversationId) throw new Error('当前会话无效')
    const normalized = mode === 'default' || mode === null || mode === '' ? null : mode
    const ev = await sandboxSession.set(conversationId, normalized)
    cachedSessionSandboxMode = normalized
    const payload = ev || { type: 'sandbox/mode', time: Date.now(), data: { mode: 'workspace-write', source: 'user' } }
    event.sender.send('sandbox:mode', payload)
    return payload
  })
  ipcHandle(ipcMain, 'mcp:catalog', () => listMcpCatalog())
  ipcHandle(ipcMain, 'mcp:marketplace', () => ({
    manifest: getMarketplaceManifest(),
    entries: listMarketplaceEntries(),
  }))
  ipcHandle(ipcMain, 'mcp:installCatalog', async (_event, { id, env } = {}) => {
    assertMcpHostRestartSafe()
    const config = catalogEntryToServerConfig(id, { env })
    const saved = await mcp.installFromCatalog(config)
    await reloadMcpRuntime()
    return saved
  })
  ipcHandle(ipcMain, 'models:listCustomProviders', () => customProviderService.listCustomProviders())
  ipcHandle(ipcMain, 'models:upsertCustomProvider', async (_event, payload) => {
    const result = await customProviderService.upsertCustomProvider(payload ?? {})
    await refreshWorkspaceCache()
    const catalog = await modelService.listCatalog()
    return { ...result, catalog }
  })
  ipcHandle(ipcMain, 'models:removeCustomProvider', async (_event, providerId) => {
    await customProviderService.removeCustomProvider(providerId)
    return modelService.listCatalog()
  })
  ipcHandle(ipcMain, 'models:testCustomProvider', (_event, payload) => customProviderService.testCustomProvider(payload ?? {}))
  ipcHandle(ipcMain, 'models:testCustomProviderToolCall', (_event, payload) => customProviderService.testCustomProviderToolCall(payload ?? {}))
  ipcHandle(ipcMain, 'models:probeProviderModels', (_event, payload) => customProviderService.probeModels(payload ?? {}))
  ipcHandle(ipcMain, 'models:batchAddCustomModels', async (_event, payload) => {
    const result = await customProviderService.batchAddCustomModels(payload ?? {})
    if (Array.isArray(result.addedKeys)) {
      for (const key of result.addedKeys) {
        await profileStore.addModel(key).catch(() => {})
      }
    }
    await refreshWorkspaceCache()
    const catalog = await modelService.listCatalog()
    return { ...result, catalog }
  })
  ipcHandle(ipcMain, 'webSearch:getConfig', () => webSearch.getConfig())
  ipcHandle(ipcMain, 'webSearch:setConfig', (_event, patch) => webSearch.setConfig(patch ?? {}))
  ipcHandle(ipcMain, 'webSearch:testSearch', (_event, query) => webSearch.testSearch(query))
  ipcHandle(ipcMain, 'worktree:list', async () => {
    await refreshWorkspaceCache()
    return listTaskWorktrees({ workspacePath: cachedWorkspace, userDataPath: userData })
  })
  ipcHandle(ipcMain, 'worktree:remove', async (_event, taskId, force) => {
    await refreshWorkspaceCache()
    return removeTaskWorktree({
      workspacePath: cachedWorkspace,
      taskId,
      userDataPath: userData,
      force: force === true,
    })
  })
  ipcHandle(ipcMain, 'worktree:diff', async (_event, taskId) => {
    await refreshWorkspaceCache()
    if (!cachedWorkspace) throw new Error('请先设置工作区')
    return getTaskWorktreeDiff({
      workspacePath: cachedWorkspace,
      taskId,
      userDataPath: userData,
    })
  })
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
      workspace_path: cachedWorkspace,
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

  // ========== chat:send helper functions ==========

  /**
   * 验证输入并解析模型键
   */
  const validateAndResolveModel = async (text, modelKey) => {
    if (!text || typeof text !== 'string') throw new Error('消息不能为空')
    await refreshWorkspaceCache()
    return resolveModelKeyForChat({
      requestedKey: modelKey,
      profileStore,
    })
  }

  /**
   * 尝试执行自动快照
   */
  const tryAutoSnapshot = async (context) => {
    const prefs = await appPreferences.get()
    if (prefs.autoSnapshotOnTurn && context.workspacePath) {
      try {
        await createGitCheckpoint(context.workspacePath, {
          conversationId: context.conversationId,
          summary: '本轮对话开始前（自动）',
          userDataPath: userData,
        })
      } catch (err) {
        console.error('自动创建 Git 快照失败:', err)
      }
    }
  }

  function emitPromptBudget(webContents, snapshot) {
    if (!webContents || webContents.isDestroyed?.() || typeof webContents.send !== 'function') return
    webContents.send('chat:promptBudget', snapshot)
  }

  /**
   * 创建并存储用户消息
   */
  const createUserMessage = async (text, conversationId) => {
    const now = Date.now()
    const time = new Date(now).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    const messageId = `m-${now}-${Math.random().toString(36).slice(2, 8)}`
    const userEntry = {
      id: `${messageId}-u`,
      author: 'user',
      name: '你',
      time,
      timestamp: now,
      text,
    }
    await appState.appendMessagesToConversation(conversationId, userEntry)
    return { messageId, time, userEntry }
  }

  /**
   * 执行多 Agent 协作
   */
  const executeMultiAgent = async (effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, event, execution, conversationId, runtimeContext) => {
    try {
      const outcome = await orchestration.planAndExecute({
        text: effectivePrompt,
        primaryModelKey: activeKey,
        conversationId,
        workspacePath: runtimeContext.workspacePath,
        webContents: event.sender,
        skill: selectedSkill,
        skillAlreadyApplied: true,
        synthesize: async (prompt) => chat.send({
          text: prompt,
          modelKey: activeKey,
          conversationId,
          cwdOverride: runtimeContext.workspacePath,
          webContents: event.sender,
          agentPreset: primaryAgentPreset,
          skill: null,
          // The orchestration result owns aggregate usage and final metadata.
          persistTerminal: false,
        }),
      })
      return { ...outcome.assistant }
    } catch (error) {
      if (error instanceof PlannerFallbackError || error?.code === 'PLANNER_FALLBACK') {
        const hint = error instanceof Error ? error.message : String(error)
        const result = await chat.send({
          text: effectivePrompt,
          modelKey: activeKey,
          conversationId,
          cwdOverride: runtimeContext.workspacePath,
          webContents: event.sender,
          agentPreset: primaryAgentPreset,
          skill: null,
        })
        // 降级说明挂在最终消息的 callout 上。原来靠 `chat:stream` 的 orchestration 事件传，
        // 但渲染端没有该分支、且事件不带 conversationId —— 消息会被静默丢弃，用户看不到。
        // 同时这也修掉了一个误导：降级后 tasks 为空，旧逻辑会写成「拆分并执行 0 个子任务」。
        return {
          ...result,
          callout: `多 Agent 规划失败，已自动降级为单 Agent：${hint.slice(0, IPC_PLANNER_FALLBACK_HINT_MAX_LENGTH)}`,
        }
      }
      throw error
    }
  }

  /**
   * 执行单 Agent 调用
   */
  const executeSingleAgent = async (effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, event, execution, conversationId, runtimeContext) => {
    return chat.send({
      text: effectivePrompt,
      modelKey: activeKey,
      conversationId,
      cwdOverride: runtimeContext.workspacePath,
      webContents: event.sender,
      agentPreset: primaryAgentPreset,
      // The selected Skill is already included and counted by preparePromptByWorkMode.
      skill: null,
    })
  }

  /**
   * 执行聊天请求（多 Agent 或单 Agent）
   */
  const executeChatRequest = async (execution, effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, event, conversationId, runtimeContext) => {
    return permissions.withExecution(runtimeContext.permissionMode, event.sender, async () => {
      if (execution.mode === 'multi-agent') {
        return executeMultiAgent(effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, event, execution, conversationId, runtimeContext)
      }
      return executeSingleAgent(effectivePrompt, primaryAgentPreset, activeKey, selectedSkill, event, execution, conversationId, runtimeContext)
    }, { conversationId })
  }

  /**
   * 处理执行错误并存储错误消息
   */
  const handleChatError = async (error, messageId, time, conversationId, modelKey = null) => {
    // Transport uncertainty is not proof the Agent failed. Its native terminal
    // will own persistence/accounting once the connection can be recovered.
    if (error?.runContinues) throw error
    if (error?.partialResult?.turnId) {
      // Retry a failed terminal commit with the same IDs; never duplicate the
      // stream/native result or count the failed turn twice in the ledger.
      if (!error.partialResult.nativePersisted) {
        try {
          await persistNativeTurn({ conversationId, modelKey: error.modelKey,
            result: error.partialResult, errorMessage: error.message })
        } catch (persistenceError) {
          error.persistenceError = persistenceError
          console.error('[register-ipc] 保存失败轮次失败:', persistenceError instanceof Error ? persistenceError.message : persistenceError)
        }
      }
      throw error
    }
    let message = error instanceof Error ? error.message : String(error)
    const cause = error && typeof error === 'object' ? error.cause : null
    if (cause && typeof cause === 'object') {
      const code = typeof cause.code === 'string' ? cause.code : null
      const detail = typeof cause.message === 'string' ? cause.message : null
      const diagnostic = code ?? detail
      if (diagnostic && !message.includes(diagnostic)) message = `${message}（底层原因：${diagnostic}）`
    }
    message = humanizeOpenCodexTransportError(message, modelKey ?? error?.modelKey)
    await appState.appendMessagesToConversation(conversationId, {
      id: `${messageId}-error`,
      author: 'orchestrator',
      name: 'TaskWeaver',
      time,
      timestamp: Date.now(),
      text: `${message === '任务已停止' ? '执行已停止' : '执行失败'}：${message.slice(0, IPC_ERROR_MESSAGE_MAX_LENGTH)}`,
    })
    throw error
  }

  /**
   * 创建并存储助手消息
   */
  const createAssistantMessage = async (result, messageId, time, activeKey, execution, conversationId) => {
    // 执行层给的 callout 优先（例如多 Agent 降级为单 Agent），否则按执行模式回落到默认说明。
    const callout = result.callout
      ?? (execution.mode === 'multi-agent'
        ? `由 TaskWeaver 拆分并执行 ${(await appState.getConversationState(conversationId)).tasks.length} 个子任务`
        : undefined)
    const agentEntry = {
      id: result.turnId ? `z-turn-${result.turnId}` : `${messageId}-a`,
      author: 'orchestrator',
      name: 'TaskWeaver',
      time,
      timestamp: Date.now(),
      text: result.cancelled ? (result.text || '任务已停止。') : (result.text || '（模型未返回文本）'),
      thinking: result.thinking,
      thinkingDurationMs: result.thinkingDurationMs,
      contentBlocks: Array.isArray(result.contentBlocks) ? result.contentBlocks : undefined,
      modelKey: activeKey,
      usage: result.usage,
      fileChanges: result.fileChanges,
      verification: result.verification,
      callout,
      interrupted: Boolean(result.cancelled),
    }
    await appState.upsertMessagesToConversation(conversationId, agentEntry)
    // 用量在执行完成处直接落库，不依赖当前 UI 是否仍订阅该会话；后台运行的会话也必须计入。
    const usage = result.usage
    if (!result.nativePersisted && usage && typeof usage === 'object') {
      try {
        await usageStore.record({
          id: `${messageId}-usage`,
          timestamp: agentEntry.timestamp,
          modelKey: activeKey || 'unknown',
          modelName: activeKey?.split('/')?.pop() || activeKey || 'unknown',
          conversationId,
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          cacheReadTokens: usage.cacheReadTokens || 0,
          cacheWriteTokens: usage.cacheWriteTokens || 0,
          costUsd: usage.costUsd || 0,
          elapsedMs: usage.elapsedMs || 0,
        })
      } catch (error) {
        console.warn('[register-ipc] 记录本轮模型用量失败:', error instanceof Error ? error.message : error)
      }
    }
    return agentEntry
  }

  // ========== chat:send main handler ==========

  ipcHandle(ipcMain, 'chat:send', async (event, text, modelKey, skillName, executionModeOverride, workMode = 'code', requestedConversationId) => {
    // 先获取当前会话 ID，再用它加锁，避免并发时串会话
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)

    return withTurnLock(conversationId, async () => {

    const { modelKey: activeKey } = await validateAndResolveModel(text, modelKey)
    const command = nativeChatCommand(text)
    if (command) {
      // Native Host commands are not coding tasks. Do not inject sandbox/task
      // prose, skill content, snapshots or planner decisions into its syntax.
      const { messageId, time, userEntry } = await createUserMessage(command, conversationId)
      let result
      try {
        result = await chat.send({ text: command, modelKey: activeKey, conversationId,
          cwdOverride: runtimeContext.workspacePath, webContents: event.sender,
          agentPreset: resolvePrimaryAgentPreset(command, workMode, activeKey) })
      } catch (error) { await handleChatError(error, messageId, time, conversationId, activeKey) }
      const assistant = await createAssistantMessage(result, messageId, time, activeKey,
        { mode: 'single-agent' }, conversationId)
      return { user: userEntry, assistant }
    }
    await tryAutoSnapshot(runtimeContext)

    const selectedSkill = skillName ? await skills.resolve(skillName) : null
    const prefs = await appPreferences.get()
    const conversationState = appState.getConversationState
      ? await appState.getConversationState(conversationId)
      : await appState.getState()
    const {
      effectiveOverride,
      effectivePrompt,
      promptStats,
      assembled,
      injectionByteCap: capUsed,
    } = await assembleAndComposeUserPrompt({
      text,
      workMode,
      workspacePath: runtimeContext.workspacePath,
      sandboxContextLine: sandboxContextLineForContext(runtimeContext),
      modelKey: activeKey,
      selectedSkill,
      conversationMessages: conversationState?.messages ?? [],
      preferences: prefs,
    })
    logPromptPipelineAccounting(conversationId, promptStats, assembled, { scope: 'chat:send' })
    emitPromptBudget(event.sender, promptBudgetSnapshotFromStats(conversationId, promptStats, assembled, 'chat:send'))

    const decision = decideExecutionMode(text, selectedSkill)
    const preferMulti = prefs.preferMultiAgent
      && !effectiveOverride
      && !executionModeOverride
      && !/不要|不需要|无需|禁止|别用|不启用|禁用|关闭/i.test(text)
    const modeOverride = effectiveOverride || executionModeOverride || (preferMulti ? 'multi-agent' : null)
    const execution = resolveExecutionMode(decision, modeOverride)
    if (
      execution.mode === 'single-agent'
      && prefs.adaptiveOrchestrationGate
      && !modeOverride
      && !selectedSkill?.multiAgent
    ) {
      const gate = evaluateOrchestrationGate(text)
      if (gate.mode === 'ask-user') {
        return {
          needsOrchestrationChoice: true,
          reason: gate.reason,
          suggestedMode: 'multi-agent',
        }
      }
    }

    const turnHooks = await loadTaskweaverHooks(userData, runtimeContext.workspacePath)
    await runTaskweaverHooks('beforeTurn', turnHooks, {
      workspacePath: runtimeContext.workspacePath,
      conversationId,
      text: effectivePrompt,
      executionMode: execution.mode,
    })

    const { messageId, time, userEntry } = await createUserMessage(text, conversationId)

    let result
    try {
      result = await executeChatRequest(execution, effectivePrompt, resolvePrimaryAgentPreset(text, workMode, activeKey), activeKey, selectedSkill, event, conversationId, runtimeContext)
    } catch (error) {
      await handleChatError(error, messageId, time, conversationId, activeKey)
    }

    if (result.accepted) return { user: userEntry, accepted: true, queued: result.queued }

    // ============ 自动验证与静默自愈闭环 (Self-Healing Loop) ============
    const shouldSelfHeal = prefs.selfHealingLoop !== false
      && !result.cancelled
      && Array.isArray(result.fileChanges)
      && result.fileChanges.length > 0
      && runtimeContext.workspacePath
      && workMode !== 'plan'

    if (shouldSelfHeal) {
      const maxSelfHealingAttempts = Math.max(1, Math.min(3, Number(prefs.selfHealingMaxRetries) || 2))
      let healAttempt = 0
      let lastVerification = null

      while (healAttempt < maxSelfHealingAttempts) {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('chat:stream', {
            type: 'activity',
            phase: 'verification',
            message: healAttempt === 0
              ? '正在对变更代码执行静默轻量自检…'
              : `第 ${healAttempt} 次修复完成，正在复检…`,
            conversationId,
          })
        }

        const verifyRes = await executeVerificationRunner(runtimeContext.workspacePath, {
          timeoutMs: 30_000,
        })
        lastVerification = verifyRes

        if (!verifyRes.executed || verifyRes.passed) {
          if (verifyRes.executed && verifyRes.passed && event.sender && !event.sender.isDestroyed()) {
            event.sender.send('chat:stream', {
              type: 'activity',
              phase: 'verification',
              message: `轻量自检通过（${verifyRes.command}，耗时 ${verifyRes.durationMs}ms）。`,
              conversationId,
            })
          }
          break
        }

        // 验证失败，构造自愈指令通知模型直接修复
        healAttempt += 1
        const errorDetail = verifyRes.errorSummary || verifyRes.stderr || verifyRes.stdout || '命令执行返回非零状态码'
        const healPrompt = [
          `【自动代码自检失败 - 自愈修复请求 (第 ${healAttempt}/${maxSelfHealingAttempts} 次尝试)】`,
          `刚刚的代码修改在运行轻量验证命令 \`${verifyRes.command}\` 时未通过，退出码为 ${verifyRes.exitCode}。`,
          `错误摘要如下：\n\`\`\`\n${errorDetail.slice(0, 1500)}\n\`\`\``,
          `请立即检查并修复上述错误，不要停止在报错状态。直接使用工具修改引发错误的代码文件。`,
        ].join('\n\n')

        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('chat:stream', {
            type: 'activity',
            phase: 'healing',
            message: `自检发现错误（退出码 ${verifyRes.exitCode}），正在启动静默自愈（${healAttempt}/${maxSelfHealingAttempts}）…`,
            conversationId,
          })
        }

        try {
          const healResult = await executeChatRequest(
            execution,
            healPrompt,
            resolvePrimaryAgentPreset(healPrompt, workMode, activeKey),
            activeKey,
            selectedSkill,
            event,
            conversationId,
            runtimeContext,
          )

          if (healResult && !healResult.accepted) {
            // 合并自愈轮次的输出与文件变更
            if (healResult.text) {
              result.text = `${result.text}\n\n---\n**[自愈修复第 ${healAttempt} 轮]**\n${healResult.text}`
            }
            if (Array.isArray(healResult.fileChanges) && healResult.fileChanges.length > 0) {
              const existingPaths = new Set(result.fileChanges.map((f) => f.path))
              for (const fc of healResult.fileChanges) {
                if (!existingPaths.has(fc.path)) {
                  result.fileChanges.push(fc)
                }
              }
            }
            if (healResult.usage && result.usage) {
              result.usage.inputTokens = (result.usage.inputTokens || 0) + (healResult.usage.inputTokens || 0)
              result.usage.outputTokens = (result.usage.outputTokens || 0) + (healResult.usage.outputTokens || 0)
              result.usage.costUsd = (result.usage.costUsd || 0) + (healResult.usage.costUsd || 0)
            }
          }
        } catch (healError) {
          console.warn(`[register-ipc] 自愈修复执行轮次 ${healAttempt} 异常:`, healError instanceof Error ? healError.message : healError)
          break
        }
      }

      if (lastVerification && lastVerification.executed) {
        result.verification = {
          command: lastVerification.command,
          passed: lastVerification.passed,
          exitCode: lastVerification.exitCode,
          durationMs: lastVerification.durationMs,
          healed: healAttempt > 0 && lastVerification.passed,
          healAttempts: healAttempt,
        }
      }
    }

    const agentEntry = await createAssistantMessage(result, messageId, time, activeKey, execution, conversationId)
    await runTaskweaverHooks('afterTurn', turnHooks, {
      workspacePath: runtimeContext.workspacePath,
      conversationId,
      text: effectivePrompt,
      executionMode: execution.mode,
    })
    return { user: userEntry, assistant: agentEntry }
    })
  })

  ipcHandle(ipcMain, 'tasks:sendMessage', async (event, taskId, text) => {
    const state = await appState.getState()
    const conversationId = state?.conversationId ?? cachedConversationId
    if (!conversationId) return Promise.reject(new Error('当前对话标识无效'))
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    return withTurnLock(conversationId, async () => {
      if (!text || typeof text !== 'string') throw new Error('消息不能为空')
      const prefs = await appPreferences.get()
      const task = state.tasks?.find((item) => item.id === taskId)
      const taskModelKey = task?.modelKey ?? state.modelKey ?? null
      const {
        effectivePrompt,
        promptStats,
        assembled,
      } = await assembleAndComposeUserPrompt({
        text,
        workMode: 'code',
        workspacePath: runtimeContext.workspacePath,
        sandboxContextLine: sandboxContextLineForContext(runtimeContext),
        modelKey: taskModelKey,
        selectedSkill: null,
        conversationMessages: state.messages ?? [],
        preferences: prefs,
      })
      logPromptPipelineAccounting(conversationId, promptStats, assembled, { scope: 'tasks:sendMessage' })
      emitPromptBudget(event.sender, promptBudgetSnapshotFromStats(conversationId, promptStats, assembled, 'tasks:sendMessage'))
      return permissions.withExecution(runtimeContext.permissionMode, event.sender, () => orchestration.sendTaskMessage({
        taskId,
        text: effectivePrompt,
        conversationId,
        webContents: event.sender,
        workspacePath: runtimeContext.workspacePath,
      }), { conversationId })
    })
  })

  const terminalService = createTerminalService()

  ipcHandle(ipcMain, 'terminal:create', async (event, options = {}) => {
    const targetCwd = options.cwd || cachedWorkspace || fallbackWorkspace
    const sessionId = options.id || `term-${Date.now()}`
    
    // 当窗口销毁时自动销毁对应终端会话
    event.sender.once('destroyed', () => {
      terminalService.killSession(sessionId)
    })

    return await terminalService.createSession({
      id: sessionId,
      cwd: targetCwd,
      title: options.title,
      cols: options.cols,
      rows: options.rows,
      onData: (data) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('terminal:data', { id: sessionId, data })
        }
      },
      onExit: (code) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('terminal:exit', { id: sessionId, code })
        }
      },
    })
  })

  ipcHandle(ipcMain, 'terminal:write', (_event, payload = {}) => {
    return terminalService.write(payload.id, payload.data)
  })

  ipcHandle(ipcMain, 'terminal:resize', (_event, payload = {}) => {
    return terminalService.resize(payload.id, payload.cols, payload.rows)
  })

  ipcHandle(ipcMain, 'terminal:kill', (_event, payload = {}) => {
    return terminalService.killSession(payload.id)
  })

  ipcHandle(ipcMain, 'terminal:list', () => {
    return terminalService.listSessions()
  })

  ipcHandle(ipcMain, 'system:getEnvDiagnostics', (_event, customDirs = []) => {
    return diagnoseEnvironment(customDirs)
  })

  ipcHandle(ipcMain, 'system:diagnoseTool', async (_event, name) => {
    return diagnoseTool(name)
  })

  app.on('before-quit', () => {
    scheduledJobsRunner.stop()
    terminalService.dispose()
  })

  return { modelService, profileStore, appState, chatService: chat, orchestrationService: orchestration, permissionService: permissions, permissionRulesStore, mcpService: mcp, terminalService }
}
