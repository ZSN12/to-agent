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
import { ensureWorkspaceHooksApproved } from './taskweaver-hook-runner.mjs'
import { resolveSandboxPolicy, renderFileSandboxContext } from './sandbox-policy.mjs'
import { createSandboxSessionStore } from './sandbox-session-mode.mjs'
import { createCredentialStore } from './credential-store.mjs'
import { createApprovalAuditStore } from './approval-audit.mjs'
import { createMemoryStore } from './memory-store.mjs'
import { createCustomProviderService } from './custom-provider-service.mjs'
import { setOcxRuntimeContext } from './opencodex-binary.mjs'
import { createAppBootstrap } from './bootstrap.mjs'
import { resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'
import { ensureModelsJsonSyncedToDshHost } from './sync-models-json-to-host.mjs'
import { resolveConversationId } from './conversation-id-routing.mjs'
import { createWorkspaceOperationGuard } from './workspace-operation-guard.mjs'

/**
 * 主进程服务装配（阶段 5.2）。
 */
export async function composeBackendServices({ app, dialog, BrowserWindow, safeStorage, net }) {
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
  const approvalAudit = createApprovalAuditStore({ agentDataPath })
  const dshHomePath = path.join(userData, 'dsh')
  const agentsHomePath = process.env.Z_AGENTS_HOME || process.env.DSH_AGENTS_HOME || path.join(homedir(), '.agents')
  const builtInSkillsPath = path.join(app.getAppPath(), 'vendor', 'z-runtime', '.agents', 'skills')
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

  const { resolveTaskWeaverOpenCodexRoot } = await import('./opencodex-package-root.mjs')
  const opencodexPackageRoot = resolveTaskWeaverOpenCodexRoot(app.getAppPath()) ?? undefined

  const hostManager = createZHostManager({
    runtimeRoot,
    opencodexPackageRoot,
    userDataPath: userData,
    executable: process.execPath,
    getMcpRuntimeIntegration: () => mcp.prepareRuntimeIntegration(),
  })
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
  })
  modelRegistryUpdater.setMappingValidator((registry) => modelService.validateRegistryMapping(registry))
  const appBootstrap = createAppBootstrap({
    userData,
    appPath: app.getAppPath(),
    hostManager,
    profileStore,
    modelService,
    credentialStore,
    modelRegistryUpdater,
  })
  void appBootstrap.start().catch((error) => {
    console.error('应用引导失败（模型/Host 将重试）:', error instanceof Error ? error.message : error)
  })
  const modelsPath = resolveTaskWeaverModelsPath(userData)
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
      modelKey: state.modelKey ?? null,
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
    return ensureWorkspaceHooksApproved(userData, workspacePath, { dialog, parentWindow: parent })
  }

  const resolveIpcConversationId = async (requestedConversationId) => {
    const state = requestedConversationId === undefined ? await appState.getState() : null
    return resolveConversationId(
      requestedConversationId,
      state?.conversationId ?? cachedConversationId,
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
    getWorkspaceTrusted: () => cachedWorkspaceTrusted,
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
  const chat = createDshChatService({
    hostManager,
    conversationHub,
    userDataPath: userData,
    getWorkspacePath: () => cachedWorkspace,
    profileStore,
    modelService,
    appState,
    onTurnCompleted: persistNativeTurn,
    logger: console,
    getPermissionMode: async (conversationId) => {
      const state = conversationId && appState.getConversationState
        ? await appState.getConversationState(conversationId)
        : await appState.getState()
      return state.permissionMode || 'ask'
    },
    logApprovalEvent: (conversationId, type, body) => approvalAudit.append(conversationId, type, body),
  })

  app.on('before-quit', () => { void chat.stop() })
  const scheduledJobsStore = createScheduledJobsStore(userData)

  const orchestration = createOrchestrationService({
    modelService,
    appState,
    getWorkspacePath: () => cachedWorkspace,
    agentDataPath,
    userDataPath: userData,
    getAppPreferences: () => appPreferences.get(),
    dshRuntime: chat,
    permissionService: permissions,
  })
  return {
    app, dialog, BrowserWindow, safeStorage, net,
    userData, fallbackWorkspace,
    profileStore, approvalAudit, mcp, hostManager, conversationHub,
    modelRegistryUpdater, modelService, appBootstrap, modelsPath, appState, usageStore,
    workspaceTrust, webSearch, appPreferences, permissionRulesStore, sandboxSession,
    getCachedWorkspace: () => cachedWorkspace,
    getCachedConversationId: () => cachedConversationId,
    setCachedWorkspaceTrusted: (trusted) => { cachedWorkspaceTrusted = trusted },
    cachedBashSandbox: () => cachedBashSandbox,
    cachedPermissionMode: () => cachedPermissionMode,
    cachedSessionSandboxMode: () => cachedSessionSandboxMode,
    setCachedSessionSandboxMode: (mode) => { cachedSessionSandboxMode = mode },
    refreshWorkspaceCache, getConversationRuntimeContext, sandboxContextLineForContext,
    skills, sessionMemory, workspaceIndex, turnInProgressByConversation,
    withTurnLock, resolveWorktreeContext, workspaceHooksTrusted, resolveIpcConversationId,
    assertNotBusy, withWorkspaceOperation, validateWorkspace, permissions,
    customProviderService, persistNativeTurn, chat, orchestration, scheduledJobsStore,
    agentDataPath, pricingSync, credentialStore,
  }
}
