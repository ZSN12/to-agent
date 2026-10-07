import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppStateStore } from '../electron/backend/app-state-store.mjs'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-fork-smoke-'))
const appState = createAppStateStore(home, '/tmp/workspace')
let state = await appState.createThread({ title: '主线' })
const threadId = state.currentThreadId
await appState.appendMessagesToConversation(state.conversationId, {
  id: 'u1',
  author: 'user',
  name: '你',
  time: '12:00',
  text: '第一条',
}, {
  id: 'a1',
  author: 'orchestrator',
  name: 'TW',
  time: '12:01',
  text: '回复',
})
const parentConversationId = state.conversationId
state = await appState.forkThread(threadId, 'u1')
assert.equal(state.messages.length, 1)
assert.equal(state.messages[0].id, 'u1')
assert.notEqual(state.conversationId, parentConversationId)
assert.notEqual(state.currentThreadId, threadId)
console.log('fork-thread-smoke passed')
