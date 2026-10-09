import assert from 'node:assert/strict'
import {
  COMPACTION_SUGGEST_CLEAR_PERCENT,
  COMPACTION_SUGGEST_CONTEXT_PERCENT,
  shouldAutoCompact,
  shouldSuggestContextCompaction,
} from '../src/shared/context-compaction-policy.ts'

assert.equal(COMPACTION_SUGGEST_CONTEXT_PERCENT, 75)
assert.equal(COMPACTION_SUGGEST_CLEAR_PERCENT, 60)

assert.equal(shouldSuggestContextCompaction({ contextPercent: 50 }).suggest, false)
assert.equal(shouldSuggestContextCompaction({ contextPercent: 74 }).suggest, false)
assert.equal(shouldSuggestContextCompaction({ contextPercent: 90, sending: true }).suggest, false)
assert.equal(shouldSuggestContextCompaction({ contextPercent: 90, dismissedForConversation: true }).suggest, false)
const hot = shouldSuggestContextCompaction({ contextPercent: 78 })
assert.equal(hot.suggest, true)
assert.match(hot.message ?? '', /78%/)

assert.equal(shouldSuggestContextCompaction({ contextPercent: 90, sending: true, compacting: true }).reason, 'compacting')

assert.equal(shouldAutoCompact({ contextPercent: 74 }), false)
assert.equal(shouldAutoCompact({ contextPercent: 76 }), true)
assert.equal(shouldAutoCompact({ contextPercent: 76, compacting: true }), false)
assert.equal(shouldAutoCompact({ contextPercent: 76, sending: true }), false)

console.log('context-compaction-policy tests passed')
