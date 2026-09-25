import assert from 'node:assert/strict'
import { dshCacheHitRate } from '../src/features/chat/usage-labels.ts'
import {
  formatTokensCompact,
  summarizeSessionUsage,
  sessionUsageHasData,
} from '../src/features/chat/session-usage.ts'

const totals = summarizeSessionUsage([
  { id: '1', author: 'user', name: '你', time: '', text: 'hi' },
  {
    id: '2',
    author: 'orchestrator',
    name: 'TW',
    time: '',
    text: 'ok',
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 900,
      cacheWriteTokens: 0,
      costUsd: 0,
      elapsedMs: 1,
      tokensPerSecond: 50,
      contextTokens: null,
      contextWindow: null,
      contextPercent: null,
    },
  },
])

assert.equal(totals.inputTokens, 100)
assert.equal(totals.outputTokens, 50)
assert.equal(totals.cacheReadTokens, 900)
assert.ok(Math.abs(totals.cacheHitRatePercent - 90) < 0.01)
assert.ok(Math.abs(dshCacheHitRate(100, 900) - 0.9) < 0.0001)
assert.equal(dshCacheHitRate(120_000, 0), 0)
assert.ok(sessionUsageHasData(totals))
assert.equal(formatTokensCompact(92400000), '92M')

const emptyCache = summarizeSessionUsage([
  {
    id: 'a',
    author: 'orchestrator',
    name: 'TW',
    time: '',
    text: 'x',
    usage: {
      inputTokens: 10_000,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
      elapsedMs: 1,
      tokensPerSecond: 1,
      contextTokens: null,
      contextWindow: null,
      contextPercent: null,
    },
  },
])
assert.equal(emptyCache.cacheReadTokens, 0)
assert.equal(emptyCache.cacheHitRatePercent, 0)

console.log('session-usage checks passed')
