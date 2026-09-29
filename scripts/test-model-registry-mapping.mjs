#!/usr/bin/env node
/**
 * Exercise registry validation and a real modelAdditions -> llm.models route
 * through the bundled Z Host. No provider request is sent to an LLM endpoint.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProfileStore } from '../electron/backend/profile-store.mjs'
import { createModelService } from '../electron/backend/model-service.mjs'
import { createModelRegistryUpdater } from '../electron/backend/model-registry-updater.mjs'
import { createZHostManager, resolveTaskWeaverRuntimeRoot } from '../electron/agent/z-host/index.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = resolveTaskWeaverRuntimeRoot({
  appPath: projectRoot,
  resourcesPath: null,
  isPackaged: false,
  env: process.env,
})
const bundledRegistryPath = path.join(projectRoot, 'registry', 'model-registry.v1.json')
const bundledRegistry = JSON.parse(await fs.readFile(bundledRegistryPath, 'utf8'))
const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-registry-mapping-'))
const hostManager = createZHostManager({
  runtimeRoot,
  userDataPath: userData,
  executable: process.execPath,
  startTimeoutMs: 60_000,
})

const modelRegistryUpdater = createModelRegistryUpdater({
  userDataPath: userData,
  bundledRegistryPath,
  currentAppVersion: '1.0.0',
  runtimeLockPath: path.join(projectRoot, 'runtime-lock.json'),
  publicKeyDer: (await fs.readFile(path.join(projectRoot, 'registry', 'model-registry-public-key.der.b64'), 'utf8')).trim(),
  fetchImpl: async () => new Response('{}', { status: 404 }),
})
const modelService = createModelService({
  profileStore: createProfileStore(userData),
  priceRegistryPath: path.join(projectRoot, 'pricing/registry.json'),
  dshHostManager: hostManager,
  userDataPath: userData,
  dshRuntimeRoot: runtimeRoot,
  modelRegistryUpdater,
})

try {
  await hostManager.start()
  await modelService.validateRegistryMapping(bundledRegistry)

  const invalidProviderRegistry = {
    ...bundledRegistry,
    providers: { ...bundledRegistry.providers, 'not-in-runtime': { protocols: ['openai-completions'] } },
    models: {
      ...bundledRegistry.models,
      'not-in-runtime/model': { provider: 'not-in-runtime', id: 'model', api: 'openai-completions' },
    },
  }
  await assert.rejects(modelService.validateRegistryMapping(invalidProviderRegistry), /未注册提供方/)

  // Anthropic is a DSH-managed pi-ai provider; its Anthropic protocol is
  // accepted by this Runtime and does not trigger OpenAI /models discovery.
  const providerId = 'anthropic'
  const modelId = 'taskweaver-registry-routing-test'
  const modelKey = `${providerId}/${modelId}`
  const testRegistry = {
    ...bundledRegistry,
    registryVersion: `${bundledRegistry.registryVersion}-routing-test`,
    providers: {
      ...bundledRegistry.providers,
      [providerId]: { ...bundledRegistry.providers[providerId], protocols: ['anthropic-messages'] },
    },
    models: {
      ...bundledRegistry.models,
      [modelKey]: {
        provider: providerId,
        id: modelId,
        name: 'TaskWeaver Registry Routing Test',
        api: 'anthropic-messages',
        contextWindow: 16384,
        maxTokens: 4096,
        input: ['text'],
        deprecated: false,
      },
    },
  }
  await modelService.validateRegistryMapping(testRegistry)
  const registryDirectory = path.join(userData, 'model-registry')
  await fs.mkdir(registryDirectory, { recursive: true })
  await fs.writeFile(path.join(registryDirectory, 'active.json'), `${JSON.stringify(testRegistry, null, 2)}\n`)

  await modelService.setProviderApiKey(providerId, 'test-registry-routing-key')
  const beforeAdd = await modelService.listCatalog()
  const candidate = beforeAdd.candidateModels.find((model) => model.key === modelKey)
  assert.ok(candidate, 'registry-only model should be offered as an add candidate')
  assert.equal(candidate.routeRegistered, false, 'model must not claim a route before explicit add')

  const afterAdd = await modelService.addModel(modelKey)
  const routed = afterAdd.models.find((model) => model.key === modelKey)
  assert.ok(routed, "explicitly added model should appear in the user's model list")
  assert.equal(routed.routeRegistered, true, 'Z Host must report the model as routable')
  assert.equal(routed.available, true, 'configured provider credentials should make it available')

  const { api } = await hostManager.start()
  const llmReply = await api.llm.models({})
  const llmModels = llmReply?.result?.value ?? llmReply?.result ?? llmReply
  assert.ok(
    (llmModels.groups ?? []).some((group) => group.id === providerId
      && group.models?.some((model) => model.id === modelId)),
    'modelAdditions must become visible in the real Z Host llm.models API',
  )

  console.log('model-registry-mapping checks passed: registry protocol validation and explicit modelAdditions routing through Z Host')
} finally {
  await modelService.dispose()
  await hostManager.stop().catch(() => {})
  await fs.rm(userData, { recursive: true, force: true })
}
