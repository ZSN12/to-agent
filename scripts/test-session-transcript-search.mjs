import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { searchSessionTranscripts } from '../electron/backend/session-transcript-search.mjs'
import { createThreadStore } from '../electron/backend/thread-store.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-transcript-search-'))
const userData = root
const convDir = path.join(userData, 'taskweaver-agent', 'conversations')
await fs.mkdir(convDir, { recursive: true })

const conversationId = 'conv-jsonl-abc'
await fs.writeFile(
  path.join(convDir, `${conversationId}.jsonl`),
  `${JSON.stringify({ role: 'user', content: '请实现登录模块 refactor' })}\n${JSON.stringify({ role: 'assistant', text: '好的，开始修改' })}\n`,
)

const hits = await searchSessionTranscripts(convDir, '登录模块')
assert.equal(hits.length, 1)
assert.equal(hits[0].conversationId, conversationId)

const store = createThreadStore(userData, '/ws')
await store.initialize()
const created = await store.createThread({ title: '无关标题', workspacePath: '/ws' })
await store.setCurrent({ conversationId })

const found = await store.searchThreads('refactor', { workspacePath: '/ws' })
assert.ok(found.some((row) => row.conversationId === conversationId), 'thread search 应命中 jsonl 全文')

console.log('session-transcript-search 测试通过')
await fs.rm(root, { recursive: true, force: true })
