import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { serializeDshConversationView } from '../electron/backend/dsh-snapshot-serialize.mjs'
import ts from 'typescript'

const activitySource = await fs.readFile(path.resolve('src/features/chat/streamActivityLabel.ts'), 'utf8')
const { outputText: activityModule } = ts.transpileModule(activitySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { shortStreamActivityLabel } = await import(
  `data:text/javascript;base64,${Buffer.from(activityModule).toString('base64')}`,
)

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
assert.equal(view.activityLabel, '正在思考…', 'reasoning chunks should take precedence over a generic model-step label')
assert.equal(shortStreamActivityLabel(view.activityLabel), '模型思考中')

const waiting = serializeDshConversationView({
  running: true,
  partial: { turn: 1, step: 3, blocks: [] },
  runningCalls: [],
  queue: [],
}, { conversationId: 'c1', sessionId: 'tw-c1' })
assert.equal(waiting.activityLabel, '等待模型响应 · 第 3 步')
assert.equal(shortStreamActivityLabel(waiting.activityLabel), '等待模型响应 第 3 步')

const generating = serializeDshConversationView({
  running: true,
  partial: { turn: 1, step: 3, blocks: [{ kind: 'text', text: 'partial answer' }] },
  runningCalls: [],
  queue: [],
}, { conversationId: 'c1', sessionId: 'tw-c1' })
assert.equal(generating.activityLabel, '正在生成回复…')
assert.equal(shortStreamActivityLabel(generating.activityLabel), '正在生成回复…')

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
assert.match(withTools.activityLabel, /run_code/, 'active tool should take precedence over model-step status')
assert.equal(shortStreamActivityLabel(withTools.activityLabel), 'run_code')
assert.match(withTools.toolRows[0].argsRaw, /read workspace layout/)
assert.equal(withTools.projections.contextPressure.contextWindow, 128_000)
assert.equal(withTools.projections.contextBreakdown.systemTokens, 800)

console.log('dsh-snapshot-serialize smoke passed')
