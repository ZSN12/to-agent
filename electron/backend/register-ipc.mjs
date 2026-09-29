import path from 'node:path'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import { createProfileStore } from './profile-store.mjs'
import { createModelService } from './model-service.mjs'
import { createModelRegistryUpdater } from './model-registry-updater.mjs'
import { createAppStateStore } from './app-state-store.mjs'
import { createDshChatService } from './dsh-chat-service.mjs'
import { createOrchestrationService, PlannerFallbackError } from './orchestration-service.mjs'
import { createSkillService } from './skill-service.mjs'
import { decideExecutionMode, resolveExecutionMode } from './orchestration-policy.mjs'
import { createPermissionService } from './permission-service.mjs'
import { resolvePermissionPrompt } from './permission-prompt-bridge.mjs'
import { createPermissionRulesStore } from './permission-rules-store.mjs'
import { createWorkspaceIndex } from './workspace-index.mjs'
import { isWorkspacePath } from './workspace-index.mjs'
import { assembleWorkspaceContext } from './context-assembler.mjs'
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
import { detectVerificationCommands } from './verification-policy.mjs'
import { analyzeUserIntent, injectIntentGuidelines } from './user-intent.mjs'
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
import { probeSandboxSupport } from './sandbox-service.mjs'
import { resolveSandboxPolicy, renderFileSandboxContext } from './sandbox-policy.mjs'
import { createSandboxSessionStore } from './sandbox-session-mode.mjs'
import { createCredentialStore } from './credential-store.mjs'
import { listMcpCatalog } from './mcp-catalog.mjs'
import { getMarketplaceManifest, listMarketplaceEntries, catalogEntryToServerConfig } from './mcp-marketplace.mjs'
import { createTaskWorktree, listTaskWorktrees, removeTaskWorktree, getTaskWorktreeDiff } from './worktree-service.mjs'
import { createMemoryStore } from './memory-store.mjs'
import { createCustomProviderService } from './custom-provider-service.mjs'
import { listModelsFromExport } from './opencodex-sync.mjs'
import { migrateLegacyModelsJson, resolveTaskWeaverModelsPath } from './taskweaver-models-path.mjs'
import { ensureModelsJsonSyncedToDshHost } from './sync-models-json-to-host.mjs'
import { IPC_PLANNER_FALLBACK_HINT_MAX_LENGTH, IPC_ERROR_MESSAGE_MAX_LENGTH } from './config.mjs'
import { resolveConversationId } from './conversation-id-routing.mjs'

function ipcHandle(ipcMain, channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const data = await fn(event, ...args)
      return { ok: true, data }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  })
}

/**
 * 注册全部主进程 IPC（模型 + 应用状态 + 单 Agent 对话）。
 */
export async function registerIpc({ ipcMain, app, dialog, BrowserWindow, safeStorage, net }) {
  const { configureCodexOAuthNetwork } = await import('./codex-oauth.mjs')
  if (net?.fetch) {
    configureCodexOAuthNetwork({ fetch: (input, init) => net.fetch(input, init) })
  }
  const userData = app.getPath('userData')
  const fallbackWorkspace = process.cwd()

  const profileStore = createProfileStore(userData)
  const agentDataPath = path.join(userData, 'taskweaver-agent')
  const builtInSkillsPath = path.join(app.getAppPath(), 'electron', 'skills')
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

  const { createZHostManager, resolveTaskWeaverRuntimeRoot } = await import('../agent/z-host/index.mjs')
  const runtimeRoot = resolveTaskWeaverRuntimeRoot({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
  })
  const hostManager = createZHostManager({
    runtimeRoot,
    userDataPath: userData,
    executable: process.execPath,
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
  const mcp = createMcpService({ userData, safeStorage })
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
  const UNBOUND_WORKSPACE_ERROR = '当前对话还没有绑定工作区。未绑定工作区时 DSH 会话会落在文件系统根目录，'
    + '文件写入沙箱边界将失效，因此本次消息已阻止。请先选择一个工作区文件夹再发送。'
  /** 发送前的最后一道闸：没有工作区就不要建立 DSH 会话。 */
  const assertWorkspaceBound = (context) => {
    if (!context?.workspaceBound) throw new Error(UNBOUND_WORKSPACE_ERROR)
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
    getWorkspacePath: () => cachedWorkspace,
    getWorkspaceTrusted: () => cachedWorkspaceTrusted,
    hostManager
  })
  const sessionMemory = createMemoryStore({ agentDataPath })
  const workspaceIndex = createWorkspaceIndex({ getWorkspacePath: () => cachedWorkspace })
  const turnInProgressByConversation = new Map()

  const withTurnLock = async (conversationId, fn) => {
    if (!conversationId) throw new Error('缺少会话标识')
    if (turnInProgressByConversation.get(conversationId)) throw new Error('该会话的上一条任务仍在处理中')
    turnInProgressByConversation.set(conversationId, true)
    try {
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
    if (targetConversationId && (
      turnInProgressByConversation.get(targetConversationId)
      || chat.isBusy(targetConversationId)
      || orchestration.isBusy(targetConversationId)
    )) {
      throw new Error('目标会话仍在执行任务，结束后再切换')
    }
    if (!targetConversationId && (
      turnInProgressByConversation.size > 0
      || chat.isBusyAny()
      || orchestration.isBusy()
    )) {
      throw new Error('有对话仍在执行任务，完成或停止后再执行此工作区操作')
    }
  }
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

  const chat = createDshChatService({
    hostManager,
    conversationHub,
    userDataPath: userData,
    getWorkspacePath: () => cachedWorkspace,
    profileStore,
    modelService,
    getPermissionMode: async (conversationId) => {
      const state = conversationId && appState.getConversationState
        ? await appState.getConversationState(conversationId)
        : await appState.getState()
      return state.permissionMode || 'ask'
    },
  })

  app.on('before-quit', () => { void chat.stop() })
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
      try {
        const { removed } = await chat.forgetConversation(target.conversationId)
        for (const conversationId of removed) conversationHub.detachSession(conversationId)
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
    if (source?.conversationId) assertNotBusy(source.conversationId)
    await chat.resetSession()
    const state = await appState.forkThread(threadId, messageId)
    await refreshWorkspaceCache()
    // fork 出来的对话此前是「UI 有消息、模型是空的」：DSH 侧是新建的空会话。
    // 这里同步 fork 源 DSH 会话，让分支真正继承上下文。
    if (source?.conversationId && state?.conversationId) {
      try {
        const completedTurns = await resolveForkCompletedTurns(source.conversationId, messageId)
        const result = await chat.forkConversation({
          sourceConversationId: source.conversationId,
          targetConversationId: state.conversationId,
          completedTurns,
        })
        if (!result?.ok) {
          console.warn('[register-ipc] forkThread 未继承 DSH 上下文:', result?.reason, result?.error ?? '')
        }
      } catch (error) {
        console.warn('[register-ipc] forkThread 同步 DSH 会话失败:', error instanceof Error ? error.message : error)
      }
    }
    return state
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
  ipcHandle(ipcMain, 'models:scanLocal', async () => {
    // Scan OpenCodex models from local CLI export
    const openCodexPath = path.join(userData, 'opencodex-export.json')
    if (!fsSync.existsSync(openCodexPath)) {
      return { models: [], source: null, syncedAt: null }
    }
    try {
      const raw = await fs.readFile(openCodexPath, 'utf8')
      const exportDoc = JSON.parse(raw)
      const models = listModelsFromExport(exportDoc)
      const stats = await fs.stat(openCodexPath)
      return {
        models,
        source: openCodexPath,
        syncedAt: stats.mtime.toISOString(),
      }
    } catch (err) {
      console.error('扫描本地 OpenCodex 模型失败:', err)
      return { models: [], source: null, syncedAt: null, error: err.message }
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
  ipcHandle(ipcMain, 'mcp:list', () => mcp.listServers())
  ipcHandle(ipcMain, 'mcp:save', async (_event, server) => {
    assertNotBusy()
    const saved = await mcp.saveServer(server)
    await chat.resetSession()
    return saved
  })
  ipcHandle(ipcMain, 'mcp:remove', async (_event, id) => {
    assertNotBusy()
    const removed = await mcp.removeServer(id)
    await chat.resetSession()
    return removed
  })
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
    assertNotBusy()
    const { path: relPath, reverseEdits, originalContent } = payload || {}
    if (!relPath || typeof relPath !== 'string') throw new Error('未提供有效的文件路径')
    await refreshWorkspaceCache()

    const hasReverseEdits = Array.isArray(reverseEdits) && reverseEdits.length > 0
    // 严格安全路径校验：防范同前缀兄弟目录、.. 相对逃逸与符号链接越界
    const { realPath, relativePath } = await assertSafeWorkspacePath(cachedWorkspace, relPath, {
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
    assertNotBusy()
    await refreshWorkspaceCache()
    const { checkpointId, force, expectedStateFingerprint } = payload || {}
    if (!checkpointId) throw new Error('缺少检查点 ID')
    return restoreGitCheckpoint(cachedWorkspace, checkpointId, {
      force: Boolean(force),
      expectedStateFingerprint,
      userDataPath: userData,
    })
  })

  ipcHandle(ipcMain, 'workspace:deleteGitCheckpoint', async (_event, checkpointId) => {
    assertNotBusy()
    await refreshWorkspaceCache()
    if (!checkpointId) throw new Error('缺少检查点 ID')
    return deleteGitCheckpoint(cachedWorkspace, checkpointId, {
      userDataPath: userData,
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

  ipcHandle(ipcMain, 'permission:respondPrompt', (_event, id, response) => {
    const ok = resolvePermissionPrompt(id, response)
    return { ok }
  })

  ipcHandle(ipcMain, 'chat:steer', async (event, text, requestedConversationId) => {
    if (!text || typeof text !== 'string') throw new Error('内容不能为空')
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    assertWorkspaceBound(runtimeContext)
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
    assertWorkspaceBound(runtimeContext)
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
    const config = catalogEntryToServerConfig(id, { env })
    return mcp.installFromCatalog(config)
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
  ipcHandle(ipcMain, 'webSearch:getConfig', () => webSearch.getConfig())
  ipcHandle(ipcMain, 'webSearch:setConfig', (_event, patch) => webSearch.setConfig(patch ?? {}))
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

  /**
   * 根据工作模式准备提示词
   */
  const preparePromptByWorkMode = (text, workMode, assembled) => {
    let effectiveOverride = null
    let effectivePrompt = assembled.prompt

    if (workMode === 'goal') {
      effectiveOverride = 'multi-agent'
    } else if (workMode === 'plan') {
      effectiveOverride = 'single-agent'
      effectivePrompt = `【系统模式：计划模式 (Plan Mode)】\n请对用户提出的需求进行系统性推演与架构分析，输出严密、详尽、步骤明确的逐步实施计划（Step-by-step Execution Plan），列出涉及的文件路径、接口改动、验证方案与风险点。请注意：在计划模式下专注于生成规划方案，不要修改工作区代码。\n\n需求详情：\n${assembled.prompt}`
    } else {
      const intent = analyzeUserIntent(text, workMode)
      const policy = detectVerificationCommands(cachedWorkspace)
      effectivePrompt = injectIntentGuidelines(effectivePrompt, intent, policy)
    }

    return { effectiveOverride, effectivePrompt }
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
  const executeMultiAgent = async (effectivePrompt, activeKey, selectedSkill, event, execution, conversationId, runtimeContext) => {
    try {
      const outcome = await orchestration.planAndExecute({
        text: effectivePrompt,
        primaryModelKey: activeKey,
        conversationId,
        workspacePath: runtimeContext.workspacePath,
        webContents: event.sender,
        skill: selectedSkill,
        synthesize: async (prompt) => chat.send({
          text: prompt,
          modelKey: activeKey,
          conversationId,
          cwdOverride: runtimeContext.workspacePath,
          webContents: event.sender,
          skill: selectedSkill,
        }),
      })
      return { text: outcome.assistant.text, usage: outcome.assistant.usage }
    } catch (error) {
      if (error instanceof PlannerFallbackError || error?.code === 'PLANNER_FALLBACK') {
        const hint = error instanceof Error ? error.message : String(error)
        const result = await chat.send({
          text: effectivePrompt,
          modelKey: activeKey,
          conversationId,
          cwdOverride: runtimeContext.workspacePath,
          webContents: event.sender,
          skill: selectedSkill,
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
  const executeSingleAgent = async (effectivePrompt, activeKey, selectedSkill, event, execution, conversationId, runtimeContext) => {
    return chat.send({
      text: effectivePrompt,
      modelKey: activeKey,
      conversationId,
      cwdOverride: runtimeContext.workspacePath,
      webContents: event.sender,
      skill: selectedSkill,
    })
  }

  /**
   * 执行聊天请求（多 Agent 或单 Agent）
   */
  const executeChatRequest = async (execution, effectivePrompt, activeKey, selectedSkill, event, conversationId, runtimeContext) => {
    return permissions.withExecution(runtimeContext.permissionMode, event.sender, async () => {
      if (execution.mode === 'multi-agent') {
        return executeMultiAgent(effectivePrompt, activeKey, selectedSkill, event, execution, conversationId, runtimeContext)
      }
      return executeSingleAgent(effectivePrompt, activeKey, selectedSkill, event, execution, conversationId, runtimeContext)
    }, { conversationId })
  }

  /**
   * 处理执行错误并存储错误消息
   */
  const handleChatError = async (error, messageId, time, conversationId) => {
    const message = error instanceof Error ? error.message : String(error)
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
      id: `${messageId}-a`,
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
      callout,
    }
    await appState.appendMessagesToConversation(conversationId, agentEntry)
    return agentEntry
  }

  // ========== chat:send main handler ==========

  ipcHandle(ipcMain, 'chat:send', async (event, text, modelKey, skillName, executionModeOverride, workMode = 'code', requestedConversationId) => {
    // 先获取当前会话 ID，再用它加锁，避免并发时串会话
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) throw new Error('当前对话标识无效')
    const runtimeContext = await getConversationRuntimeContext(conversationId)
    assertWorkspaceBound(runtimeContext)

    return withTurnLock(conversationId, async () => {

    const { modelKey: activeKey } = await validateAndResolveModel(text, modelKey)
    await tryAutoSnapshot(runtimeContext)

    const selectedSkill = skillName ? await skills.resolve(skillName) : null
    const assembled = await assembleWorkspaceContext(text, runtimeContext.workspacePath, {
      sandboxContextLine: sandboxContextLineForContext(runtimeContext),
    })

    const { effectiveOverride, effectivePrompt } = preparePromptByWorkMode(text, workMode, assembled)

    const decision = decideExecutionMode(text, selectedSkill)
    const execution = resolveExecutionMode(decision, effectiveOverride || executionModeOverride)
    if (execution.mode === 'ask-user') {
      return {
        needsOrchestrationChoice: true,
        reason: decision.reason,
        suggestedMode: decision.suggestedMode ?? 'multi-agent',
      }
    }

    const { messageId, time, userEntry } = await createUserMessage(text, conversationId)

    let result
    try {
      result = await executeChatRequest(execution, effectivePrompt, activeKey, selectedSkill, event, conversationId, runtimeContext)
    } catch (error) {
      await handleChatError(error, messageId, time, conversationId)
    }

    const agentEntry = await createAssistantMessage(result, messageId, time, activeKey, execution, conversationId)
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
      const assembled = await assembleWorkspaceContext(text, runtimeContext.workspacePath, {
        sandboxContextLine: sandboxContextLineForContext(runtimeContext),
      })
      return permissions.withExecution(runtimeContext.permissionMode, event.sender, () => orchestration.sendTaskMessage({
        taskId,
        text: assembled.prompt,
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
    terminalService.dispose()
  })

  return { modelService, profileStore, appState, chatService: chat, orchestrationService: orchestration, permissionService: permissions, permissionRulesStore, mcpService: mcp, terminalService }
}
