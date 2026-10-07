import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({
  stdin: {
    contents: `export { chatMessagesFromDshTranscript, isDshContextMessage, mergeStoredMessagesWithDshTranscript }
      from './src/features/dsh-runtime/dshTranscriptMessages'`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
})
const mapper = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

const transcript = [
  { dshKey: 'u1', role: 'user', text: '查看上下文', timestamp: 1_000 },
  { dshKey: 'ctx1', role: 'context', text: 'injected context', plugin: 'time-context', form: 'future-form', timestamp: 1_500 },
  { dshKey: 'ctx2', role: 'context', text: 'opaque context', plugin: 'workspace', timestamp: 1_750 },
  { dshKey: 'a1', role: 'assistant', text: '处理完成', thinking: 'checked', timestamp: 2_000 },
  { dshKey: 'c1', role: 'compaction', summary: 'prior summary', automatic: true, timestamp: 2_500 },
]
const messages = mapper.chatMessagesFromDshTranscript(transcript, { user: 'User', agent: 'Agent' })

assert.deepEqual(messages.map(message => message.id), [
  'dsh-user-u1', 'dsh-context-ctx1', 'dsh-context-ctx2', 'dsh-asst-a1', 'dsh-compact-c1',
])
assert.deepEqual(messages.map(message => message.author), ['user', 'agent', 'agent', 'orchestrator', 'orchestrator'])
assert.equal(messages[1].text, 'injected context')
assert.deepEqual(messages[1].dshContext, { plugin: 'time-context', form: 'future-form' })
assert.deepEqual(messages[2].dshContext, { plugin: 'workspace', form: undefined })
assert.equal(mapper.isDshContextMessage(messages[1]), true)
assert.equal(mapper.isDshContextMessage(messages[2]), true)
assert.equal(mapper.isDshContextMessage(messages[3]), false)
assert.equal(messages[1].usage, undefined)
assert.equal(messages[1].modelKey, undefined)
assert.equal(messages[1].thinking, undefined)
assert.equal(messages[1].callout, undefined)
assert.equal(messages[1].fileChanges, undefined)
assert.equal(messages[3].thinking, 'checked')
assert.equal(messages[4].compaction.summary, 'prior summary')

// An injected context must neither absorb assistant metadata nor satisfy the
// occurrence-based de-duplication for a streamed answer with identical text.
const answer = {
  id: 'z-turn-live',
  author: 'orchestrator',
  name: 'Agent',
  time: '00:02',
  timestamp: 2_000,
  text: 'same words',
  usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0,
    elapsedMs: 1, tokensPerSecond: 1, contextTokens: null, contextWindow: null, contextPercent: null },
}
const contextOnlyTranscript = [{ dshKey: 'ctx-same', role: 'context', text: 'same words', plugin: 'test-plugin' }]
const mergedWithContext = mapper.mergeStoredMessagesWithDshTranscript([answer], contextOnlyTranscript, true)
assert.equal(mergedWithContext.length, 2)
assert.equal(mapper.isDshContextMessage(mergedWithContext[0]), true)
assert.equal(mergedWithContext[0].usage, undefined)
assert.equal(mergedWithContext[1].id, 'z-turn-live')

const assistantTranscript = [{ dshKey: 'assistant-same', role: 'assistant', text: 'same words', thinking: '' }]
const mergedAssistant = mapper.mergeStoredMessagesWithDshTranscript([answer], assistantTranscript, true)
assert.equal(mergedAssistant.length, 1)
assert.equal(mergedAssistant[0].usage, answer.usage)

console.log('dsh-transcript-messages smoke passed')
