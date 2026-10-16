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
import { createContextInjectionLedger } from './context-injection-ledger.mjs'
import { createOrchestrationService } from './orchestration-service.mjs'
import { createSkillService } from './skill-service.mjs'
import { createPermissionService } from './permission-service.mjs'
import { createPermissionRulesStore } from './permission-rules-store.mjs'
import { createWorkspaceIndex } from './workspace-index.mjs'
import { createWorkspaceTrustService } from './workspace-trust-service.mjs'
import { createMcpService } from './mcp-service.mjs'
import {
  isGitRepository,
  createGitCheckpoint,
} from './git-service.mjs'
import { createUsageStore } from './usage-store.mjs'
import { createPricingSyncService } from './pricing-sync-service.mjs'
import { createWebSearchService } from './web-search-service.mjs'
import { createAppPreferencesStore } from './app-preferences.mjs'
import { createScheduledJobsStore } from './scheduled-jobs-store.mjs'
import { ensureWorkspaceHooksApproved, loadTaskweaverHooks } from './taskweaver-hook-runner.mjs'
import { resolveSandboxPolicy } from './sandbox-policy.mjs'
import { createIpcRuntimeContext } from './ipc/context.mjs'
import { createSandboxSessionStore } from './sandbox-session-mode.mjs'
import { createCredentialStore } from './credential-store.mjs'
import { createApprovalAuditStore } from './approval-audit.mjs'
import { readTaskWeaverEnvironment, resolveTaskWeaverRuntimeHome } from './agent/z-host/migrate-z-home.mjs'
import { createMemoryStore } from './memory-store.mjs'
import { createCustomProviderService } from './custom-provider-service.mjs'
import { createHostModelCatalogEventPump } from './host-events.mjs'
import { resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'
import { ensureModelsJsonSyncedToDshHost } from './sync-models-json-to-host.mjs'
import { resolveConversationId } from './conversation-id-routing.mjs'
import { createWorkspaceOperationGuard } from './workspace-operation-guard.mjs'
import { setJsonStoreCorruptionHandler } from './json-store.mjs'

/**
 * 主进程服务装配（阶段 5.2）。
 */
export async function composeBackendServices({ app, dialog, BrowserWindow, safeStorage, secrets, net, startup }) {
  const {
    hostManager,
    bootstrap: appBootstrap,
    runtimeRoot,
    hostNodeExecutable,
    configureHostRuntimeIntegrations,
    configureBootstrapServices,
  } = startup ?? {}
  if (!hostManager || !appBootstrap || !runtimeRoot || !hostNodeExecutable) {
    throw new Error('composeBackendServices requires the process startup coordinator')
  }
  setJsonStoreCorruptionHandler(({ filePath, quarantinePath }) => {
    const parent = BrowserWindow?.getAllWindows?.().find((window) => !window.isDestroyed())
    const options = {
      type: 'warning',
      title: '本地数据文件损坏',
      message: '已隔离损坏的数据文件，并恢复为默认值。',
      detail: `损坏文件：${filePath}\n隔离副本：${quarantinePath}`,
      buttons: ['确定'],
      noLink: true,
    }
    const shown = parent
      ? dialog.showMessageBox(parent, options)
      : dialog.showMessageBox(options)
    return shown
  })
  const { configureCodexOAuthNetwork } = await import('./codex-oauth.mjs')
  const { configureGitHubMcpOAuthNetwork } = await import('./github-mcp-oauth.mjs')
  if (net?.fetch) {
    const networkFetch = (input, init) => net.fetch(input, init)
    configureCodexOAuthNetwork({ fetch: networkFetch })
    configureGitHubMcpOAuthNetwork({ fetch: networkFetch })
  }
  const userData = app.getPath('userData')
  const appPreferences = createAppPreferencesStore(userData)
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
  const approvalAudit = createApprovalAuditStore({ agentDataPath })
  const runtimeHomePath = resolveTaskWeaverRuntimeHome()
  const agentsHomePath = readTaskWeaverEnvironment(
    process.env,
    'TASKWEAVER_AGENTS_HOME',
    ['TASKWEAVER_AGENTS_HOME', 'TASKWEAVER_AGENTS_HOME'],
  ) || path.join(homedir(), '.agents')
  const builtInSkillsPath = path.join(app.getAppPath(), 'backend', 'skills')
  const bundledRegistryPath = path.join(app.getAppPath(), 'pricing', 'registry.json')
  const pricingSync = createPricingSyncService({
    userDataPath: userData,
    bundledRegistryPath,
    getDshDirectory: async () => modelService.getDshModelDirectory(),
  })

  const credentialStore = createCredentialStore({
    filePath: path.join(userData, 'credentials.enc'),
    safeStorage,
    secrets,
  })

  let assertRuntimeConfigChangeSafe = () => {
    throw new Error('应用服务尚未就绪，暂时不能修改 Host runtime 配置。')
  }
  const webSearch = createWebSearchService({
    userData,
    safeStorage,
    secrets,
    searchWithHost: async ({ query, maxResults }) => {
      const { api } = await hostManager.start()
      const response = await api.host.searchWeb({ query, maxResults })
      if (!response.result.ok) throw new Error(response.result.error.message)
      return response.result.value
    },
    assertRuntimeConfigChangeSafe: () => assertRuntimeConfigChangeSafe(),
    onRuntimeConfigChanged: async () => {
      if (hostManager) await hostManager.restart()
    },
  })
  const mcp = createMcpService({
    userData,
    safeStorage,
    secrets,
    getHostTools: async ({ startHost = false } = {}) => {
      const api = startHost ? (await hostManager.start()).api : hostManager.getApi()
      if (!api) return null
      const response = await api.mcp.list({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      return response.result.value.tools
    },
  })
  configureHostRuntimeIntegrations({ mcp, webSearch, appPreferences })

  const { createZConversationHub } = await import('./z-conversation-hub.mjs')
  const conversationHub = createZConversationHub({ runtimeRoot })
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
    appVersion: app.getVersion(),
  })
  pricingSync.setAfterSync?.(() => modelService.refreshCapabilityTiers())
  pricingSync.start()
  app.on('before-quit', () => pricingSync.stop())
  modelRegistryUpdater.setMappingValidator((registry) => modelService.validateRegistryMapping(registry))
  configureBootstrapServices({ profileStore, modelService, credentialStore, modelRegistryUpdater })
  const hostModelCatalogEvents = createHostModelCatalogEventPump({ hostManager, modelService })
  app.once('before-quit', () => hostModelCatalogEvents.stop())
  const bootstrapPromise = appBootstrap.start()
  void bootstrapPromise.then(() => hostModelCatalogEvents.start()).catch((error) => {
    console.error('应用引导失败（模型/Host 将重试）:', error instanceof Error ? error.message : error)
  })
  const modelsPath = resolveTaskWeaverModelsPath(userData)
  const appState = createAppStateStore(userData, fallbackWorkspace)
  const usageStore = createUsageStore(userData)
  const workspaceTrust = createWorkspaceTrustService(userData)
  const permissionRulesStore = createPermissionRulesStore({ userDataPath: userData })

  const sandboxSession = createSandboxSessionStore(userData)
  const runtimeContext = createIpcRuntimeContext({
    appState,
    fallbackWorkspace,
    workspaceTrust,
    appPreferences,
    sandboxSession,
    usageStore,
  })
  const {
    refreshUiSnapshot,
    getConversationRuntimeContext,
    sandboxContextLineForContext,
    getUiWorkspacePath,
    getUiConversationId,
    getUiWorkspaceTrusted,
    setUiWorkspaceTrusted,
    getUiBashSandbox,
    getUiPermissionMode,
    getUiSessionSandboxMode,
    setUiSessionSandboxMode,
  } = runtimeContext
  await refreshUiSnapshot()
  const getWorkspacePathForConversation = async (conversationId) => {
    const ctx = await getConversationRuntimeContext(conversationId ?? getUiConversationId())
    return ctx.workspacePath
  }
  const skills = createSkillService({
    agentDataPath,
    builtInSkillsPath,
    globalSkillPaths: [path.join(runtimeHomePath, 'skills'), path.join(agentsHomePath, 'skills')],
    getWorkspacePath: getWorkspacePathForConversation,
    getWorkspaceTrusted: async (conversationId) => {
      const ctx = await getConversationRuntimeContext(conversationId ?? getUiConversationId())
      return ctx.workspaceTrusted === true
    },
    hostManager
  })
  const sessionMemory = createMemoryStore({ agentDataPath })
  const workspaceIndex = createWorkspaceIndex()
  const turnInProgressByConversation = new Map()
  let mcpHostRestartInProgress = false
  const workspaceOperationGuard = createWorkspaceOperationGuard(getConversationRuntimeContext)

  const withTurnLock = async (conversationId, fn) => {
    if (!conversationId) throw new Error('缺少会话标识')
    if (mcpHostRestartInProgress) throw new Error('MCP 工具正在重新加载，请稍后重试。')
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

  async function resolveWorktreeContext(requestedConversationId) {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    if (!runtimeContext.workspacePath) throw new Error('请先设置工作区')
    return { conversationId, workspacePath: runtimeContext.workspacePath }
  }

  async function workspaceHooksTrusted(workspacePath, workspaceTrusted) {
    if (!workspaceTrusted || !workspacePath) return false
    const parent = BrowserWindow?.getFocusedWindow?.() ?? null
    return ensureWorkspaceHooksApproved(userData, workspacePath, {
      dialog,
      parentWindow: parent,
      isPackaged: app.isPackaged === true,
    })
  }

  async function resolveTaskweaverHooks({ conversationId, workspacePath, workspaceTrusted = false } = {}) {
    let resolvedWorkspacePath = workspacePath || null
    let trusted = workspaceTrusted === true
    if (conversationId) {
      const context = await getConversationRuntimeContext(conversationId)
      resolvedWorkspacePath ||= context.workspacePath
      trusted = context.workspaceTrusted === true
    }
    const approved = await workspaceHooksTrusted(resolvedWorkspacePath, trusted)
    return loadTaskweaverHooks(userData, resolvedWorkspacePath, { workspaceTrusted: approved })
  }

  const resolveIpcConversationId = async (requestedConversationId) => {
    const state = requestedConversationId === undefined ? await appState.getState() : null
    return resolveConversationId(
      requestedConversationId,
      state?.conversationId ?? getUiConversationId(),
    )
  }

  const assertNotBusy = (targetConversationId) => {
    if (!targetConversationId) {
      throw new Error('assertNotBusy 需要会话 ID')
    }
    // 只检查目标会话是否忙碌，允许其他会话并发运行
    if (
      turnInProgressByConversation.get(targetConversationId)
      || chat.isBusy(targetConversationId)
      || orchestration.isBusy(targetConversationId)
    ) {
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
    getToolHooks: resolveTaskweaverHooks,
    getWorkspaceTrusted: async (conversationId) => {
      const ctx = await getConversationRuntimeContext(conversationId)
      return ctx.workspaceTrusted === true
    },
    getFileSandboxPolicy: async (conversationId, workspaceOverride) => {
      const context = await getConversationRuntimeContext(conversationId)
      return resolveSandboxPolicy({
        ...context,
        ...(workspaceOverride ? { workspacePath: workspaceOverride } : {}),
      }).file
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
    getAutoReviewReads: async () => (await appPreferences.get()).autoReviewReads !== false,
    logApprovalEvent: (conversationId, type, body) => approvalAudit.append(conversationId, type, body),
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
  const contextInjectionLedger = createContextInjectionLedger()
  const chat = createDshChatService({
    hostManager,
    conversationHub,
    userDataPath: userData,
    getWorkspacePath: getWorkspacePathForConversation,
    resolveToolHooks: resolveTaskweaverHooks,
    profileStore,
    modelService,
    appState,
    contextInjectionLedger,
    onTurnCompleted: persistNativeTurn,
    logger: console,
    getPermissionMode: async (conversationId) => {
      const state = conversationId && appState.getConversationState
        ? await appState.getConversationState(conversationId)
        : await appState.getState()
      return state.permissionMode || 'ask'
    },
    getUiVerifyPolicy: async (conversationId, cwdOverride) => {
      const context = conversationId ? await getConversationRuntimeContext(conversationId) : null
      const workspacePath = cwdOverride || context?.workspacePath
      if (!workspacePath) return undefined
      const [trust, preferences] = await Promise.all([
        workspaceTrust.get(workspacePath),
        appPreferences.get(),
      ])
      return {
        workspaceTrusted: trust.trusted === true,
        autoAllowUiVerify: preferences.autoAllowUiVerify === true,
      }
    },
    logApprovalEvent: (conversationId, type, body) => approvalAudit.append(conversationId, type, body),
  })

  app.on('before-quit', () => chat.stop())
  const scheduledJobsStore = createScheduledJobsStore(userData)

  const orchestration = createOrchestrationService({
    modelService,
    appState,
    getWorkspacePath: getWorkspacePathForConversation,
    agentDataPath,
    userDataPath: userData,
    getAppPreferences: () => appPreferences.get(),
    dshRuntime: chat,
    permissionService: permissions,
  })
  chat.setOrchestrationHandler(async ({ conversationId, goal, taskContext, readOnly, context, webContents, signal }) => {
    if (context?.allowed !== true) throw new Error('当前回合没有启用 DAG 编排权限。')
    const readOnlyRequest = readOnly === true || context.permissionMode === 'readonly'
    const outcome = await orchestration.planAndExecute({
      text: context.text,
      rawText: context.rawText,
      contextLayers: [
        ...(Array.isArray(context.promptContextLayers) ? context.promptContextLayers : []),
        ...(typeof taskContext === 'string' && taskContext.trim()
          ? [{ id: 'primary-agent-known-context', text: taskContext.trim() }]
          : []),
        { id: 'primary-agent-dag-goal', text: goal },
      ],
      primaryModelKey: context.primaryModelKey,
      conversationId,
      webContents,
      skill: context.skill,
      skillAlreadyApplied: context.skillAlreadyApplied === true,
      workspacePath: context.workspacePath,
      permissionMode: readOnlyRequest ? 'readonly' : context.permissionMode,
      forceReadOnly: readOnlyRequest,
      workspaceTrusted: context.workspaceTrusted === true,
      attachments: context.attachments,
      documents: context.documents,
      dagPlanApprovalOverride: context.dagPlanApprovalOverride,
      signal,
    })
    return outcome
  })
  const withMcpHostRestartLock = async (operation) => {
    if (mcpHostRestartInProgress) throw new Error('MCP 工具正在重新加载，请稍后重试。')
    if (turnInProgressByConversation.size > 0 || chat.isBusyAny() || orchestration.isBusy()) {
      throw new Error('有任务正在执行，不能此时重载 MCP 工具。请等所有会话任务结束后再保存或启用 MCP。')
    }
    mcpHostRestartInProgress = true
    try {
      return await operation()
    } finally {
      mcpHostRestartInProgress = false
    }
  }
  assertRuntimeConfigChangeSafe = () => {
    if (turnInProgressByConversation.size > 0 || chat.isBusyAny() || orchestration.isBusy()) {
      throw new Error('有任务正在执行，不能此时重载网页搜索工具。请等所有会话任务结束后再保存网页搜索设置。')
    }
  }
  return {
    app, dialog, BrowserWindow, safeStorage, net,
    userData, fallbackWorkspace,
    profileStore, approvalAudit, mcp, hostManager, hostNodeExecutable, conversationHub,
    modelRegistryUpdater, modelService, appBootstrap, modelsPath, appState, usageStore,
    startHostModelCatalogEvents: () => hostModelCatalogEvents.start(),
    workspaceTrust, webSearch, appPreferences, permissionRulesStore, sandboxSession,
    getUiWorkspacePath,
    getUiConversationId,
    getUiWorkspaceTrusted,
    setUiWorkspaceTrusted,
    getUiBashSandbox,
    getUiPermissionMode,
    getUiSessionSandboxMode,
    setUiSessionSandboxMode,
    refreshUiSnapshot, getConversationRuntimeContext, sandboxContextLineForContext,
    skills, sessionMemory, workspaceIndex, turnInProgressByConversation,
    withTurnLock, withMcpHostRestartLock, resolveWorktreeContext, workspaceHooksTrusted, resolveIpcConversationId,
    assertNotBusy, withWorkspaceOperation, validateWorkspace, permissions,
    customProviderService, persistNativeTurn, chat, orchestration, scheduledJobsStore,
    contextInjectionLedger,
    agentDataPath, pricingSync, credentialStore,
  }
}
