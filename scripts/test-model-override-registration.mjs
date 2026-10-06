/**
 * Verify that a registry model already present in the bundled pi-ai catalog is
 * routed through modelOverrides (not modelAdditions) and becomes selectable.
 * No provider request is made; the Host API is an in-memory contract fixture.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createModelService } from '../electron/backend/model-service.mjs'
import { createModelRegistryUpdater } from '../electron/backend/model-registry-updater.mjs'
import { createProfileStore } from '../electron/backend/profile-store.mjs'
import { resolveTaskWeaverRuntimeRoot } from '../electron/agent/z-host/index.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = resolveTaskWeaverRuntimeRoot({
  appPath: projectRoot,
  resourcesPath: null,
  isPackaged: false,
  env: process.env,
})
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'taskweaver-model-override-'))
const modelId = 'deepseek-v4-pro'
const providerId = 'deepseek'
const modelKey = `${providerId}/${modelId}`
const namespace = {
  ns: 'llm-pi-ai',
  revision: 1,
  writable: true,
  value: {
    providers: {
      [providerId]: { api: 'openai-completions', apiKeyEnv: 'TEST_DEEPSEEK_KEY' },
    },
  },
}
const provider = {
  provider: providerId,
  displayName: 'DeepSeek test provider',
  active: false,
  settingsNs: 'llm-pi-ai',
  settingsPath: ['providers', providerId],
}
const api = {
  llm: {
    providers: async () => ({ value: { providers: [provider] } }),
    models: async () => {
      const override = namespace.value.providers[providerId].modelOverrides?.[modelId]
      return {
        value: {
          groups: override
            ? [{
                id: providerId,
                name: provider.displayName,
                models: [{
                  id: modelId,
                  name: override.name,
                  reasoning: { efforts: Object.keys(override.reasoningEfforts ?? {}).map((id) => ({ id })) },
                }],
              }]
            : [],
        },
      }
    },
  },
  settings: {
    describe: async () => ({ value: { namespaces: [{ ...namespace }] } }),
    mutate: async ({ expectedRevision, ops }) => {
      assert.equal(expectedRevision, namespace.revision)
      for (const operation of ops) {
        assert.equal(operation.op, 'set')
        let target = namespace.value
        for (const key of operation.path.slice(0, -1)) target = target[key] ??= {}
        target[operation.path.at(-1)] = operation.value
      }
      namespace.revision += 1
      return { value: { revision: namespace.revision } }
    },
  },
  credentials: {
    describe: async ({ refs }) => ({
      value: { credentials: Object.fromEntries(refs.map((ref) => [ref, { configured: true, writable: true }])) },
    }),
  },
}
const hostManager = { start: async () => ({ api }), stop: async () => {} }
const addedKeys = []
const profileStore = {
  migrateLegacyAutoRouteActiveKey: async () => false,
  listProfiles: async () => ({}),
  getActiveModelKey: async () => null,
  listAddedModelKeys: async () => [...addedKeys],
  getThinkingLevel: async () => 'high',
  getProfile: async () => null,
  addModel: async (key) => { if (!addedKeys.includes(key)) addedKeys.push(key) },
  removeModel: async (key) => { const index = addedKeys.indexOf(key); if (index >= 0) addedKeys.splice(index, 1) },
}
const registryUpdater = createModelRegistryUpdater({
  userDataPath: userData,
  bundledRegistryPath: path.join(projectRoot, 'registry/model-registry.v1.json'),
  currentAppVersion: '1.0.0',
})
const service = createModelService({
  profileStore,
  priceRegistryPath: path.join(projectRoot, 'pricing/registry.json'),
  dshHostManager: hostManager,
  dshRuntimeRoot: runtimeRoot,
  modelRegistryUpdater: registryUpdater,
})

try {
  const before = (await service.listCatalog()).candidateModels.find((model) => model.key === modelKey)
  assert.ok(before, 'signed registry model should appear as a candidate')
  assert.equal(before.routeRegistered, false)
  assert.equal(before.available, false, 'configured credentials must not masquerade as a registered model route')

  const afterCatalog = await service.addModel(modelKey)
  const after = afterCatalog.models.find((model) => model.key === modelKey)
  assert.ok(after)
  assert.equal(after.routeRegistered, true, 'the real model directory must confirm the route')
  assert.deepEqual(namespace.value.providers[providerId].modelAdditions ?? [], [])
  assert.equal(namespace.value.providers[providerId].modelOverrides[modelId].contextWindow, 1_000_000)
  assert.equal('id' in namespace.value.providers[providerId].modelOverrides[modelId], false)
  assert.deepEqual(await service.getDshModelConfig(modelKey), {
    provider: providerId,
    id: modelId,
    name: 'DeepSeek V4 Pro',
    reasoning: true,
    supportedThinkingLevels: ['off', 'minimal', 'low', 'medium', 'high', 'max'],
    defaultThinkingLevel: 'high',
  })
  console.log('model override registration passed: bundled pi-ai model is overridden, route-confirmed, and resolvable')
} finally {
  await service.dispose()
  fs.rmSync(userData, { recursive: true, force: true })
}
