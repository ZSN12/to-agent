import assert from 'node:assert/strict'
import { build } from 'esbuild'

// Execute the production hook and reducers without a browser. A deterministic
// hook scheduler replaces React rendering; bridge callbacks and IPC races are real
// production code. This is not a visual/Electron end-to-end test.
const slots = []
let cursor = 0
let dirty = false
let pendingEffects = []
let view = null
const equalDeps = (a, b) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])))
const hooks = {
  useState(initial) {
    const i = cursor++
    slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slots[i].value, update => {
      const next = typeof update === 'function' ? update(slots[i].value) : update
      if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true }
    }]
  },
  useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i] },
  useMemo(fn, deps) {
    const i = cursor++
    if (!equalDeps(slots[i]?.deps, deps)) slots[i] = { value: fn(), deps }
    return slots[i].value
  },
  useCallback(fn, deps) { return hooks.useMemo(() => fn, deps) },
  useEffect(fn, deps) {
    const i = cursor++
    if (!equalDeps(slots[i]?.deps, deps)) {
      const cleanup = slots[i]?.cleanup
      slots[i] = { deps }
      pendingEffects.push(() => { cleanup?.(); slots[i].cleanup = fn() })
    }
  },
}
globalThis.__taskweaverLifecycleHooks = hooks
globalThis.__taskweaverLifecycleProjection = () => ({ view, subscribed: Boolean(view) })
const result = await build({
  stdin: { contents: `export { useAppBackend } from './src/features/app/useAppBackend';
    export { mergeStoredMessagesWithDshTranscript } from './src/features/dsh-runtime/dshTranscriptMessages';
    export { completedStreamMessage } from './src/features/chat/conversation-run-lifecycle';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'headless-hooks', setup(api) {
    api.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'lifecycle-test' }))
    api.onResolve({ filter: /useDshConversationView$/ }, () => ({ path: 'projection', namespace: 'lifecycle-test' }))
    api.onLoad({ filter: /.*/, namespace: 'lifecycle-test' }, ({ path }) => ({
      contents: path === 'hooks'
        ? 'export const {useState,useRef,useMemo,useCallback,useEffect} = globalThis.__taskweaverLifecycleHooks;'
        : 'export const useDshConversationView = globalThis.__taskweaverLifecycleProjection;',
    }))
  } }],
})
const { useAppBackend, mergeStoredMessagesWithDshTranscript, completedStreamMessage } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
let onStream
let reply
let backendRunning = []
const state = { conversationId: 'c1', workspacePath: process.cwd(), currentThreadId: 't1',
  threadTitle: 'test', threads: [], messages: [], tasks: [], outputLogs: [], permissionMode: 'ask' }
const bridge = {
  app: { getState: async () => ({ ok: true, data: state }) },
  chat: {
    onStream(fn) { onStream = fn; return () => { onStream = null } },
    listRunningConversations: async () => ({ ok: true, data: backendRunning }),
    send: () => new Promise(resolve => { reply = resolve }),
    followUp: async () => ({ ok: true, data: { accepted: true, queued: true } }),
  },
}
const originalWindow = globalThis.window
globalThis.window = { taskweaver: bridge, setInterval: () => 1, clearInterval() {},
  localStorage: { getItem: () => null, setItem() {} } }
let app
function render() {
  cursor = 0
  dirty = false
  app = useAppBackend()
  const effects = pendingEffects
  pendingEffects = []
  for (const effect of effects) effect()
}
async function flush() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
    if (dirty) render()
  }
}
async function emit(event) { onStream(event); await flush() }
try {
  render()
  await flush()
  assert.equal(app.state.conversationId, 'c1')
  const firstSend = app.sendMessage('read the entrypoint')
  await flush()
  await emit({ type: 'start', conversationId: 'c1', turnId: 'first', startedAt: 1000 })
  await emit({ type: 'delta', conversationId: 'c1', delta: 'first answer', full: 'first answer' })
  await app.followUpMessage('a queued question')
  await flush()
  await emit({ type: 'done', conversationId: 'c1', turnId: 'first', startedAt: 1000,
    full: 'first answer', fullThinking: 'first reasoning', continuing: true })
  assert.equal(app.sending, true, 'intermediate done must not stop the run')
  assert.ok(app.runningConversationIds.includes('c1'))
  assert.ok(!app.completedConversationIds.includes('c1'))
  assert.equal(app.messages.filter(message => message.text === 'first answer').length, 1)
  await emit({ type: 'start', conversationId: 'c1', turnId: 'next', startedAt: 2000 })
  await emit({ type: 'delta', conversationId: 'c1', delta: 'next partial', full: 'next partial' })
  reply({ ok: true, data: { user: { id: 'u1', author: 'user', text: 'read the entrypoint', time: '' },
    assistant: { id: 'z-turn-first', author: 'orchestrator', text: 'first answer', thinking: 'first reasoning', time: '', timestamp: 1000 } } })
  await firstSend
  await flush()
  assert.equal(app.sending, true, 'late IPC reply must not stop the newer queued turn')
  assert.equal(app.streamText, 'next partial', 'late IPC reply must not clear newer output')
  assert.equal(app.messages.filter(message => message.text === 'first answer').length, 1, 'IPC and completed stream must deduplicate')

  const acceptedSend = app.sendMessage('another queued question')
  await flush()
  assert.equal(app.streamText, 'next partial', 'busy send must not erase its current stream')
  reply({ ok: true, data: { accepted: true, queued: true,
    user: { id: 'u3', author: 'user', text: 'another queued question', time: '' } } })
  await acceptedSend
  await flush()
  assert.equal(app.streamText, 'next partial')
  assert.equal(app.sending, true)
  assert.equal(app.messages.filter(message => message.text === 'another queued question').length, 1)

  await emit({ type: 'done', conversationId: 'c1', turnId: 'next', startedAt: 2000,
    full: 'next answer', continuing: false })
  assert.equal(app.sending, false)
  assert.ok(!app.runningConversationIds.includes('c1'))
  assert.ok(app.completedConversationIds.includes('c1'))
  assert.equal(app.messages.filter(message => message.text === 'first answer').length, 1)
  assert.equal(app.messages.filter(message => message.text === 'next answer').length, 1)

  // Projection lag must not hide a completed turn; durable rows take over once caught up.
  const oldTranscript = [{ role: 'user', dshKey: 'u1', text: 'read the entrypoint', timestamp: 500 }]
  let merged = mergeStoredMessagesWithDshTranscript(app.messages, oldTranscript, true)
  assert.ok(merged.some(message => message.text === 'first answer'))
  assert.ok(merged.some(message => message.text === 'next answer'))
  merged = mergeStoredMessagesWithDshTranscript(app.messages, [...oldTranscript,
    { role: 'assistant', dshKey: 'a1', text: 'first answer', thinking: 'first reasoning', timestamp: 1500 },
    { role: 'assistant', dshKey: 'a2', text: 'next answer', timestamp: 2500 }], true)
  assert.equal(merged.filter(message => message.text === 'first answer').length, 1)
  assert.equal(merged.filter(message => message.text === 'next answer').length, 1)
  const withCallout = mergeStoredMessagesWithDshTranscript([
    { id: 'z-turn-with-callout', author: 'orchestrator', text: 'summary', callout: 'completed 2 subtasks' },
  ], [{ role: 'assistant', dshKey: 'summary', text: 'summary' }], true)
  assert.equal(withCallout.length, 1)
  assert.equal(withCallout[0].callout, 'completed 2 subtasks', 'native transcript takeover must preserve orchestration metadata')
  const fileChange = { path: 'src/main.ts', addedLines: 1, deletedLines: 1 }
  const withFiles = mergeStoredMessagesWithDshTranscript([
    { id: 'z-turn-file-change', author: 'orchestrator', text: 'summary', fileChanges: [fileChange] },
  ], [{ role: 'assistant', dshKey: 'file-change', text: 'summary' }], true)
  assert.deepEqual(withFiles[0].fileChanges, [fileChange], 'DSH transcript projection must preserve stored file summaries')
  assert.deepEqual(completedStreamMessage({ type: 'done', turnId: 'files-only', conversationId: 'c1',
    full: '', fullThinking: '', fileChanges: [fileChange] })?.fileChanges, [fileChange],
  'a terminal message with only file-change evidence must still be rendered')
  const repeat = [1, 2].map(n => ({ id: `z-turn-repeat-${n}`, author: 'orchestrator', text: '你好', timestamp: n }))
  assert.equal(mergeStoredMessagesWithDshTranscript(repeat,
    [{ role: 'assistant', dshKey: 'repeat', text: '你好', timestamp: 1 }], true).length, 2,
  'one durable identical answer must not swallow a second completed turn')

  const failedSend = app.sendMessage('read then fail')
  await flush()
  await emit({ type: 'start', conversationId: 'c1', turnId: 'failed', startedAt: 2800 })
  await emit({ type: 'delta', conversationId: 'c1', delta: 'partial before failure', full: 'partial before failure' })
  await emit({ type: 'thinking_delta', conversationId: 'c1', delta: 'prior thought', fullThinking: 'prior thought' })
  const errorEvent = { type: 'error', conversationId: 'c1', turnId: 'failed', startedAt: 2800,
    full: 'partial before failure', fullThinking: 'prior thought', thinkingDurationMs: 500, message: 'HTTP 402' }
  await emit(errorEvent)
  await emit(errorEvent)
  assert.equal(app.sending, false)
  assert.equal(app.messages.filter(message => message.id === 'z-turn-failed').length, 1)
  assert.equal(app.messages.find(message => message.id === 'z-turn-failed').interrupted, true)
  assert.equal(app.streamText, null, 'terminal partial is rendered once as a committed row, not twice as a stream')
  // The actual backend terminal sink commits before rejecting the send. Model
  // that durable state for the hook's reload triggered by a failed IPC reply.
  state.messages = app.state.messages.map(message => ({ ...message }))
  reply({ ok: false, error: 'HTTP 402' })
  await failedSend
  await flush()
  assert.equal(app.messages.filter(message => message.text === 'partial before failure').length, 1,
    'error reply/reload must not erase partial output')
  const failedProjection = mergeStoredMessagesWithDshTranscript(app.messages,
    [{ role: 'assistant', dshKey: 'failed', text: 'partial before failure', thinking: 'prior thought' }], true)
  assert.equal(failedProjection.filter(message => message.text === 'partial before failure').length, 1)
  assert.equal(failedProjection[0].interrupted, true, 'native takeover keeps failure metadata')
  assert.match(failedProjection[0].callout, /已保留/)
  const repeatedMetadata = mergeStoredMessagesWithDshTranscript([
    { id: 'z-turn-ok-repeat', author: 'orchestrator', text: 'same', interrupted: false, usage: { inputTokens: 10 } },
    { id: 'z-turn-failed-repeat', author: 'orchestrator', text: 'same', interrupted: true, callout: 'failed', usage: { inputTokens: 20 } },
  ], [
    { role: 'assistant', dshKey: 'ok-repeat', text: 'same' },
    { role: 'assistant', dshKey: 'failed-repeat', text: 'same' },
  ], true)
  assert.equal(repeatedMetadata[0].interrupted, false)
  assert.equal(repeatedMetadata[1].interrupted, true)
  assert.equal(repeatedMetadata[1].usage.inputTokens, 20, 'repeat takeover matches metadata occurrences, not the first identical answer')
  await emit({ type: 'start', conversationId: 'c1', turnId: 'recovered', startedAt: 2900 })
  assert.equal(app.messages.filter(message => message.text === 'partial before failure').length, 1,
    'next start must not erase the previous failed turn')
  await emit({ type: 'error', conversationId: 'c1', taskId: 'child', turnId: 'child-failed',
    full: 'child partial', message: 'child error' })
  assert.ok(app.runningConversationIds.includes('c1'), 'child failure must not finish the parent run')
  assert.ok(!app.messages.some(message => message.text === 'child partial'))
  assert.equal(app.error, 'HTTP 402', 'child errors must not replace the main error banner')
  await emit({ type: 'done', conversationId: 'c1', turnId: 'recovered', full: 'recovered answer' })

  await emit({ type: 'start', conversationId: 'c1', turnId: 'stopped', startedAt: 2950 })
  await emit({ type: 'done', conversationId: 'c1', turnId: 'stopped',
    full: 'stopped partial', interrupted: true })
  assert.equal(app.messages.filter(message => message.text === 'stopped partial').length, 1,
    'stable interrupted turn must not also create a timestamp-based duplicate')

  const oldFailureSend = app.sendMessage('old slow failure')
  await flush()
  const oldFailureReply = reply
  await emit({ type: 'start', conversationId: 'c1', turnId: 'old-failure', startedAt: 2960 })
  await emit({ type: 'error', conversationId: 'c1', turnId: 'old-failure', full: 'old retained partial', message: 'old provider failure' })
  const newerSend = app.sendMessage('new independent task')
  await flush()
  const newerReply = reply
  await emit({ type: 'start', conversationId: 'c1', turnId: 'new-independent', startedAt: 2970 })
  await emit({ type: 'delta', conversationId: 'c1', full: 'new live output', delta: 'new live output' })
  oldFailureReply({ ok: false, error: 'old provider failure', turnId: 'old-failure' })
  await oldFailureSend
  await flush()
  assert.equal(app.streamText, 'new live output', 'late failure IPC must not clear a newer turn')
  assert.equal(app.sending, true)
  assert.ok(app.runningConversationIds.includes('c1'))
  const rejectedBusySend = app.sendMessage('/compact')
  await flush()
  reply({ ok: false, error: 'busy admission rejected' })
  await rejectedBusySend
  await flush()
  assert.equal(app.streamText, 'new live output', 'rejecting another admission must not stop the active turn')
  assert.equal(app.sending, true)
  await emit({ type: 'done', conversationId: 'c1', turnId: 'new-independent', full: 'new complete output' })
  newerReply({ ok: true, data: { assistant: { id: 'z-turn-new-independent', author: 'orchestrator', text: 'new complete output', time: '' } } })
  await newerSend
  await flush()

  const uncertainSend = app.sendMessage('unconfirmed remote run')
  await flush()
  await emit({ type: 'start', conversationId: 'c1', turnId: 'uncertain', startedAt: 2980 })
  await emit({ type: 'delta', conversationId: 'c1', full: 'uncertain partial', delta: 'uncertain partial' })
  await emit({ type: 'queue_update', conversationId: 'c1', steering: [], followUp: ['keep queued'] })
  await emit({ type: 'connection', conversationId: 'c1', state: 'reconnecting', message: '恢复连接中' })
  reply({ ok: false, error: 'remote state unconfirmed', turnId: 'uncertain', runContinues: true })
  await uncertainSend
  await flush()
  assert.equal(app.sending, true, 'unconfirmed transport cannot terminate a native run')
  assert.equal(app.streamText, 'uncertain partial')
  assert.deepEqual(app.promptQueue.followUp, ['keep queued'])
  assert.equal(app.error, 'remote state unconfirmed')
  await emit({ type: 'connection', conversationId: 'c1', state: 'restored', message: '连接已恢复' })
  assert.equal(app.error, null)
  assert.equal(app.streamText, 'uncertain partial')
  await emit({ type: 'done', conversationId: 'c1', turnId: 'uncertain', full: 'uncertain complete', continuing: false })
  assert.equal(app.sending, false)

  await emit({ type: 'start', conversationId: 'background', startedAt: 3000 })
  await emit({ type: 'done', conversationId: 'background', full: 'background reply', continuing: true, turnId: 'bg' })
  assert.ok(app.runningConversationIds.includes('background'))
  assert.equal(app.sending, false, 'background turns must not affect active sending state')
  assert.ok(!app.messages.some(message => message.text === 'background reply'))
  await emit({ type: 'error', conversationId: 'background', turnId: 'bg-failed',
    full: 'background failed partial', message: 'cancelled' })
  assert.ok(!app.runningConversationIds.includes('background'))
  assert.ok(!app.messages.some(message => message.text === 'background failed partial'))
  console.log('conversation run lifecycle: production hook IPC races, queued completion, projection lag, repeated answers and background isolation passed')
} finally {
  for (const slot of slots) slot?.cleanup?.()
  globalThis.window = originalWindow
  delete globalThis.__taskweaverLifecycleHooks
  delete globalThis.__taskweaverLifecycleProjection
}
