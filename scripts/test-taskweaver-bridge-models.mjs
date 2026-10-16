import assert from 'node:assert/strict'
import {
  bridgeProfilesFromModelsDoc,
  bridgeProviderBlockToDshProfile,
  splitModelsDocProviders,
} from '../backend/taskweaver-bridge-models.mjs'
import { piProviderBlockToDshProfile, profilesFromModelsDoc } from '../backend/pi-models-to-dsh-profile.mjs'

const doc = {
  providers: {
    'bridge-composer': {
      name: 'Composer',
      api: 'taskweaver-bridge',
      bridgeKind: 'cursor',
      models: [{ id: 'cursor/composer-2.5-fast', name: 'Composer Fast' }],
    },
    opencodex: { name: 'OpenCodex', baseUrl: 'http://127.0.0.1:10100/v1', models: [] },
    'openai-codex': {
      name: 'ChatGPT subscription',
      models: [{
        id: 'gpt-6-luna',
        name: 'GPT-6 Luna',
        api: 'openai-codex-responses',
        contextWindow: 272_000,
        maxTokens: 2_048,
      }],
    },
  },
}

const { bridgeIds, piAiIds } = splitModelsDocProviders(doc)
assert.deepEqual(bridgeIds, ['bridge-composer'])
assert.deepEqual(piAiIds, ['opencodex', 'openai-codex'], 'native OAuth providers need a pi-ai profile even without a baseUrl')

const bridge = bridgeProfilesFromModelsDoc(doc, bridgeIds)
assert.equal(bridge['bridge-composer'].bridgeKind, 'cursor')
assert.equal(bridge['bridge-composer'].displayName, 'Composer')
assert.equal(bridge['bridge-composer'].models[0].id, 'cursor/composer-2.5-fast')

const one = bridgeProviderBlockToDshProfile('bridge-composer', doc.providers['bridge-composer'])
assert.equal(one.bridgeKind, 'cursor')

assert.deepEqual(Object.keys(profilesFromModelsDoc(doc, [])), [], 'empty piAiIds must not sync all providers into llm-pi-ai')
const codexProfile = profilesFromModelsDoc(doc, ['openai-codex'])['openai-codex']
assert.equal(codexProfile.models[0].id, 'gpt-6-luna')
assert.equal(Object.hasOwn(codexProfile, 'api'), false,
  'native OAuth protocol must be inherited from the installed provider catalog')
assert.equal(codexProfile.models[0].contextWindow, 272_000)
assert.equal(codexProfile.models[0].maxTokens, 2_048)
assert.equal(Object.hasOwn(codexProfile, 'apiKeyEnv'), false,
  'OAuth-only providers must keep native auth instead of naming a missing API-key reference')
assert.equal(Object.hasOwn(piProviderBlockToDshProfile('openai-codex', {
  api: 'openai-codex-responses',
  models: [{ id: 'gpt-6-luna', api: 'openai-codex-responses' }],
}), 'api'), false, 'matching native provider and model APIs stay on the catalog route')
assert.throws(() => piProviderBlockToDshProfile('openai-codex', {
  models: [{ id: 'model-a', api: 'openai-responses' }],
}), /必须使用内置 OAuth 协议/)
assert.throws(() => piProviderBlockToDshProfile('mixed-provider', {
  models: [
    { id: 'model-a', api: 'openai-codex-responses' },
    { id: 'model-b', api: 'openai-completions' },
  ],
}), /多个模型 API/)
assert.throws(() => piProviderBlockToDshProfile('mixed-provider', {
  api: 'openai-completions',
  models: [{ id: 'model-a', api: 'openai-codex-responses' }],
}), /模型 API 与提供方 API 冲突/)
const customProfile = profilesFromModelsDoc({ providers: { 'custom-gateway': { models: [] } } }, ['custom-gateway'])['custom-gateway']
assert.equal(customProfile.apiKeyEnv, 'TASKWEAVER_CUSTOM_GATEWAY_API_KEY',
  'API-key routes continue to receive an isolated credential reference')
assert.equal(piProviderBlockToDshProfile('constructor', { models: [] }).apiKeyEnv, 'TASKWEAVER_CONSTRUCTOR_API_KEY',
  'provider ids inherited from Object.prototype must not be classified as native OAuth routes')

console.log('test-taskweaver-bridge-models: ok')
