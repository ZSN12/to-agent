import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createAppStateStore } from '../backend/app-state-store.mjs'
import { createUsageStore } from '../backend/usage-store.mjs'
import { createChatTurnPersistence } from '../backend/chat-turn-persistence.mjs'
import { createChatTurnPipeline } from '../backend/chat-turn-pipeline.mjs'

// Execute the production IPC persistence helpers with real stores, no Electron
// or model provider. This checks delayed IPC and aggregate accounting contracts.
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-turn-persistence-'))
try {
  const appState = createAppStateStore(home, home)
  const usageStore = createUsageStore(home)
  const persistNativeTurn = createChatTurnPersistence({ appState, usageStore })
  const conversationId = (await appState.getState()).conversationId
  const activeKey = 'local/test'
  const ipcHandle = (ipcMain, channel, fn) => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        const data = await fn(event, ...args)
        return { ok: true, data }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          ok: false,
          error: message,
          ...(error?.partialResult?.turnId || error?.turnId
            ? { turnId: error.partialResult?.turnId ?? error.turnId }
            : {}),
          ...(error?.runContinues ? { runContinues: true } : {}),
        }
      }
    })
  }
  const pipeline = createChatTurnPipeline({
    appState,
    usageStore,
    profileStore: { resolve: async () => ({}) },
    resolveModelKeyForChat: async () => ({ modelKey: activeKey }),
    appPreferences: { get: async () => ({}) },
    createGitCheckpoint: async () => {},
    userDataPath: home,
    chat: {},
    orchestration: {},
    permissions: { withExecution: async (_mode, _sender, fn) => fn() },
    skills: { resolve: async () => null },
    persistNativeTurn,
    workspaceHooksTrusted: async () => false,
    sandboxContextLineForContext: () => '',
  })
  const { createAssistantMessage, handleChatError } = pipeline
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
  const readStats = () => usageStore.getStats()
  assert.equal((await readStats()).totals.totalCalls, 1, 'delayed IPC must not duplicate native usage')

  const partial = { ...result, turnId: 'failed', text: 'partial output', nativePersisted: false }
  const error = Object.assign(new Error('Controlled failure'), { code: 'MAX_STEPS', partialResult: partial, modelKey: activeKey })
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
  assert.equal(messages.find(message => message.id === 'z-turn-failed').errorCode, 'MAX_STEPS',
    'the durable assistant message keeps the machine-readable recovery reason')
  assert.equal((await readStats()).totals.totalCalls, 2)
  assert.equal(messages.find(message => message.id === 'z-turn-failed').interrupted, true)
  assert.deepEqual(messages.find(message => message.id === 'z-turn-failed').fileChanges, result.fileChanges,
    'partial output after a failed run retains file change summaries')
  await persistNativeTurn({ conversationId, modelKey: activeKey, result: {
    turnId: 'max-steps-empty', startedAt: Date.now(), text: '', thinking: '', fileChanges: [],
  }, errorMessage: '本轮已达到安全步数上限，当前进度已保留，点击“继续”可接着完成。', errorCode: 'MAX_STEPS' })
  const noOutputFailure = (await appState.getConversationState(conversationId)).messages.find(message => message.id === 'z-turn-max-steps-empty')
  assert.equal(noOutputFailure.errorCode, 'MAX_STEPS', 'step-limit failures remain actionable even without visible partial text')
  assert.match(noOutputFailure.callout, /点击“继续”/)
  const persistenceFailure = new Error('controlled disk failure')
  const originalErrorLog = console.error
  try {
    console.error = () => {}
    const brokenPipeline = createChatTurnPipeline({
      appState,
      usageStore,
      profileStore: { resolve: async () => ({}) },
      resolveModelKeyForChat: async () => ({ modelKey: activeKey }),
      appPreferences: { get: async () => ({}) },
      createGitCheckpoint: async () => {},
      userDataPath: home,
      chat: {},
      orchestration: {},
      permissions: { withExecution: async (_mode, _sender, fn) => fn() },
      skills: { resolve: async () => null },
      persistNativeTurn: async () => { throw persistenceFailure },
      workspaceHooksTrusted: async () => false,
      sandboxContextLineForContext: () => '',
    })
    await assert.rejects(brokenPipeline.handleChatError(error, 'disk-failed', '12:01', conversationId), candidate => candidate === error)
    assert.equal(error.persistenceError, persistenceFailure, 'commit failures must not replace the provider error')
  } finally { console.error = originalErrorLog }
  const earlyConversationId = (await appState.createThread({})).conversationId
  await handleChatError(new Error('before native start'), 'early', '12:02', earlyConversationId).catch(() => {})
  assert.equal(
    (await appState.getConversationState(earlyConversationId)).messages.at(-1).text,
    '执行失败：before native start',
  )

  const budgetConversationId = (await appState.createThread({})).conversationId
  let chatRequest
  const budgetPipeline = createChatTurnPipeline({
    appState,
    usageStore,
    profileStore: { resolve: async () => ({}) },
    modelService: { getModelContextWindow: async () => 128_000 },
    resolveModelKeyForChat: async () => ({ modelKey: activeKey }),
    appPreferences: { get: async () => ({}) },
    createGitCheckpoint: async () => {},
    userDataPath: home,
    chat: {
      send: async (request) => {
        chatRequest = request
        return { text: '你好' }
      },
    },
    orchestration: {},
    permissions: { withExecution: async (_mode, _sender, fn) => fn() },
    skills: { resolve: async () => null },
    persistNativeTurn,
    workspaceHooksTrusted: async () => false,
    sandboxContextLineForContext: () => '',
  })
  await budgetPipeline.runTurn({
    webContents: { isDestroyed: () => false, send: () => {} },
    text: '你好',
    executionModeOverride: 'single-agent',
    conversationId: budgetConversationId,
    runtimeContext: {
      workspacePath: home,
      permissionMode: 'standard',
      workspaceTrusted: false,
      modelKey: activeKey,
    },
  })
  assert.equal(chatRequest.toolOutputMaxChars, 2_800,
    'chat execution receives the dynamic tool output budget returned beside workspace context')
  assert.equal((await readStats()).totals.totalCalls, 2, 'early errors invent no model usage')

  await persistNativeTurn({ conversationId, modelKey: activeKey, result: {
    turnId: 'files-only', startedAt: Date.now(), text: '', thinking: '',
    fileChanges: [{ path: 'src/created.ts', addedLines: 4, deletedLines: 0, isNewFile: true }],
  } })
  assert.deepEqual((await appState.getConversationState(conversationId)).messages.find(message => message.id === 'z-turn-files-only').fileChanges,
    [{ path: 'src/created.ts', addedLines: 4, deletedLines: 0, isNewFile: true }],
  'file-only terminal evidence must not be dropped from history')

  // A synthesis caller opts out of terminal accounting: aggregate DAG usage is
  // still recorded once at the IPC boundary, not aggregate + synthesis twice.
  const aggregate = {
    turnId: 'synthesis', text: 'DAG answer', multiAgentTaskCount: 2,
    usage: { inputTokens: 100, outputTokens: 20, elapsedMs: 100 },
  }
  await createAssistantMessage(aggregate, 'dag', '12:03', activeKey, { mode: 'multi-agent' }, conversationId)
  await createAssistantMessage(aggregate, 'dag', '12:03', activeKey, { mode: 'multi-agent' }, conversationId)
  assert.equal((await readStats()).totals.totalCalls, 3)
  assert.equal((await readStats()).totals.totalTokens, 144)
  messages = (await appState.getConversationState(conversationId)).messages
  assert.equal(messages.filter(message => message.id === 'z-turn-synthesis').length, 1)
  assert.equal(messages.find(message => message.id === 'z-turn-synthesis').callout, '由 TaskWeaver 拆分并执行 2 个子任务')

  const diagnosticFailure = Object.assign(new TypeError('Bearer test-secret must never enter diagnostics'), { code: 'TEST_ERROR' })
  await assert.rejects(
    handleChatError(diagnosticFailure, 'diagnostic-failure', '12:04', conversationId),
    candidate => candidate === diagnosticFailure,
  )
  const diagnosticPath = path.join(home, 'taskweaver', 'chat-errors.jsonl')
  const diagnosticText = await fs.readFile(diagnosticPath, 'utf8')
  const diagnostic = JSON.parse(diagnosticText.trim().split('\n').at(-1))
  assert.equal(diagnostic.errors[0].name, 'TypeError')
  assert.equal(diagnostic.errors[0].code, 'TEST_ERROR')
  assert.ok(diagnostic.errors[0].frames.some(frame => frame.includes('test-chat-turn-persistence.mjs')),
    'the local diagnostic keeps stack locations for reproduction')
  assert.doesNotMatch(diagnosticText, /Bearer test-secret/,
    'diagnostics must not write error messages that can contain credentials')
  assert.equal((await fs.stat(diagnosticPath)).mode & 0o777, 0o600,
    'chat diagnostics are readable only by the current user')
  console.log('production IPC turn persistence: stable message IDs, failed partial/error, reported usage dedup and DAG aggregate accounting passed')
} finally {
  await fs.rm(home, { recursive: true, force: true })
}
