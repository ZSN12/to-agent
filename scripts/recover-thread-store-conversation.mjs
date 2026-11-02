#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { createThreadStore } from '../backend/thread-store.mjs'

const [userDataArgument, conversationIdArgument] = process.argv.slice(2)
if (!userDataArgument || !conversationIdArgument) {
  console.error('Usage: node scripts/recover-thread-store-conversation.mjs <user-data-directory> <conversation-id>')
  process.exitCode = 2
} else {
  const userDataPath = path.resolve(userDataArgument)
  const databasePath = path.join(userDataPath, 'taskweaver-threads.sqlite')
  let stat
  try {
    stat = await fs.stat(databasePath)
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`SQLite 会话库不存在：${databasePath}`)
    throw error
  }
  if (!stat.isFile()) throw new Error(`SQLite 会话库不是普通文件：${databasePath}`)

  const store = createThreadStore(userDataPath, null)
  try {
    if (!await store.isInitialized()) throw new Error('SQLite 会话库尚未完成迁移，未恢复')
    const restored = await store.recoverConversation(conversationIdArgument)
    console.log(`已恢复 conversationId=${conversationIdArgument}，messageCount=${restored.messages.length}。`)
  } finally {
    await store.close()
  }
}
