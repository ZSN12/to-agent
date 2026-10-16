/**
 * Desktop invoke contracts. Channel identity, handler module, and UI bridge paths.
 * Shell HTTP bridge (`gen-shell-bridge`) and TS types (`gen-ipc-types`) are generated from this table.
 */
const typeSchema = (reference) => ({ kind: 'typescript', reference })
const invokeGroup = (handlerModule, entries) => entries.map(([name, bridgePath, methodType, preloadFactory]) => ({
  name, direction: 'renderer-to-main/invoke',
  argsSchema: typeSchema(`Parameters<NonNullable<${methodType}>>`),
  resultSchema: typeSchema(`Awaited<ReturnType<NonNullable<${methodType}>>>`),
  handlerModule, bridgePath, preloadFactory: preloadFactory || ((invoke) => new Function('invoke', `return (...args) => invoke(${JSON.stringify(name)}, ...args)`)(invoke)),
}))

export const IPC_CHANNELS = [
  ...invokeGroup("backend/register-ipc.mjs", [
    ["backend:ready", "backendReady", "import('./types/app-api').TaskweaverBackendApi['backendReady']"],
  ]),
  ...invokeGroup("backend/ipc/register-app-ipc.mjs", [
    ["app:clearConversation", "app.clearConversation", "import('./types/app-api').TaskweaverAppApi['clearConversation']"],
    ["app:deleteThread", "app.deleteThread", "import('./types/app-api').TaskweaverAppApi['deleteThread']"],
    ["app:forkThread", "app.forkThread", "import('./types/app-api').TaskweaverAppApi['forkThread']"],
    ["app:getState", "app.getState", "import('./types/app-api').TaskweaverAppApi['getState']"],
    ["app:listOutputLogs", "app.listOutputLogs", "import('./types/app-api').TaskweaverAppApi['listOutputLogs']"],
    ["app:listThreads", "app.listThreads", "import('./types/app-api').TaskweaverAppApi['listThreads']"],
    ["app:pickWorkspace", "app.pickWorkspace", "import('./types/app-api').TaskweaverAppApi['pickWorkspace']"],
    ["app:renameThread", "app.renameThread", "import('./types/app-api').TaskweaverAppApi['renameThread']"],
    ["app:searchThreads", "app.searchThreads", "import('./types/app-api').TaskweaverAppApi['searchThreads']"],
    ["app:setModelKey", "app.setModelKey", "import('./types/app-api').TaskweaverAppApi['setModelKey']"],
    ["app:setPermissionMode", "app.setPermissionMode", "import('./types/app-api').TaskweaverAppApi['setPermissionMode']"],
    ["app:setThinkingLevel", "app.setThinkingLevel", "import('./types/app-api').TaskweaverAppApi['setThinkingLevel']"],
    ["app:setWorkspace", "app.setWorkspace", "import('./types/app-api').TaskweaverAppApi['setWorkspace']"],
    ["app:switchThread", "app.switchThread", "import('./types/app-api').TaskweaverAppApi['switchThread']"],
    ["app:toggleArchiveThread", "app.toggleArchiveThread", "import('./types/app-api').TaskweaverAppApi['toggleArchiveThread']"],
    ["app:togglePinThread", "app.togglePinThread", "import('./types/app-api').TaskweaverAppApi['togglePinThread']"],
    ["app:getFirstRunNotice", "app.getFirstRunNotice", "import('./types/app-api').TaskweaverAppApi['getFirstRunNotice']"],
    ["app:dismissFirstRunNotice", "app.dismissFirstRunNotice", "import('./types/app-api').TaskweaverAppApi['dismissFirstRunNotice']"],
  ]),
  ...invokeGroup("backend/ipc/register-models-ipc.mjs", [
    ["bridge:getStatus", "models.bridgeGetStatus", "import('./types/model-api').TaskweaverModelsApi['bridgeGetStatus']"],
    ["bridge:login", "models.bridgeLogin", "import('./types/model-api').TaskweaverModelsApi['bridgeLogin']"],
    ["models:add", "models.add", "import('./types/model-api').TaskweaverModelsApi['add']"],
    ["models:batchAddCustomModels", "models.batchAddCustomModels", "import('./types/model-api').TaskweaverModelsApi['batchAddCustomModels']"],
    ["models:cancelOAuth", "models.cancelOAuth", "import('./types/model-api').TaskweaverModelsApi['cancelOAuth']"],
    ["models:checkForUpdates", "models.checkForUpdates", "import('./types/model-api').TaskweaverModelsApi['checkForUpdates']"],
    ["models:discoverProviderModels", "models.discoverProviderModels", "import('./types/model-api').TaskweaverModelsApi['discoverProviderModels']"],
    ["models:getBusyEnterMode", "models.getBusyEnterMode", "import('./types/model-api').TaskweaverModelsApi['getBusyEnterMode']"],
    ["models:getSemanticSearchSettings", "models.getSemanticSearchSettings", "import('./types/model-api').TaskweaverModelsApi['getSemanticSearchSettings']"],
    ["models:getThinkingLevel", "models.getThinkingLevel", "import('./types/model-api').TaskweaverModelsApi['getThinkingLevel']"],
    ["models:getUpdateStatus", "models.getUpdateStatus", "import('./types/model-api').TaskweaverModelsApi['getUpdateStatus']"],
    ["models:list", "models.list", "import('./types/model-api').TaskweaverModelsApi['list']"],
    ["models:listCustomProviders", "models.listCustomProviders", "import('./types/model-api').TaskweaverModelsApi['listCustomProviders']"],
    ["models:loadBundle", "models.loadBundle", "import('./types/model-api').TaskweaverModelsApi['loadBundle']"],
    ["models:logoutOAuth", "models.logoutOAuth", "import('./types/model-api').TaskweaverModelsApi['logoutOAuth']"],
    ["models:migrateLegacyOpenCodexRoutes", "models.migrateLegacyOpenCodexRoutes", "import('./types/model-api').TaskweaverModelsApi['migrateLegacyOpenCodexRoutes']"],
    ["models:probeProviderModels", "models.probeProviderModels", "import('./types/model-api').TaskweaverModelsApi['probeProviderModels']"],
    ["models:providersAuth", "models.listProvidersAuth", "import('./types/model-api').TaskweaverModelsApi['listProvidersAuth']"],
    ["models:refresh", "models.refresh", "import('./types/model-api').TaskweaverModelsApi['refresh']"],
    ["models:remove", "models.remove", "import('./types/model-api').TaskweaverModelsApi['remove']"],
    ["models:removeCustomProvider", "models.removeCustomProvider", "import('./types/model-api').TaskweaverModelsApi['removeCustomProvider']"],
    ["models:removeProviderCredentials", "models.removeProviderCredentials", "import('./types/model-api').TaskweaverModelsApi['removeProviderCredentials']"],
    ["models:rollbackRegistry", "models.rollbackRegistry", "import('./types/model-api').TaskweaverModelsApi['rollbackRegistry']"],
    ["models:scanLocal", "models.scanLocal", "import('./types/model-api').TaskweaverModelsApi['scanLocal']"],
    ["models:saveSemanticSearchSettings", "models.saveSemanticSearchSettings", "import('./types/model-api').TaskweaverModelsApi['saveSemanticSearchSettings']"],
    ["models:setActive", "models.setActive", "import('./types/model-api').TaskweaverModelsApi['setActive']"],
    ["models:setBusyEnterMode", "models.setBusyEnterMode", "import('./types/model-api').TaskweaverModelsApi['setBusyEnterMode']"],
    ["models:setProviderApiKey", "models.setProviderApiKey", "import('./types/model-api').TaskweaverModelsApi['setProviderApiKey']"],
    ["models:setThinkingLevel", "models.setThinkingLevel", "import('./types/model-api').TaskweaverModelsApi['setThinkingLevel']"],
    ["models:startOAuth", "models.startOAuth", "import('./types/model-api').TaskweaverModelsApi['startOAuth']"],
    ["models:submitOAuthCode", "models.submitOAuthCode", "import('./types/model-api').TaskweaverModelsApi['submitOAuthCode']"],
    ["models:testCustomProvider", "models.testCustomProvider", "import('./types/model-api').TaskweaverModelsApi['testCustomProvider']"],
    ["models:testCustomProviderToolCall", "models.testCustomProviderToolCall", "import('./types/model-api').TaskweaverModelsApi['testCustomProviderToolCall']"],
    ["models:upsertCustomProvider", "models.upsertCustomProvider", "import('./types/model-api').TaskweaverModelsApi['upsertCustomProvider']"],
    ["models:upsertProfile", "models.upsertProfile", "import('./types/model-api').TaskweaverModelsApi['upsertProfile']"],
    ["openusage:getLimits", "openusage.getLimits", "import('./types/app-api').TaskweaverOpenUsageApi['getLimits']"],
    ["portfolio:get", "portfolio.get", "import('./types/app-api').TaskweaverPortfolioApi['get']"],
    ["portfolio:resetToBundled", "portfolio.resetToBundled", "import('./types/app-api').TaskweaverPortfolioApi['resetToBundled']"],
    ["portfolio:save", "portfolio.save", "import('./types/app-api').TaskweaverPortfolioApi['save']"],
    ["pricing:getStatus", "pricing.getStatus", "import('./types/app-api').TaskweaverPricingApi['getStatus']"],
    ["pricing:sync", "pricing.sync", "import('./types/app-api').TaskweaverPricingApi['sync']"],
    ["usage:clear", "usage.clear", "import('./types/app-api').TaskweaverUsageApi['clear']"],
    ["usage:getReport", "usage.getReport", "import('./types/app-api').TaskweaverUsageApi['getReport']"],
    ["usage:getStats", "usage.getStats", "import('./types/app-api').TaskweaverUsageApi['getStats']"],
    ["usage:setEnabled", "usage.setEnabled", "import('./types/app-api').TaskweaverUsageApi['setEnabled']"],
  ]),
  ...invokeGroup("backend/ipc/register-chat-ipc.mjs", [
    ["chat:cancel", "chat.cancel", "import('./types/app-api').TaskweaverChatApi['cancel']"],
    ["chat:getDshView", "chat.getDshView", "import('./types/app-api').TaskweaverChatApi['getDshView']"],
    ["chat:getToolOutput", "chat.getToolOutput", "import('./types/app-api').TaskweaverChatApi['getToolOutput']"],
    ["chat:getImageAttachment", "chat.getImageAttachment", "import('./types/app-api').TaskweaverChatApi['getImageAttachment']"],
    ["chat:getImageLimits", "chat.getImageLimits", "import('./types/app-api').TaskweaverChatApi['getImageLimits']"],
    ["chat:getResultAttachment", "chat.getResultAttachment", "import('./types/app-api').TaskweaverChatApi['getResultAttachment']"],
    ["chat:getLiveContext", "chat.getLiveContext", "import('./types/app-api').TaskweaverChatApi['getLiveContext']"],
    ["chat:getSessionStats", "chat.getSessionStats", "import('./types/app-api').TaskweaverChatApi['getSessionStats']"],
    ["chat:listRunningConversations", "chat.listRunningConversations", "import('./types/app-api').TaskweaverChatApi['listRunningConversations']"],
    ["chat:pickImages", "chat.pickImages", "import('./types/app-api').TaskweaverChatApi['pickImages']"],
    ["chat:pickAttachments", "chat.pickAttachments", "import('./types/app-api').TaskweaverChatApi['pickAttachments']"],
    ["chat:releaseDocuments", "chat.releaseDocuments", "import('./types/app-api').TaskweaverChatApi['releaseDocuments']"],
    ["chat:queueMutate", "chat.queueMutate", "import('./types/app-api').TaskweaverChatApi['queueMutate']"],
    ["chat:readDroppedImage", "chat.readDroppedImageFile", "import('./types/app-api').TaskweaverChatApi['readDroppedImageFile']", (invoke) => (file, conversationId) => {
      const filePath = webUtils.getPathForFile(file)
      if (!filePath) return Promise.resolve({ ok: false, error: '无法读取拖入文件的路径，请使用图片选择按钮。' })
      return invoke("chat:readDroppedImage", filePath, conversationId)
    }],
    ["chat:stageDroppedDocument", "chat.stageDroppedDocumentFile", "import('./types/app-api').TaskweaverChatApi['stageDroppedDocumentFile']", (invoke) => (file, conversationId) => {
      const filePath = webUtils.getPathForFile(file)
      if (!filePath) return Promise.resolve({ ok: false, error: '无法读取拖入文档的路径，请使用附件选择按钮。' })
      return invoke("chat:stageDroppedDocument", filePath, conversationId)
    }],
    ["chat:subscribeMux", "chat.subscribeMux", "import('./types/app-api').TaskweaverChatApi['subscribeMux']"],
    ["chat:unsubscribeMux", "chat.unsubscribeMux", "import('./types/app-api').TaskweaverChatApi['unsubscribeMux']"],
    ["skills:list", "skills.list", "import('./types/app-api').TaskweaverSkillsApi['list']"],
    ["tasks:approvePlan", "tasks.approvePlan", "import('./types/app-api').TaskweaverTasksApi['approvePlan']"],
    ["tasks:cancel", "tasks.cancel", "import('./types/app-api').TaskweaverTasksApi['cancel']"],
    ["tasks:pauseRun", "tasks.pauseRun", "import('./types/app-api').TaskweaverTasksApi['pauseRun']"],
    ["tasks:rejectPlan", "tasks.rejectPlan", "import('./types/app-api').TaskweaverTasksApi['rejectPlan']"],
    ["tasks:rerunDownstream", "tasks.rerunDownstream", "import('./types/app-api').TaskweaverTasksApi['rerunDownstream']"],
    ["tasks:resumeCheckpoint", "tasks.resumeCheckpoint", "import('./types/app-api').TaskweaverTasksApi['resumeCheckpoint']"],
    ["tasks:resumeRun", "tasks.resumeRun", "import('./types/app-api').TaskweaverTasksApi['resumeRun']"],
    ["tasks:listRuns", "tasks.listRuns", "import('./types/app-api').TaskweaverTasksApi['listRuns']"],
    ["tasks:sendMessage", "tasks.sendMessage", "import('./types/app-api').TaskweaverTasksApi['sendMessage']"],
  ]),
  ...invokeGroup("backend/ipc/register-chat-send-ipc.mjs", [
    ["chat:followUp", "chat.followUp", "import('./types/app-api').TaskweaverChatApi['followUp']"],
    ["chat:send", "chat.send", "import('./types/app-api').TaskweaverChatApi['send']"],
    ["chat:steer", "chat.steer", "import('./types/app-api').TaskweaverChatApi['steer']"],
  ]),
  ...invokeGroup("backend/ipc/register-debug-ipc.mjs", [
    ["debug:shadowTranscript", "debug.shadowTranscript", "import('./types/app-api').TaskweaverDebugApi['shadowTranscript']"],
  ]),
  ...invokeGroup("backend/ipc/register-preferences-ipc.mjs", [
    ["github:listPullRequests", "github.listPullRequests", "import('./types/app-api').TaskweaverGithubApi['listPullRequests']"],
    ["preferences:get", "preferences.get", "import('./types/app-api').TaskweaverPreferencesApi['get']"],
    ["preferences:set", "preferences.set", "import('./types/app-api').TaskweaverPreferencesApi['set']"],
    ["webSearch:getConfig", "webSearch.getConfig", "import('./types/app-api').TaskweaverWebSearchApi['getConfig']"],
    ["webSearch:setConfig", "webSearch.setConfig", "import('./types/app-api').TaskweaverWebSearchApi['setConfig']"],
    ["webSearch:testSearch", "webSearch.testSearch", "import('./types/app-api').TaskweaverWebSearchApi['testSearch']"],
  ]),
  ...invokeGroup("backend/register-scheduled-jobs-ipc.mjs", [
    ["jobs:installLaunchAgent", "jobs.installLaunchAgent", "import('./types/app-api').TaskweaverJobsApi['installLaunchAgent']"],
    ["jobs:list", "jobs.list", "import('./types/app-api').TaskweaverJobsApi['list']"],
    ["jobs:launchAgentInstalled", "jobs.launchAgentInstalled", "import('./types/app-api').TaskweaverJobsApi['launchAgentInstalled']"],
    ["jobs:remove", "jobs.remove", "import('./types/app-api').TaskweaverJobsApi['remove']"],
    ["jobs:removeLaunchAgent", "jobs.removeLaunchAgent", "import('./types/app-api').TaskweaverJobsApi['removeLaunchAgent']"],
    ["jobs:runNow", "jobs.runNow", "import('./types/app-api').TaskweaverJobsApi['runNow']"],
    ["jobs:upsert", "jobs.upsert", "import('./types/app-api').TaskweaverJobsApi['upsert']"],
  ]),
  ...invokeGroup("backend/ipc/register-mcp-ipc.mjs", [
    ["mcp:cancelGitHubOAuth", "mcp.cancelGitHubOAuth", "import('./types/app-api').TaskweaverMcpApi['cancelGitHubOAuth']"],
    ["mcp:catalog", "mcp.catalog", "import('./types/app-api').TaskweaverMcpApi['catalog']"],
    ["mcp:configureGitHub", "mcp.configureGitHub", "import('./types/app-api').TaskweaverMcpApi['configureGitHub']"],
    ["mcp:disconnect", "mcp.disconnect", "import('./types/app-api').TaskweaverMcpApi['disconnect']"],
    ["mcp:getGitHubOAuthAvailability", "mcp.getGitHubOAuthAvailability", "import('./types/app-api').TaskweaverMcpApi['getGitHubOAuthAvailability']"],
    ["mcp:getRuntimeBinding", "mcp.getRuntimeBinding", "import('./types/app-api').TaskweaverMcpApi['getRuntimeBinding']"],
    ["mcp:installCatalog", "mcp.installCatalog", "import('./types/app-api').TaskweaverMcpApi['installCatalog']"],
    ["mcp:list", "mcp.list", "import('./types/app-api').TaskweaverMcpApi['list']"],
    ["mcp:marketplace", "mcp.marketplace", "import('./types/app-api').TaskweaverMcpApi['marketplace']"],
    ["mcp:refresh", "mcp.refresh", "import('./types/app-api').TaskweaverMcpApi['refresh']"],
    ["mcp:remove", "mcp.remove", "import('./types/app-api').TaskweaverMcpApi['remove']"],
    ["mcp:save", "mcp.save", "import('./types/app-api').TaskweaverMcpApi['save']"],
    ["mcp:setEnabled", "mcp.setEnabled", "import('./types/app-api').TaskweaverMcpApi['setEnabled']"],
    ["mcp:startGitHubOAuth", "mcp.startGitHubOAuth", "import('./types/app-api').TaskweaverMcpApi['startGitHubOAuth']"],
    ["mcp:testConnection", "mcp.testConnection", "import('./types/app-api').TaskweaverMcpApi['testConnection']"],
  ]),
  ...invokeGroup("backend/ipc/register-memory-ipc.mjs", [
    ["memory:clear", "memory.clear", "import('./types/app-api').TaskweaverMemoryApi['clear']"],
    ["memory:get", "memory.get", "import('./types/app-api').TaskweaverMemoryApi['get']"],
  ]),
  ...invokeGroup("backend/ipc/register-permissions-ipc.mjs", [
    ["permission:addRule", "permission.addRule", "import('./types/app-api').TaskweaverPermissionApi['addRule']"],
    ["permission:clearRules", "permission.clearRules", "import('./types/app-api').TaskweaverPermissionApi['clearRules']"],
    ["permission:listApprovalAudit", "permission.listApprovalAudit", "import('./types/app-api').TaskweaverPermissionApi['listApprovalAudit']"],
    ["permission:listRules", "permission.listRules", "import('./types/app-api').TaskweaverPermissionApi['listRules']"],
    ["permission:removeRule", "permission.removeRule", "import('./types/app-api').TaskweaverPermissionApi['removeRule']"],
    ["permission:respondPrompt", "permission.respondPrompt", "import('./types/app-api').TaskweaverPermissionApi['respondPrompt']"],
    ["userQuestions:answer", "userQuestions.answer", "import('./types/app-api').TaskweaverUserQuestionsApi['answer']"],
    ["userQuestions:cancel", "userQuestions.cancel", "import('./types/app-api').TaskweaverUserQuestionsApi['cancel']"],
  ]),
  ...invokeGroup("backend/ipc/register-sandbox-ipc.mjs", [
    ["sandbox:getEffective", "sandbox.getEffective", "import('./types/app-api').TaskweaverSandboxApi['getEffective']"],
    ["sandbox:probe", "sandbox.probe", "import('./types/app-api').TaskweaverSandboxApi['probe']"],
    ["sandbox:setSessionMode", "sandbox.setSessionMode", "import('./types/app-api').TaskweaverSandboxApi['setSessionMode']"],
  ]),
  ...invokeGroup("backend/register-terminal-ipc.mjs", [
    ["terminal:create", "terminal.create", "import('./types/app-api').TaskweaverTerminalApi['create']"],
    ["terminal:kill", "terminal.kill", "import('./types/app-api').TaskweaverTerminalApi['kill']"],
    ["terminal:list", "terminal.list", "import('./types/app-api').TaskweaverTerminalApi['list']"],
    ["terminal:resize", "terminal.resize", "import('./types/app-api').TaskweaverTerminalApi['resize']"],
    ["terminal:write", "terminal.write", "import('./types/app-api').TaskweaverTerminalApi['write']"],
  ]),
  ...invokeGroup("backend/ipc/register-worktree-ipc.mjs", [
    ["worktree:applyMerge", "worktree.applyMerge", "import('./types/app-api').TaskweaverWorktreeApi['applyMerge']"],
    ["worktree:diff", "worktree.diff", "import('./types/app-api').TaskweaverWorktreeApi['diff']"],
    ["worktree:list", "worktree.list", "import('./types/app-api').TaskweaverWorktreeApi['list']"],
    ["worktree:previewMerge", "worktree.previewMerge", "import('./types/app-api').TaskweaverWorktreeApi['previewMerge']"],
    ["worktree:remove", "worktree.remove", "import('./types/app-api').TaskweaverWorktreeApi['remove']"],
  ]),
  ...invokeGroup("backend/register-workspace-git-ipc.mjs", [
    ["workspace:createManualGitCommit", "workspace.createManualGitCommit", "import('./types/app-api').TaskweaverWorkspaceApi['createManualGitCommit']"],
    ["workspace:deleteGitCheckpoint", "workspace.deleteGitCheckpoint", "import('./types/app-api').TaskweaverWorkspaceApi['deleteGitCheckpoint']"],
    ["workspace:getGitCheckpointDiff", "workspace.getGitCheckpointDiff", "import('./types/app-api').TaskweaverWorkspaceApi['getGitCheckpointDiff']"],
    ["workspace:gitStatus", "workspace.gitStatus", "import('./types/app-api').TaskweaverWorkspaceApi['gitStatus']"],
    ["workspace:gitSuggestCommit", "workspace.gitSuggestCommit", "import('./types/app-api').TaskweaverWorkspaceApi['gitSuggestCommit']"],
    ["workspace:listGitCheckpoints", "workspace.listGitCheckpoints", "import('./types/app-api').TaskweaverWorkspaceApi['listGitCheckpoints']"],
    ["workspace:openPath", "workspace.openPath", "import('./types/app-api').TaskweaverWorkspaceApi['openPath']"],
    ["workspace:previewManualGitCommit", "workspace.previewManualGitCommit", "import('./types/app-api').TaskweaverWorkspaceApi['previewManualGitCommit']"],
    ["workspace:restoreGitCheckpoint", "workspace.restoreGitCheckpoint", "import('./types/app-api').TaskweaverWorkspaceApi['restoreGitCheckpoint']"],
    ["workspace:revertDiff", "workspace.revertDiff", "import('./types/app-api').TaskweaverWorkspaceApi['revertDiff']"],
  ]),
  ...invokeGroup("backend/ipc/register-workspace-ipc.mjs", [
    ["workspace:createReference", "workspace.createReference", "import('./types/app-api').TaskweaverWorkspaceApi['createReference']"],
    ["workspace:getTrust", "workspace.getTrust", "import('./types/app-api').TaskweaverWorkspaceApi['getTrust']"],
    ["workspace:listContext", "workspace.listContext", "import('./types/app-api').TaskweaverWorkspaceApi['listContext']"],
    ["workspace:setTrust", "workspace.setTrust", "import('./types/app-api').TaskweaverWorkspaceApi['setTrust']"],
  ]),
]

export const INVOKE_CHANNELS = IPC_CHANNELS.map(({ name }) => name)

export const OPTIONAL_BRIDGE_NAMESPACES = Object.freeze(['pricing', 'permission', 'userQuestions', 'usage', 'openusage', 'terminal', 'portfolio', 'preferences', 'sandbox', 'webSearch', 'worktree', 'memory', 'jobs', 'github', 'debug'])


export const PRELOAD_EVENTS = Object.freeze([
  { bridgePath: 'models.onOAuthStatus', event: 'models:oauthStatus' },
  { bridgePath: 'models.onCatalogUpdated', event: 'models:catalogUpdated' },
  { bridgePath: 'models.onUpdateStatus', event: 'models:updateStatus' },
  { bridgePath: 'mcp.onGitHubOAuthStatus', event: 'mcp:githubOAuthStatus' },
  { bridgePath: 'chat.onMux', event: 'chat:mux' },
  { bridgePath: 'chat.onDshView', event: 'chat:dshView' },
  { bridgePath: 'chat.onStream', event: 'chat:stream' },
  { bridgePath: 'chat.onPromptBudget', event: 'chat:promptBudget' },
  { bridgePath: 'permission.onPrompt', event: 'permission:prompt' },
  { bridgePath: 'userQuestions.onPrompt', event: 'user-question:prompt' },
  { bridgePath: 'userQuestions.onResolved', event: 'user-question:resolved' },
  { bridgePath: 'terminal.onData', event: 'terminal:data' },
  { bridgePath: 'terminal.onExit', event: 'terminal:exit' },
  { bridgePath: 'sandbox.onMode', event: 'sandbox:mode' },
])

export const PRELOAD_LOCAL_METHODS = Object.freeze([
  { bridgePath: 'workspace.getDroppedFilePath', create: (webUtils) => (file) => webUtils.getPathForFile(file) },
])

export const renderPreloadEventSubscription = (event) => `(listener) => {
  const handler = (_event, payload) => listener(payload)
  ipcRenderer.on(${JSON.stringify(event)}, handler)
  return () => ipcRenderer.removeListener(${JSON.stringify(event)}, handler)
}`
