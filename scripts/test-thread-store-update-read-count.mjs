import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createThreadStore } from '../backend/thread-store.mjs'

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-thread-update-scope-'))
const stores = []
try {
  const firstStore = createThreadStore(home, '/default/workspace')
  stores.push(firstStore)
  const initial = await firstStore.initialize()
  const second = await firstStore.createThread({ title: 'unrelated archived body' })
  const otherBody = {
    messages: [{ id: 'other-message', author: 'user', text: 'must not be loaded by the update' }],
    tasks: [],
    outputLogs: [],
  }

  const db = new DatabaseSync(firstStore.filePath)
  db.prepare('UPDATE thread_bodies SET body_json = ? WHERE thread_id = ?').run(JSON.stringify(otherBody), second.id)
  db.close()

  // A structurally damaged unrelated row is a sentinel: a full-body scan would fail here.
  const secondDb = new DatabaseSync(firstStore.filePath)
  secondDb.prepare('UPDATE thread_bodies SET body_json = ? WHERE thread_id = ?').run(
    JSON.stringify({ messages: {}, tasks: [], outputLogs: [] }), second.id,
  )
  secondDb.close()

  const updated = await firstStore.updateConversation(initial.conversationId, {
    title: 'one committed transaction snapshot',
    messages: [{ id: 'm1', author: 'user', text: 'hello' }],
    tasks: [{ id: 'task-1', status: 'done' }],
  })
  assert.equal(updated.title, 'one committed transaction snapshot')
  assert.equal(updated.conversationId, initial.conversationId)
  assert.deepEqual(updated.messages, [{ id: 'm1', author: 'user', text: 'hello' }])
  assert.deepEqual(updated.tasks, [{ id: 'task-1', status: 'done' }])
  assert.equal(updated.threads.find((thread) => thread.id === initial.id).messageCount, 1)
  assert.equal((await firstStore.listThreads()).length, 2, 'summary reads must not decode any conversation body')
  await assert.rejects(firstStore.getByConversationId(second.conversationId), /会话正文结构损坏/)

  // Restore the unrelated body and verify independent store instances serialize updates.
  const restoreDb = new DatabaseSync(firstStore.filePath)
  restoreDb.prepare('UPDATE thread_bodies SET body_json = ? WHERE thread_id = ?').run(JSON.stringify(otherBody), second.id)
  restoreDb.close()
  const secondStore = createThreadStore(home, '/other/workspace')
  stores.push(secondStore)
  await Promise.all([
    firstStore.updateConversation(initial.conversationId, { title: 'concurrent title' }),
    secondStore.updateConversation(initial.conversationId, { outputLogs: [{ id: 'log-1', text: 'kept' }] }),
  ])
  const latest = await firstStore.getByConversationId(initial.conversationId)
  assert.equal(latest.title, 'concurrent title')
  assert.deepEqual(latest.messages, [{ id: 'm1', author: 'user', text: 'hello' }])
  assert.deepEqual(latest.outputLogs, [{ id: 'log-1', text: 'kept' }])
  await assert.rejects(firstStore.updateConversation('missing-conversation', { title: 'no write' }), /找不到该对话/)

  console.log('thread-store update checks passed: one target body per update, summary-only list, committed transaction result, serialized same-process stores')
} finally {
  for (const store of stores) await store.close().catch(() => {})
  await fs.rm(home, { recursive: true, force: true })
}
