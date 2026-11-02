import assert from 'node:assert/strict'
import { createProviderCredentialHelpers } from '../backend/model/provider-credential-helpers.mjs'
import { createModelCredentials } from '../backend/model/credentials.mjs'

const loginCalls = []
const directory = {
  providers: [
    {
      provider: 'bridge-composer',
      displayName: 'Composer（内置桥）',
      settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'bridge-composer'],
      active: false,
    },
    {
      provider: 'bridge-antigravity',
      displayName: 'Antigravity（内置桥）',
      settingsNs: 'llm-pi-ai',
      settingsPath: ['providers', 'bridge-antigravity'],
      active: true,
    },
  ],
  groups: [
    {
      id: 'bridge-composer',
      models: [{ id: 'cursor/composer-2.5', name: 'Composer 2.5' }],
    },
    {
      id: 'bridge-antigravity',
      models: [{ id: 'google-antigravity/gemini-3.8-flash', name: 'Gemini 3.8 Flash' }],
    },
  ],
  namespaces: [{
    ns: 'llm-pi-ai',
    writable: true,
    value: {
      providers: {
        'bridge-composer': {},
        'bridge-antigravity': {},
      },
    },
  }],
  api: {
    credentials: {
      describe: async () => {
        throw new Error('built-in bridge auth must use local subscription status')
      },
    },
  },
}

const directoryClient = {
  fetchDshModelDirectoryOnce: async () => directory,
  getDshModelDirectory: async () => directory,
}
const providerAuth = createProviderCredentialHelpers({
  userDataPath: '/tmp/taskweaver-bridge-model-test',
  directoryClient,
  fetchBridgeLogins: async (userDataPath) => {
    loginCalls.push(userDataPath)
    return { cursor: true, 'google-antigravity': false }
  },
})

const mockProviderAuth = createProviderCredentialHelpers({
  userDataPath: '/tmp/taskweaver-bridge-model-test',
  directoryClient,
  fetchBridgeLogins: async () => ({}),
  isUiVerifyMockModelEnabled: () => true,
})

const composerRow = directory.providers[0]
const antigravityRow = directory.providers[1]
assert.equal(await providerAuth.isProviderCredentialConfigured(directory, composerRow), true)
assert.equal(await providerAuth.isProviderCredentialConfigured(directory, antigravityRow), false)

const candidateModels = [
  {
    key: 'bridge-composer/cursor/composer-2.5',
    provider: 'bridge-composer',
    routeRegistered: true,
    available: true,
  },
  {
    key: 'bridge-antigravity/google-antigravity/gemini-3.8-flash',
    provider: 'bridge-antigravity',
    routeRegistered: true,
    available: true,
  },
]
const availableKeys = new Set(candidateModels.map((model) => model.key))
const providerById = new Map(directory.providers.map((provider) => [provider.provider, {
  id: provider.provider,
  name: provider.displayName,
  active: provider.active,
}]))
await providerAuth.applyCredentialBasedAvailability(
  directory,
  providerById,
  availableKeys,
  candidateModels,
  candidateModels.map((model) => model.key),
)
assert.equal(candidateModels[0].available, true, 'a logged-in local Cursor subscription makes its registered bridge model available')
assert.equal(candidateModels[1].available, false, 'a registered bridge model must be unavailable after local login expires')
assert.equal(availableKeys.has(candidateModels[1].key), false, 'an active-looking Host row cannot override a missing local bridge login')

const uiVerifyMock = {
  key: 'bridge-composer/cursor/composer-2.5-fast',
  provider: 'bridge-composer',
  routeRegistered: true,
  available: false,
}
const uiVerifyMockKeys = new Set()
await mockProviderAuth.applyCredentialBasedAvailability(
  directory,
  new Map(),
  uiVerifyMockKeys,
  [uiVerifyMock],
  [uiVerifyMock.key],
)
assert.equal(uiVerifyMock.available, true, 'the isolated UI verification fixture remains selectable without a real Cursor login')
assert.equal(uiVerifyMockKeys.has(uiVerifyMock.key), true)

const credentials = createModelCredentials({
  userDataPath: null,
  profileStore: {},
  modelRegistryUpdater: null,
  directoryClient,
  hostSync: { applyRegistryAdditions: async () => directory },
  catalogApi: {},
  resolveDshCredentialRef: async () => ({}),
  getBridgeProviderAuthorization: providerAuth.getBridgeProviderAuthorization,
})
const auth = await credentials.listProvidersAuth()
assert.equal(auth.find((provider) => provider.id === 'bridge-composer')?.configured, true)
assert.equal(auth.find((provider) => provider.id === 'bridge-composer')?.authType, 'local_subscription')
assert.equal(auth.find((provider) => provider.id === 'bridge-antigravity')?.configured, false)
assert.equal(loginCalls.length, 1, 'repeated catalog/auth checks briefly share one local login status snapshot')

console.log('bridge model availability checks passed: local subscription auth, routable models, missing-login gating, and provider status')
