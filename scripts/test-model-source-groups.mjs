// Run: node --import tsx scripts/test-model-source-groups.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildModelSourceGroups } from '../src/features/models/utils/model-source-groups.ts'

const model = (provider, id, fields = {}) => ({ provider, id, key: `${provider}/${id}`, name: id, ...fields })
const provider = (id, fields = {}) => ({ id, name: id, configured: false, authType: null, writable: false, source: null, ...fields })
const custom = (id, fields = {}) => ({ id, name: id, baseUrl: 'https://example.test/v1', api: 'openai-responses', models: [], ...fields })
const build = fields => buildModelSourceGroups({ auth: [], models: [], customList: [], query: '', isCodexConfigured: false, ...fields })

test('missing inputs and configured empty subscription/provider groups retain their rules', () => {
  assert.deepEqual(build({ auth: undefined, isCodexConfigured: true }), [])
  assert.deepEqual(build({ models: null, isCodexConfigured: true }), [])
  assert.deepEqual(build({}), [])
  const groups = build({ isCodexConfigured: true, auth: [
    provider('anthropic', { authorizationMethods: [{ id: 'oauth', label: 'OAuth' }] }),
    provider('ready', { configured: true, authType: 'api-key', writable: true }),
    provider('empty'),
  ] })
  assert.deepEqual(groups.map(group => [group.id, group.kind, group.configured, group.models.length]), [
    ['openai-codex', 'codex', true, 0], ['anthropic', 'anthropic', false, 0], ['ready', 'builtin', true, 0],
  ])
  assert.equal(groups[2].authType, 'api-key')
  assert.equal(groups[2].writable, true)
})

test('mixed source priority, model order, custom entry access and unknown fallback stay unchanged', () => {
  const gateway = custom('custom-gateway', { name: 'Gateway' })
  const input = [model('unknown-z', 'z1'), model('ready', 'r'), model('anthropic', 'claude'),
    model('openai-codex', 'gpt'), model('custom-gateway', 'gw'), model('unknown-z', 'z2'),
    model('custom-orphan', 'orphan'), model('known', 'k'), model('unknown-a', 'a')]
  const groups = build({ models: input, customList: [gateway], auth: [
    provider('known'), provider('ready', { configured: true }), provider('anthropic'),
    provider('custom-orphan', { configured: true }),
  ] })
  assert.deepEqual(groups.map(group => group.id), [
    'openai-codex', 'anthropic', 'custom-gateway', 'known', 'ready', 'unknown-z', 'custom-orphan', 'unknown-a',
  ])
  assert.deepEqual(groups[5].models.map(item => item.id), ['z1', 'z2'])
  assert.equal(groups[2].rawCustomEntry, gateway)
  assert.equal('typeLabel' in groups[2], false)
  assert.equal('baseUrl' in groups[2], false)
  assert.equal('api' in groups[2], false)
  assert.equal(groups[2].models[0], input[4])
  assert.deepEqual(build({ models: [model('anthropic', 'external')] }).map(group => group.kind), ['builtin'],
    'Anthropic models without an auth descriptor retain the generic fallback')
})

test('source-only queries keep empty model lists; model queries match name/id/key case-insensitively', () => {
  const groups = build({ isCodexConfigured: true, query: '  订阅  ', auth: [provider('anthropic', { configured: true })],
    models: [model('openai-codex', 'gpt'), model('anthropic', 'claude')] })
  assert.deepEqual(groups.map(group => [group.id, group.models.length]), [['openai-codex', 0], ['anthropic', 0]])
  const input = [model('custom-gateway', 'identifier', { key: 'lookup-key', name: 'Visible Model' })]
  const customList = [custom('custom-gateway', { name: 'Human Gateway', api: 'openai-completions' })]
  const bySource = build({ models: input, customList, query: 'human' })
  assert.equal(bySource.length, 1)
  assert.deepEqual(bySource[0].models, [])
  assert.equal(bySource[0].rawCustomEntry, customList[0], 'raw provider details remain available to edit and probe')
  for (const query of ['VISIBLE', 'identifier', 'lookup-KEY']) {
    assert.deepEqual(build({ models: input, customList, query }).map(group => group.models), [input])
  }
  assert.deepEqual(build({ models: input, customList, query: 'unmatched' }), [])
})

test('bridge/opencodex visibility uses both bridge markers and preserves real opencodex models', () => {
  const auth = [provider('opencodex', { configured: true })]
  assert.deepEqual(build({ auth }).map(group => group.id), ['opencodex'])
  for (const bridge of [model('bridge-composer', 'composer'), model('external', 'route', { key: 'bridge-custom/route' })]) {
    const hidden = build({ auth, models: [bridge] })
    assert.equal(hidden.some(group => group.id === 'opencodex'), false)
    const visible = build({ auth, models: [bridge, model('opencodex', 'real')] })
    assert.equal(visible[0].id, 'opencodex')
  }
  assert.deepEqual(build({ auth: [...auth, provider('bridge-composer')] }), [])
})

test('custom/auth duplicate ids preserve both existing groups', () => {
  const input = [model('gateway', 'm')]
  const groups = build({ auth: [provider('gateway', { configured: true })], customList: [custom('gateway')], models: input })
  assert.deepEqual(groups.map(group => [group.id, group.kind, group.models]), [
    ['gateway', 'custom', input], ['gateway', 'builtin', input],
  ])
})

test('provider bucketing reads each model provider once as provider counts grow', () => {
  for (const providerCount of [50, 100]) {
    let providerReads = 0, nameReads = 0
    const models = Array.from({ length: providerCount * 20 }, (_, index) => {
      const providerId = `provider-${Math.floor(index / 20)}`
      return { id: `model-${index}`, key: `route-${index}`,
        get provider() { providerReads += 1; return providerId },
        get name() { nameReads += 1; return 'Model' },
      }
    })
    const auth = Array.from({ length: providerCount }, (_, index) => provider(`provider-${index}`))
    const groups = build({ models, auth })
    assert.equal(groups.length, providerCount)
    assert.equal(providerReads, models.length, 'membership work is one pass rather than one scan per provider')
    assert.equal(nameReads, 0, 'an empty query does not inspect model search text')
    providerReads = 0
    assert.deepEqual(build({ models, auth, query: 'no-match' }), [])
    assert.equal(providerReads, models.length)
    assert.equal(nameReads, models.length, 'a nonempty query filters each model bucket once')
  }
})
