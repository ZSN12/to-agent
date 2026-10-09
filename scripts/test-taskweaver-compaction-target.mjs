import assert from 'node:assert/strict'
import {
  resolveCompactionSummarizationFromModelsDoc,
} from '../electron/backend/taskweaver-compaction-target.mjs'

const doc = {
  providers: {
    opencodex: {
      apiKey: 'x',
      models: [{ id: 'composer-2.5' }],
    },
    'my-gateway': {
      apiKey: 'secret',
      models: [
        { id: 'tier', isTierVariant: true },
        { id: 'fast-model', name: 'Fast' },
      ],
    },
  },
}

const picked = await resolveCompactionSummarizationFromModelsDoc(doc)
assert.deepEqual(picked, { provider: 'my-gateway', model: 'fast-model' })

const onlyOcx = await resolveCompactionSummarizationFromModelsDoc({
  providers: {
    opencodex: {
      baseUrl: 'http://127.0.0.1:10100/v1',
      models: [
        { id: 'cursor/composer-2.5' },
        { id: 'cursor/composer-2.5-fast' },
      ],
    },
  },
})
assert.deepEqual(onlyOcx, { provider: 'opencodex', model: 'cursor/composer-2.5-fast' })

const ocxAfterApi = await resolveCompactionSummarizationFromModelsDoc({
  providers: {
    opencodex: { baseUrl: 'http://127.0.0.1:10100/v1', models: [{ id: 'cursor/composer-2.5' }] },
    other: { apiKey: 'k', models: [{ id: 'small' }] },
  },
})
assert.deepEqual(ocxAfterApi, { provider: 'other', model: 'small' })

console.log('taskweaver-compaction-target tests passed')
