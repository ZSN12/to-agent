import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createModelLiveDiscovery } from '../backend/model/live-discovery.mjs'
import { createModelCatalog } from '../backend/model/catalog.mjs'
import {
  createDiscoverProviderModelsHandler,
  DEFAULT_PROVIDER_DISCOVERY_TIMEOUT_MS,
} from '../backend/model/discover-provider-models-ipc.mjs'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-live-discovery-'))
const priorHome = process.env.TASKWEAVER_HOME
const priorLegacyHome = process.env.Z_HOME
const priorDshHome = process.env.DSH_HOME
process.env.TASKWEAVER_HOME = path.join(home, 'runtime')
delete process.env.Z_HOME
delete process.env.DSH_HOME
await fs.mkdir(process.env.TASKWEAVER_HOME, { recursive: true })
await fs.writeFile(path.join(process.env.TASKWEAVER_HOME, '.credentials.yaml'), [
  'version: 1',
  'refs:',
  '  TASKWEAVER_TEST_ALPHA_KEY: alpha-secret',
  '  TASKWEAVER_TEST_BETA_KEY: beta-secret',
  '',
].join('\n'))

try {
  const [bootstrapSource, modelServiceSource, credentialsSource, modelsIpcSource, discoveryIpcSource] = await Promise.all([
    fs.readFile(new URL('../backend/bootstrap.mjs', import.meta.url), 'utf8'),
    fs.readFile(new URL('../backend/model-service.mjs', import.meta.url), 'utf8'),
    fs.readFile(new URL('../backend/model/credentials.mjs', import.meta.url), 'utf8'),
    fs.readFile(new URL('../backend/ipc/register-models-ipc.mjs', import.meta.url), 'utf8'),
    fs.readFile(new URL('../backend/model/discover-provider-models-ipc.mjs', import.meta.url), 'utf8'),
  ])
  assert.equal(DEFAULT_PROVIDER_DISCOVERY_TIMEOUT_MS, 3_000, 'production provider discovery keeps its three-second deadline')
  assert.match(discoveryIpcSource, /AbortSignal\.timeout\(timeoutMs\)/, 'the IPC deadline uses AbortSignal.timeout')
  assert.match(modelsIpcSource, /ipcHandle\(ipcMain, 'models:discoverProviderModels', createDiscoverProviderModelsHandler\(\{ modelService \}\)\)/,
    'the registered IPC route uses the tested handler')
  assert.doesNotMatch(bootstrapSource, /liveDiscovery\s*:\s*true/, 'startup does not opt into provider live discovery')
  assert.doesNotMatch(modelServiceSource, /liveDiscovery\s*:\s*true/, 'model bundle loading does not opt into provider live discovery')
  assert.match(credentialsSource, /buildCatalogFromDirectory\(directory, \{ liveDiscovery: false \}\)/,
    'model bundle loading explicitly disables provider live discovery')
  const loadBundleStart = modelsIpcSource.indexOf("ipcHandle(ipcMain, 'models:loadBundle'")
  const loadBundleEnd = modelsIpcSource.indexOf("ipcHandle(ipcMain, 'models:list'", loadBundleStart)
  assert.ok(loadBundleStart >= 0 && loadBundleEnd > loadBundleStart, 'models:loadBundle route is present')
  assert.doesNotMatch(modelsIpcSource.slice(loadBundleStart, loadBundleEnd), /liveDiscovery\s*:\s*true/,
    'models:loadBundle does not opt into provider live discovery')

  let now = 1_000
  let activeRequests = 0
  let maxConcurrentRequests = 0
  const requests = []
  const providers = ['alpha', 'beta'].map((provider) => ({
    provider,
    displayName: provider,
    active: true,
    settingsNs: 'llm-pi-ai',
    settingsPath: ['providers', provider],
  }))
  const directory = {
    providers,
    groups: [],
    namespaces: [{
      ns: 'llm-pi-ai',
      value: {
        providers: {
          alpha: { apiKeyEnv: 'TASKWEAVER_TEST_ALPHA_KEY', baseURL: 'https://alpha.example/v1', api: 'openai-completions' },
          beta: { apiKeyEnv: 'TASKWEAVER_TEST_BETA_KEY', baseURL: 'https://beta.example/api', api: 'openai-responses' },
        },
      },
    }],
    api: {
      credentials: {
        async describe({ refs }, signal) {
          assert.ok(signal instanceof AbortSignal)
          return {
            result: {
              ok: true,
              value: { credentials: Object.fromEntries(refs.map((ref) => [ref, { configured: true }])) },
            },
          }
        },
      },
      llm: {
        async discoverModels(payload, signal) {
          requests.push({ payload, signal })
          activeRequests += 1
          maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests)
          await new Promise((resolve) => setTimeout(resolve, 20))
          activeRequests -= 1
          const provider = payload.baseURL.includes('alpha') ? 'alpha' : 'beta'
          return { result: { ok: true, value: { models: [{ id: `${provider}-live`, name: `${provider} live` }] } } }
        },
      },
    },
  }

  const liveDiscovery = createModelLiveDiscovery({
    userDataPath: home,
    dshRuntimeRoot: path.join(home, 'runtime-root'),
    serializeDshModel: (provider, model, availableKeys, _profile, _registry, source) => ({
      provider: provider.id,
      id: model.id,
      key: `${provider.id}/${model.id}`,
      source,
      available: availableKeys.has(`${provider.id}/${model.id}`),
    }),
    isProviderCredentialConfigured: async () => true,
    now: () => now,
  })

  const makeCatalogRows = async () => {
    const candidates = []
    const available = new Set()
    const providerMap = new Map(providers.map((provider) => [provider.provider, { id: provider.provider, active: true }]))
    await liveDiscovery.mergeLiveProviderModels(directory, candidates, available, providerMap, {}, new Map(), null, [])
    return { candidates, available }
  }

  const first = await makeCatalogRows()
  assert.deepEqual(first.candidates.map((model) => model.id).sort(), ['alpha-live', 'beta-live'])
  assert.equal(maxConcurrentRequests, 2, 'provider listings run concurrently')
  assert.equal(requests.length, 2)
  assert.equal(requests.some(({ payload }) => Object.hasOwn(payload, 'provider')), false,
    'online discovery omits provider so pi-ai performs the HTTP listing instead of returning static metadata')
  assert.deepEqual(requests.map(({ payload }) => payload.baseURL).sort(), [
    'https://alpha.example/v1',
    'https://beta.example/api',
  ])
  assert.deepEqual(requests.map(({ payload }) => payload.api).sort(), ['openai-completions', 'openai-responses'])
  assert.ok(requests.every(({ signal }) => signal instanceof AbortSignal), 'the Host fetch receives a bounded signal')

  await makeCatalogRows()
  assert.equal(requests.length, 2, 'successful listings are cached')
  now += 6 * 60 * 60 * 1_000 + 1
  await makeCatalogRows()
  assert.equal(requests.length, 4, 'the cache expires after six hours')

  let liveCalls = 0
  const emptyDirectory = { providers: [], groups: [], namespaces: [], api: {} }
  const catalog = createModelCatalog({
    dshRuntimeRoot: null,
    profileStore: {
      migrateLegacyAutoRouteActiveKey: async () => false,
      listProfiles: async () => ({}),
      getActiveModelKey: async () => null,
      listAddedModelKeys: async () => [],
      getThinkingLevel: async () => 'medium',
    },
    modelRegistryUpdater: { loadActiveRegistry: async () => ({ registry: null, source: 'bundled' }) },
    serializeDshModel: () => ({}),
    directoryClient: {
      getDshModelDirectory: async () => emptyDirectory,
      fetchDshModelDirectoryOnce: async () => emptyDirectory,
      invalidateModelDirectoryCache: () => {},
      seedModelDirectoryCache: () => {},
    },
    hostSync: { applyRegistryAdditions: async () => emptyDirectory },
    liveDiscovery: {
      mergeLiveProviderModels: async () => { liveCalls += 1 },
      discoverProviderModels: async () => [],
    },
    applyCredentialBasedAvailability: async () => {},
  })
  await catalog.listCatalog()
  await catalog.refreshCatalog()
  assert.equal(liveCalls, 0, 'routine catalog reads do not make live discovery requests')
  await catalog.listCatalog({ liveDiscovery: true })
  await catalog.refreshCatalog({ liveDiscovery: true })
  assert.equal(liveCalls, 2, 'live discovery is opt-in for configuration flows')

  // 测试 3 个 provider（其中 1 个永远挂起模拟不可达超时）
  const timeoutProviders = ['fast-a', 'slow-timeout', 'fast-b'].map((provider) => ({
    provider,
    displayName: provider,
    active: true,
    settingsNs: 'llm-pi-ai',
    settingsPath: ['providers', provider],
  }))
  const timeoutDirectory = {
    providers: timeoutProviders,
    namespaces: [{
      ns: 'llm-pi-ai',
      value: {
        providers: {
          'fast-a': { apiKeyEnv: 'TASKWEAVER_TEST_ALPHA_KEY', baseURL: 'https://fast-a.example/v1', api: 'openai-completions' },
          'slow-timeout': { apiKeyEnv: 'TASKWEAVER_TEST_ALPHA_KEY', baseURL: 'https://slow-timeout.example/v1', api: 'openai-completions' },
          'fast-b': { apiKeyEnv: 'TASKWEAVER_TEST_ALPHA_KEY', baseURL: 'https://fast-b.example/v1', api: 'openai-completions' },
        },
      },
    }],
    api: {
      credentials: {
        async describe({ refs }) {
          return { result: { ok: true, value: { credentials: Object.fromEntries(refs.map((r) => [r, { configured: true }])) } } }
        },
      },
      llm: {
        async discoverModels(payload, signal) {
          if (payload.baseURL.includes('slow-timeout')) {
            return new Promise((_, reject) => {
              if (signal?.aborted) return reject(signal.reason)
              const fallback = setTimeout(() => reject(new Error('TimeoutError')), 500)
              signal?.addEventListener('abort', () => {
                clearTimeout(fallback)
                reject(signal.reason)
              }, { once: true })
            })
          }
          return { result: { ok: true, value: { models: [{ id: 'ok-model' }] } } }
        },
      },
    },
  }

  const timeoutDiscovery = createModelLiveDiscovery({
    userDataPath: home,
    dshRuntimeRoot: path.join(home, 'runtime-root'),
    serializeDshModel: (p, m) => ({ key: `${p.id}/${m.id}` }),
    isProviderCredentialConfigured: async () => true,
    discoveryTimeoutMs: 200,
  })

  const tStart = Date.now()
  const timeoutCandidates = []
  const timeoutAvailable = new Set()
  const timeoutMap = new Map(timeoutProviders.map((p) => [p.provider, { id: p.provider, active: true }]))
  await timeoutDiscovery.mergeLiveProviderModels(timeoutDirectory, timeoutCandidates, timeoutAvailable, timeoutMap, {}, new Map(), null, ['fast-a', 'slow-timeout', 'fast-b'])
  const elapsed = Date.now() - tStart
  assert.ok(elapsed < 1000, `并发超时机制工作正常，总耗时 ${elapsed}ms < 1000ms`)
  assert.ok(timeoutCandidates.some((c) => c.key.startsWith('fast-a/')), 'fast-a 正常返回')
  assert.ok(timeoutCandidates.some((c) => c.key.startsWith('fast-b/')), 'fast-b 正常返回')

  const ipcDiscovery = createDiscoverProviderModelsHandler({
    modelService: {
      async discoverProviderModels({ providerId, signal }) {
        assert.ok(signal instanceof AbortSignal, 'the IPC handler passes an abort signal to discovery')
        if (providerId === 'slow-timeout') {
          return new Promise((_, reject) => {
            if (signal.aborted) return reject(signal.reason)
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          })
        }
        if (providerId === 'provider-error') throw new Error('provider listing failed')
        return [{ id: `${providerId}-model`, name: `${providerId} model` }]
      },
    },
    timeoutMs: 40,
  })
  const routeStartedAt = Date.now()
  const deadlineKeepAlive = setTimeout(() => {}, 250)
  let routeResults
  try {
    routeResults = await Promise.all(['fast-a', 'slow-timeout', 'fast-b'].map((providerId) =>
      ipcDiscovery(null, { providerId })))
  } finally {
    clearTimeout(deadlineKeepAlive)
  }
  const routeElapsed = Date.now() - routeStartedAt
  assert.ok(routeElapsed < 500, `all provider IPC results settle within the short test deadline (${routeElapsed}ms)`)
  assert.deepEqual(routeResults.map((result) => result.status), ['ok', 'timeout', 'ok'])
  assert.deepEqual(routeResults.map((result) => result.providerId), ['fast-a', 'slow-timeout', 'fast-b'])
  assert.deepEqual(routeResults.map((result) => result.models.length), [1, 0, 1])
  assert.equal(routeResults[1].error, '模型发现超过 0.04 秒，已停止等待', 'a hung provider is explicitly classified as timeout')

  const failedRouteResult = await ipcDiscovery(null, { providerId: 'provider-error' })
  assert.equal(failedRouteResult.status, 'error', 'provider failures are distinguished from timeouts')
  assert.deepEqual(failedRouteResult.models, [])
  assert.equal(failedRouteResult.error, 'provider listing failed')

  console.log('Model live-discovery checks passed: explicit-only discovery, concurrent IPC status results, AbortSignal timeout, and startup/loadBundle opt-out.')
} finally {
  await fs.rm(home, { recursive: true, force: true })
  if (priorHome === undefined) delete process.env.TASKWEAVER_HOME
  else process.env.TASKWEAVER_HOME = priorHome
  if (priorLegacyHome === undefined) delete process.env.Z_HOME
  else process.env.Z_HOME = priorLegacyHome
  if (priorDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = priorDshHome
}
