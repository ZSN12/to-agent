#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createThreadStore } from '../electron/backend/thread-store.mjs'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-thread-store-'))
const storeA = createThreadStore(tmp, '/tmp/fallback')
const storeB = createThreadStore(tmp, '/tmp/fallback')

await storeA.initialize()
await storeA.createThread({ title: '第二会话' })
const listed = await storeA.listThreads()
assert.equal(listed.length, 2)
const [first, second] = listed.sort((a, b) => a.title.localeCompare(b.title))

await Promise.all([
  storeA.renameThread(first.id, '并发改名 A'),
  storeB.renameThread(second.id, '并发改名 B'),
])

const after = await storeB.listThreads()
const titleA = after.find((t) => t.id === first.id)?.title
const titleB = after.find((t) => t.id === second.id)?.title
assert.equal(titleA, '并发改名 A')
assert.equal(titleB, '并发改名 B')

await fs.rm(tmp, { recursive: true, force: true })
console.log('thread-store concurrency: parallel renames persisted')
