import assert from 'node:assert/strict'
import { serializeDshConversationView } from '../electron/backend/dsh-snapshot-serialize.mjs'

const view = serializeDshConversationView({
  running: true,
  partial: {
    turn: 1,
    step: 2,
    blocks: [
      { kind: 'reasoning', text: 'think-a' },
      { kind: 'text', text: 'hello ' },
      { kind: 'text', text: 'world' },
    ],
  },
  runningCalls: [],
  queue: [],
}, { conversationId: 'c1', sessionId: 'tw-c1' })

assert.equal(view.streamingText, 'hello world')
assert.equal(view.streamingReasoning, 'think-a')
assert.equal(view.running, true)

const withTools = serializeDshConversationView({
  running: true,
  partial: { turn: 2, step: 1, blocks: [] },
  runningCalls: [{
    callId: 'c1',
    name: 'run_code',
    argsRaw: JSON.stringify({ code: 'return 1', description: 'read workspace layout' }),
    turn: 2,
    step: 1,
    time: Date.now(),
    callView: null,
    subCalls: [],
  }],
  queue: [],
}, {
  conversationId: 'c1',
  sessionId: 'tw-c1',
  projections: {
    get(key) {
      if (key === 'contextPressure') return { pressureTokens: 3840, contextWindow: 128_000 }
      if (key === 'contextBreakdown') return { systemTokens: 800, toolsTokens: 400, messageTokens: 2640 }
      return undefined
    },
  },
})
assert.equal(withTools.toolRows.length, 1)
assert.equal(withTools.toolRows[0].toolName, 'run_code')
assert.match(withTools.toolRows[0].argsRaw, /read workspace layout/)
assert.equal(withTools.projections.contextPressure.contextWindow, 128_000)
assert.equal(withTools.projections.contextBreakdown.systemTokens, 800)

console.log('dsh-snapshot-serialize smoke passed')
