import assert from 'node:assert/strict'
import { parseCompactionCommandText } from '../electron/backend/compaction-reply.mjs'
import { nativeChatCommand } from '../electron/backend/native-chat-command.mjs'
import {
  isCompactCommandText,
  shouldSuggestContextCompaction,
} from '../electron/backend/context-compaction-policy.mjs'

const parsed = parseCompactionCommandText('Compacted 172 history items (~125556 tokens).')
assert.deepEqual(parsed, { historyItems: 172, tokensShadowed: 125556 })
assert.equal(parseCompactionCommandText('hello'), null)

// chat:send routes /compact as a native Host command (no prompt pipeline).
assert.equal(nativeChatCommand('/compact'), '/compact')
assert.equal(nativeChatCommand('  /COMPACT  '), '/compact')
assert.equal(nativeChatCommand('/compact keep API notes'), '/compact keep API notes')
assert.equal(nativeChatCommand('please /compact'), null)
assert.equal(nativeChatCommand('/compact\nextra line'), null)

// Renderer pending-compaction detection must agree with the main-process router.
for (const text of ['/compact', ' /Compact ', '/compact focus on tests', 'compact', '/compaction', '/compact\nx', 'hi /compact']) {
  assert.equal(isCompactCommandText(text), nativeChatCommand(text) !== null && /^\/compact/i.test(nativeChatCommand(text)), text)
}

// Banner policy around a compact turn.
const hot = { contextPercent: 90 }
assert.equal(shouldSuggestContextCompaction(hot).suggest, true)
assert.equal(shouldSuggestContextCompaction({ ...hot, sending: true }).suggest, false)
const inFlight = shouldSuggestContextCompaction({ ...hot, sending: true, compacting: true })
assert.equal(inFlight.suggest, true)
assert.equal(inFlight.reason, 'compacting')
// After compaction lands the banner is dismissed (persisted flag) even though contextPercent is stale.
assert.equal(shouldSuggestContextCompaction({ ...hot, dismissedForConversation: true }).suggest, false)

console.log('test-compaction-reply: ok')
