import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useThreadActions } from '../src/features/app/hooks/useThreadActions.ts'

const originalWindow = globalThis.window
function harness(initial, api) {
  let current = initial
  let resets = 0
  let sending = false
  let error = null
  const values = new Map()
  const storage = {
    get length() { return values.size },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  }
  globalThis.window = { taskweaver: { app: api }, localStorage: storage }
  const refs = {
    activeConversationIdRef: { current: initial.conversationId },
    conversationStartedAtRef: { current: new Map() },
    conversationStreamRef: { current: new Map() },
    permissionPromptsRef: { current: new Map() },
    userQuestionPromptsRef: { current: new Map() },
  }
  let actions
  const noop = () => {}
  function Host() {
    actions = useThreadActions({
      state: initial,
      ...refs,
      setState(value) { current = typeof value === 'function' ? value(current) : value },
      setError(value) { error = value },
      resetTransientConversationState() { resets += 1 },
      refreshSkills: noop, refreshSessionStats: noop,
      isConversationRunning: (id) => id === 'conversation-A',
      applyConversationStreamSnapshot: noop,
      setCompletedConversationIds: noop, setToolTraces: noop,
      setSending(value) { sending = value },
      setStreamStartedAt: noop, setPermissionPrompt: noop, setUserQuestionPrompt: noop,
    })
    return null
  }
  renderToStaticMarkup(React.createElement(Host))
  return { actions, refs, storage, get state() { return current }, get resets() { return resets }, get error() { return error }, get sending() { return sending } }
}
const threadA = { id: 'A', conversationId: 'conversation-A', workspacePath: '/A' }
const threadB = { id: 'B', conversationId: 'conversation-B', workspacePath: '/B' }
const state = { currentThreadId: 'A', conversationId: 'conversation-A', threads: [threadA, threadB], messages: [{ id: 'live-token' }], tasks: [], outputLogs: [] }
try {
  const h = harness(state, { deleteThread: async () => ({ ok: true, data: { ...state, threads: [threadA], messages: [] } }) })
  h.refs.conversationStreamRef.current.set('conversation-B', { text: 'old stream' })
  h.storage.setItem('taskweaver.workbench.v1.conversation-B', '{}')
  assert.equal(await h.actions.deleteThread('B'), true)
  assert.equal(h.resets, 0, 'deleting a background conversation must preserve active streaming UI')
  assert.deepEqual(h.state.messages, [{ id: 'live-token' }])
  assert.equal(h.state.threads.length, 1)
  assert.equal(h.refs.conversationStreamRef.current.has('conversation-B'), false)
  assert.equal(h.storage.getItem('taskweaver.workbench.v1.conversation-B'), null)

  const next = { ...state, currentThreadId: 'B', conversationId: 'conversation-B', threads: [threadB], messages: [] }
  const active = harness(state, { deleteThread: async () => ({ ok: true, data: next }) })
  assert.equal(await active.actions.deleteThread('A'), true)
  assert.equal(active.resets, 1)
  assert.equal(active.refs.activeConversationIdRef.current, 'conversation-B')
  assert.equal(active.state.currentThreadId, 'B')
  assert.equal(active.sending, false)

  let finishFirst
  const calls = []
  const navigation = harness(state, { switchThread: (id) => {
    calls.push(id)
    return id === 'A' ? new Promise((resolve) => { finishFirst = resolve }) : Promise.resolve({ ok: true, data: next })
  } })
  const first = navigation.actions.switchThread('A')
  const last = navigation.actions.switchThread('B')
  await Promise.resolve()
  assert.deepEqual(calls, ['A'])
  finishFirst({ ok: true, data: state })
  assert.equal(await first, false)
  assert.equal(await last, true)
  assert.deepEqual(calls, ['A', 'B'])
  assert.equal(navigation.state.currentThreadId, 'B')
  const offline = harness(state, { switchThread: async () => { throw new Error('offline') } })
  assert.equal(await offline.actions.switchThread('B'), false)
  assert.equal(offline.error, 'offline')
  assert.equal(offline.resets, 0)
  console.log('thread action checks passed: background deletion, active refs, serialized navigation, transport rejection')
} finally {
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
}
