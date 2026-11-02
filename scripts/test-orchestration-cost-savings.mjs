import assert from 'node:assert/strict'
import { calculateCostSavings, createRunPricingSnapshot } from '../backend/orchestration/cost-savings.mjs'

function model(costPerMillion, overrides = {}) {
  return {
    costPerMillion,
    priceMeta: {
      currency: 'USD',
      confidence: 'high',
      stale: false,
      hasInputPrice: true,
      hasOutputPrice: true,
      hasCacheReadPrice: true,
      hasCacheWritePrice: true,
      ...overrides,
    },
  }
}

function snapshot(models, flagshipModelKey = 'flagship/model') {
  return { capturedAt: '2026-10-30T12:00:00.000Z', flagshipModelKey, models }
}

function approximately(actual, expected, epsilon = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`)
}

const capturedPricing = createRunPricingSnapshot({
  models: [
    { key: 'lite/model', available: true, capabilityTier: { tier: 'weak' }, ...model({ input: 1, output: 4 }) },
    { key: 'strong/cheap', available: true, capabilityTier: { tier: 'strong' }, contextWindow: 128_000, ...model({ input: 5, output: 15 }) },
  ],
  candidateModels: [
    { key: 'strong/premium', available: true, capabilityTier: { tier: 'strong' }, contextWindow: 64_000, ...model({ input: 10, output: 30 }) },
    { key: 'strong/unavailable', available: false, capabilityTier: { tier: 'strong' }, ...model({ input: 99, output: 99 }) },
  ],
}, '2026-10-30T12:00:00.000Z')
assert.equal(capturedPricing.capturedAt, '2026-10-30T12:00:00.000Z')
assert.equal(capturedPricing.flagshipModelKey, 'strong/premium', 'the available, most-premium strong-tier model is the baseline')
assert.deepEqual(Object.keys(capturedPricing.models).sort(), ['lite/model', 'strong/cheap', 'strong/premium', 'strong/unavailable'])

const prices = snapshot({
  'lite/model': model({ input: 1, output: 4, cacheRead: 0.1, cacheWrite: 0.5 }),
  'flagship/model': model({ input: 10, output: 20, cacheRead: 1, cacheWrite: 5 }),
})

const records = [
  { taskId: 'planner', attempt: 1, modelKey: 'lite/model', outcome: 'success', usage: { inputTokens: 100, outputTokens: 40, cacheReadTokens: 20, cacheWriteTokens: 5, costUsd: 99 } },
  { taskId: 'T1', attempt: 1, modelKey: 'lite/model', outcome: 'failed', usage: { inputTokens: 50, outputTokens: 10, cacheReadTokens: 3, cacheWriteTokens: 2, costUsd: 99 } },
  { taskId: 'T1', attempt: 2, modelKey: 'lite/model', outcome: 'success', usage: { inputTokens: 60, outputTokens: 20, cacheReadTokens: 4, cacheWriteTokens: 1, costUsd: 99 } },
  { taskId: 'synthesis', attempt: 1, modelKey: 'lite/model', outcome: 'success', usage: { inputTokens: 70, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 99 } },
]

const summary = calculateCostSavings(records, prices)
assert.deepEqual(summary.tokenTotals, {
  inputTokens: 280,
  outputTokens: 100,
  cacheReadTokens: 27,
  cacheWriteTokens: 8,
  totalTokens: 415,
})
assert.equal(summary.routedCost.totalCalls, 4)
assert.equal(summary.routedCost.pricedCalls, 4)
assert.equal(summary.routedCost.currency, 'USD')
approximately(summary.routedCost.amount, 0.0006867)
approximately(summary.flagshipBaseline.amount, 0.004867)
approximately(summary.savings.amountUsd, 0.0041803)
approximately(summary.savings.percent, (0.0041803 / 0.004867) * 100)
assert.equal(summary.coverage.complete, true)

// Cache tokens use their own rates and an explicit zero is only valid when
// the snapshot declares that price as present.
const cacheOnly = calculateCostSavings([
  { taskId: 'T1', modelKey: 'lite/model', usage: { cacheReadTokens: 1_000_000, cacheWriteTokens: 2_000_000 } },
], prices)
approximately(cacheOnly.routedCost.amount, 1.1)
approximately(cacheOnly.flagshipBaseline.amount, 11)

const missingRoutePrice = calculateCostSavings([
  { taskId: 'planner', modelKey: 'unlisted/model', usage: { inputTokens: 1, outputTokens: 1 } },
], prices)
assert.equal(missingRoutePrice.routedCost.amount, null)
assert.equal(missingRoutePrice.savings.percent, null)
assert.ok(missingRoutePrice.warnings.some((warning) => warning.code === 'missing_model_price'))

for (const [description, badMeta, warningCode] of [
  ['stale', { stale: true }, 'stale_price'],
  ['low confidence', { confidence: 'low' }, 'low_confidence_price'],
  ['unknown confidence', { confidence: 'unreviewed' }, 'unknown_price_confidence'],
]) {
  const badSnapshot = snapshot({
    'lite/model': model({ input: 1, output: 4, cacheRead: 0.1, cacheWrite: 0.5 }, badMeta),
    'flagship/model': prices.models['flagship/model'],
  })
  const result = calculateCostSavings([
    { taskId: 'T1', modelKey: 'lite/model', usage: { inputTokens: 10, outputTokens: 2 } },
  ], badSnapshot)
  assert.equal(result.routedCost.amount, null, `${description} route price should be unavailable`)
  assert.equal(result.savings.percent, null, `${description} route price should suppress savings`)
  assert.ok(result.warnings.some((warning) => warning.code === warningCode))
}

const oldPriceSnapshot = snapshot({
  'lite/model': model(
    { input: 1, output: 4, cacheRead: 0.1, cacheWrite: 0.5 },
    { synced_at: '2026-09-24T12:00:00.000Z' },
  ),
  'flagship/model': prices.models['flagship/model'],
})
const oldPrice = calculateCostSavings([
  { taskId: 'T1', modelKey: 'lite/model', usage: { inputTokens: 10, outputTokens: 2 } },
], oldPriceSnapshot)
assert.equal(oldPrice.routedCost.amount, null)
assert.equal(oldPrice.savings.percent, null)
assert.ok(oldPrice.warnings.some((warning) => warning.code === 'stale_price'))

const missingRateSnapshot = snapshot({
  'lite/model': model(
    { input: 0, output: 4, cacheRead: 0, cacheWrite: 0 },
    { hasInputPrice: false, hasCacheReadPrice: false, hasCacheWritePrice: false },
  ),
  'flagship/model': prices.models['flagship/model'],
})
const missingRate = calculateCostSavings([
  { taskId: 'T1', modelKey: 'lite/model', usage: { inputTokens: 10, cacheReadTokens: 5 } },
], missingRateSnapshot)
assert.equal(missingRate.routedCost.amount, null)
assert.equal(missingRate.savings.percent, null)
assert.ok(missingRate.warnings.some((warning) => warning.code === 'missing_price'))

const untrustedFlagship = calculateCostSavings([
  { taskId: 'planner', modelKey: 'lite/model', usage: { inputTokens: 10, outputTokens: 2 } },
], snapshot({
  'lite/model': prices.models['lite/model'],
  'flagship/model': model({ input: 10, output: 20, cacheRead: 1, cacheWrite: 5 }, { confidence: 'low' }),
}))
assert.equal(untrustedFlagship.routedCost.complete, true)
assert.equal(untrustedFlagship.flagshipBaseline.amount, null)
assert.equal(untrustedFlagship.savings.percent, null)
assert.ok(untrustedFlagship.warnings.some((warning) => warning.code === 'low_confidence_price'))

const missingCurrency = calculateCostSavings([
  { taskId: 'T1', modelKey: 'lite/model', usage: { inputTokens: 10 } },
], snapshot({
  'lite/model': model({ input: 1, output: 4, cacheRead: 0.1, cacheWrite: 0.5 }, { currency: '' }),
  'flagship/model': prices.models['flagship/model'],
}))
assert.equal(missingCurrency.routedCost.amount, null)
assert.equal(missingCurrency.savings.percent, null)
assert.ok(missingCurrency.warnings.some((warning) => warning.code === 'missing_currency'))

const mixedCurrency = calculateCostSavings([
  { taskId: 'T1', modelKey: 'lite/model', usage: { inputTokens: 1_000_000 } },
  { taskId: 'T2', modelKey: 'cny/model', usage: { inputTokens: 1_000_000 } },
], snapshot({
  ...prices.models,
  'cny/model': model(
    { input: 2, output: 4, cacheRead: 1, cacheWrite: 1 },
    { currency: 'CNY' },
  ),
}))
assert.equal(mixedCurrency.routedCost.amount, null)
assert.deepEqual(Object.keys(mixedCurrency.routedCost.byCurrency).sort(), ['CNY', 'USD'])
assert.equal(mixedCurrency.savings.percent, null)
assert.ok(mixedCurrency.warnings.some((warning) => warning.code === 'mixed_currency'))

const zeroBaseline = calculateCostSavings([
  { taskId: 'T1', modelKey: 'lite/model', usage: { inputTokens: 0, outputTokens: 0 } },
], snapshot({
  'lite/model': model({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
  'flagship/model': model({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
}))
assert.equal(zeroBaseline.routedCost.amount, 0)
assert.equal(zeroBaseline.flagshipBaseline.amount, 0)
assert.equal(zeroBaseline.savings.percent, null)
assert.ok(zeroBaseline.warnings.some((warning) => warning.code === 'zero_flagship_baseline'))

const invalidUsage = calculateCostSavings([
  { taskId: 'T1', modelKey: 'lite/model', usage: { inputTokens: -3, outputTokens: Number.NaN } },
], prices)
assert.deepEqual(invalidUsage.tokenTotals, {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
})
assert.equal(invalidUsage.routedCost.amount, null)
assert.equal(invalidUsage.savings.percent, null)
assert.ok(invalidUsage.warnings.some((warning) => warning.code === 'invalid_usage'))

const unmeasuredUsage = calculateCostSavings([
  { taskId: 'T1', modelKey: 'lite/model', usage: {} },
], prices)
assert.equal(unmeasuredUsage.routedCost.amount, null)
assert.equal(unmeasuredUsage.savings.percent, null)
assert.ok(unmeasuredUsage.warnings.some((warning) => warning.code === 'invalid_usage'))

const noReference = calculateCostSavings([
  { taskId: 'planner', modelKey: 'lite/model', usage: { inputTokens: 1 } },
], { models: { 'lite/model': prices.models['lite/model'] } })
assert.equal(noReference.flagshipBaseline.amount, null)
assert.equal(noReference.savings.percent, null)
assert.ok(noReference.warnings.some((warning) => warning.code === 'missing_flagship_reference'))

const noCalls = calculateCostSavings([], prices)
assert.equal(noCalls.routedCost.amount, null)
assert.equal(noCalls.flagshipBaseline.amount, null)
assert.equal(noCalls.coverage.complete, false)
assert.ok(noCalls.warnings.some((warning) => warning.code === 'no_usage_records'))

console.log('orchestration cost-savings checks passed')
