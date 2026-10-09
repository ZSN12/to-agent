import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppStateStore } from '../electron/backend/app-state-store.mjs'
import { createUsageStore } from '../electron/backend/usage-store.mjs'
import { createChatTurnPersistence } from '../electron/backend/chat-turn-persistence.mjs'
import { IPC_ERROR_MESSAGE_MAX_LENGTH } from '../electron/backend/config.mjs'
import { humanizeBridgeTransportError } from '../electron/backend/cursor-tool-guidance.mjs'

// Execute the production IPC persistence helpers with real stores, no Electron
// or model provider. This checks delayed IPC and aggregate accounting contracts.
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-turn-persistence-'))
try {
  const appState = createAppStateStore(home, home)
  const usageStore = createUsageStore(home)
  const persistNativeTurn = createChatTurnPersistence({ appState, usageStore })
  const conversationId = (await appState.getState()).conversationId
  const activeKey = 'local/test'
  const source = await fs.readFile(new URL('../electron/backend/register-ipc.mjs', import.meta.url), 'utf8')
  const { ipcHandle } = await import('../electron/backend/ipc-utils.mjs')
  const start = source.indexOf('  const handleChatError = async')
  const end = source.indexOf('  // ========== chat:send main handler', start)
  assert.ok(start >= 0 && end > start)
  const { handleChatError, createAssistantMessage } = new Function('appState', 'usageStore', 'persistNativeTurn',
    'IPC_ERROR_MESSAGE_MAX_LENGTH', 'humanizeBridgeTransportError',
    `${source.slice(start, end)}\nreturn {handleChatError,createAssistantMessage}`)(
    appState, usageStore, persistNativeTurn, IPC_ERROR_MESSAGE_MAX_LENGTH, humanizeBridgeTransportError)
  const result = { turnId: 'first', startedAt: Date.now(), text: 'completed turn', thinking: 'reasoning',
    fileChanges: [{ path: 'src/main.ts', addedLines: 2, deletedLines: 1 }],
    usage: { inputTokens: 10, outputTokens: 2, elapsedMs: 50 } }
  await persistNativeTurn({ conversationId, modelKey: activeKey, result })
  result.nativePersisted = true
  await createAssistantMessage(result, 'ipc-first', '12:00', activeKey, { mode: 'single-agent' }, conversationId)
  await createAssistantMessage(result, 'ipc-first', '12:00', activeKey, { mode: 'single-agent' }, conversationId)
  assert.equal((await appState.getConversationState(conversationId)).messages.length, 1)
  assert.deepEqual((await appState.getConversationState(conversationId)).messages[0].fileChanges, result.fileChanges,
    'file change summaries must survive native persistence and delayed IPC reconciliation')
  const readLedger = async () => JSON.parse(await fs.readFile(path.join(home, 'taskweaver-model-usage.json'), 'utf8')).records
  assert.equal((await readLedger()).length, 1, 'delayed IPC must not duplicate native ledger record')

  const partial = { ...result, turnId: 'failed', text: 'partial output', nativePersisted: false }
  const error = Object.assign(new Error('Controlled failure'), { partialResult: partial, modelKey: activeKey })
  let wrappedHandler
  ipcHandle({ handle(_channel, handler) { wrappedHandler = handler } }, 'chat:send', async () => { throw error })
  assert.deepEqual(await wrappedHandler({}), { ok: false, error: 'Controlled failure', turnId: 'failed' },
    'actual IPC wrapper must preserve failed turn identity for delayed replies')
  const uncertain = Object.assign(new Error('state unconfirmed'), { runContinues: true, turnId: 'still-running' })
  ipcHandle({ handle(_channel, handler) { wrappedHandler = handler } }, 'chat:send', async () => { throw uncertain })
  assert.deepEqual(await wrappedHandler({}), { ok: false, error: 'state unconfirmed', turnId: 'still-running', runContinues: true })
  const beforeUncertain = (await appState.getConversationState(conversationId)).messages.length
  await assert.rejects(handleChatError(uncertain, 'uncertain', '12:01', conversationId), candidate => candidate === uncertain)
  assert.equal((await appState.getConversationState(conversationId)).messages.length, beforeUncertain,
    'transport uncertainty cannot be persisted as a failed Agent turn')
  await assert.rejects(handleChatError(error, 'ipc-failed', '12:01', conversationId), candidate => candidate === error)
  await assert.rejects(handleChatError(error, 'ipc-failed', '12:01', conversationId), candidate => candidate === error)
  let messages = (await appState.getConversationState(conversationId)).messages
  assert.equal(messages.filter(message => message.id === 'z-turn-failed').length, 1)
  assert.equal(messages.filter(message => message.id === 'z-turn-failed-error').length, 0,
    'failed turn with partial output must not create a duplicate error message')
  assert.match(messages.find(message => message.id === 'z-turn-failed').callout, /执行失败：Controlled failure/)
  assert.equal((await readLedger()).length, 2)
  assert.equal(messages.find(message => message.id === 'z-turn-failed').interrupted, true)
  assert.deepEqual(messages.find(message => message.id === 'z-turn-failed').fileChanges, result.fileChanges,
    'partial output after a failed run retains file change summaries')
  const persistenceFailure = new Error('controlled disk failure')
  const originalErrorLog = console.error
  try {
    console.error = () => {}
    const broken = new Function('appState', 'usageStore', 'persistNativeTurn', 'IPC_ERROR_MESSAGE_MAX_LENGTH',
      'humanizeBridgeTransportError', `${source.slice(start, end)}\nreturn {handleChatError}`)(appState, usageStore,
      async () => { throw persistenceFailure }, IPC_ERROR_MESSAGE_MAX_LENGTH, humanizeBridgeTransportError)
    await assert.rejects(broken.handleChatError(error, 'disk-failed', '12:01', conversationId), candidate => candidate === error)
    assert.equal(error.persistenceError, persistenceFailure, 'commit failures must not replace the provider error')
  } finally { console.error = originalErrorLog }
  const earlyConversationId = (await appState.createThread({})).conversationId
  await handleChatError(new Error('before native start'), 'early', '12:02', earlyConversationId).catch(() => {})
  assert.equal(
    (await appState.getConversationState(earlyConversationId)).messages.at(-1).text,
    '执行失败：before native start',
  )
  assert.equal((await readLedger()).length, 2, 'early errors invent no model usage')

  await persistNativeTurn({ conversationId, modelKey: activeKey, result: {
    turnId: 'files-only', startedAt: Date.now(), text: '', thinking: '',
    fileChanges: [{ path: 'src/created.ts', addedLines: 4, deletedLines: 0, isNewFile: true }],
  } })
  assert.deepEqual((await appState.getConversationState(conversationId)).messages.find(message => message.id === 'z-turn-files-only').fileChanges,
    [{ path: 'src/created.ts', addedLines: 4, deletedLines: 0, isNewFile: true }],
  'file-only terminal evidence must not be dropped from history')

  // A synthesis caller opts out of terminal accounting: aggregate DAG usage is
  // still recorded once at the IPC boundary, not aggregate + synthesis twice.
  const aggregate = { turnId: 'synthesis', text: 'DAG answer', usage: { inputTokens: 100, outputTokens: 20, elapsedMs: 100 } }
  await createAssistantMessage(aggregate, 'dag', '12:03', activeKey, { mode: 'multi-agent' }, conversationId)
  await createAssistantMessage(aggregate, 'dag', '12:03', activeKey, { mode: 'multi-agent' }, conversationId)
  assert.equal((await readLedger()).length, 3)
  assert.equal((await readLedger()).reduce((sum, row) => sum + row.totalTokens, 0), 144)
  messages = (await appState.getConversationState(conversationId)).messages
  assert.equal(messages.filter(message => message.id === 'z-turn-synthesis').length, 1)
  assert.match(messages.find(message => message.id === 'z-turn-synthesis').callout, /子任务/)
  console.log('production IPC turn persistence: stable message IDs, failed partial/error, reported usage dedup and DAG aggregate accounting passed')
} finally {
  await fs.rm(home, { recursive: true, force: true })
}
