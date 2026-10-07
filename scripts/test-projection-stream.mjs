import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const projectionPath = path.resolve('src/features/dsh-runtime/projectionStream.ts')
const { outputFiles } = await build({
  entryPoints: [projectionPath],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node22',
})
assert.equal(outputFiles.length, 1, 'the projection entry and its real relative dependencies should bundle together')
const { applyDshProjectionMetadata, shouldPreferDshTranscript } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`,
)

assert.equal(shouldPreferDshTranscript(true, 'conversation-a', { conversationId: 'conversation-a' }), true)
assert.equal(shouldPreferDshTranscript(true, 'conversation-a', { conversationId: 'conversation-b' }), false)

const updates = { activity: [], queues: [] }
applyDshProjectionMetadata({
  conversationId: 'conversation-a',
  running: true,
  streamingText: 'stale projected answer',
  streamingReasoning: 'stale projected reasoning',
  activityLabel: '正在读取文件',
  queue: { steering: ['继续检查'], followUp: [] },
}, {
  setStreamText: (value) => updates.activity.push(['unexpected-text', value]),
  setStreamThinking: (value) => updates.activity.push(['unexpected-thinking', value]),
  setStreamActivity: (value) => updates.activity.push(value),
  setPromptQueue: (value) => updates.queues.push(value),
})
assert.deepEqual(updates.activity, ['正在读取文件'], 'projection contributes activity metadata, never replaces direct deltas')
assert.deepEqual(updates.queues, [{ steering: ['继续检查'], followUp: [] }])

const backendSource = await fs.readFile(path.resolve('src/features/app/useAppBackend.ts'), 'utf8')
assert.equal(backendSource.includes('isStreamEventSupersededByProjection'), false,
  'live chat:stream events must not be discarded merely because a transcript projection is mounted')
assert.match(backendSource, /if \(event\.type === 'delta'\)[\s\S]{0,180}setStreamText/)
assert.match(backendSource, /event\.type === 'start' && event\.conversationId === activeConversationIdRef\.current\)\s*\{\s*setToolTraces\(next\.toolTraces\)/,
  'the visible tool batch must reset from the clean per-conversation snapshot on each active turn start')

console.log('projection stream ownership tests passed')
