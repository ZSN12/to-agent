import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import {
  loadWorkBuddyRawModels,
  buildWorkBuddyProviderBlock,
  mapWorkBuddyScannedModels,
  probeWorkBuddyAvailable,
  loadWorkBuddyProductCatalogMetadata,
  scanWorkBuddy,
  workBuddyCredentialFromModels,
} from '../backend/model-sync/workbuddy-scan.mjs'
import { writeModelsJsonFromBridgeExport } from '../backend/model-sync/bridge-catalog.mjs'
import {
  bootstrapWorkBuddyOnAppReady,
  enrichScannedBridgeModels,
  formatScanLocalIpcResult,
  scanLocalModels,
} from '../backend/model-sync/scan-local.mjs'
import {
  detectWorkBuddyInstallations,
  isWorkBuddyAiInstallation,
  isWorkBuddyInstallation,
} from '../backend/model-sync/workbuddy-installation.mjs'
import { profilesFromModelsDoc } from '../backend/pi-models-to-dsh-profile.mjs'
import { ensureOpenCodexProxyForExport } from '../backend/ensure-opencodex-proxy.mjs'
import { createCredentialStore } from '../backend/credential-store.mjs'
import { ensureModelsJsonSyncedToDshHost } from '../backend/sync-models-json-to-host.mjs'

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-wb-test-'))

try {
  // 0. Detect installed macOS bundles without opening their private app data.
  const appRoot = path.join(tempDir, 'Applications')
  for (const appName of ['WorkBuddy AI.app', 'WorkBuddy.app']) {
    const infoPath = path.join(appRoot, appName, 'Contents', 'Info.plist')
    await fs.mkdir(path.dirname(infoPath), { recursive: true })
    await fs.writeFile(infoPath, 'mock bundle metadata', 'utf8')
  }
  const detectedApps = await detectWorkBuddyInstallations({ platform: 'darwin', appRoots: [appRoot] })
  assert.deepEqual(detectedApps.map((app) => app.name), ['WorkBuddy AI', 'WorkBuddy'])
  assert.equal(isWorkBuddyAiInstallation(detectedApps[0]), true)
  assert.equal(isWorkBuddyInstallation(detectedApps[0]), false)
  assert.equal(isWorkBuddyAiInstallation(detectedApps[1]), false)
  assert.equal(isWorkBuddyInstallation(detectedApps[1]), true)
  assert.deepEqual(await detectWorkBuddyInstallations({ platform: 'linux', appRoots: [appRoot] }), [])
  const installedWithoutModels = await scanWorkBuddy({
    customPath: path.join(tempDir, 'missing-models.json'),
    detectInstallations: async () => detectedApps,
  })
  assert.equal(installedWithoutModels.block, null)
  assert.deepEqual(installedWithoutModels.installations, [detectedApps[1]],
    'WorkBuddy AI must not be attributed to the classic WorkBuddy models.json scanner')

  // 1. 测试从 mock 文件解析 WorkBuddy 模型列表
  const mockModelsJson = path.join(tempDir, 'mock-wb-models.json')
  const mockData = [
    {
      id: 'glm-5.3',
      name: 'GLM 5.3 (WorkBuddy OAuth)',
      vendor: 'Custom',
      url: 'http://127.0.0.1:10104/v1/chat/completions',
      apiKey: 'synthetic-wb-secret',
      supportsToolCall: true,
      supportsImages: false,
      supportsReasoning: true,
      useCustomProtocol: false,
      maxInputTokens: 200000,
      maxOutputTokens: 65536,
    },
    {
      id: 'gpt-5.6-sol',
      name: 'GPT-5.6-Sol (国内 OAuth)',
      vendor: 'Custom',
      url: 'http://127.0.0.1:10105/v1/chat/completions',
      apiKey: 'synthetic-wb-secret',
      supportsToolCall: true,
      supportsImages: true,
      supportsReasoning: true,
      useCustomProtocol: false,
      maxInputTokens: 262144,
      maxOutputTokens: 65536,
    },
  ]
  await fs.writeFile(mockModelsJson, JSON.stringify(mockData, null, 2), 'utf8')

  const raw = await loadWorkBuddyRawModels(mockModelsJson)
  assert.equal(raw.length, 2)
  assert.equal(raw[0].id, 'glm-5.3')

  // 2. 测试构建 Provider 块配置
  const block = buildWorkBuddyProviderBlock(raw)
  assert.ok(block)
  assert.equal(block.name, 'WorkBuddy')
  assert.equal(block.baseUrl, 'http://127.0.0.1:10104/v1')
  assert.equal(block.api, 'openai-completions')
  assert.equal(block.apiKeyEnv, 'TASKWEAVER_WORKBUDDY_API_KEY')
  assert.equal(Object.hasOwn(block, 'apiKey'), false)
  assert.equal(block.models.length, 2)
  assert.equal(block.models[0].id, 'glm-5.3')
  assert.equal(block.models[0].baseURL, 'http://127.0.0.1:10104/v1')
  assert.equal(block.models[1].baseURL, 'http://127.0.0.1:10105/v1')
  assert.equal(Object.hasOwn(block.models[0], 'url'), false)
  assert.equal(block.models[0].reasoning, true)
  assert.deepEqual(block.models[0].input, ['text'])
  assert.deepEqual(block.models[1].input, ['text', 'image'])

  // 3. 测试模型映射为 ScannedLocalModel 条目
  const scanned = mapWorkBuddyScannedModels(raw, {
    addedKeys: new Set(['workbuddy/glm-5.3']),
    isAvailable: true,
  })
  assert.equal(scanned.length, 2)
  assert.equal(scanned[0].key, 'workbuddy/glm-5.3')
  assert.equal(scanned[0].id, 'glm-5.3')
  assert.equal(scanned[0].provider, 'workbuddy')
  assert.equal(scanned[0].source, 'workbuddy')
  assert.equal(scanned[0].available, true)
  assert.equal(scanned[0].alreadyAdded, true)
  assert.equal(Object.hasOwn(scanned[0], 'apiKey'), false)
  assert.equal(scanned[1].alreadyAdded, false)

  // 4. 测试 WorkBuddy 完整扫描流程与 URL 探测
  const wbScanResult = await scanWorkBuddy({ customPath: mockModelsJson, probe: false })
  assert.equal(wbScanResult.models.length, 2)
  assert.ok(wbScanResult.block)
  assert.equal(wbScanResult.models[1].url, 'http://127.0.0.1:10105/v1')
  assert.deepEqual(workBuddyCredentialFromModels(raw), { key: 'synthetic-wb-secret', ambiguous: false })

  // WorkBuddy model endpoints are probed individually, and arbitrary remote
  // URLs are never fetched during discovery.
  const localModelsServer = createServer((request, response) => {
    response.statusCode = request.url === '/v1/models' ? 200 : 404
    response.end('{}')
  })
  await new Promise((resolve) => localModelsServer.listen(0, '127.0.0.1', resolve))
  const localPort = localModelsServer.address().port
  try {
    assert.equal(await probeWorkBuddyAvailable(`http://127.0.0.1:${localPort}/v1/chat/completions`), true)
    const originalFetch = globalThis.fetch
    let remoteFetchCalls = 0
    globalThis.fetch = async () => { remoteFetchCalls += 1; throw new Error('unexpected remote probe') }
    try {
      assert.equal(await probeWorkBuddyAvailable('https://example.invalid/v1'), false)
      assert.equal(remoteFetchCalls, 0, 'remote WorkBuddy endpoints are not contacted during discovery')
    } finally {
      globalThis.fetch = originalFetch
    }
  } finally {
    await new Promise((resolve, reject) => localModelsServer.close((error) => error ? reject(error) : resolve()))
  }

  const originalFetch = globalThis.fetch
  let redirectMode
  globalThis.fetch = async (_url, options) => {
    redirectMode = options.redirect
    return new Response('', { status: 302, headers: { location: 'https://example.invalid/redirected' } })
  }
  try {
    assert.equal(await probeWorkBuddyAvailable('http://127.0.0.1:10104/v1'), false)
    assert.equal(redirectMode, 'manual', 'local WorkBuddy probes must not follow redirects to arbitrary hosts')
  } finally {
    globalThis.fetch = originalFetch
  }

  const probeFailureServer = createServer((request, response) => {
    if (request.url === '/v1/models') {
      request.socket.destroy()
      return
    }
    response.statusCode = request.url === '/' ? 200 : 404
    response.end('{}')
  })
  await new Promise((resolve) => probeFailureServer.listen(0, '127.0.0.1', resolve))
  try {
    const probePort = probeFailureServer.address().port
    assert.equal(await probeWorkBuddyAvailable(`http://127.0.0.1:${probePort}/v1`), false)
  } finally {
    await new Promise((resolve, reject) => probeFailureServer.close((error) => error ? reject(error) : resolve()))
  }

  // 4.1 Catalog discovery: authenticated loopback listing, product metadata,
  // configured models never dropped, and cached products remain addable but unverified.
  const catalogDir = path.join(tempDir, 'catalog-wb')
  await fs.mkdir(path.join(catalogDir, 'cache'), { recursive: true })
  await fs.writeFile(path.join(catalogDir, 'cache', 'acc-product-config-v3.json'), JSON.stringify({
    models: [
      { id: 'kimi-k3', name: 'Kimi K3', credits: 'x0.5', contextWindow: { defaultLength: 128000 } },
      { id: 'glm-6', name: 'GLM 6', credits: 'x1' },
      { id: 'hy4', name: 'Hy4', credits: 'x0.2' },
      { id: 'zero-test', name: 'Zero Test', credits: 'x0' },
    ],
  }), 'utf8')
  let catalogAuthorized = true
  const seenAuthorization = []
  const catalogServer = createServer((request, response) => {
    seenAuthorization.push(request.headers.authorization ?? '')
    if (request.url !== '/v1/models') {
      response.statusCode = 404
      response.end('{}')
      return
    }
    if (!catalogAuthorized || request.headers.authorization !== 'Bearer synthetic-wb-secret') {
      response.statusCode = 401
      response.end('{}')
      return
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ data: [{ id: 'kimi-k3' }, { id: 'workbuddy-ai/glm-6' }, { id: 'deepseek-v4' }] }))
  })
  await new Promise((resolve) => catalogServer.listen(0, '127.0.0.1', resolve))
  try {
    const catalogUrl = `http://127.0.0.1:${catalogServer.address().port}/v1/chat/completions`
    const catalogModelsPath = path.join(catalogDir, 'models.json')
    await fs.writeFile(catalogModelsPath, JSON.stringify([
      { id: 'kimi-k3', name: 'My Kimi', url: catalogUrl, apiKey: 'synthetic-wb-secret' },
      { id: 'kimi-k3-b', name: 'Kimi K3 Experimental', url: catalogUrl, apiKey: 'synthetic-wb-secret' },
    ]), 'utf8')

    const listedScan = await scanWorkBuddy({ customPath: catalogModelsPath, probe: false, discoverCatalog: true })
    assert.ok(seenAuthorization.includes('Bearer synthetic-wb-secret'), 'catalog listing uses the WorkBuddy key')
    const listedIds = listedScan.models.map((model) => model.id).sort()
    assert.deepEqual(listedIds, ['deepseek-v4', 'glm-6', 'hy4', 'kimi-k3', 'kimi-k3-b', 'zero-test'])
    const kimi = listedScan.models.find((model) => model.id === 'kimi-k3')
    assert.equal(kimi.name, 'My Kimi', 'configured model names are kept')
    assert.equal(kimi.workBuddyMultiplier, 'x0.5')
    assert.equal(kimi.workBuddyMultiplierStatus, 'fresh')
    assert.ok(kimi.workBuddyMultiplierUpdatedAt)
    assert.equal(kimi.maxInputTokens, 128000)
    assert.equal(listedScan.models.find((model) => model.id === 'glm-6').name, 'GLM 6')
    assert.equal(listedScan.models.find((model) => model.id === 'glm-6').workBuddyMultiplier, 'x1')
    assert.equal(listedScan.models.find((model) => model.id === 'zero-test').workBuddyMultiplier, 'x0')
    assert.equal(JSON.stringify(listedScan.block).includes('synthetic-wb-secret'), false)

    catalogAuthorized = false
    const unlistedScan = await scanWorkBuddy({ customPath: catalogModelsPath, probe: false, discoverCatalog: true })
    assert.deepEqual(
      unlistedScan.models.map((model) => model.id).sort(),
      ['glm-6', 'hy4', 'kimi-k3', 'kimi-k3-b', 'zero-test'],
      'product-cache models stay addable when the local endpoint refuses to list models',
    )
    assert.equal(unlistedScan.raw.find((model) => model.id === 'glm-6').workBuddyCatalogListed, false)
    assert.equal(
      unlistedScan.models.find((model) => model.id === 'glm-6').verificationStatus,
      'unverified',
      'a product-cache model absent from the endpoint listing is not marked verified',
    )

    const productConfigPath = path.join(catalogDir, 'cache', 'acc-product-config-v3.json')
    const freshMetadata = await loadWorkBuddyProductCatalogMetadata({ productConfigPaths: [productConfigPath] })
    assert.equal(freshMetadata.multiplierById.get('zero-test').multiplier, 'x0')
    assert.equal(freshMetadata.multiplierById.get('zero-test').status, 'fresh')
    const stat = await fs.stat(productConfigPath)
    const staleNow = stat.mtimeMs + 8 * 24 * 60 * 60 * 1_000
    const staleMetadata = await loadWorkBuddyProductCatalogMetadata({ productConfigPaths: [productConfigPath], now: staleNow })
    assert.equal(staleMetadata.multiplierById.get('zero-test').multiplier, 'x0')
    assert.equal(staleMetadata.multiplierById.get('zero-test').status, 'stale')
    assert.notEqual(staleMetadata.fingerprint, freshMetadata.fingerprint, 'cache freshness changes the fingerprint')
  } finally {
    await new Promise((resolve, reject) => catalogServer.close((error) => error ? reject(error) : resolve()))
  }

  const ambiguousRaw = raw.map((model, index) => index === 1 ? { ...model, apiKey: 'another-secret' } : model)
  const ambiguousPath = path.join(tempDir, 'ambiguous-wb-models.json')
  await fs.writeFile(ambiguousPath, JSON.stringify(ambiguousRaw), 'utf8')
  const ambiguousScan = await scanWorkBuddy({ customPath: ambiguousPath, probe: false })
  assert.equal(ambiguousScan.block, null)
  assert.match(ambiguousScan.warning, /不同 API Key/)
  assert.equal(Object.hasOwn(ambiguousScan, 'apiKey'), false)
  assert.deepEqual(formatScanLocalIpcResult({
    ok: false,
    error: '扫描失败',
    discoveryWarnings: [ambiguousScan.warning],
  }).discoveryWarnings, [ambiguousScan.warning])
  assert.equal(buildWorkBuddyProviderBlock([{
    id: 'unsafe-url',
    url: 'https://user:pass@example.invalid/v1/chat/completions',
  }]), null)

  // 5. 测试 writeModelsJsonFromBridgeExport 写入 WorkBuddy 块
  const modelsPath = path.join(tempDir, 'taskweaver', 'models.json')
  const { modelsDoc, bridgeProviderIds } = await writeModelsJsonFromBridgeExport(
    modelsPath,
    { providers: {} },
    { workbuddyBlock: block },
  )
  assert.ok(modelsDoc.providers.workbuddy)
  assert.equal(modelsDoc.providers.workbuddy.name, 'WorkBuddy')
  assert.equal(Object.hasOwn(modelsDoc.providers.workbuddy, 'apiKey'), false)
  assert.ok(bridgeProviderIds.includes('workbuddy'))
  assert.doesNotMatch(await fs.readFile(modelsPath, 'utf8'), /synthetic-wb-secret/)
  const mappedProfile = profilesFromModelsDoc(modelsDoc, ['workbuddy']).workbuddy
  assert.deepEqual(mappedProfile.models.map((model) => model.baseURL), [
    'http://127.0.0.1:10104/v1',
    'http://127.0.0.1:10105/v1',
  ])

  // 6. 测试 enrichScannedBridgeModels 包含 WorkBuddy 模型
  const mockModelService = {
    async listCatalog() {
      return { models: [{ key: 'workbuddy/glm-5.3' }] }
    },
  }
  const enriched = await enrichScannedBridgeModels(
    mockModelService,
    modelsDoc,
    [],
    null,
    wbScanResult,
  )
  const wbEnriched = enriched.filter((m) => m.source === 'workbuddy')
  assert.equal(wbEnriched.length, 2)
  assert.equal(wbEnriched.find((m) => m.id === 'glm-5.3')?.alreadyAdded, true)
  assert.equal(wbEnriched.find((m) => m.id === 'gpt-5.6-sol')?.alreadyAdded, false)

  // 7. 测试 ensureOpenCodexProxyForExport 超时已调整为合理时长（<= 10秒）
  // 检查函数签名或默认参数：通过传入不存在的路径并快速超时抛出验证
  const start = Date.now()
  try {
    await ensureOpenCodexProxyForExport({
      userDataPath: path.join(tempDir, 'nonexistent-user-data'),
      timeoutMs: 500,
    })
  } catch (err) {
    const elapsed = Date.now() - start
    assert.ok(elapsed < 2000, `timeout should be fast, elapsed: ${elapsed}ms`)
  }

  // 8. 检查 LocalScanModal.tsx 源码：验证取消按钮不再在 loading 时禁用、具备右上角关闭按钮、支持 ESC
  const modalSource = await fs.readFile(
    new URL('../src/features/models/LocalScanModal.tsx', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(
    modalSource,
    /disabled=\{loading \|\| saving\}>[\s\r\n]*取消/,
    '取消按钮在 loading 时必须可点击',
  )
  assert.match(
    modalSource,
    /disabled=\{saving\}>[\s\r\n]*取消/,
    '取消按钮仅在 saving 时禁用',
  )
  assert.match(
    modalSource,
    /onEscape: !saving \? onClose : undefined/,
    'ESC 键在 loading 期间必须可以关闭弹窗',
  )
  assert.match(
    modalSource,
    /workbuddy:\s*'WorkBuddy'/,
    'SOURCE_LABELS 应准确显示 WorkBuddy 分组名',
  )
  assert.match(
    modalSource,
    /aria-label="关闭"/,
    '具备右上角关闭按钮',
  )

  // 9. 检查 ModelSettingsPanel.tsx 源码：验证 closeScanModal 不再被 scanLoading 阻断
  const panelSource = await fs.readFile(
    new URL('../src/features/models/ModelSettingsPanel.tsx', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(
    panelSource,
    /const closeScanModal = \(\) => \{\s*if \(scanLoading\) return/,
    'closeScanModal 不能拦截 scanLoading',
  )
  assert.match(
    panelSource,
    /const closeScanModal = \(\) => \{\s*scanRequestIdRef\.current \+= 1/,
    'closeScanModal 递增请求序号，使已关闭弹窗的扫描结果失效',
  )
  assert.match(
    panelSource,
    /requestId !== scanRequestIdRef\.current/,
    '过期扫描响应不得覆盖当前弹窗状态',
  )

  // 10. 测试使用真实 createCredentialStore 进行 scanLocalModels 本地扫描
  const credentialFilePath = path.join(tempDir, 'private', 'credentials.enc')
  const safeStorageMock = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`mock-enc:${value}`),
    decryptString: (value) => {
      const text = Buffer.from(value).toString('utf8')
      return text.slice('mock-enc:'.length)
    },
  }
  const realStore = createCredentialStore({ filePath: credentialFilePath, safeStorage: safeStorageMock })

  // 10.1 验证真实凭据存储（无 .set 方法）扫描成功写入凭据，绝不抛出 credentialStore.set is not a function
  assert.equal(typeof realStore.set, 'undefined', '真实 credentialStore 不应该有 set 方法')
  assert.equal(typeof realStore.modify, 'function', '真实 credentialStore 应该有 modify 方法')

  const scanWithStoreUserDataPath = path.join(tempDir, 'scan-with-store-user')
  const scanWithStoreResult = await scanLocalModels({
    userDataPath: scanWithStoreUserDataPath,
    force: true,
    credentialStore: realStore,
    exportCatalog: async () => ({ providers: {} }),
    exportAntigravityCatalog: async () => ({ providers: {} }),
    fetchLogins: async () => ({}),
    scanWb: async () => wbScanResult,
    commitHost: async () => [],
    modelService: mockModelService,
    enrichModels: async () => [{ key: 'workbuddy/glm-5.3', name: 'GLM 5.3', provider: 'workbuddy' }],
  })
  assert.equal(scanWithStoreResult.ok, true, '真实 credentialStore 扫描应该成功')
  const storedWbCred = await realStore.read('workbuddy')
  assert.deepEqual(storedWbCred, { type: 'api_key', key: 'synthetic-wb-secret' }, 'WorkBuddy 凭据应正确写入真实存储')
  const persistedModelsJson = await fs.readFile(path.join(scanWithStoreUserDataPath, 'taskweaver', 'models.json'), 'utf8')
  assert.doesNotMatch(persistedModelsJson, /synthetic-wb-secret/, 'models.json 中不能保存 WorkBuddy 明文凭据')
  assert.match(persistedModelsJson, /TASKWEAVER_WORKBUDDY_API_KEY/)
  assert.match(persistedModelsJson, /workbuddy-local/)

  // 10.2 A user-owned route and credential are left untouched by local scan.
  const customCredentialUserDataPath = path.join(tempDir, 'custom-credential-user')
  const customCredentialModelsPath = path.join(customCredentialUserDataPath, 'taskweaver', 'models.json')
  await fs.mkdir(path.dirname(customCredentialModelsPath), { recursive: true })
  await fs.writeFile(customCredentialModelsPath, JSON.stringify({ providers: {
    workbuddy: { name: 'My WorkBuddy route', api: 'openai-completions', baseUrl: 'https://user.example/v1', models: [] },
  } }), 'utf8')
  const customCredentialModelsBefore = await fs.readFile(customCredentialModelsPath, 'utf8')
  await realStore.modify('workbuddy', () => ({ type: 'api_key', key: 'custom-existing-key' }))
  const customCredentialScan = await scanLocalModels({
    userDataPath: customCredentialUserDataPath,
    force: true,
    credentialStore: realStore,
    exportCatalog: async () => ({ providers: {} }),
    exportAntigravityCatalog: async () => ({ providers: {} }),
    fetchLogins: async () => ({}),
    scanWb: async () => wbScanResult,
    commitHost: async () => [],
    modelService: mockModelService,
    enrichModels: async () => [],
  })
  assert.equal(customCredentialScan.ok, true)
  const preservedCred = await realStore.read('workbuddy')
  assert.equal(preservedCred?.key, 'custom-existing-key', '已有 WorkBuddy 凭据应该保留')
  assert.equal(await fs.readFile(customCredentialModelsPath, 'utf8'), customCredentialModelsBefore)

  // 10.3 验证防御性回退：如果 credentialStore 只有 set 方法也能正常工作
  let mockSetCalled = false
  const mockSetStore = {
    set: async (providerId, cred) => {
      mockSetCalled = true
      assert.equal(providerId, 'workbuddy')
      assert.equal(cred.key, 'synthetic-wb-secret')
    },
  }
  await scanLocalModels({
    userDataPath: path.join(tempDir, 'set-only-user'),
    force: true,
    credentialStore: mockSetStore,
    exportCatalog: async () => ({ providers: {} }),
    exportAntigravityCatalog: async () => ({ providers: {} }),
    fetchLogins: async () => ({}),
    scanWb: async () => wbScanResult,
    commitHost: async () => [],
    modelService: mockModelService,
    enrichModels: async () => [],
  })
  assert.equal(mockSetCalled, true, '仅有 set 方法的 store 也能正常调用')

  // 10.4 直接 Host 同步也必须先迁移 legacy models.json 中的明文密钥
  const legacyUserDataPath = path.join(tempDir, 'legacy-user')
  const legacyModelsPath = path.join(legacyUserDataPath, 'taskweaver', 'models.json')
  const legacyCredentialStore = createCredentialStore({
    filePath: path.join(legacyUserDataPath, 'private', 'credentials.enc'),
    safeStorage: safeStorageMock,
  })
  const legacySecret = 'synthetic-legacy-wb-secret'
  await fs.mkdir(path.dirname(legacyModelsPath), { recursive: true })
  await fs.writeFile(legacyModelsPath, JSON.stringify({
    providers: {
      workbuddy: {
        name: 'WorkBuddy',
        api: 'openai-completions',
        baseUrl: 'http://127.0.0.1:10104/v1',
        apiKey: legacySecret,
        models: [{ id: 'glm-5.3', name: 'GLM 5.3' }],
      },
    },
  }), 'utf8')
  const migratedHostSecrets = []
  const legacyApi = {
    settings: {
      async describe() {
        return { result: { ok: true, value: { namespaces: [{ ns: 'llm-pi-ai', writable: true, revision: 1 }] } } }
      },
      async mutate(payload) { return { revision: payload.ops.length } },
    },
    credentials: {
      async set(payload) { migratedHostSecrets.push(payload); return {} },
      async unset() { return {} },
    },
  }
  const legacyHostManager = { async start() { return { api: legacyApi } } }
  const migratedSync = await ensureModelsJsonSyncedToDshHost({
    hostManager: legacyHostManager,
    userDataPath: legacyUserDataPath,
    credentialStore: legacyCredentialStore,
  })
  assert.equal(migratedSync.synced, true)
  assert.deepEqual(await legacyCredentialStore.read('workbuddy'), { type: 'api_key', key: legacySecret })
  assert.equal(migratedHostSecrets[0]?.value, legacySecret, 'Host sync should read the migrated secret')
  const sanitizedLegacyConfig = await fs.readFile(legacyModelsPath, 'utf8')
  assert.doesNotMatch(sanitizedLegacyConfig, /synthetic-legacy-wb-secret/)
  assert.match(sanitizedLegacyConfig, /TASKWEAVER_WORKBUDDY_API_KEY/)

  // Startup auto-discovery imports WorkBuddy without requiring the other
  // local-agent scan and keeps its credentials out of models.json.
  const autoUserDataPath = path.join(tempDir, 'auto-user')
  const autoCredentialStore = {
    key: null,
    async read() { return this.key ? { key: this.key } : null },
    async modify(_provider, update) { this.key = (await update(this.key ? { key: this.key } : null)).key },
  }
  const hostSyncCalls = []
  let refreshCalls = 0
  const autoImport = await bootstrapWorkBuddyOnAppReady({
    userDataPath: autoUserDataPath,
    credentialStore: autoCredentialStore,
    hostManager: { id: 'mock-host' },
    modelService: { async refreshCatalog() { refreshCalls += 1 } },
    scanWb: async () => wbScanResult,
    ensureModelsJsonSyncedToDshHost: async (options) => {
      hostSyncCalls.push(options)
      return { synced: true, reason: 'updated' }
    },
  })
  assert.equal(autoImport.refreshed, true)
  assert.equal(autoImport.modelCount, 2)
  assert.equal(autoCredentialStore.key, 'synthetic-wb-secret')
  assert.equal(hostSyncCalls.length, 1)
  assert.equal(refreshCalls, 1)
  const autoModelsJson = await fs.readFile(path.join(autoUserDataPath, 'taskweaver', 'models.json'), 'utf8')
  assert.match(autoModelsJson, /workbuddy-local/)
  assert.doesNotMatch(autoModelsJson, /synthetic-wb-secret/)

  // A later explicit local-agent scan keeps the marker so WorkBuddy key
  // rotations remain attributable to the imported local configuration.
  const scanAfterAutoImport = await scanLocalModels({
    userDataPath: autoUserDataPath,
    force: true,
    credentialStore: autoCredentialStore,
    exportCatalog: async () => ({ providers: {} }),
    exportAntigravityCatalog: async () => ({ providers: {} }),
    fetchLogins: async () => ({}),
    scanWb: async () => wbScanResult,
    commitHost: async () => [],
    modelService: mockModelService,
    enrichModels: async () => [],
  })
  assert.equal(autoCredentialStore.key, 'synthetic-wb-secret')
  assert.equal(scanAfterAutoImport.modelsDoc.providers.workbuddy.taskweaverSource, 'workbuddy-local')

  const secondAutoImport = await bootstrapWorkBuddyOnAppReady({
    userDataPath: autoUserDataPath,
    credentialStore: autoCredentialStore,
    modelService: { async refreshCatalog() { refreshCalls += 1 } },
    scanWb: async () => wbScanResult,
    ensureModelsJsonSyncedToDshHost: async () => ({ synced: true }),
  })
  assert.equal(secondAutoImport.reason, 'unchanged')
  assert.equal(hostSyncCalls.length, 1, 'unchanged startup scans do not repeat Host sync')

  // A compatible user-owned WorkBuddy provider receives only missing models;
  // its route, existing entries, and user metadata remain untouched.
  const mergeUserDataPath = path.join(tempDir, 'merge-user')
  const mergeModelsPath = path.join(mergeUserDataPath, 'taskweaver', 'models.json')
  const originalModel = { ...wbScanResult.block.models[0], name: 'My existing WorkBuddy model' }
  const userProvider = {
    name: 'My WorkBuddy route',
    baseUrl: 'http://127.0.0.1:10104/v1',
    api: 'openai-completions',
    apiKeyEnv: 'TASKWEAVER_WORKBUDDY_API_KEY',
    keepThisSetting: true,
    models: [originalModel],
  }
  await fs.mkdir(path.dirname(mergeModelsPath), { recursive: true })
  await fs.writeFile(mergeModelsPath, JSON.stringify({ providers: { workbuddy: userProvider } }), 'utf8')
  let mergeHostSyncCalls = 0
  const mergedAutoImport = await bootstrapWorkBuddyOnAppReady({
    userDataPath: mergeUserDataPath,
    credentialStore: autoCredentialStore,
    modelService: { async refreshCatalog() { refreshCalls += 1 } },
    scanWb: async () => wbScanResult,
    ensureModelsJsonSyncedToDshHost: async () => {
      mergeHostSyncCalls += 1
      return { synced: true, reason: 'updated' }
    },
  })
  assert.equal(mergedAutoImport.refreshed, true)
  assert.equal(mergedAutoImport.addedModelCount, 1)
  assert.equal(mergedAutoImport.modelCount, 2)
  const mergedProvider = JSON.parse(await fs.readFile(mergeModelsPath, 'utf8')).providers.workbuddy
  assert.equal(mergedProvider.name, userProvider.name)
  assert.equal(mergedProvider.baseUrl, userProvider.baseUrl)
  assert.equal(mergedProvider.apiKeyEnv, userProvider.apiKeyEnv)
  assert.equal(mergedProvider.keepThisSetting, true)
  assert.equal(Object.hasOwn(mergedProvider, 'taskweaverSource'), false)
  assert.equal(mergedProvider.models[0].name, originalModel.name)
  assert.equal(mergedProvider.models[1].id, wbScanResult.block.models[1].id)
  assert.equal(mergeHostSyncCalls, 1)
  const repeatMerge = await bootstrapWorkBuddyOnAppReady({
    userDataPath: mergeUserDataPath,
    credentialStore: autoCredentialStore,
    scanWb: async () => wbScanResult,
    ensureModelsJsonSyncedToDshHost: async () => { throw new Error('unchanged models must not sync') },
  })
  assert.equal(repeatMerge.reason, 'unchanged')
  assert.equal(repeatMerge.addedModelCount, 0)
  assert.equal(mergeHostSyncCalls, 1)

  const rotatedWorkBuddyScan = {
    ...wbScanResult,
    raw: wbScanResult.raw.map((model) => ({ ...model, apiKey: 'rotated-synthetic-wb-secret' })),
  }
  const rotatedAutoImport = await bootstrapWorkBuddyOnAppReady({
    userDataPath: autoUserDataPath,
    credentialStore: autoCredentialStore,
    modelService: { async refreshCatalog() { refreshCalls += 1 } },
    scanWb: async () => rotatedWorkBuddyScan,
    ensureModelsJsonSyncedToDshHost: async (options) => {
      hostSyncCalls.push(options)
      return { synced: true, reason: 'updated' }
    },
  })
  assert.equal(rotatedAutoImport.refreshed, true, 'rotated source credentials must be synced even when model metadata is unchanged')
  assert.equal(autoCredentialStore.key, 'rotated-synthetic-wb-secret')
  assert.equal(hostSyncCalls.length, 2)
  assert.equal(refreshCalls, 3)

  const manualUserDataPath = path.join(tempDir, 'manual-user')
  const manualModelsPath = path.join(manualUserDataPath, 'taskweaver', 'models.json')
  await fs.mkdir(path.dirname(manualModelsPath), { recursive: true })
  await fs.writeFile(manualModelsPath, JSON.stringify({ providers: {
    workbuddy: { name: 'My WorkBuddy route', api: 'openai-completions', baseUrl: 'https://example.invalid/v1', models: [] },
  } }), 'utf8')
  const preservedManualConfig = await fs.readFile(manualModelsPath, 'utf8')
  const manualAutoImport = await bootstrapWorkBuddyOnAppReady({
    userDataPath: manualUserDataPath,
    credentialStore: autoCredentialStore,
    scanWb: async () => wbScanResult,
    ensureModelsJsonSyncedToDshHost: async () => { throw new Error('must not sync over a user route') },
  })
  assert.equal(manualAutoImport.reason, 'user-configured')
  assert.equal(await fs.readFile(manualModelsPath, 'utf8'), preservedManualConfig)

  const manualScanConfig = await scanLocalModels({
    userDataPath: manualUserDataPath,
    force: true,
    credentialStore: autoCredentialStore,
    exportCatalog: async () => ({ providers: {} }),
    exportAntigravityCatalog: async () => ({ providers: {} }),
    fetchLogins: async () => ({}),
    scanWb: async () => wbScanResult,
    commitHost: async () => [],
    modelService: mockModelService,
    enrichModels: async () => [],
  })
  assert.equal(manualScanConfig.ok, true)
  assert.equal(await fs.readFile(manualModelsPath, 'utf8'), preservedManualConfig, 'explicit scan must preserve a user-owned WorkBuddy route')

  const conflictUserDataPath = path.join(tempDir, 'conflict-user')
  const conflictingCredentialStore = {
    async read() { return { key: 'user-owned-wb-secret' } },
    async modify() { throw new Error('must not replace a user-owned WorkBuddy credential') },
  }
  const conflictAutoImport = await bootstrapWorkBuddyOnAppReady({
    userDataPath: conflictUserDataPath,
    credentialStore: conflictingCredentialStore,
    scanWb: async () => wbScanResult,
    ensureModelsJsonSyncedToDshHost: async () => { throw new Error('conflicting credentials must stop import') },
  })
  assert.equal(conflictAutoImport.reason, 'credential-conflict')
  assert.match(conflictAutoImport.warning, /另一组 WorkBuddy 凭据/)
  await assert.rejects(fs.readFile(path.join(conflictUserDataPath, 'taskweaver', 'models.json'), 'utf8'), { code: 'ENOENT' })

  const configuredConflictPath = path.join(tempDir, 'configured-conflict-user')
  const configuredConflictModelsPath = path.join(configuredConflictPath, 'taskweaver', 'models.json')
  await fs.mkdir(path.dirname(configuredConflictModelsPath), { recursive: true })
  await fs.writeFile(configuredConflictModelsPath, JSON.stringify({ providers: {
    workbuddy: {
      name: 'My WorkBuddy route',
      api: 'openai-completions',
      apiKeyEnv: 'TASKWEAVER_WORKBUDDY_API_KEY',
      models: [],
    },
  } }), 'utf8')
  const configuredConflictBefore = await fs.readFile(configuredConflictModelsPath, 'utf8')
  const configuredConflict = await bootstrapWorkBuddyOnAppReady({
    userDataPath: configuredConflictPath,
    credentialStore: conflictingCredentialStore,
    scanWb: async () => wbScanResult,
    ensureModelsJsonSyncedToDshHost: async () => { throw new Error('conflicting credentials must stop merge') },
  })
  assert.equal(configuredConflict.reason, 'credential-conflict')
  assert.equal(await fs.readFile(configuredConflictModelsPath, 'utf8'), configuredConflictBefore)

  const missingModelsApp = await bootstrapWorkBuddyOnAppReady({
    userDataPath: path.join(tempDir, 'installed-without-models'),
    scanWb: async () => ({
      block: null,
      models: [],
      raw: [],
      installations: [{ name: 'WorkBuddy AI', bundleIdentifier: 'com.workbuddy.workbuddy-ai' }],
    }),
  })
  assert.equal(missingModelsApp.reason, 'not-found')
  assert.deepEqual(missingModelsApp.installedApps, [], 'WorkBuddy AI must not be reported as a classic WorkBuddy installation')
  assert.equal(missingModelsApp.warning, undefined, 'classic WorkBuddy scanner must not show WorkBuddy AI login guidance')

  let uiVerifyScanned = false
  const priorUiVerify = process.env.TASKWEAVER_UI_VERIFY
  process.env.TASKWEAVER_UI_VERIFY = '1'
  try {
    const skippedUiVerify = await bootstrapWorkBuddyOnAppReady({
      userDataPath: path.join(tempDir, 'ui-verify-user'),
      scanWb: async () => { uiVerifyScanned = true; return wbScanResult },
    })
    assert.equal(skippedUiVerify.reason, 'ui-verify')
    assert.equal(uiVerifyScanned, false)
  } finally {
    if (priorUiVerify === undefined) delete process.env.TASKWEAVER_UI_VERIFY
    else process.env.TASKWEAVER_UI_VERIFY = priorUiVerify
  }

  console.log('✓ WorkBuddy 本机扫描、逐模型端点映射、安全凭据存储与启动自动接入测试全部通过！')
} finally {
  await fs.rm(tempDir, { recursive: true, force: true })
}
