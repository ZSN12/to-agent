#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { createThreadStore } from '../backend/thread-store.mjs'

const [userDataArgument, outputArgument] = process.argv.slice(2)
if (!userDataArgument || !outputArgument) {
  console.error('Usage: node scripts/export-thread-store-rollback.mjs <user-data-directory> <output-json-path>')
  process.exitCode = 2
} else {
  const userDataPath = path.resolve(userDataArgument)
  const outputPath = path.resolve(outputArgument)
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
    if (!await store.isInitialized()) throw new Error('SQLite 会话库尚未完成迁移，未导出')
    const output = await store.exportRollbackSnapshot(outputPath)
    console.log(`已导出 ${output}；这是可回退的当前完整快照，旧版应用使用前请先停止所有写入进程。`)
  } finally {
    await store.close()
  }
}
