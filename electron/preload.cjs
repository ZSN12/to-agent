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
    deleteThread: (threadId) => invoke('app:deleteThread', threadId),
    forkThread: (threadId, messageId) => invoke('app:forkThread', threadId, messageId),
    clearConversation: (options) => invoke('app:clearConversation', options),
    setPermissionMode: (mode) => invoke('app:setPermissionMode', mode),
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
    listGitCheckpoints: () => invoke('workspace:listGitCheckpoints'),
    getGitCheckpointDiff: (checkpointId) => invoke('workspace:getGitCheckpointDiff', checkpointId),
    restoreGitCheckpoint: (payload) => invoke('workspace:restoreGitCheckpoint', payload),
  },
  pricing: {
    getStatus: () => invoke('pricing:getStatus'),
    sync: () => invoke('pricing:sync'),
  },
  models: {
    list: () => invoke('models:list'),
    refresh: () => invoke('models:refresh'),
    scanLocal: () => invoke('models:scanLocal'),
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
    onOAuthStatus: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('models:oauthStatus', handler)
      return () => ipcRenderer.removeListener('models:oauthStatus', handler)
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
    list: () => invoke('mcp:list'),
    save: (server) => invoke('mcp:save', server),
    remove: (id) => invoke('mcp:remove', id),
    disconnect: (id) => invoke('mcp:disconnect', id),
    refresh: () => invoke('mcp:refresh'),
  },
  chat: {
    send: (text, modelKey, skillName, executionModeOverride, workMode) =>
      invoke('chat:send', text, modelKey ?? null, skillName ?? null, executionModeOverride ?? null, workMode ?? 'code'),
    steer: (text) => invoke('chat:steer', text),
    followUp: (text) => invoke('chat:followUp', text),
    cancel: () => invoke('chat:cancel'),
    queueMutate: (payload) => invoke('chat:queueMutate', payload),
    getLiveContext: () => invoke('chat:getLiveContext'),
    getSessionStats: () => invoke('chat:getSessionStats'),
    onStream: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('chat:stream', handler)
      return () => ipcRenderer.removeListener('chat:stream', handler)
    },
  },
  tasks: {
    sendMessage: (taskId, text) => invoke('tasks:sendMessage', taskId, text),
  },
  permission: {
    listRules: () => invoke('permission:listRules'),
    addRule: (rule) => invoke('permission:addRule', rule),
    removeRule: (id) => invoke('permission:removeRule', id),
    clearRules: (options) => invoke('permission:clearRules', options),
    respondPrompt: (id, response) => invoke('permission:respondPrompt', id, response),
    onPrompt: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('permission:prompt', handler)
      return () => ipcRenderer.removeListener('permission:prompt', handler)
    },
  },
})
