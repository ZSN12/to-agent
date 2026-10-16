import assert from 'node:assert/strict'
import { createSemanticSearchSettingsService } from '../backend/semantic-search-settings.mjs'

const state = {
  provider: 'jina',
  revision: 3,
  credentials: {},
  readonlyRefs: new Set(),
  writes: [],
}
const directory = {
  api: {
    credentials: {
      async describe({ refs }) {
        return { result: { ok: true, value: { credentials: Object.fromEntries(refs.map(ref => [ref, {
          configured: Boolean(state.credentials[ref]),
          writable: !state.readonlyRefs.has(ref),
          ...(state.credentials[ref] ? { source: 'file' } : {}),
        }])) } } }
      },
      async set({ ref, value }) {
        state.writes.push({ kind: 'set', ref, value })
        state.credentials[ref] = value
        return { result: { ok: true, value: {} } }
      },
      async unset({ ref }) {
        state.writes.push({ kind: 'unset', ref })
        delete state.credentials[ref]
        return { result: { ok: true, value: {} } }
      },
    },
    settings: {
      async describe() {
        return { result: { ok: true, value: {
          writable: true,
          namespaces: [{ ns: 'tool-fs-semantic-search', value: { embeddingProvider: state.provider }, applies: 'live', revision: state.revision }],
        } } }
      },
      async update(payload) {
        state.writes.push({ kind: 'update', ...payload })
        state.provider = payload.patch.embeddingProvider
        state.revision += 1
        return { result: { ok: true, value: {} } }
      },
    },
  },
}

const service = createSemanticSearchSettingsService({ getDirectory: async () => directory })
const initial = await service.get()
assert.equal(initial.embeddingProvider, 'jina')
assert.equal(initial.enabled, false)
assert.equal(initial.credentials.jina.configured, false)
assert.equal(JSON.stringify(initial).includes('secret'), false, 'status responses must never expose a credential value')

const saved = await service.save({ embeddingProvider: 'openai', apiKey: '  test-secret-value  ' })
assert.equal(saved.embeddingProvider, 'openai')
assert.equal(saved.enabled, true)
assert.equal(saved.credentials.openai.configured, true)
assert.equal('apiKey' in saved, false)
assert.deepEqual(state.writes.slice(0, 2), [
  { kind: 'set', ref: 'OPENAI_API_KEY', value: 'test-secret-value' },
  { kind: 'update', ns: 'tool-fs-semantic-search', patch: { embeddingProvider: 'openai' }, expectedRevision: 3 },
])

await assert.rejects(service.save({ embeddingProvider: 'unsupported', apiKey: 'secret' }), /只能选择 Jina 或 OpenAI/u)
assert.equal(state.writes.length, 2, 'invalid providers must not write credentials or settings')

state.readonlyRefs.add('OPENAI_API_KEY')
await assert.rejects(service.save({ embeddingProvider: 'openai', apiKey: 'replacement' }), /只读来源/u)
assert.equal(state.writes.length, 2, 'a read-only credential must not be overwritten')
state.readonlyRefs.clear()

const cleared = await service.save({ embeddingProvider: 'openai', clearApiKey: true })
assert.equal(cleared.enabled, false)
assert.equal(cleared.credentials.openai.configured, false)
assert.equal(state.writes[2].kind, 'unset')

console.log('test-semantic-search-settings: ok (redaction, save, validation, read-only and removal)')
