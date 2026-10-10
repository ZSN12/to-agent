import assert from 'node:assert/strict'
import {
  COMPACTION_SUGGEST_CLEAR_PERCENT,
  COMPACTION_SUGGEST_CONTEXT_PERCENT,
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
assert.match(hot.message ?? '', /手动压缩/)

assert.equal(shouldSuggestContextCompaction({ contextPercent: 90, sending: true, compacting: true }).reason, 'compacting')

console.log('context-compaction-policy tests passed')
