import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createSerializeDshModel } from '../backend/model/serialize-model.mjs'
import { createModelScorer } from '../backend/orchestration/model-scorer.mjs'
import { createModelService } from '../backend/model-service.mjs'

const serialize = createSerializeDshModel({
  getPriceRegistry: () => ({ models: {} }),
  getCatalogPriceMeta: () => ({ source: 'test' }),
})
const available = new Set(['workbuddy/live'])

const hostMetadata = serialize(
  { id: 'workbuddy' },
  { id: 'live', contextWindow: 300_000, maxTokens: 65_536 },
  available,
  null,
  { contextWindow: 128_000, maxTokens: 8_192 },
)
assert.equal(hostMetadata.contextWindow, 300_000, 'live Host context wins over an older registry value')
assert.equal(hostMetadata.maxTokens, 65_536, 'live Host output limit wins over an older registry value')

const registryFallback = serialize(
  { id: 'workbuddy' },
  { id: 'fallback', contextWindow: 0, maxTokens: -1 },
  new Set(),
  null,
  { contextWindow: 131_072, maxTokens: 16_384 },
)
assert.equal(registryFallback.contextWindow, 131_072, 'zero Host context falls back to valid registry metadata')
assert.equal(registryFallback.maxTokens, 16_384, 'negative Host output limit falls back to valid registry metadata')

const malformedValues = serialize(
  { id: 'workbuddy' },
  { id: 'bad', contextWindow: 1.5, maxTokens: 'unlimited' },
  new Set(),
  null,
  { contextWindow: Number.POSITIVE_INFINITY, maxTokens: 0 },
)
assert.equal(malformedValues.contextWindow, 0, 'fractional and non-finite values do not escape validation')
assert.equal(malformedValues.maxTokens, 0, 'invalid output boundaries remain unset')

const numericStringValues = serialize(
  { id: 'workbuddy' },
  { id: 'numeric', contextWindow: '4096', maxOutputTokens: '2048' },
  new Set(),
)
assert.equal(numericStringValues.contextWindow, 4096)
assert.equal(numericStringValues.maxTokens, 2048)

const nativeMultiplier = serialize(
  { id: 'workbuddy' },
  { id: 'zero', workBuddyMultiplier: 'x0', workBuddyMultiplierStatus: 'fresh' },
  new Set(),
)
assert.equal(nativeMultiplier.workBuddyMultiplier, 'x0', 'a zero multiplier is valid metadata')
assert.equal(nativeMultiplier.workBuddyMultiplierStatus, 'fresh')

const scorer = createModelScorer({ taskType: 'implementation', portfolio: {} })
const workBuddy = (
  id,
  multiplier,
  status = 'fresh',
  provider = 'workbuddy',
  tier = 'balanced',
  capabilityTier = null,
  capabilityTierOverride = null,
) => ({
  key: `${provider}/${id}`,
  provider,
  profile: {
    tier,
    ...(capabilityTierOverride ? { capabilityTierOverride } : {}),
  },
  ...(capabilityTier ? { capabilityTier: { tier: capabilityTier } } : {}),
  reasoning: true,
  vision: false,
  contextWindow: 128_000,
  maxTokens: 8_192,
  costPerMillion: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  ...(multiplier === undefined ? {} : { workBuddyMultiplier: multiplier }),
  workBuddyMultiplierStatus: status,
})

const zeroMultiplier = workBuddy('zero', 'x0')
const normalMultiplier = workBuddy('normal', 'x1')
const scores = scorer.scoreAll([normalMultiplier, zeroMultiplier])
assert.equal(scores[0].key, 'workbuddy/zero', 'x0 ranks below x1 within the same provider and capability group')
assert.equal(scores[0].freeModel, false, 'WorkBuddy multiplier is not treated as a USD free price')
assert.equal(scores[0].pricingKnown, false, 'default zero USD rates stay unknown without price evidence')
assert.equal(scores[0].marginalCost, null, 'native multipliers never become USD marginal cost')
assert.match(scores[0].reasons.join(' '), /同提供方同档 WorkBuddy 倍率较低/)

const unknown = scorer.score(workBuddy('unknown', 'x0', 'unknown'))
assert.equal(unknown.workBuddyMultiplierStatus, 'unknown')
assert.equal(unknown.freeModel, false, 'an unknown multiplier does not make a default-zero model free')
assert.equal(unknown.pricingKnown, false)

const stale = scorer.score(workBuddy('stale', 'x0', 'stale'), [zeroMultiplier])
assert.equal(stale.workBuddyMultiplierStatus, 'stale', 'expired source metadata is distinct from missing metadata')
assert.match(stale.reasons.join(' '), /倍率来源已过期/)

const crossProvider = scorer.scoreWorkBuddyMultiplier(
  workBuddy('one', 'x1'),
  [workBuddy('foreign-cheap', 'x0', 'fresh', 'other-provider')],
)
assert.equal(crossProvider.score, 0, 'multipliers from another provider are never compared')

const differentDeclaredCapability = scorer.scoreWorkBuddyMultiplier(
  workBuddy('strong-low', 'x0', 'fresh', 'workbuddy', 'balanced', 'strong'),
  [workBuddy('weak-high', 'x1', 'fresh', 'workbuddy', 'balanced', 'weak')],
)
assert.equal(differentDeclaredCapability.score, 0,
  'same legacy profile tier cannot group models with different declared capability tiers')

const sameCapabilityDifferentRoutingTier = scorer.scoreWorkBuddyMultiplier(
  workBuddy('strong-economy', 'x0', 'fresh', 'workbuddy', 'economy', 'strong'),
  [workBuddy('strong-premium', 'x1', 'fresh', 'workbuddy', 'premium', 'strong')],
)
assert.equal(sameCapabilityDifferentRoutingTier.score, 4,
  'same declared capability tier remains comparable despite different legacy routing tiers')

const overrideWins = scorer.scoreWorkBuddyMultiplier(
  workBuddy('override-strong', 'x0', 'fresh', 'workbuddy', 'economy', 'weak', 'strong'),
  [workBuddy('declared-strong', 'x1', 'fresh', 'workbuddy', 'premium', 'strong')],
)
assert.equal(overrideWins.score, 4, 'the explicit capability override takes precedence over the old capability tier')

const distantContext = scorer.scoreWorkBuddyMultiplier(
  { ...workBuddy('small-window', 'x0'), contextWindow: 16_000 },
  [{ ...workBuddy('large-window', 'x1'), contextWindow: 128_000 }],
)
assert.equal(distantContext.score, 0, 'models with widely different context limits are not compared')

const booleanContext = scorer.scoreWorkBuddyMultiplier(
  { ...workBuddy('bool-window', 'x0'), contextWindow: true },
  [{ ...workBuddy('normal-window', 'x1'), contextWindow: 128_000 }],
)
assert.equal(booleanContext.score, 0, 'boolean context limits are rejected as malformed metadata')

const previousHome = process.env.HOME
const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-model-metadata-'))
const workBuddyHome = path.join(testRoot, 'home')
const userDataPath = path.join(testRoot, 'user-data')
const productConfigPath = path.join(workBuddyHome, '.workbuddy', 'cache', 'acc-product-config-v3.json')
await fs.mkdir(path.dirname(productConfigPath), { recursive: true })
await fs.mkdir(userDataPath, { recursive: true })
await fs.writeFile(productConfigPath, JSON.stringify({
  models: [{ id: 'cache-only', name: 'Cache Only', credits: 'x0' }],
}), 'utf8')
const endpointListingServer = createServer((request, response) => {
  if (request.url !== '/v1/models') {
    response.statusCode = 404
    response.end('{}')
    return
  }
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ data: [{ id: 'endpoint-only' }] }))
})
await new Promise((resolve) => endpointListingServer.listen(0, '127.0.0.1', resolve))
await fs.writeFile(path.join(workBuddyHome, '.workbuddy', 'models.json'), JSON.stringify([
  {
    id: 'configured-only',
    name: 'Configured Only',
    url: `http://127.0.0.1:${endpointListingServer.address().port}/v1/chat/completions`,
    apiKey: 'synthetic-workbuddy-key',
  },
]), 'utf8')
process.env.HOME = workBuddyHome

const provider = {
  provider: 'workbuddy',
  displayName: 'WorkBuddy',
  active: false,
  settingsNs: 'llm-pi-ai',
  settingsPath: ['providers', 'workbuddy'],
}
const hostApi = {
  llm: {
    async providers() {
      return { result: { ok: true, value: { providers: [provider] } } }
    },
    async models() {
      return {
        result: {
          ok: true,
          value: {
            groups: [{
              id: 'workbuddy',
              name: 'WorkBuddy',
              models: [{ id: 'cache-only', name: 'Cache Only', contextWindow: 300_000, maxTokens: 65_536 }],
            }],
          },
        },
      }
    },
  },
  settings: {
    async describe() {
      return {
        result: {
          ok: true,
          value: {
            namespaces: [{
              ns: 'llm-pi-ai',
              value: { providers: { workbuddy: { apiKeyEnv: 'TASKWEAVER_TEST_WORKBUDDY_KEY' } } },
            }],
          },
        },
      }
    },
  },
  credentials: {
    async describe({ refs }) {
      return {
        result: {
          ok: true,
          value: {
            credentials: Object.fromEntries(refs.map((ref) => [ref, { configured: true }])),
          },
        },
      }
    },
  },
}
const service = createModelService({
  profileStore: {
    async migrateLegacyAutoRouteActiveKey() { return false },
    async listProfiles() { return {} },
    async getActiveModelKey() { return null },
    async listAddedModelKeys() { return [] },
    async getThinkingLevel() { return 'medium' },
  },
  priceRegistryPath: path.join(testRoot, 'no-price-registry.json'),
  dshHostManager: { async whenReady() { return { api: hostApi } } },
  userDataPath,
  modelRegistryUpdater: {
    async loadActiveRegistry() {
      return { source: 'bundled', registry: { registryVersion: 'test', providers: { workbuddy: {} }, models: {} } }
    },
  },
  capabilityTierService: {
    async getState() { return { source: 'bundled', stale: false, snapshot: { models: {} }, changes: [] } },
    async getAliases() { return {} },
    async refresh() { return { updated: false } },
  },
})

try {
  const freshCatalog = await service.listCatalog()
  const freshCandidate = freshCatalog.candidateModels.find((model) => model.key === 'workbuddy/cache-only')
  assert.ok(freshCandidate)
  assert.equal(freshCandidate.contextWindow, 300_000)
  assert.equal(freshCandidate.maxTokens, 65_536)
  assert.equal(freshCandidate.workBuddyMultiplier, 'x0')
  assert.equal(freshCandidate.workBuddyMultiplierStatus, 'fresh')
  assert.equal(freshCandidate.available, true, 'available retains its route-and-credential meaning')
  assert.equal(freshCandidate.routeRegistered, true, 'the Host route remains addable')
  assert.equal(freshCandidate.verificationStatus, 'unverified', 'a product-cache model is not call-verified')

  const discovery = await service.discoverProviderModels({ providerId: 'workbuddy' })
  const cacheOnlyDiscovery = discovery.find((model) => model.id === 'cache-only')
  assert.ok(cacheOnlyDiscovery)
  assert.equal(cacheOnlyDiscovery.verificationStatus, 'unverified',
    'product-cache-only models absent from the endpoint listing are not presented as verified')
  assert.equal(cacheOnlyDiscovery.workBuddyMultiplier, 'x0')
  assert.equal(cacheOnlyDiscovery.workBuddyMultiplierStatus, 'fresh')
  assert.ok(discovery.some((model) => model.id === 'endpoint-only'), 'endpoint-listed rows remain discoverable')
  assert.equal(JSON.stringify(discovery).includes('synthetic-workbuddy-key'), false,
    'WorkBuddy source credentials never enter discovery results')

  const stat = await fs.stat(productConfigPath)
  await fs.utimes(productConfigPath, stat.atime, new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000))
  const staleCatalog = await service.listCatalog()
  const staleCandidate = staleCatalog.candidateModels.find((model) => model.key === 'workbuddy/cache-only')
  assert.equal(staleCandidate.workBuddyMultiplier, 'x0', 'stale source value remains visible for inspection')
  assert.equal(staleCandidate.workBuddyMultiplierStatus, 'stale')
  assert.equal(staleCandidate.available, true, 'multiplier expiry does not change route availability')
  assert.equal(staleCandidate.routeRegistered, true, 'multiplier expiry does not break model addability')
} finally {
  await service.dispose()
  await new Promise((resolve, reject) => endpointListingServer.close((error) => error ? reject(error) : resolve()))
  if (previousHome === undefined) delete process.env.HOME
  else process.env.HOME = previousHome
  await fs.rm(testRoot, { recursive: true, force: true })
}

console.log('model metadata and WorkBuddy routing checks passed')
