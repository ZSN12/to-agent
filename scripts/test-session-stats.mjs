import assert from 'node:assert/strict'
import { aggregateSessionEntries } from '../electron/backend/session-stats.mjs'

const entries = [
  {
    type: 'compaction',
    usage: { input: 100, output: 50, cacheRead: 20, cacheWrite: 0, cost: { total: 0.01 } },
  },
  {
    type: 'message',
    message: {
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
    },
  },
  {
    type: 'message',
    message: {
      role: 'assistant',
      content: [{ type: 'toolCall', name: 'read', id: '1' }],
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
    },
  },
  {
    type: 'message',
    message: {
      role: 'toolResult',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
  },
]

const folded = aggregateSessionEntries(entries)
assert.equal(folded.userMessages, 1)
assert.equal(folded.assistantMessages, 1)
assert.equal(folded.toolCalls, 1)
assert.equal(folded.toolResults, 1)
assert.equal(folded.tokens.input, 110)
assert.equal(folded.tokens.output, 55)
assert.equal(folded.tokens.cacheRead, 20)

console.log('test-session-stats: ok')
