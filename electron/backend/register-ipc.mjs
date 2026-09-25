import path from 'node:path'
import fs from 'node:fs/promises'
import { createProfileStore } from './profile-store.mjs'
import { createModelService } from './model-service.mjs'
import { createAppStateStore } from './app-state-store.mjs'
import { createChatService } from './chat-service.mjs'
import { createOrchestrationService } from './orchestration-service.mjs'
import { createSkillService } from './skill-service.mjs'
import { decideExecutionMode, resolveExecutionMode } from './orchestration-policy.mjs'
import { createPermissionService } from './permission-service.mjs'
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
  listGitCheckpoints,
  getGitCheckpointDiff,
  restoreGitCheckpoint,
} from './git-service.mjs'
import { createUsageStore } from './usage-store.mjs'
import { createPricingSyncService } from './pricing-sync-service.mjs'
import { assertSafeWorkspacePath } from './security-path.mjs'

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
export async function registerIpc({ ipcMain, app, dialog, BrowserWindow, safeStorage }) {
  const userData = app.getPath('userData')
  const fallbackWorkspace = process.cwd()

  const profileStore = createProfileStore(userData)
  const agentDataPath = path.join(userData, 'taskweaver-agent')
  const builtInSkillsPath = path.join(app.getAppPath(), 'electron', 'skills')
  const builtInExtensionsPath = path.join(app.getAppPath(), 'electron', 'extensions', 'taskweaver-permissions.ts')
  const bundledRegistryPath = path.join(app.getAppPath(), 'pricing', 'registry.json')
  const pricingSync = createPricingSyncService({
    userDataPath: userData,
    bundledRegistryPath,
  })
  pricingSync.start()
  const modelService = createModelService({
    profileStore,
    appDataPath: userData,
    safeStorage,
    priceRegistryPath: pricingSync.resolveReadPath(),
  })
  const appState = createAppStateStore(userData, fallbackWorkspace)
  const usageStore = createUsageStore(userData)
  const workspaceTrust = createWorkspaceTrustService(userData)
  const mcp = createMcpService({ userData, safeStorage })
  const permissionRulesStore = createPermissionRulesStore({ userDataPath: userData })
  app.on('before-quit', () => { void mcp.stopAll() })

  let cachedWorkspace = fallbackWorkspace
  let cachedConversationId = null
  let cachedWorkspaceTrusted = false
  const refreshWorkspaceCache = async () => {
    const state = await appState.getState()
    cachedWorkspace = state.workspacePath || fallbackWorkspace
    cachedConversationId = state.conversationId
    cachedWorkspaceTrusted = (await workspaceTrust.get(cachedWorkspace)).trusted
    if (state?.messages?.length) {
      void Promise.resolve(usageStore.importHistoricalIfEmpty(state.messages)).catch(() => {})
    }
  }
  await refreshWorkspaceCache()
  const skills = createSkillService({ agentDataPath, builtInSkillsPath, getWorkspacePath: () => cachedWorkspace, getWorkspaceTrusted: () => cachedWorkspaceTrusted })
  const workspaceIndex = createWorkspaceIndex({ getWorkspacePath: () => cachedWorkspace })
  let turnInProgress = false

  const withTurnLock = async (fn) => {
    if (turnInProgress) throw new Error('上一条任务仍在处理中')
    turnInProgress = true
    try {
      return await fn()
    } finally {
      turnInProgress = false
    }
  }

  const assertNotBusy = () => {
    if (turnInProgress || chat.isBusy() || orchestration.isBusy()) throw new Error('当前会话仍在执行任务，结束后再切换工作区或会话')
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
    getWorkspacePath: () => cachedWorkspace,
    getWorkspaceTrusted: () => cachedWorkspaceTrusted,
    appState,
    rulesStore: permissionRulesStore,
    onPreMutation: async (ws) => {
      if (await isGitRepository(ws)) {
        await createGitCheckpoint(ws, {
          conversationId: cachedConversationId,
          summary: 'Agent 执行代码修改前自动快照',
          userDataPath: userData,
        })
      }
    },
  })

  const chat = createChatService({
    modelService,
    profileStore,
    usageStore,
    appState,
    mcpService: mcp,
    agentDataPath,
    builtInSkillsPath,
    builtInExtensionsPath,
    getWorkspacePath: () => cachedWorkspace,
    getWorkspaceTrusted: () => cachedWorkspaceTrusted,
  })
  const orchestration = createOrchestrationService({
    modelService,
    profileStore,
    appState,
    mcpService: mcp,
    getWorkspacePath: () => cachedWorkspace,
    getWorkspaceTrusted: () => cachedWorkspaceTrusted,
    agentDataPath,
    builtInSkillsPath,
    builtInExtensionsPath,
  })

  ipcHandle(ipcMain, 'app:getState', async () => {
    await refreshWorkspaceCache()
    return appState.getState()
  })

  ipcHandle(ipcMain, 'app:listOutputLogs', async (_event, options) => appState.listOutputLogs(options))

  ipcHandle(ipcMain, 'app:setWorkspace', async (_event, workspacePath) => {
    assertNotBusy()
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
    assertNotBusy()
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
    assertNotBusy()
    await chat.resetSession()
    const state = await appState.createThread(options)
    await refreshWorkspaceCache()
    return state
  })

  ipcHandle(ipcMain, 'app:listThreads', () => appState.listThreads())

  ipcHandle(ipcMain, 'app:switchThread', async (_event, threadId) => {
    assertNotBusy()
    await chat.resetSession()
    const state = await appState.switchThread(threadId)
    await refreshWorkspaceCache()
    return state
  })

  ipcHandle(ipcMain, 'app:renameThread', (_event, threadId, title) => appState.renameThread(threadId, title))
  ipcHandle(ipcMain, 'app:togglePinThread', (_event, threadId) => appState.togglePinThread(threadId))

  ipcHandle(ipcMain, 'app:deleteThread', async (_event, threadId) => {
    assertNotBusy()
    const before = await appState.getState()
    if (before.currentThreadId === threadId) await chat.resetSession()
    const state = await appState.deleteThread(threadId)
    await refreshWorkspaceCache()
    return state
  })

  ipcHandle(ipcMain, 'app:forkThread', async (_event, threadId, messageId) => {
    assertNotBusy()
    await chat.resetSession()
    const state = await appState.forkThread(threadId, messageId)
    await refreshWorkspaceCache()
    return state
  })

  ipcHandle(ipcMain, 'app:setPermissionMode', async (_event, mode) => {
    const state = await appState.setPermissionMode(mode)
    await refreshWorkspaceCache()
    return state
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
    assertNotBusy()
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

  ipcHandle(ipcMain, 'models:list', () => modelService.listCatalog())
  ipcHandle(ipcMain, 'models:refresh', () => modelService.refreshCatalog())
  ipcHandle(ipcMain, 'models:scanLocal', () => modelService.scanLocalOpenCodexModels())
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
    return profileStore.setActiveModelKey(modelKey)
  })
  ipcHandle(ipcMain, 'models:getThinkingLevel', () => modelService.getThinkingLevel())
  ipcHandle(ipcMain, 'models:setThinkingLevel', async (_event, level) => {
    const res = await modelService.setThinkingLevel(level)
    await chat.updateThinkingLevel(level)
    return res
  })
  ipcHandle(ipcMain, 'usage:getStats', () => usageStore.getStats())
  ipcHandle(ipcMain, 'usage:getReport', (_event, query) => usageStore.getReport(query))
  ipcHandle(ipcMain, 'usage:clear', () => usageStore.clear())
  ipcHandle(ipcMain, 'models:upsertProfile', async (_event, modelKey, patch) =>
    profileStore.upsertProfile(modelKey, patch),
  )
  ipcHandle(ipcMain, 'models:removeProfile', (_event, modelKey) => profileStore.removeProfile(modelKey))
  ipcHandle(ipcMain, 'models:startOAuth', async (event, providerId = 'openai-codex') => {
    return modelService.loginProviderOAuth(providerId, async (statusInfo) => {
      if (statusInfo?.url) {
        try {
          const { shell } = await import('electron')
          await shell.openExternal(statusInfo.url)
        } catch {
          // ignore
        }
      }
      try {
        event.sender.send('models:oauthStatus', statusInfo)
      } catch {
        // ignore
      }
    })
  })
  ipcHandle(ipcMain, 'models:cancelOAuth', () => modelService.cancelOAuthLogin())
  ipcHandle(ipcMain, 'models:submitOAuthCode', (_event, code) => modelService.submitOAuthCode(code))
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
    return createGitCheckpoint(cachedWorkspace, {
      ...options,
      conversationId: cachedConversationId,
      userDataPath: userData,
    })
  })

  ipcHandle(ipcMain, 'workspace:listGitCheckpoints', async () => {
    await refreshWorkspaceCache()
    return listGitCheckpoints(cachedWorkspace, {
      conversationId: cachedConversationId,
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
    const { checkpointId, force } = payload || {}
    if (!checkpointId) throw new Error('缺少检查点 ID')
    return restoreGitCheckpoint(cachedWorkspace, checkpointId, {
      force: Boolean(force),
      userDataPath: userData,
    })
  })

  ipcHandle(ipcMain, 'chat:cancel', async () => {
    const [chatStopped, orchestrationStopped] = await Promise.all([chat.abort(), orchestration.abort()])
    return { stopped: chatStopped || orchestrationStopped }
  })

  ipcHandle(ipcMain, 'chat:steer', async (event, text) => {
    if (!text || typeof text !== 'string') throw new Error('内容不能为空')
    await refreshWorkspaceCache()
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    const userEntry = {
      id: `m-steer-${Date.now()}`,
      author: 'user',
      name: '你',
      time,
      text,
      behavior: 'steer',
    }
    await appState.appendMessages(userEntry)
    const activeKey = await profileStore.getActiveModelKey()
    return chat.send({
      text,
      modelKey: activeKey,
      conversationId: cachedConversationId,
      webContents: event.sender,
      behavior: 'steer',
    })
  })

  ipcHandle(ipcMain, 'chat:followUp', async (event, text) => {
    if (!text || typeof text !== 'string') throw new Error('内容不能为空')
    await refreshWorkspaceCache()
    const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    const userEntry = {
      id: `m-followup-${Date.now()}`,
      author: 'user',
      name: '你',
      time,
      text,
      behavior: 'followUp',
    }
    await appState.appendMessages(userEntry)
    const activeKey = await profileStore.getActiveModelKey()
    return chat.send({
      text,
      modelKey: activeKey,
      conversationId: cachedConversationId,
      webContents: event.sender,
      behavior: 'followUp',
    })
  })

  ipcHandle(ipcMain, 'chat:send', (event, text, modelKey, skillName, executionModeOverride, workMode = 'code') => withTurnLock(async () => {
    if (!text || typeof text !== 'string') throw new Error('消息不能为空')
    await refreshWorkspaceCache()
    const activeKey = modelKey || (await profileStore.getActiveModelKey())
    if (!activeKey) throw new Error('请先在设置中配置并选择模型')
    const selectedSkill = skillName ? await skills.resolve(skillName) : null
    const assembled = await assembleWorkspaceContext(text, cachedWorkspace)

    let effectiveOverride = executionModeOverride
    let effectivePrompt = assembled.prompt

    if (workMode === 'goal') {
      effectiveOverride = 'multi-agent'
    } else if (workMode === 'plan') {
      effectiveOverride = 'single-agent'
      effectivePrompt = `【系统模式：计划模式 (Plan Mode)】\n请对用户提出的需求进行系统性推演与架构分析，输出严密、详尽、步骤明确的逐步实施计划（Step-by-step Execution Plan），列出涉及的文件路径、接口改动、验证方案与风险点。请注意：在计划模式下专注于生成规划方案，不要修改工作区代码。\n\n需求详情：\n${assembled.prompt}`
    }

    const decision = decideExecutionMode(text, selectedSkill)
    const execution = resolveExecutionMode(decision, effectiveOverride)
    if (execution.mode === 'ask-user') {
      return {
        needsOrchestrationChoice: true,
        reason: decision.reason,
        suggestedMode: decision.suggestedMode ?? 'multi-agent',
      }
    }

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
    await appState.appendMessages(userEntry)

    let result
    try {
      result = await permissions.withExecution((await appState.getState()).permissionMode, event.sender, async () => {
      if (execution.mode === 'multi-agent') {
        event.sender.send('chat:stream', { type: 'orchestration', mode: 'multi-agent', reason: workMode === 'goal' ? '目标模式触发多智能体协作' : execution.reason })
        const outcome = await orchestration.planAndExecute({
          text: effectivePrompt,
          primaryModelKey: activeKey,
          conversationId: cachedConversationId,
          webContents: event.sender,
          skill: selectedSkill,
          synthesize: async (prompt) => chat.send({
            text: prompt,
            modelKey: activeKey,
            conversationId: cachedConversationId,
            webContents: event.sender,
            skill: selectedSkill,
          }),
        })
        return { text: outcome.assistant.text, usage: outcome.assistant.usage }
      }
      event.sender.send('chat:stream', { type: 'orchestration', mode: 'single-agent', reason: workMode === 'plan' ? '计划模式：生成实施方案' : execution.reason })
      return chat.send({
        text: effectivePrompt,
        modelKey: activeKey,
        conversationId: cachedConversationId,
        webContents: event.sender,
        skill: selectedSkill,
      })
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await appState.appendMessages({
        id: `${messageId}-error`,
        author: 'orchestrator',
        name: 'TaskWeaver',
        time,
        timestamp: Date.now(),
        text: `${message === '任务已停止' ? '执行已停止' : '执行失败'}：${message.slice(0, 500)}`,
      })
      throw error
    }

    const agentEntry = {
      id: `${messageId}-a`,
      author: 'orchestrator',
      name: 'TaskWeaver',
      time,
      timestamp: Date.now(),
      text: result.cancelled ? (result.text || '任务已停止。') : (result.text || '（模型未返回文本）'),
      thinking: result.thinking,
      thinkingDurationMs: result.thinkingDurationMs,
      modelKey: activeKey,
      usage: result.usage,
      callout: execution.mode === 'multi-agent' ? `由 TaskWeaver 拆分并执行 ${ (await appState.getState()).tasks.length } 个子任务` : undefined,
    }
    await appState.appendMessages(agentEntry)
    return { user: userEntry, assistant: agentEntry }
  }))

  ipcHandle(ipcMain, 'tasks:sendMessage', (event, taskId, text) => withTurnLock(async () => {
    if (!text || typeof text !== 'string') throw new Error('消息不能为空')
    await refreshWorkspaceCache()
    if (!cachedConversationId) throw new Error('当前对话标识无效')
    const assembled = await assembleWorkspaceContext(text, cachedWorkspace)
    return permissions.withExecution((await appState.getState()).permissionMode, event.sender, () => orchestration.sendTaskMessage({
      taskId,
      text: assembled.prompt,
      conversationId: cachedConversationId,
      webContents: event.sender,
    }))
  }))

  return { modelService, profileStore, appState, chatService: chat, orchestrationService: orchestration, permissionService: permissions, permissionRulesStore, mcpService: mcp }
}
