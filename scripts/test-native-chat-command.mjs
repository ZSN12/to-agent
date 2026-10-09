import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppStateStore } from '../electron/backend/app-state-store.mjs'
import { createUsageStore } from '../electron/backend/usage-store.mjs'
import { createChatTurnPersistence } from '../electron/backend/chat-turn-persistence.mjs'
import { createChatTurnPipeline } from '../electron/backend/chat-turn-pipeline.mjs'
import { nativeChatCommand } from '../electron/backend/native-chat-command.mjs'

for (const [input, expected] of [
  ['/compact', '/compact'], [' /COMPACT  ', '/compact'],
  ['/compact invalid-argument', '/compact invalid-argument'],
  ['/compact\n继续代码任务', null], ['/compactness', null],
  ['/plan', '/plan'], [' /PLAN  ', '/plan'], ['/plan off', '/plan off'],
  [' /PLAN\tOFF ', '/plan off'], ['/plan off now', null], ['/plan architecture', '/plan architecture'],
  ['/plan  refactor auth', '/plan refactor auth'],
  ['/plan\n继续代码任务', null], ['/planner', null],
  ['/dingtalk-chat\n用户任务', null], ['请解释 /compact', null], [null, null],
]) assert.equal(nativeChatCommand(input), expected)

const registerIpc = await fs.readFile(new URL('../electron/backend/register-ipc.mjs', import.meta.url), 'utf8')
const sendIpc = await fs.readFile(new URL('../electron/backend/ipc/register-chat-send-ipc.mjs', import.meta.url), 'utf8')
assert.equal(registerIpc.includes('【系统模式：计划模式 (Plan Mode)】'), false,
  'Plan guidance must come from the Host mode, not a hand-built local prompt prefix')
assert.match(sendIpc, /ipcHandle\(ipcMain, 'chat:send'/)
assert.match(sendIpc, /chatTurnPipeline\.runTurn/)

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-native-cmd-'))
try {
  const appState = createAppStateStore(home, home)
  const usageStore = createUsageStore(home)
  const persistNativeTurn = createChatTurnPersistence({ appState, usageStore })
  const conversationId = (await appState.getState()).conversationId
  const forbidden = (name) => () => { throw new Error(`unexpected task preparation: ${name}`) }
  let sent
  const chatTurnPipeline = createChatTurnPipeline({
    appState,
    usageStore,
    profileStore: {},
    resolveModelKeyForChat: async () => ({ modelKey: 'test/model' }),
    appPreferences: { get: async () => ({}) },
    createGitCheckpoint: forbidden('snapshot'),
    userDataPath: home,
    chat: {
      async send(options) {
        sent = options
        return { text: 'Compacted', command: true }
      },
    },
    orchestration: {},
    permissions: { withExecution: async (_mode, _sender, fn) => fn() },
    skills: { resolve: forbidden('skill') },
    persistNativeTurn,
    workspaceHooksTrusted: async () => false,
    sandboxContextLineForContext: forbidden('sandbox'),
  })

  const sender = { test: true }
  const result = await chatTurnPipeline.runTurn({
    webContents: sender,
    text: ' /COMPACT ',
    modelKey: 'test/model',
    skillName: 'dingtalk-chat',
    executionModeOverride: 'multi-agent',
    workMode: 'goal',
    conversationId,
    runtimeContext: { workspacePath: '/test/workspace', permissionMode: 'ask' },
  })
  assert.deepEqual(sent, {
    text: '/compact',
    modelKey: 'test/model',
    conversationId,
    cwdOverride: '/test/workspace',
    webContents: sender,
    agentPreset: 'standard',
  })
  assert.equal(result.assistant.text, 'Compacted')
  assert.equal(result.user.text, '/compact')

  sent = undefined
  const planResult = await chatTurnPipeline.runTurn({
    webContents: sender,
    text: ' /PLAN OFF ',
    modelKey: 'test/model',
    skillName: 'dingtalk-chat',
    executionModeOverride: 'multi-agent',
    workMode: 'goal',
    conversationId,
    runtimeContext: { workspacePath: '/test/workspace', permissionMode: 'ask' },
  })
  assert.deepEqual(sent?.text, '/plan off')
  assert.equal(planResult.user.text, '/plan off')

  const pipelineOnly = createChatTurnPipeline({
    appState,
    usageStore,
    profileStore: {},
    resolveModelKeyForChat: async () => ({ modelKey: 'test/model' }),
    appPreferences: { get: async () => ({}) },
    createGitCheckpoint: forbidden('snapshot'),
    userDataPath: home,
    chat: { send: forbidden('chat') },
    orchestration: {},
    permissions: {},
    skills: { resolve: forbidden('skill') },
    persistNativeTurn,
    workspaceHooksTrusted: async () => false,
    sandboxContextLineForContext: forbidden('sandbox'),
  })
  await assert.rejects(
    pipelineOnly.runTurn({
      webContents: sender,
      text: '/compact\nuser task',
      modelKey: null,
      skillName: null,
      executionModeOverride: null,
      workMode: 'code',
      conversationId,
      runtimeContext: { workspacePath: '/test/workspace', permissionMode: 'ask' },
    }),
    /sandbox/,
  )

  console.log('native command parser and production IPC routing pass: no injected task/skill/context prose')
} finally {
  await fs.rm(home, { recursive: true, force: true })
}
