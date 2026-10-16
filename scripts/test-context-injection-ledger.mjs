import assert from 'node:assert/strict'
import { createContextInjectionLedger, countUserTurns } from '../backend/context-injection-ledger.mjs'

const ledger = createContextInjectionLedger()
const layers = {
  prefixLayers: [{ id: 'sandbox-policy', text: 'sandbox A', required: true }],
  suffixLayers: [{ id: 'workspace-rules', text: 'rules A', required: true }],
}
const prepare = (overrides = {}) => ledger.prepare({
  conversationId: 'conversation-1',
  sessionId: 'session-1',
  historyUserTurns: 0,
  ...layers,
  ...overrides,
})

assert.equal(countUserTurns([
  { author: 'user', text: 'a' },
  { role: 'assistant', content: 'b' },
  { role: 'user', content: 'c' },
]), 2)

const first = prepare()
assert.deepEqual(first.prefixLayers.map((layer) => layer.id), ['sandbox-policy'])
assert.deepEqual(first.suffixLayers.map((layer) => layer.id), ['workspace-rules'])
// Preparing is not a commit: an interrupted or queued request must be retried with full context.
assert.equal(prepare().prefixLayers.length, 1)
assert.equal(prepare().suffixLayers.length, 1)
assert.equal(ledger.commit(first.receipt, ['sandbox-policy', 'workspace-rules'], 'session-1'), true)

const unchanged = prepare({ historyUserTurns: 1 })
assert.deepEqual(unchanged.prefixLayers, [])
assert.deepEqual(unchanged.suffixLayers, [])
ledger.commit(unchanged.receipt, [], 'session-1')

const changed = ledger.prepare({
  conversationId: 'conversation-1',
  sessionId: 'session-1',
  historyUserTurns: 2,
  prefixLayers: [{ id: 'sandbox-policy', text: 'sandbox B', required: true }],
  suffixLayers: [{ id: 'workspace-rules', text: 'rules B', required: true }],
})
assert.deepEqual(changed.prefixLayers.map((layer) => layer.text), ['sandbox B'])
assert.deepEqual(changed.suffixLayers.map((layer) => layer.text), ['rules B'])
ledger.commit(changed.receipt, ['sandbox-policy', 'workspace-rules'], 'session-1')

const removed = ledger.prepare({
  conversationId: 'conversation-1',
  sessionId: 'session-1',
  historyUserTurns: 3,
  prefixLayers: [],
  suffixLayers: [],
})
assert.match(removed.prefixLayers[0].text, /沙箱策略说明已失效/)
assert.match(removed.suffixLayers[0].text, /项目规则已不再适用/)
ledger.commit(removed.receipt, ['sandbox-policy', 'workspace-rules'], 'session-1')
assert.deepEqual(prepare({ historyUserTurns: 4, prefixLayers: [], suffixLayers: [] }).prefixLayers, [])
assert.deepEqual(prepare({ historyUserTurns: 4, prefixLayers: [], suffixLayers: [] }).suffixLayers, [])

const compacted = ledger.prepare({
  conversationId: 'conversation-1',
  sessionId: 'session-1',
  historyUserTurns: 5,
  ...layers,
})
ledger.commit(compacted.receipt, ['sandbox-policy', 'workspace-rules'], 'session-1')
ledger.invalidateConversation('conversation-1')
const afterCompaction = prepare({ historyUserTurns: 6 })
assert.equal(afterCompaction.prefixLayers.length, 1)
assert.equal(afterCompaction.suffixLayers.length, 1)
ledger.commit(afterCompaction.receipt, ['sandbox-policy', 'workspace-rules'], 'session-1')

const afterHistoryRollback = prepare({ historyUserTurns: 1 })
assert.equal(afterHistoryRollback.prefixLayers.length, 1)
assert.equal(afterHistoryRollback.suffixLayers.length, 1)
ledger.commit(afterHistoryRollback.receipt, ['sandbox-policy', 'workspace-rules'], 'session-1')

const afterSessionChange = ledger.prepare({
  conversationId: 'conversation-1',
  sessionId: 'session-2',
  historyUserTurns: 2,
  ...layers,
})
assert.equal(afterSessionChange.prefixLayers.length, 1)
assert.equal(afterSessionChange.suffixLayers.length, 1)
assert.equal(ledger.commit(afterSessionChange.receipt, ['sandbox-policy', 'workspace-rules'], 'unexpected-session'), false)
assert.equal(prepare({ historyUserTurns: 3 }).prefixLayers.length, 1,
  'a session race invalidates the receipt and forces a safe resend')

console.log('context injection ledger tests passed')
