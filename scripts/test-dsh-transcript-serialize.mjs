import assert from 'node:assert/strict'
import { extractDshChatTranscript } from '../backend/dsh-transcript-serialize.mjs'

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
        usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 2 },
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
assert.equal(rows[1].turn, 1, 'assistant transcript rows retain their DSH turn identity')
assert.equal(rows[1].text, '你好呀')
assert.equal(rows[1].usage?.inputTokens, 10)
assert.equal(rows[1].usage?.reasoningTokens, 2)

const compactionRows = extractDshChatTranscript({ chat: {
  order: ['compact-pressure', 'compact-overflow', 'compact-manual'],
  nodes: new Map([
    ['compact-pressure', { kind: 'compaction', data: { summary: 'pressure summary', trigger: 'pressure' } }],
    ['compact-overflow', { kind: 'compaction', data: { summary: 'overflow summary', trigger: 'context-overflow' } }],
    ['compact-manual', { kind: 'compaction', data: { summary: 'manual summary', trigger: 'manual' } }],
  ]),
} })
assert.deepEqual(compactionRows.map((row) => [row.compactionTrigger, row.automatic]), [
  ['pressure', true],
  ['context-overflow', true],
  ['manual', false],
])

const imageOnlyRef = {
  attachmentId: `sha256:${'a'.repeat(64)}`,
  mediaType: 'image/png',
  bytes: 1024,
  width: 800,
  height: 600,
  name: 'capture.png',
  originalDimensions: { width: 1600, height: 1200 },
}
const imageOnlyRows = extractDshChatTranscript({ chat: {
  order: ['image-user'],
  nodes: new Map([['image-user', {
    kind: 'user',
    data: { time: 3_000, content: [{ type: 'image', attachment: imageOnlyRef }] },
  }]]),
} })
assert.equal(imageOnlyRows.length, 1)
assert.equal(imageOnlyRows[0].text, '')
assert.deepEqual(imageOnlyRows[0].images, [imageOnlyRef])

const hiddenSteps = [
  { inputTokens: 11, outputTokens: 2, cacheReadTokens: 3, reasoningTokens: 1 },
  { inputTokens: 13, outputTokens: 4, cacheReadTokens: 5, reasoningTokens: 2 },
  { inputTokens: 17, outputTokens: 6, cacheReadTokens: 7, reasoningTokens: 3 },
].map((usage, index) => ({
  step: index + 1,
  data: { get: key => key === 'assistant-step' ? { turn: 2, usage } : undefined },
}))
const hiddenStepSnapshot = {
  chat: {
    order: ['u2', 'tail2'],
    nodes: new Map([
      ['u2', { kind: 'user', data: { time: 3_000, content: [{ type: 'text', text: '审批怎么走' }] } }],
      ['tail2', {
        kind: 'turn-tail',
        data: {
          turn: 2,
          closing: {
            status: 'settled', turn: 2, step: 3, time: 4_000,
            blocks: [{ kind: 'text', text: '三步模型回答' }],
            usage: { inputTokens: 17, outputTokens: 6, cacheReadTokens: 7 },
          },
        },
      }],
    ]),
    timeline: {
      turns: new Map([[2, {
        start: { event: { type: 'turn/start', seq: 10 } },
        end: { event: { type: 'turn/end', seq: 40 } },
        steps: hiddenSteps,
      }]]),
    },
  },
}
const hiddenStepRows = extractDshChatTranscript(hiddenStepSnapshot)
assert.equal(hiddenStepRows[1].usage?.inputTokens, 41)
assert.equal(hiddenStepRows[1].usage?.outputTokens, 12)
assert.equal(hiddenStepRows[1].usage?.cacheReadTokens, 15)
assert.equal(hiddenStepRows[1].usage?.reasoningTokens, 6)

const thinkingSteps = ['第一步思考', '第二步思考', '最终思考'].map((text, index) => ({
  step: index + 1,
  data: { get: key => key === 'assistant-step' ? { turn: 2, blocks: [{ kind: 'reasoning', text }] } : undefined },
}))
const thinkingSnapshot = {
  chat: {
    ...hiddenStepSnapshot.chat,
    timeline: {
      turns: new Map([[2, {
        start: { event: { type: 'turn/start', seq: 10 } },
        end: { event: { type: 'turn/end', seq: 40 } },
        steps: thinkingSteps,
      }]]),
    },
  },
}
const thinkingRows = extractDshChatTranscript(thinkingSnapshot)
assert.equal(thinkingRows[1].thinking, '第一步思考第二步思考最终思考')

const partialNodes = new Map(hiddenStepSnapshot.chat.nodes)
const partialTail = partialNodes.get('tail2')
partialNodes.set('tail2', {
  ...partialTail,
  data: {
    ...partialTail.data,
    closing: {
      ...partialTail.data.closing,
      blocks: [...partialTail.data.closing.blocks, { kind: 'reasoning', text: 'final close thought' }],
    },
  },
})
const partialTimelineRows = extractDshChatTranscript({
  chat: {
    ...hiddenStepSnapshot.chat,
    nodes: partialNodes,
    timeline: { turns: new Map([[2, {
      end: { event: { type: 'turn/end', seq: 40 } },
      steps: thinkingSteps,
    }]]) },
  },
})
assert.equal(partialTimelineRows[1].usage?.inputTokens, 17)
assert.equal(partialTimelineRows[1].usage?.outputTokens, 6)
assert.equal(partialTimelineRows[1].thinking, 'final close thought')

console.log('dsh-transcript-serialize smoke passed')
