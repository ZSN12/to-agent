import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createUsageStore } from '../backend/usage-store.mjs'

function localDateKey(timestamp) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function bucket(date, model, fields = {}) {
  return {
    date,
    provider: 'provider',
    model,
    calls: 1,
    inputTokens: 1,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 2,
    costUsd: 0.1,
    ...fields,
  }
}

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-usage-incremental-'))
try {
  const date = localDateKey(Date.now())
  const buckets = Array.from({ length: 4096 }, (_, index) =>
    bucket(date, `model-${String(index).padStart(5, '0')}`))
  const usagePath = path.join(home, 'taskweaver-model-usage.json')
  await fs.writeFile(usagePath, JSON.stringify({ version: 3, enabled: true, historyImported: true, buckets }))

  const store = createUsageStore(home)
  // Run the one-time format/order validation before measuring a normal write.
  await store.getStats()

  const originalSort = Array.prototype.sort
  const originalLocaleCompare = String.prototype.localeCompare
  let sortCalls = 0
  let identityComparisons = 0
  Array.prototype.sort = function (...args) {
    sortCalls += 1
    return originalSort.apply(this, args)
  }
  String.prototype.localeCompare = function (...args) {
    identityComparisons += 1
    return originalLocaleCompare.apply(this, args)
  }
  try {
    await store.record({
      id: 'update-existing-bucket',
      timestamp: Date.now(),
      modelKey: 'provider/model-02048',
      modelName: 'latest-model-name',
      inputTokens: 7,
      outputTokens: 4,
      cacheReadTokens: 3,
      cacheWriteTokens: 2,
      reasoningTokens: 1,
      costUsd: 0.2,
    })
    await store.record({
      id: 'insert-new-bucket',
      timestamp: Date.now(),
      modelKey: 'provider/model-02048a',
      inputTokens: 1,
      outputTokens: 0,
      costUsd: 0.01,
    })
  } finally {
    Array.prototype.sort = originalSort
    String.prototype.localeCompare = originalLocaleCompare
  }

  assert.equal(sortCalls, 0, 'recording into populated daily usage must not aggregate and sort all buckets')
  assert.ok(identityComparisons < 100, `two writes should use logarithmic lookup, got ${identityComparisons} identity comparisons`)

  const persisted = JSON.parse(await fs.readFile(usagePath, 'utf8'))
  assert.equal(persisted.buckets.length, 4097)
  const existing = persisted.buckets.find(row => row.model === 'model-02048')
  assert.deepEqual({
    calls: existing.calls,
    modelName: existing.modelName,
    inputTokens: existing.inputTokens,
    outputTokens: existing.outputTokens,
    cacheReadTokens: existing.cacheReadTokens,
    cacheWriteTokens: existing.cacheWriteTokens,
    reasoningTokens: existing.reasoningTokens,
    totalTokens: existing.totalTokens,
  }, {
    calls: 2,
    modelName: 'latest-model-name',
    inputTokens: 8,
    outputTokens: 5,
    cacheReadTokens: 3,
    cacheWriteTokens: 2,
    reasoningTokens: 1,
    totalTokens: 18,
  })
  assert.ok(Math.abs(existing.costUsd - 0.3) < 1e-12)
  for (let index = 1; index < persisted.buckets.length; index += 1) {
    const previous = persisted.buckets[index - 1]
    const current = persisted.buckets[index]
    const order = previous.date.localeCompare(current.date)
      || previous.provider.localeCompare(current.provider)
      || previous.model.localeCompare(current.model)
    assert.ok(order <= 0, 'persisted buckets must remain in canonical order')
  }

  const recoveryHome = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-usage-order-recovery-'))
  try {
    const recoveryPath = path.join(recoveryHome, 'taskweaver-model-usage.json')
    await fs.writeFile(recoveryPath, JSON.stringify({
      version: 3,
      enabled: true,
      historyImported: true,
      buckets: [bucket(date, 'z'), bucket(date, 'a'), bucket(date, 'a')],
    }))
    const recovered = createUsageStore(recoveryHome)
    const stats = await recovered.getStats()
    const repaired = JSON.parse(await fs.readFile(recoveryPath, 'utf8'))
    assert.equal(repaired.buckets.length, 2, 'non-canonical version 3 rows are coalesced before indexed updates')
    assert.deepEqual(repaired.buckets.map(row => row.model), ['a', 'z'])
    assert.equal(repaired.buckets[0].calls, 2)
    assert.equal(stats.totals.totalCalls, 3)
  } finally {
    await fs.rm(recoveryHome, { recursive: true, force: true })
  }

  console.log(`usage incremental checks passed: 4,096 bucket lookup used ${identityComparisons} identity comparisons and no full sort`)
} finally {
  await fs.rm(home, { recursive: true, force: true })
}
