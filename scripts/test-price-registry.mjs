import assert from 'node:assert/strict'
import { mergeRegistryCost } from '../electron/backend/price-registry.mjs'

const registry = {
  version: 1,
  synced_at: '2026-09-24T08:00:00+08:00',
  models: {
    'deepseek/deepseek-chat': {
      input_per_million: 2,
      output_per_million: 8,
      cache_read_per_million: 0.2,
      currency: 'CNY',
      source: 'seed:manual',
      confidence: 'medium',
    },
  },
}

const merged = mergeRegistryCost(
  'deepseek/deepseek-chat',
  { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 },
  registry,
)
assert.equal(merged.cost.input, 2)
assert.equal(merged.cost.output, 8)
assert.ok(merged.priceMeta)

const fallback = mergeRegistryCost('unknown/model', { input: 3, output: 4, cacheRead: 0, cacheWrite: 0 }, registry)
assert.equal(fallback.cost.input, 3)
assert.equal(fallback.priceMeta, null)

console.log('price-registry checks passed: merge overrides and fallback')
