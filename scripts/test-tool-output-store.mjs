import assert from 'node:assert/strict'
import { createToolOutputStore } from '../backend/tool-output-store.mjs'

const store = createToolOutputStore({ maxEntries: 2, maxTotalBytes: 64, maxOutputBytes: 32 })
const first = store.store({ conversationId: 'c1', text: 'first full output' })
assert.ok(first?.outputId)
assert.deepEqual(store.get({ conversationId: 'c2', outputId: first.outputId }), null, 'output references are conversation scoped')

const second = store.store({ conversationId: 'c1', text: 'second' })
assert.equal(store.get({ conversationId: 'c1', outputId: first.outputId })?.text, 'first full output')
const third = store.store({ conversationId: 'c2', text: 'third' })
assert.equal(store.get({ conversationId: 'c1', outputId: first.outputId })?.text, 'first full output', 'reads refresh the LRU position')
assert.equal(store.get({ conversationId: 'c1', outputId: second.outputId }), null, 'the least recently used item is evicted')
assert.equal(store.get({ conversationId: 'c2', outputId: third.outputId })?.text, 'third')

const bounded = store.store({ conversationId: 'c3', text: 'x'.repeat(80) })
assert.equal(bounded.truncated, true, 'oversized results are bounded')
assert.equal(store.get({ conversationId: 'c3', outputId: bounded.outputId })?.text.length, 32)
assert.equal(store.clearConversation('c3'), 1)
assert.equal(store.get({ conversationId: 'c3', outputId: bounded.outputId }), null)

const redacted = store.store({
  conversationId: 'c4',
  text: 'Authorization: Bearer abcdefghijklmnop12345\napi_key=private-fixture-key',
})
const safeOutput = store.get({ conversationId: 'c4', outputId: redacted.outputId })
assert.equal(safeOutput.text.includes('abcdefghijklmnop12345'), false, 'credentials are redacted before storage')
assert.equal(safeOutput.text.includes('private-fixture-key'), false, 'named secret values are redacted before storage')
assert.match(safeOutput.text, /已隐藏/)
console.log('tool output store checks passed: scope, LRU, byte caps, and conversation cleanup')
