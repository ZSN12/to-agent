import assert from 'node:assert/strict'
import { extractDshChatTranscript } from '../electron/backend/dsh-transcript-serialize.mjs'

const nodes = new Map([
  ['u1', { kind: 'user', data: { seq: 1, time: 1_000, content: [{ type: 'text', text: '你好' }] } }],
  ['t1', {
    kind: 'turn-tail',
    data: {
      turn: 1,
      time: 2_000,
      closing: {
        status: 'settled',
        turn: 1,
        step: 1,
        time: 2_000,
        blocks: [{ kind: 'text', text: '你好呀' }],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    },
  }],
])

const rows = extractDshChatTranscript({
  chat: { order: ['u1', 't1'], nodes },
})

assert.equal(rows.length, 2)
assert.equal(rows[0].role, 'user')
assert.equal(rows[0].text, '你好')
assert.equal(rows[1].role, 'assistant')
assert.equal(rows[1].text, '你好呀')
assert.equal(rows[1].usage?.inputTokens, 10)

console.log('dsh-transcript-serialize smoke passed')
