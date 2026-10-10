import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createModelLiveDiscovery } from '../desktop/backend/model/live-discovery.mjs'
import { createModelCatalog } from '../desktop/backend/model/catalog.mjs'

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

  console.log('Model live-discovery checks passed: explicit-only discovery, parallel requests, three-second signal, provider/baseURL cache, and online/static routing split.')
} finally {
  await fs.rm(home, { recursive: true, force: true })
  if (priorHome === undefined) delete process.env.TASKWEAVER_HOME
  else process.env.TASKWEAVER_HOME = priorHome
  if (priorLegacyHome === undefined) delete process.env.Z_HOME
  else process.env.Z_HOME = priorLegacyHome
  if (priorDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = priorDshHome
}
