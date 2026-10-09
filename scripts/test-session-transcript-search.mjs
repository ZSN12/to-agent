import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createThreadStore } from '../electron/backend/thread-store.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-transcript-search-'))
try {
  const store = createThreadStore(root, '/ws')
  const first = await store.initialize({ threadId: 'legacy-thread', workspacePath: '/ws' })
  await store.renameThread(first.id, '旧讨论')
  await store.setSessionSearch(async (query) => {
    if (query !== '重构计划') return { items: [], hasMore: false }
    return {
      items: [{ conversationId: first.conversationId, snippet: '上次讨论的重构计划已经完成' }],
      hasMore: false,
    }
  })

  const found = await store.searchThreads('重构计划', { workspacePath: '/ws' })
  assert.equal(found.length, 1)
  assert.equal(found[0].conversationId, first.conversationId)
  assert.equal(found[0].searchSnippet, '上次讨论的重构计划已经完成')

  const localTitle = await store.searchThreads('旧讨论', { workspacePath: '/ws' })
  assert.equal(localTitle[0].conversationId, first.conversationId)
  assert.equal(localTitle[0].searchSnippet, undefined)
  console.log('Host-backed thread search test passed')
} finally {
  await fs.rm(root, { recursive: true, force: true })
}
