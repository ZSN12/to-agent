import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createCredentialStore } from '../backend/credential-store.mjs'
import { createModelCredentials } from '../backend/model/credentials.mjs'
import { createProviderCredentialHelpers } from '../backend/model/provider-credential-helpers.mjs'
import { LOCAL_AGENT_INTEGRATIONS } from '../backend/model-sync/local-agent-registry.mjs'

// 1. 运行底层 credential-store 的完整加密与钥匙串测试
await import('./test-credential-store.mjs')

// 2. 验证 WorkBuddy 在本地官方 Agent 注册表与凭据读取系统中的顺畅兼容
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-credentials-test-'))

try {
  // 2.1 验证注册表中 WorkBuddy 配置正确且无需外部 OAuth 登录
  const wbIntegration = LOCAL_AGENT_INTEGRATIONS.find((row) => row.agentId === 'workbuddy')
  assert.ok(wbIntegration, 'LOCAL_AGENT_INTEGRATIONS 中必须包含 workbuddy')
  assert.equal(wbIntegration.loginProvider, null, 'workbuddy 无需外部 OAuth 登录')
  assert.equal(wbIntegration.routeId, 'workbuddy')

  // 2.2 验证 provider-credential-helpers 对 WorkBuddy 返回已授权状态
  const helpers = createProviderCredentialHelpers({
    userDataPath: tempDir,
    directoryClient: {
      fetchDshModelDirectoryOnce: async () => ({ namespaces: [], providers: [], groups: [] }),
    },
    fetchBridgeLogins: async () => ({}),
  })
  const wbAuth = await helpers.getBridgeProviderAuthorization('workbuddy')
  assert.ok(wbAuth, 'WorkBuddy 应具有 bridge 授权信息')
  assert.equal(wbAuth.configured, true, 'WorkBuddy 默认处于 configured: true 状态')
  assert.equal(wbAuth.authType, 'local_subscription')

  // 2.3 验证 createModelCredentials 中的 listProvidersAuth 与 addModel 兼容性
  const mockDirectory = {
    namespaces: [],
    providers: [
      { provider: 'workbuddy', displayName: 'WorkBuddy' },
    ],
    groups: [
      {
        id: 'workbuddy',
        name: 'WorkBuddy',
        models: [{ id: 'glm-5.3', name: 'GLM 5.3' }],
      },
    ],
  }

  const addedModels = new Set()
  let activeKey = null
  const mockProfileStore = {
    async listAddedModelKeys() { return Array.from(addedModels) },
    async addModel(key) { addedModels.add(key) },
    async getActiveModelKey() { return activeKey },
    async setActiveModelKey(key) { activeKey = key },
    async getProfile() { return null },
  }

  const mockCatalog = {
    candidateModels: [
      {
        key: 'workbuddy/glm-5.3',
        id: 'glm-5.3',
        provider: 'workbuddy',
        routeRegistered: true,
        available: true,
      },
    ],
    models: [],
  }

  const credentialsManager = createModelCredentials({
    userDataPath: tempDir,
    profileStore: mockProfileStore,
    modelRegistryUpdater: {
      async loadActiveRegistry() { return { registry: { models: {} } } },
    },
    directoryClient: {
      getDshModelDirectory: async () => mockDirectory,
      fetchDshModelDirectoryOnce: async () => mockDirectory,
      reloadDshHostAfterCredentialChange: async () => {},
    },
    hostSync: {
      applyRegistryAdditions: async () => {},
    },
    catalogApi: {
      listCatalog: async () => mockCatalog,
      refreshCatalog: async () => mockCatalog,
      buildCatalogFromDirectory: async () => mockCatalog,
      reconcileDirectoryRoutesForAddedModels: async (dir) => dir,
    },
    resolveDshCredentialRef: async () => ({}),
    getBridgeProviderAuthorization: helpers.getBridgeProviderAuthorization,
  })

  // 验证 listProvidersAuth 对 WorkBuddy 返回 configured: true
  const authList = await credentialsManager.listProvidersAuth()
  const wbAuthEntry = authList.find((p) => p.id === 'workbuddy')
  assert.ok(wbAuthEntry, 'authList 应包含 workbuddy')
  assert.equal(wbAuthEntry.configured, true, 'WorkBuddy 凭据在 authList 中应识别为 configured')

  // 验证 addModel 能顺利添加 WorkBuddy 模型且不抛出「请先在 Z Runtime 中配置该模型提供方的凭据」
  await credentialsManager.addModel('workbuddy/glm-5.3')
  assert.ok(addedModels.has('workbuddy/glm-5.3'), '成功添加 workbuddy/glm-5.3 模型')

  // 2.3.1 A WorkBuddy model missing from the catalog is registered through the
  // shared WorkBuddy sync, never by writing models.json directly.
  const syncCalls = []
  let syncResult = { refreshed: true, reason: 'synced' }
  const syncedCatalog = { ...mockCatalog, candidateModels: [...mockCatalog.candidateModels] }
  const syncingManager = createModelCredentials({
    userDataPath: tempDir,
    profileStore: mockProfileStore,
    modelRegistryUpdater: { async loadActiveRegistry() { return { registry: { models: {} } } } },
    directoryClient: {
      getDshModelDirectory: async () => mockDirectory,
      fetchDshModelDirectoryOnce: async () => mockDirectory,
      reloadDshHostAfterCredentialChange: async () => {},
    },
    hostSync: { applyRegistryAdditions: async () => {} },
    catalogApi: {
      listCatalog: async () => syncedCatalog,
      refreshCatalog: async () => syncedCatalog,
      buildCatalogFromDirectory: async () => syncedCatalog,
      reconcileDirectoryRoutesForAddedModels: async (dir) => dir,
    },
    resolveDshCredentialRef: async () => ({}),
    getBridgeProviderAuthorization: helpers.getBridgeProviderAuthorization,
    syncWorkBuddyModels: async () => {
      syncCalls.push(Date.now())
      if (syncResult.refreshed) {
        syncedCatalog.candidateModels.push({
          key: 'workbuddy/hy4', id: 'hy4', provider: 'workbuddy', routeRegistered: true, available: true,
        })
      }
      return syncResult
    },
  })
  await syncingManager.addModel('workbuddy/hy4')
  assert.equal(syncCalls.length, 1)
  assert.ok(addedModels.has('workbuddy/hy4'))
  await assert.rejects(fs.access(path.join(tempDir, 'taskweaver', 'models.json')), 'addModel must not write models.json itself')

  syncResult = { refreshed: false, reason: 'user-configured' }
  await assert.rejects(syncingManager.addModel('workbuddy/manual-only'), /手动配置/)
  syncResult = { refreshed: false, reason: 'credential-conflict', warning: '凭据冲突' }
  await assert.rejects(syncingManager.addModel('workbuddy/conflict'), /凭据冲突/)

  // 2.4 验证真实凭据存储读取 WorkBuddy 凭据
  const credentialFilePath = path.join(tempDir, 'private', 'credentials.enc')
  const safeStorageMock = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`mock-enc:${value}`),
    decryptString: (value) => {
      const text = Buffer.from(value).toString('utf8')
      return text.slice('mock-enc:'.length)
    },
  }
  const store = createCredentialStore({ filePath: credentialFilePath, safeStorage: safeStorageMock })
  await store.modify('workbuddy', () => ({ type: 'api_key', key: 'test-wb-key' }))
  const readBack = await store.read('workbuddy')
  assert.deepEqual(readBack, { type: 'api_key', key: 'test-wb-key' })

  console.log('✓ Model credentials 与 WorkBuddy addModel 兼容性测试全部通过！')
} finally {
  await fs.rm(tempDir, { recursive: true, force: true })
}
