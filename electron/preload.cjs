const { contextBridge, ipcRenderer, webUtils } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('taskweaver', {
  app: {
    getState: () => invoke('app:getState'),
    listOutputLogs: (options) => invoke('app:listOutputLogs', options ?? {}),
    setWorkspace: (workspacePath) => invoke('app:setWorkspace', workspacePath),
    pickWorkspace: () => invoke('app:pickWorkspace'),
    createThread: (options) => invoke('app:createThread', options),
    listThreads: () => invoke('app:listThreads'),
    switchThread: (threadId) => invoke('app:switchThread', threadId),
    renameThread: (threadId, title) => invoke('app:renameThread', threadId, title),
    togglePinThread: (threadId) => invoke('app:togglePinThread', threadId),
    toggleArchiveThread: (threadId) => invoke('app:toggleArchiveThread', threadId),
    searchThreads: (query, options) => invoke('app:searchThreads', query, options),
    deleteThread: (threadId) => invoke('app:deleteThread', threadId),
    forkThread: (threadId, messageId) => invoke('app:forkThread', threadId, messageId),
    clearConversation: (options) => invoke('app:clearConversation', options),
    setPermissionMode: (mode) => invoke('app:setPermissionMode', mode),
    setModelKey: (modelKey) => invoke('app:setModelKey', modelKey),
    setThinkingLevel: (thinkingLevel) => invoke('app:setThinkingLevel', thinkingLevel),
  },
  workspace: {
    listContext: (query, limit) => invoke('workspace:listContext', query ?? '', limit ?? 100),
    createReference: (droppedPath) => invoke('workspace:createReference', droppedPath),
    getDroppedFilePath: (file) => webUtils.getPathForFile(file),
    getTrust: () => invoke('workspace:getTrust'),
    setTrust: (trusted) => invoke('workspace:setTrust', trusted),
    revertDiff: (payload) => invoke('workspace:revertDiff', payload),
    openPath: (relativePath) => invoke('workspace:openPath', relativePath),
    gitStatus: () => invoke('workspace:gitStatus'),
    gitSuggestCommit: () => invoke('workspace:gitSuggestCommit'),
    createGitCheckpoint: (options) => invoke('workspace:createGitCheckpoint', options),
    previewManualGitCommit: () => invoke('workspace:previewManualGitCommit'),
    createManualGitCommit: (options) => invoke('workspace:createManualGitCommit', options),
    listGitCheckpoints: () => invoke('workspace:listGitCheckpoints'),
    getGitCheckpointDiff: (checkpointId) => invoke('workspace:getGitCheckpointDiff', checkpointId),
    restoreGitCheckpoint: (payload) => invoke('workspace:restoreGitCheckpoint', payload),
    deleteGitCheckpoint: (checkpointId) => invoke('workspace:deleteGitCheckpoint', checkpointId),
  },
  pricing: {
    getStatus: () => invoke('pricing:getStatus'),
    sync: () => invoke('pricing:sync'),
  },
  models: {
    list: () => invoke('models:list'),
    loadBundle: () => invoke('models:loadBundle'),
    refresh: () => invoke('models:refresh'),
    getUpdateStatus: () => invoke('models:getUpdateStatus'),
    checkForUpdates: (options) => invoke('models:checkForUpdates', options ?? {}),
    rollbackRegistry: () => invoke('models:rollbackRegistry'),
    scanLocal: () => invoke('models:scanLocal'),
    openCodexGetSetupStatus: () => invoke('opencodex:getSetupStatus'),
    openCodexEnsure: () => invoke('opencodex:ensure'),
    openCodexLoginCursor: () => invoke('opencodex:loginCursor'),
    openCodexOpenDashboard: () => invoke('opencodex:openDashboard'),
    listProvidersAuth: () => invoke('models:providersAuth'),
    setProviderApiKey: (providerId, apiKey) =>
      invoke('models:setProviderApiKey', providerId, apiKey),
    add: (modelKey) => invoke('models:add', modelKey),
    remove: (modelKey) => invoke('models:remove', modelKey),
    removeProviderCredentials: (providerId) => invoke('models:removeProviderCredentials', providerId),
    getActive: () => invoke('models:getActive'),
    setActive: (modelKey) => invoke('models:setActive', modelKey),
    getThinkingLevel: () => invoke('models:getThinkingLevel'),
    setThinkingLevel: (level) => invoke('models:setThinkingLevel', level),
    getBusyEnterMode: () => invoke('models:getBusyEnterMode'),
    setBusyEnterMode: (mode) => invoke('models:setBusyEnterMode', mode),
    upsertProfile: (modelKey, patch) => invoke('models:upsertProfile', modelKey, patch),
    removeProfile: (modelKey) => invoke('models:removeProfile', modelKey),
    resolve: (modelKey) => invoke('models:resolve', modelKey),
    startOAuth: (providerId) => invoke('models:startOAuth', providerId),
    cancelOAuth: () => invoke('models:cancelOAuth'),
    submitOAuthCode: (code) => invoke('models:submitOAuthCode', code),
    logoutOAuth: (providerId) => invoke('models:logoutOAuth', providerId),
    listCustomProviders: () => invoke('models:listCustomProviders'),
    upsertCustomProvider: (payload) => invoke('models:upsertCustomProvider', payload),
    removeCustomProvider: (providerId) => invoke('models:removeCustomProvider', providerId),
    testCustomProvider: (payload) => invoke('models:testCustomProvider', payload),
    testCustomProviderToolCall: (payload) => invoke('models:testCustomProviderToolCall', payload),
    probeProviderModels: (payload) => invoke('models:probeProviderModels', payload ?? {}),
    batchAddCustomModels: (payload) => invoke('models:batchAddCustomModels', payload ?? {}),
    onOAuthStatus: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('models:oauthStatus', handler)
      return () => ipcRenderer.removeListener('models:oauthStatus', handler)
    },
    onUpdateStatus: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('models:updateStatus', handler)
      return () => ipcRenderer.removeListener('models:updateStatus', handler)
    },
  },
  usage: {
    getStats: () => invoke('usage:getStats'),
    getReport: (query) => invoke('usage:getReport', query),
    clear: () => invoke('usage:clear'),
  },
  skills: {
    list: () => invoke('skills:list'),
  },
  mcp: {
    getRuntimeBinding: () => invoke('mcp:getRuntimeBinding'),
    list: () => invoke('mcp:list'),
    catalog: () => invoke('mcp:catalog'),
    marketplace: () => invoke('mcp:marketplace'),
    installCatalog: (id, env) => invoke('mcp:installCatalog', { id, env }),
    save: (server) => invoke('mcp:save', server),
    remove: (id) => invoke('mcp:remove', id),
    setEnabled: (id, enabled) => invoke('mcp:setEnabled', id, enabled),
    disconnect: (id) => invoke('mcp:disconnect', id),
    testConnection: (id) => invoke('mcp:testConnection', id),
    configureGitHub: (token) => invoke('mcp:configureGitHub', token),
    getGitHubOAuthAvailability: () => invoke('mcp:getGitHubOAuthAvailability'),
    startGitHubOAuth: () => invoke('mcp:startGitHubOAuth'),
    cancelGitHubOAuth: () => invoke('mcp:cancelGitHubOAuth'),
    onGitHubOAuthStatus: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('mcp:githubOAuthStatus', handler)
      return () => ipcRenderer.removeListener('mcp:githubOAuthStatus', handler)
    },
    refresh: () => invoke('mcp:refresh'),
  },
  chat: {
    send: (text, modelKey, skillName, executionModeOverride, workMode, conversationId) =>
      invoke('chat:send', text, modelKey ?? null, skillName ?? null, executionModeOverride ?? null, workMode ?? 'code', conversationId ?? null),
    steer: (text, conversationId) => invoke('chat:steer', text, conversationId ?? null),
    followUp: (text, conversationId) => invoke('chat:followUp', text, conversationId ?? null),
    cancel: (conversationId) => invoke('chat:cancel', conversationId ?? null),
    queueMutate: (payload) => invoke('chat:queueMutate', payload),
    getLiveContext: (conversationId) => invoke('chat:getLiveContext', conversationId ?? null),
    getSessionStats: (conversationId) => invoke('chat:getSessionStats', conversationId ?? null),
    listRunningConversations: () => invoke('chat:listRunningConversations'),
    subscribeMux: (conversationId) => invoke('chat:subscribeMux', conversationId),
    unsubscribeMux: (conversationId) => invoke('chat:unsubscribeMux', conversationId),
    onMux: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('chat:mux', handler)
      return () => ipcRenderer.removeListener('chat:mux', handler)
    },
    getDshView: (conversationId) => invoke('chat:getDshView', conversationId ?? null),
    onDshView: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('chat:dshView', handler)
      return () => ipcRenderer.removeListener('chat:dshView', handler)
    },
    onStream: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('chat:stream', handler)
      return () => ipcRenderer.removeListener('chat:stream', handler)
    },
    onPromptBudget: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('chat:promptBudget', handler)
      return () => ipcRenderer.removeListener('chat:promptBudget', handler)
    },
  },
  tasks: {
    sendMessage: (taskId, text, conversationId) => invoke('tasks:sendMessage', taskId, text, conversationId ?? null),
  },
  permission: {
    listRules: () => invoke('permission:listRules'),
    addRule: (rule) => invoke('permission:addRule', rule),
    removeRule: (id) => invoke('permission:removeRule', id),
    clearRules: (options) => invoke('permission:clearRules', options),
    respondPrompt: (id, response) => invoke('permission:respondPrompt', id, response),
    listApprovalAudit: (conversationId) => invoke('permission:listApprovalAudit', conversationId ?? null),
    onPrompt: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('permission:prompt', handler)
      return () => ipcRenderer.removeListener('permission:prompt', handler)
    },
  },
  userQuestions: {
    answer: (id, answer) => invoke('userQuestions:answer', id, answer),
    cancel: (id) => invoke('userQuestions:cancel', id),
    onPrompt: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('user-question:prompt', handler)
      return () => ipcRenderer.removeListener('user-question:prompt', handler)
    },
    onResolved: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('user-question:resolved', handler)
      return () => ipcRenderer.removeListener('user-question:resolved', handler)
    },
  },
  terminal: {
    create: (options) => invoke('terminal:create', options),
    write: (id, data) => invoke('terminal:write', { id, data }),
    resize: (id, cols, rows) => invoke('terminal:resize', { id, cols, rows }),
    kill: (id) => invoke('terminal:kill', { id }),
    list: () => invoke('terminal:list'),
    onData: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
    onExit: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('terminal:exit', handler)
      return () => ipcRenderer.removeListener('terminal:exit', handler)
    },
  },
  system: {
    getEnvDiagnostics: (customDirs) => invoke('system:getEnvDiagnostics', customDirs),
    diagnoseTool: (name) => invoke('system:diagnoseTool', name),
  },
  portfolio: {
    get: () => invoke('portfolio:get'),
    save: (portfolio) => invoke('portfolio:save', portfolio),
    resetToBundled: () => invoke('portfolio:resetToBundled'),
    getBundledTemplate: () => invoke('portfolio:getBundledTemplate'),
    getDisplayName: (modelKey) => invoke('portfolio:getDisplayName', modelKey),
  },
  preferences: {
    get: () => invoke('preferences:get'),
    set: (patch) => invoke('preferences:set', patch),
  },
  sandbox: {
    probe: () => invoke('sandbox:probe'),
    getEffective: () => invoke('sandbox:getEffective'),
    setSessionMode: (mode) => invoke('sandbox:setSessionMode', mode),
    onMode: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('sandbox:mode', handler)
      return () => ipcRenderer.removeListener('sandbox:mode', handler)
    },
  },
  webSearch: {
    getConfig: () => invoke('webSearch:getConfig'),
    setConfig: (patch) => invoke('webSearch:setConfig', patch),
    testSearch: (query) => invoke('webSearch:testSearch', query),
  },
  worktree: {
    list: () => invoke('worktree:list'),
    remove: (taskId, force) => invoke('worktree:remove', taskId, force),
    diff: (taskId) => invoke('worktree:diff', taskId),
    previewMerge: (taskId) => invoke('worktree:previewMerge', taskId),
    applyMerge: (taskId, options) => invoke('worktree:applyMerge', taskId, options ?? {}),
  },
  memory: {
    get: () => invoke('memory:get'),
    clear: () => invoke('memory:clear'),
  },
})
