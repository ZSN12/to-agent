import assert from 'node:assert/strict'
import {
  bridgeProfilesFromModelsDoc,
  bridgeProviderBlockToDshProfile,
  splitModelsDocProviders,
} from '../electron/backend/taskweaver-bridge-models.mjs'
import { profilesFromModelsDoc } from '../electron/backend/pi-models-to-dsh-profile.mjs'

const doc = {
  providers: {
    'bridge-composer': {
      name: 'Composer',
      api: 'taskweaver-bridge',
      bridgeKind: 'cursor',
      models: [{ id: 'cursor/composer-2.5-fast', name: 'Composer Fast' }],
    },
    opencodex: { name: 'OpenCodex', baseUrl: 'http://127.0.0.1:10100/v1', models: [] },
  },
}

const { bridgeIds, piAiIds } = splitModelsDocProviders(doc)
assert.deepEqual(bridgeIds, ['bridge-composer'])
assert.deepEqual(piAiIds, ['opencodex'])

const bridge = bridgeProfilesFromModelsDoc(doc, bridgeIds)
assert.equal(bridge['bridge-composer'].bridgeKind, 'cursor')
assert.equal(bridge['bridge-composer'].displayName, 'Composer')
assert.equal(bridge['bridge-composer'].models[0].id, 'cursor/composer-2.5-fast')

const one = bridgeProviderBlockToDshProfile('bridge-composer', doc.providers['bridge-composer'])
assert.equal(one.bridgeKind, 'cursor')

assert.deepEqual(Object.keys(profilesFromModelsDoc(doc, [])), [], 'empty piAiIds must not sync all providers into llm-pi-ai')

console.log('test-taskweaver-bridge-models: ok')
