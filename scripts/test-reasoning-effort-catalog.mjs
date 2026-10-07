import assert from 'node:assert/strict'
import { reasoningCatalogFromHostModel } from '../electron/backend/reasoning-effort-catalog.mjs'

const xiaomi = reasoningCatalogFromHostModel({
  reasoning: {
    defaultEffort: 'medium',
    efforts: [
      { id: 'off', name: 'Off' },
      { id: 'low', name: 'Low' },
      { id: 'medium', name: 'Medium' },
      { id: 'high', name: 'High' },
    ],
  },
})
assert.deepEqual(xiaomi.supportedThinkingLevels, ['off', 'low', 'medium', 'high'])
assert.equal(xiaomi.defaultThinkingLevel, 'medium')
assert.equal(xiaomi.reasoningEfforts.length, 4)

const composer = reasoningCatalogFromHostModel({
  reasoning: {
    defaultEffort: 'low',
    efforts: [
      { id: 'off', name: 'Off' },
      { id: 'minimal', name: 'Minimal' },
      { id: 'low', name: 'Low' },
      { id: 'medium', name: 'Medium' },
      { id: 'high', name: 'High' },
      { id: 'xhigh', name: 'Extra High' },
    ],
  },
})
assert.ok(composer.supportedThinkingLevels.includes('xhigh'), 'must pass through provider-specific effort ids')
assert.equal(composer.defaultThinkingLevel, 'low')

const plain = reasoningCatalogFromHostModel({ id: 'gpt', name: 'gpt' })
assert.equal(plain.reasoning, false)
assert.deepEqual(plain.supportedThinkingLevels, [])

console.log('test-reasoning-effort-catalog: ok')
