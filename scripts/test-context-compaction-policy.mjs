import assert from 'node:assert/strict'
import {
  COMPACTION_SUGGEST_CLEAR_PERCENT,
  COMPACTION_SUGGEST_CONTEXT_PERCENT,
  shouldSuggestContextCompaction,
} from '../electron/backend/context-compaction-policy.mjs'

assert.equal(COMPACTION_SUGGEST_CONTEXT_PERCENT, 85)
assert.equal(COMPACTION_SUGGEST_CLEAR_PERCENT, 72)

assert.equal(shouldSuggestContextCompaction({ contextPercent: 50 }).suggest, false)
assert.equal(shouldSuggestContextCompaction({ contextPercent: 90, sending: true }).suggest, false)
assert.equal(shouldSuggestContextCompaction({ contextPercent: 90, dismissedForConversation: true }).suggest, false)
const hot = shouldSuggestContextCompaction({ contextPercent: 88 })
assert.equal(hot.suggest, true)
assert.match(hot.message ?? '', /88%/)

console.log('context-compaction-policy tests passed')
