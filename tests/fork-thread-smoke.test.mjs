import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppStateStore } from '../electron/backend/app-state-store.mjs'
import {
  resolveForkCompletedTurns,
  resolveForkSliceEnd,
  sliceForkMessages,
} from '../electron/backend/fork-turns.mjs'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-fork-smoke-'))
const appState = createAppStateStore(home, '/tmp/workspace')
let state = await appState.createThread({ title: '主线' })
const threadId = state.currentThreadId
const msg = (id, author) => ({ id, author, name: author, time: '12:00', text: id })
await appState.appendMessagesToConversation(
  state.conversationId,
  msg('u1', 'user'),
  msg('a1', 'orchestrator'),
  msg('u2', 'user'),
  msg('a2', 'orchestrator'),
  msg('a3', 'orchestrator'),
)
const parentConversationId = state.conversationId

// 助手消息：保留到该消息为止
state = await appState.forkThread(threadId, 'a1')
assert.deepEqual(state.messages.map((m) => m.id), ['u1', 'a1'])
assert.notEqual(state.conversationId, parentConversationId)
assert.notEqual(state.currentThreadId, threadId)

// 用户消息：保留该消息所在整轮（含回答），不越过下一条用户消息
state = await appState.forkThread(threadId, 'u1')
assert.deepEqual(state.messages.map((m) => m.id), ['u1', 'a1'])
state = await appState.forkThread(threadId, 'u2')
assert.deepEqual(state.messages.map((m) => m.id), ['u1', 'a1', 'u2', 'a2', 'a3'])

// 纯函数：completedTurns 与切片一致
const messages = [msg('u1', 'user'), msg('a1', 'assistant'), msg('u2', 'user'), msg('a2', 'assistant'), msg('a2b', 'assistant'), msg('u3', 'user')]
assert.equal(resolveForkCompletedTurns(messages, 'a1'), 1)
assert.equal(resolveForkCompletedTurns(messages, 'u1'), 1)
assert.equal(resolveForkCompletedTurns(messages, 'u2'), 2)
assert.equal(resolveForkCompletedTurns(messages, 'a2'), 2)
assert.equal(resolveForkCompletedTurns(messages, 'u3'), 3)
assert.equal(resolveForkCompletedTurns(messages, undefined), 3)
assert.equal(resolveForkCompletedTurns(messages, 'missing'), 3)
assert.equal(resolveForkCompletedTurns([], 'u1'), undefined)
assert.equal(resolveForkCompletedTurns([msg('a0', 'assistant')], 'a0'), undefined)
assert.equal(resolveForkSliceEnd(messages, 'u2'), 5)
assert.equal(resolveForkSliceEnd(messages, 'u3'), 6)
assert.deepEqual(sliceForkMessages(messages, 'u2').map((m) => m.id), ['u1', 'a1', 'u2', 'a2', 'a2b'])

console.log('fork-thread-smoke passed')
