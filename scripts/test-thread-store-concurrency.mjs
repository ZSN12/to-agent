#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createThreadStore } from '../backend/thread-store.mjs'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-thread-store-process-race-'))
const store = createThreadStore(tmp, '/tmp/fallback')
try {
  await store.initialize()
  const created = await store.createThread({ title: '多进程追加' })
  const moduleUrl = new URL('../backend/thread-store.mjs', import.meta.url).href
  const childSource = `
    import { createThreadStore } from ${JSON.stringify(moduleUrl)}
    const [root, conversationId, writer] = process.argv.slice(1)
    const store = createThreadStore(root, '/tmp/fallback')
    try {
      for (let i = 0; i < 24; i += 1) {
        await store.updateConversation(conversationId, thread => ({
          messages: [...thread.messages, { id: writer + '-' + i, author: 'assistant', text: writer }],
        }))
      }
    } finally {
      await store.close()
    }
  `
  const runWriter = (writer) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', childSource, tmp, created.conversationId, writer], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`writer ${writer} exited ${code ?? signal}: ${stderr || stdout}`))
    })
  })

  const childResults = await Promise.all([runWriter('writer-a'), runWriter('writer-b')])
  const latest = await store.getByConversationId(created.conversationId)
  assert.equal(latest.messages.length, 48, 'BEGIN IMMEDIATE must serialize cross-process read/modify/write updates')
  assert.equal(new Set(latest.messages.map((message) => message.id)).size, 48, 'no child-process update may overwrite another')
  assert.equal(latest.messages.filter((message) => message.id.startsWith('writer-a-')).length, 24)
  assert.equal(latest.messages.filter((message) => message.id.startsWith('writer-b-')).length, 24)
  assert.equal(childResults.length, 2)
  console.log('thread-store cross-process concurrency: 48 read/modify/write appends persisted without lost updates')
} finally {
  await store.close().catch(() => {})
  await fs.rm(tmp, { recursive: true, force: true })
}
