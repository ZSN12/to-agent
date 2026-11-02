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
    slots[i].setter ??= update => {
      const next = typeof update === 'function' ? update(slots[i].value) : update
      if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true }
    }
    return [slots[i].value, slots[i].setter]
  },
  useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i] },
  useMemo(fn, deps) {
    const i = cursor++
    if (!equalDeps(slots[i]?.deps, deps)) slots[i] = { value: fn(), deps }
    return slots[i].value
  },
  useCallback(fn, deps) { return hooks.useMemo(() => fn, deps) },
  useReducer(reducer, initial) {
    const i = cursor++
    slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }
    slots[i].dispatch ??= (action) => {
      const next = reducer(slots[i].value, action)
      if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true }
    }
    return [slots[i].value, slots[i].dispatch]
  },
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
    export { completedStreamMessage, endsConversationRun } from './src/features/chat/conversation-run-lifecycle';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'headless-hooks', setup(api) {
    api.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'lifecycle-test' }))
    api.onResolve({ filter: /useDshConversationView$/ }, () => ({ path: 'projection', namespace: 'lifecycle-test' }))
    api.onLoad({ filter: /.*/, namespace: 'lifecycle-test' }, ({ path }) => ({
      contents: path === 'hooks'
        ? 'export const {useState,useReducer,useRef,useMemo,useCallback,useEffect} = globalThis.__taskweaverLifecycleHooks;'
        : 'export const useDshConversationView = globalThis.__taskweaverLifecycleProjection;',
    }))
  } }],
})
const { useAppBackend, mergeStoredMessagesWithDshTranscript, completedStreamMessage, endsConversationRun } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
let onStream
let reply
let rejectReply
let sendMode = 'deferred'
let sendCalls = 0
let roleSendCalls = 0
let roleReply
let backendRunning = []
const followUpMessages = []
let listRunningReject = false
let appStateReject = false
let deferredAppState = null
let runningPoll
const state = { conversationId: 'c1', workspacePath: process.cwd(), currentThreadId: 't1',
  threadTitle: 'test', threads: [], messages: [], tasks: [], outputLogs: [], permissionMode: 'ask' }
let backendAppState = state
const bridge = {
  app: {
    getState: async () => {
      if (deferredAppState) {
        const deferred = deferredAppState
        deferredAppState = null
        return deferred.promise
      }
      if (appStateReject) throw new Error('app bridge offline')
      return { ok: true, data: backendAppState }
    },
    switchThread: async threadId => {
      backendAppState = {
        ...state,
        conversationId: threadId === 't2' ? 'c2' : threadId === 't-new' || threadId === 't-new-2' ? null : 'c1',
        currentThreadId: threadId,
        messages: [],
      }
      return { ok: true, data: backendAppState }
    },
  },
  chat: {
    onStream(fn) { onStream = fn; return () => { onStream = null } },
    listRunningConversations: async () => {
      if (listRunningReject) throw new Error('chat bridge offline')
      return { ok: true, data: backendRunning }
    },
    send: () => {
      sendCalls++
      if (sendMode === 'reject') return Promise.reject(new Error('send bridge offline'))
      return new Promise((resolve, reject) => { reply = resolve; rejectReply = reject })
    },
    sendAsRoles: () => {
      roleSendCalls++
      return new Promise((resolve) => { roleReply = resolve })
    },
    followUp: async (text) => {
      followUpMessages.push(text)
      return { ok: true, data: { accepted: true, queued: true } }
    },
  },
}
const originalWindow = globalThis.window
globalThis.window = { taskweaver: bridge, setInterval: callback => { runningPoll = callback; return 1 }, clearInterval() {},
  localStorage: { getItem: () => null, setItem() {} } }
// A frame elapses on the next microtask, so `flush()` models time passing
// between IPC events while synchronous bursts still share one frame.
const originalAnimationFrame = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame]
const frameCallbacks = new Map()
let nextFrameId = 0
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextFrameId
  frameCallbacks.set(id, callback)
  queueMicrotask(() => {
    const scheduled = frameCallbacks.get(id)
    frameCallbacks.delete(id)
    scheduled?.(0)
  })
  return id
}
globalThis.cancelAnimationFrame = (id) => { frameCallbacks.delete(id) }
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
async function emit(event) {
  if (event.type === 'start' && event.conversationId && !backendRunning.includes(event.conversationId)) {
    backendRunning.push(event.conversationId)
  }
  if (endsConversationRun(event) && event.conversationId) {
    backendRunning = backendRunning.filter((id) => id !== event.conversationId)
  }
  onStream(event)
  await flush()
}
try {
  render()
  await flush()
  assert.equal(app.state.conversationId, 'c1')
  const firstSend = app.sendMessage('read the entrypoint')
  await flush()
  const firstSendReply = reply
  await emit({ type: 'start', conversationId: 'c1', turnId: 'first', startedAt: 1000 })
  await app.switchThread('t2')
  await flush()
  assert.equal(app.state.conversationId, 'c2')
  const secondSend = app.sendMessage('review the separate conversation')
  await flush()
  const secondSendReply = reply
  assert.equal(sendCalls, 2,
    'an in-flight request in another conversation must not block a new task')
  await emit({ type: 'start', conversationId: 'c2', turnId: 'parallel', startedAt: 1001 })
  await app.switchThread('t1')
  await flush()
  assert.equal(app.state.conversationId, 'c1')
  assert.equal(app.sending, true,
    'switching back must restore the first conversation’s active state')
  assert.equal(await app.sendMessage('correct this direction'), true,
    'a normal send racing with an active turn must be redirected to the follow-up queue')
  assert.deepEqual(followUpMessages, ['correct this direction'],
    'an active in-flight turn must accept the message through its queue endpoint instead of rejecting it')
  assert.equal(sendCalls, 2, 'redirecting a correction must not start a third model turn')
  assert.ok(app.runningConversationIds.includes('c1') && app.runningConversationIds.includes('c2'),
    'two independent conversations must both show as running')
  await emit({ type: 'done', conversationId: 'c2', turnId: 'parallel', startedAt: 1001,
    full: 'parallel answer', continuing: false })
  secondSendReply({ ok: true, data: { accepted: true,
    user: { id: 'u2', author: 'user', text: 'review the separate conversation', time: '' } } })
  await secondSend
  reply = firstSendReply
  assert.ok(app.completedConversationIds.includes('c2'), 'a background completion must show an unread reminder')
  assert.ok(app.runningConversationIds.includes('c1') && !app.runningConversationIds.includes('c2'),
    'completing one conversation must leave the other conversation running')
  await emit({ type: 'delta', conversationId: 'c1', delta: 'first answer', full: 'first answer' })
  await emit({ type: 'tool', conversationId: 'c1', id: 'first-read', toolName: 'read', status: 'done' })
  assert.equal(app.toolTraces.length, 1, 'active turn tool calls should be visible in the current tool batch')
  await app.followUpMessage('a queued question')
  await flush()
  await emit({ type: 'done', conversationId: 'c1', turnId: 'first', startedAt: 1000,
    full: 'first answer', fullThinking: 'first reasoning', continuing: true })
  assert.equal(app.sending, true, 'intermediate done must not stop the run')
  assert.ok(app.runningConversationIds.includes('c1'))
  assert.ok(!app.completedConversationIds.includes('c1'))
  assert.equal(app.messages.filter(message => message.text === 'first answer').length, 1)
  await emit({ type: 'start', conversationId: 'c1', turnId: 'next', startedAt: 2000 })
  assert.equal(app.toolTraces.length, 0, 'the next queued turn must not inherit the prior turn tool batch')
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
  assert.ok(!app.completedConversationIds.includes('c1'), 'the conversation being viewed must not show an unread completion')
  assert.ok(app.completedConversationIds.includes('c2'), 'reading the active conversation must preserve the background reminder')
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
  const cappedTurn = completedStreamMessage({ type: 'error', turnId: 'max-steps-empty', conversationId: 'c1',
    full: '', fullThinking: '', message: '本轮已达到安全步数上限，点击“继续”可接着完成。', code: 'MAX_STEPS' })
  assert.equal(cappedTurn?.errorCode, 'MAX_STEPS', 'a step-limit failure is actionable even without partial text')
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
  backendAppState = { ...backendAppState, messages: app.state.messages.map(message => ({ ...message })) }
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

  await emit({ type: 'start', conversationId: 'c1', turnId: 'burst', startedAt: 2990 })
  for (const delta of ['a', 'b', 'c']) onStream({ type: 'delta', conversationId: 'c1', delta })
  assert.equal(app.streamText, '', 'token-rate deltas wait for the next frame instead of rendering per token')
  await flush()
  assert.equal(app.streamText, 'abc', 'one frame applies the whole burst in arrival order')
  onStream({ type: 'delta', conversationId: 'c1', delta: 'd' })
  await emit({ type: 'done', conversationId: 'c1', turnId: 'burst', full: 'abcd', continuing: false })
  assert.equal(app.streamText, null, 'a terminal event applies queued copy before it commits the turn')
  assert.equal(app.messages.filter(message => message.text === 'abcd').length, 1)
  assert.equal(app.sending, false)

  // A terminal stream event can reach the renderer before the send IPC reply
  // finishes its post-turn bookkeeping. That acknowledgement must not keep a
  // completed conversation locked against the next user message.
  const terminalBeforeAck = app.sendMessage('first turn with delayed acknowledgement')
  await flush()
  const terminalAck = reply
  await emit({ type: 'start', conversationId: 'c1', turnId: 'terminal-before-ack', startedAt: 2995 })
  await emit({ type: 'done', conversationId: 'c1', turnId: 'terminal-before-ack', full: 'first turn completed' })
  assert.equal(app.sending, false, 'the terminal event makes the completed turn available')
  const sendCountAfterTerminal = sendCalls
  const nextAfterTerminal = app.sendMessage('next turn immediately after completion')
  await flush()
  assert.equal(sendCalls, sendCountAfterTerminal + 1,
    'a delayed acknowledgement from the completed turn cannot block a distinct next send')
  const nextAfterTerminalReply = reply
  await emit({ type: 'start', conversationId: 'c1', turnId: 'next-after-terminal', startedAt: 2996 })
  await emit({ type: 'done', conversationId: 'c1', turnId: 'terminal-before-ack', full: 'late duplicate terminal' })
  assert.equal(app.sending, true, 'a late terminal event from the previous turn cannot stop the newer turn')
  assert.ok(app.runningConversationIds.includes('c1'), 'a stale terminal event cannot clear the current run marker')
  terminalAck({ ok: true, data: { assistant: { id: 'z-turn-terminal-before-ack', author: 'orchestrator', text: 'first turn completed', time: '' } } })
  await terminalBeforeAck
  await flush()
  assert.equal(app.sending, true, 'the earlier acknowledgement cannot clear the next turn state')
  nextAfterTerminalReply({ ok: true, data: { accepted: true, queued: true,
    user: { id: 'u-next-after-terminal', author: 'user', text: 'next turn immediately after completion', time: '' } } })
  await nextAfterTerminal
  await emit({ type: 'done', conversationId: 'c1', turnId: 'next-after-terminal', full: 'next turn completed' })

  const firstRoleReply = {
    id: 'role-first-reply', author: 'orchestrator', name: '小王', text: '第一个 Bot 的完整回答',
    roleMode: true, speakerId: 'role-one', time: '',
  }
  const secondRoleReply = {
    id: 'role-second-reply', author: 'orchestrator', name: '小张', text: '第二个 Bot 的补充回答',
    roleMode: true, speakerId: 'role-two', time: '',
  }
  const roleDiscussion = app.sendAsRoles('两个 Bot 接力讨论', ['role-one', 'role-two'])
  await flush()
  assert.equal(roleSendCalls, 1)
  await emit({ type: 'role_progress', conversationId: 'c1', roleId: 'role-one', roleName: '小王',
    status: 'started', streamToRenderer: true })
  await emit({ type: 'delta', conversationId: 'c1', delta: '小王正在回答', full: '小王正在回答' })
  await emit({ type: 'role_progress', conversationId: 'c1', roleId: 'role-one', roleName: '小王',
    status: 'completed', streamToRenderer: true, assistantMessage: firstRoleReply })
  await emit({ type: 'role_progress', conversationId: 'c1', roleId: 'role-two', roleName: '小张',
    status: 'started', streamToRenderer: true })
  assert.ok(app.messages.some((message) => message.id === firstRoleReply.id),
    'the first Bot answer remains in the transcript when the next Bot resets the live stream')
  await emit({ type: 'delta', conversationId: 'c1', delta: '小张正在回答', full: '小张正在回答' })
  roleReply({ ok: true, data: {
    user: { id: 'role-user', author: 'user', text: '两个 Bot 接力讨论', roleMode: true, time: '' },
    assistants: [firstRoleReply, secondRoleReply], roleErrors: [],
  } })
  await roleDiscussion
  await flush()
  assert.equal(app.messages.filter((message) => message.id === firstRoleReply.id).length, 1,
    'the delayed group reply deduplicates the already streamed first Bot answer')
  assert.equal(app.messages.filter((message) => message.id === secondRoleReply.id).length, 1)
  assert.equal(app.sending, false, 'a completed Bot round must release the composer for the next message')

  const thirdRoleReply = {
    id: 'role-third-reply', author: 'orchestrator', name: '小王', text: '第三条：第二轮小王回答',
    roleMode: true, speakerId: 'role-one', time: '',
  }
  const fourthRoleReply = {
    id: 'role-fourth-reply', author: 'orchestrator', name: '小张', text: '第四条：第二轮小张回答',
    roleMode: true, speakerId: 'role-two', time: '',
  }
  const roleFollowUp = app.sendAsRoles('第二轮补充任务', ['role-one', 'role-two'])
  await flush()
  assert.equal(roleSendCalls, 2, 'the same conversation must accept a follow-up after the first Bot round completes')
  assert.equal(app.sending, true)
  assert.ok(app.messages.some((message) => message.id === firstRoleReply.id)
    && app.messages.some((message) => message.id === secondRoleReply.id),
  'the previous round must remain visible while its follow-up is running')
  await emit({ type: 'role_progress', conversationId: 'c1', roleId: 'role-one', roleName: '小王',
    status: 'started', streamToRenderer: true })
  await emit({ type: 'delta', conversationId: 'c1', delta: '第二轮小王正在回答', full: '第二轮小王正在回答' })
  await emit({ type: 'role_progress', conversationId: 'c1', roleId: 'role-one', roleName: '小王',
    status: 'completed', streamToRenderer: true, assistantMessage: thirdRoleReply })
  await emit({ type: 'role_progress', conversationId: 'c1', roleId: 'role-two', roleName: '小张',
    status: 'started', streamToRenderer: true })
  assert.ok(app.messages.some((message) => message.id === firstRoleReply.id)
    && app.messages.some((message) => message.id === secondRoleReply.id)
    && app.messages.some((message) => message.id === thirdRoleReply.id),
  'starting the next Bot must preserve both the prior round and the completed reply from this round')
  await emit({ type: 'delta', conversationId: 'c1', delta: '第二轮小张正在回答', full: '第二轮小张正在回答' })
  roleReply({ ok: true, data: {
    user: { id: 'role-user-two', author: 'user', text: '第二轮补充任务', roleMode: true, time: '' },
    assistants: [thirdRoleReply, fourthRoleReply], roleErrors: [],
  } })
  await roleFollowUp
  await flush()
  assert.equal(app.sending, false)
  for (const message of [firstRoleReply, secondRoleReply, thirdRoleReply, fourthRoleReply]) {
    assert.equal(app.messages.filter((row) => row.id === message.id).length, 1,
      'streamed and committed role replies must be deduplicated across consecutive rounds')
  }
  assert.ok(app.messages.some((message) => message.id === 'role-user')
    && app.messages.some((message) => message.id === 'role-user-two'),
  'both user turns must remain in the shared transcript')

  await emit({ type: 'start', conversationId: 'background', startedAt: 3000 })
  await emit({ type: 'done', conversationId: 'background', full: 'background reply', continuing: true, turnId: 'bg' })
  assert.ok(app.runningConversationIds.includes('background'))
  assert.equal(app.sending, false, 'background turns must not affect active sending state')
  assert.ok(!app.messages.some(message => message.text === 'background reply'))
  await emit({ type: 'error', conversationId: 'background', turnId: 'bg-failed',
    full: 'background failed partial', message: 'cancelled' })
  assert.ok(!app.runningConversationIds.includes('background'))
  assert.ok(!app.messages.some(message => message.text === 'background failed partial'))

  // A rejected transport with no start evidence must stop the ordinary spinner,
  // keep the composer draft in the caller, and block blind resubmission until a
  // later successful running-state poll reconciles the uncertain request.
  sendMode = 'reject'
  listRunningReject = true
  appStateReject = true
  const sendCountBeforeOffline = sendCalls
  const offlineSend = app.sendMessage('offline draft with attachment/reference')
  await flush()
  assert.equal(await offlineSend, 'uncertain')
  await runningPoll?.()
  await flush()
  assert.equal(app.sending, false, 'no-start transport failure must not leave the ordinary sending spinner running')
  assert.ok(!app.runningConversationIds.includes('c1'))
  assert.match(app.error, /状态未能确认|状态仍未确认/)
  assert.match(app.error, /等待连接恢复/)
  assert.match(app.error, /停止普通发送指示器/)
  appStateReject = false
  sendMode = 'deferred'
  assert.equal(await app.sendMessage('offline draft with attachment/reference'), false,
    'an uncertain request cannot be resubmitted before transcript and running-state confirmation')
  assert.equal(sendCalls, sendCountBeforeOffline + 1, 'guarded retry never reaches the bridge')

  // An empty running snapshot is insufficient when the same conversation's
  // durable transcript reload still rejects. Keep the request gate closed.
  appStateReject = true
  listRunningReject = false
  await runningPoll?.()
  await flush()
  assert.equal(await app.sendMessage('offline draft with attachment/reference'), false,
    'an empty running snapshot cannot release the gate while transcript refresh fails')
  assert.equal(sendCalls, sendCountBeforeOffline + 1,
    'a rejected transcript reload keeps blind retries away from the bridge')

  // A successful transcript refresh marks the row state, but the poll that
  // overlapped that refresh cannot release the gate. Require a later snapshot.
  appStateReject = false
  await runningPoll?.()
  await flush()
  assert.equal(await app.sendMessage('offline draft with attachment/reference'), false,
    'a successful transcript refresh still waits for a later running snapshot')
  assert.equal(sendCalls, sendCountBeforeOffline + 1)
  await runningPoll?.()
  await flush()

  // Exercise the rejected-reload branch too: reload and running-state IPC both
  // fail while the send has an explicit rejection, but the explicit send error
  // remains visible and the call settles instead of hanging.
  listRunningReject = false
  await runningPoll?.()
  await flush()
  appStateReject = true
  const sendCallsBeforeExplicitReject = sendCalls
  const rejectedSend = app.sendMessage('server rejected')
  await flush()
  assert.equal(sendCalls, sendCallsBeforeExplicitReject + 1,
    'a deliberate send reaches the bridge after both transcript and running-state confirmation')
  reply({ ok: false, error: 'server rejected' })
  await rejectedSend
  await flush()
  assert.equal(app.sending, false)
  assert.equal(app.error, 'server rejected', 'a failed reload must not replace the explicit send rejection')
  appStateReject = false

  // A late rejected request belongs to c1 even after navigation to c2. It must
  // not clear c2's live stream or install a stale error in the new conversation.
  const staleSend = app.sendMessage('late rejection from c1')
  await flush()
  await app.switchThread('t2')
  await flush()
  await emit({ type: 'start', conversationId: 'c2', turnId: 'c2-live', startedAt: 4000 })
  await emit({ type: 'delta', conversationId: 'c2', delta: 'c2 output', full: 'c2 output' })
  rejectReply(new Error('late c1 transport failure'))
  assert.equal(await staleSend, 'uncertain')
  await flush()
  assert.equal(app.state.conversationId, 'c2')
  assert.equal(app.error, null, 'a late failure from c1 must not replace the active c2 error state')
  assert.equal(app.sending, true)
  assert.equal(app.streamText, 'c2 output')
  await emit({ type: 'done', conversationId: 'c2', turnId: 'c2-live', full: 'c2 output' })

  // The backend may have accepted a request and emitted start before its IPC
  // acknowledgement is lost. Preserve that run and keep retries blocked until
  // the terminal event or a later authoritative running snapshot.
  const acceptedButUnacked = app.sendMessage('accepted but acknowledgement lost')
  await flush()
  await emit({ type: 'start', conversationId: 'c2', turnId: 'ack-lost', startedAt: 4100 })
  backendAppState = { ...backendAppState, messages: [
    ...backendAppState.messages,
    { id: 'u-ack-lost', author: 'user', text: 'accepted but acknowledgement lost', time: '' },
  ] }
  rejectReply(new Error('acknowledgement lost'))
  assert.equal(await acceptedButUnacked, 'uncertain')
  await flush()
  assert.equal(app.sending, true, 'an observed start must keep the accepted run active after its ack is lost')
  assert.ok(app.runningConversationIds.includes('c2'))
  assert.match(app.error, /状态未能确认|状态仍未确认/)
  assert.match(app.error, /请勿重复提交这条消息/)
  await flush()
  assert.ok(app.state.messages.some(message => message.id === 'u-ack-lost'),
    'the guarded recovery reload must surface the durable user row when the backend accepted the send')
  assert.match(app.error, /请勿重复提交这条消息/,
    'the reload result keeps a no-duplicate instruction while the run is active')
  const sendCallsBeforeUncertainRetry = sendCalls
  const uncertainRetry = app.sendMessage('accepted but acknowledgement lost')
  await flush()
  assert.equal(sendCalls, sendCallsBeforeUncertainRetry,
    `an uncertain request must be blocked before it reaches the bridge: ${JSON.stringify({ state: app.state?.conversationId, error: app.error, sending: app.sending, ids: app.runningConversationIds })}`)
  assert.equal(await uncertainRetry, false,
    'an accepted but unacknowledged request cannot be sent twice while its run is active')
  await emit({ type: 'done', conversationId: 'c2', turnId: 'ack-lost', full: 'ack-lost result' })

  // A new thread has no conversation ID to key running state by. A transport
  // rejection still clears its spinner and blocks the same draft until reload
  // supplies an ID that lets the user inspect the durable transcript.
  await app.switchThread('t-new')
  await flush()
  assert.equal(app.state.conversationId, null)
  sendMode = 'reject'
  listRunningReject = true
  appStateReject = true
  const noIdCallCount = sendCalls
  const noIdSend = app.sendMessage('new thread offline draft')
  await flush()
  assert.equal(await noIdSend, 'uncertain')
  await runningPoll?.()
  await flush()
  assert.equal(app.sending, false, 'a rejected new-thread request without an ID must stop the ordinary spinner')
  assert.match(app.error, /尚未获得会话ID/)
  assert.equal(await app.reload().then(() => 'resolved', () => 'rejected'), 'rejected',
    'the offline fixture also rejects reload')
  await flush()
  assert.equal(app.sending, false)
  assert.equal(app.loading, false, 'a rejected reload must release its loading indicator')
  assert.equal(await app.sendMessage('new thread offline draft'), false,
    'the same no-ID draft stays blocked until reload supplies a conversation ID')
  assert.equal(sendCalls, noIdCallCount + 1)

  // Once a reload gives the uncertain thread an ID, keep its gate closed until
  // a versioned listRunning snapshot taken after that transfer succeeds.
  appStateReject = false
  listRunningReject = false
  backendAppState = { ...state, conversationId: 'c-new', currentThreadId: 't-new', messages: [] }
  await app.reload()
  await flush()
  assert.equal(app.state.conversationId, 'c-new')
  const sendCallsBeforeIdGate = sendCalls
  assert.equal(await app.sendMessage('new thread offline draft'), false,
    'receiving an ID alone must not release the uncertain new-thread gate')
  assert.equal(sendCalls, sendCallsBeforeIdGate)
  await runningPoll?.()
  await flush()
  assert.equal(await app.sendMessage('new thread offline draft'), false,
    'an ID transfer requires transcript confirmation and a later running snapshot')
  await runningPoll?.()
  await flush()
  sendMode = 'reject'
  assert.equal(await app.sendMessage('new thread offline draft'), 'uncertain',
    'a successful running snapshot releases the gate so the user can deliberately retry')
  assert.equal(sendCalls, sendCallsBeforeIdGate + 1)
  await emit({ type: 'done', conversationId: 'c-new', turnId: 'deliberate-retry', full: 'retry checked' })

  // A delayed reload from one conversation must not overwrite a later thread
  // selection when its getState response eventually arrives.
  await app.switchThread('t2')
  await flush()
  let resolveDeferredAppState
  const delayedAppState = new Promise(resolve => { resolveDeferredAppState = resolve })
  deferredAppState = { promise: delayedAppState }
  const staleReload = app.reload()
  await Promise.resolve()
  await app.switchThread('t1')
  await flush()
  assert.equal(app.state.conversationId, 'c1')
  resolveDeferredAppState({ ok: true, data: { ...state, conversationId: 'c2', currentThreadId: 't2', messages: [] } })
  await staleReload
  await flush()
  assert.equal(app.state.conversationId, 'c1', 'a late reload must not replace the conversation selected while it was pending')

  // Conversation IDs are both null for newly created threads. Navigation must
  // invalidate that reload by request generation as well as by conversation ID.
  await app.switchThread('t-new')
  await flush()
  let resolveDeferredNullState
  const delayedNullState = new Promise(resolve => { resolveDeferredNullState = resolve })
  deferredAppState = { promise: delayedNullState }
  const staleNullReload = app.reload()
  await Promise.resolve()
  await app.switchThread('t-new-2')
  await flush()
  assert.equal(app.state.currentThreadId, 't-new-2')
  resolveDeferredNullState({ ok: true, data: { ...state, conversationId: null, currentThreadId: 't-new', messages: [] } })
  await staleNullReload
  await flush()
  assert.equal(app.state.currentThreadId, 't-new-2', 'a delayed reload must not replace a different new thread that also has no conversation ID')

  // Let fire-and-forget recovery polling and the initial reload settle before
  // restoring the browser bridge globals in this headless hook harness.
  await flush()
  await new Promise(resolve => setTimeout(resolve, 0))
  await flush()
  console.log('conversation run lifecycle: independent cross-conversation sends, IPC races, offline uncertainty, duplicate protection, late failure, queued completion, projection lag and background isolation passed')
} finally {
  for (const slot of slots) slot?.cleanup?.()
  globalThis.window = originalWindow
  ;[globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame] = originalAnimationFrame
  delete globalThis.__taskweaverLifecycleHooks
  delete globalThis.__taskweaverLifecycleProjection
}
