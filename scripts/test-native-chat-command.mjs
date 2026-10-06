import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { nativeChatCommand } from '../electron/backend/native-chat-command.mjs'

for (const [input, expected] of [
  ['/compact', '/compact'], [' /COMPACT  ', '/compact'],
  ['/compact invalid-argument', '/compact invalid-argument'],
  ['/compact\n继续代码任务', null], ['/compactness', null],
  ['/dingtalk-chat\n用户任务', null], ['请解释 /compact', null], [null, null],
]) assert.equal(nativeChatCommand(input), expected)

// Execute the actual IPC handler closure without initializing Electron, user
// settings, or the Host. Only its collaborators are substituted. This checks
// routing, not Electron transport or visual rendering.
const source = await fs.readFile(new URL('../electron/backend/register-ipc.mjs', import.meta.url), 'utf8')
const start = source.indexOf("  ipcHandle(ipcMain, 'chat:send',")
const end = source.indexOf("  ipcHandle(ipcMain, 'tasks:sendMessage',", start)
assert.ok(start >= 0 && end > start)
let handler
let sent
const calls = []
const forbidden = name => () => { throw new Error(`unexpected task preparation: ${name}`) }
const dependencies = {
  ipcMain: {}, ipcHandle(_ipc, channel, fn) { assert.equal(channel, 'chat:send'); handler = fn },
  nativeChatCommand,
  resolveIpcConversationId: async id => id,
  getConversationRuntimeContext: async () => ({ workspacePath: '/test/workspace' }),
  withTurnLock: async (id, fn) => { calls.push(`lock:${id}`); return fn() },
  validateAndResolveModel: async () => ({ modelKey: 'test/model' }),
  createUserMessage: async text => ({ messageId: 'u1', time: 1, userEntry: { text } }),
  chat: { async send(options) { sent = options; return { text: 'Compacted', command: true } } },
  handleChatError: async error => { throw error },
  createAssistantMessage: async result => { calls.push('persist-result'); return result },
  tryAutoSnapshot: forbidden('snapshot'), skills: { resolve: forbidden('skill') },
  assembleWorkspaceContext: forbidden('context'), sandboxContextLineForContext: forbidden('sandbox'),
  preparePromptByWorkMode: forbidden('work mode'), decideExecutionMode: forbidden('policy'),
  resolveExecutionMode: forbidden('orchestration'), executeChatRequest: forbidden('agent'),
}
new Function(...Object.keys(dependencies), source.slice(start, end))(...Object.values(dependencies))
const sender = { test: true }
const result = await handler({ sender }, ' /COMPACT ', 'test/model', 'dingtalk-chat', 'multi-agent', 'goal', 'c1')
assert.deepEqual(sent, { text: '/compact', modelKey: 'test/model', conversationId: 'c1',
  cwdOverride: '/test/workspace', webContents: sender })
assert.equal(result.assistant.command, true)
assert.equal(result.user.text, '/compact')
assert.deepEqual(calls, ['lock:c1', 'persist-result'])
await assert.rejects(handler({ sender }, '/compact\nuser task', null, null, null, 'code', 'c1'), /snapshot/)
console.log('native command parser and production IPC routing pass: no injected task/skill/context prose')
