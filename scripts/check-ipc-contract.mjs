#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INVOKE_CHANNELS } from '../electron/ipc/channels.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const preloadPath = path.join(root, 'electron/preload.cjs')
const backendDir = path.join(root, 'electron/backend')

function listPreloadInvokeChannels() {
  const text = fs.readFileSync(preloadPath, 'utf8')
  return [...new Set([...text.matchAll(/invoke\('([^']+)'/g)].map((match) => match[1]))].sort()
}

function listRegisteredHandlers() {
  const channels = new Set()
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) {
        walk(full)
        continue
      }
      if (!name.endsWith('.mjs')) continue
      const text = fs.readFileSync(full, 'utf8')
      for (const match of text.matchAll(/ipcHandle\(\s*ipcMain,\s*'([^']+)'/g)) {
        channels.add(match[1])
      }
    }
  }
  walk(backendDir)
  return [...channels].sort()
}

const preloadChannels = listPreloadInvokeChannels()
const handlerChannels = listRegisteredHandlers()

const allowHandlerOnly = new Set(['debug:shadowTranscript'])
const allowPreloadOnly = new Set()

const missingHandlers = preloadChannels.filter(
  (channel) => !handlerChannels.includes(channel) && !allowPreloadOnly.has(channel),
)
const missingPreload = handlerChannels.filter(
  (channel) => !preloadChannels.includes(channel) && !allowHandlerOnly.has(channel),
)

if (missingHandlers.length) {
  console.error('check-ipc-contract: preload 通道缺少主进程 handler:\n', missingHandlers.join('\n'))
  process.exit(1)
}
if (missingPreload.length) {
  console.error('check-ipc-contract: handler 未暴露到 preload:\n', missingPreload.join('\n'))
  process.exit(1)
}

const tableChannels = [...INVOKE_CHANNELS].sort()
const tableSet = new Set(tableChannels)
const preloadSet = new Set(preloadChannels)
const handlerSet = new Set(handlerChannels)

const tableMissingFromPreload = tableChannels.filter((ch) => !preloadSet.has(ch))
const tableMissingFromHandlers = tableChannels.filter((ch) => !handlerSet.has(ch) && !allowHandlerOnly.has(ch))
const preloadNotInTable = preloadChannels.filter((ch) => !tableSet.has(ch))
const handlersNotInTable = handlerChannels.filter((ch) => !tableSet.has(ch) && !allowHandlerOnly.has(ch))

if (tableMissingFromPreload.length || tableMissingFromHandlers.length || preloadNotInTable.length || handlersNotInTable.length) {
  if (tableMissingFromPreload.length) {
    console.error('check-ipc-contract: channels.mjs 未出现在 preload:\n', tableMissingFromPreload.join('\n'))
  }
  if (tableMissingFromHandlers.length) {
    console.error('check-ipc-contract: channels.mjs 缺少 handler:\n', tableMissingFromHandlers.join('\n'))
  }
  if (preloadNotInTable.length) {
    console.error('check-ipc-contract: preload 通道未列入 channels.mjs:\n', preloadNotInTable.join('\n'))
  }
  if (handlersNotInTable.length) {
    console.error('check-ipc-contract: handler 未列入 channels.mjs:\n', handlersNotInTable.join('\n'))
  }
  process.exit(1)
}

console.log(`check-ipc-contract: ok (${preloadChannels.length} invoke channels, channels.mjs aligned)`)
