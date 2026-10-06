import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { createZHostManager, resolveTaskWeaverRuntimeRoot } from '../electron/agent/z-host/index.mjs'
import { createDshChatService } from '../electron/backend/dsh-chat-service.mjs'
import { createAppStateStore } from '../electron/backend/app-state-store.mjs'
import { createUsageStore } from '../electron/backend/usage-store.mjs'
import { createChatTurnPersistence } from '../electron/backend/chat-turn-persistence.mjs'

// Real deployed Agent + read tool. Only the provider endpoint is controlled.
// The second LLM step fails after visible text and a completed filesystem read.
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-failed-turn-'))
const fixture = path.join(home, 'fixture.txt')
await fs.writeFile(fixture, 'READ_ONLY_FAILURE_FIXTURE\n')
const events = []
const appState = createAppStateStore(home, home)
const usageStore = createUsageStore(home)
const persist = createChatTurnPersistence({ appState, usageStore })
let modelRequests = 0
const server = createServer((request, response) => {
  let raw = ''
  request.on('data', chunk => { raw += chunk.toString() })
  request.on('end', () => {
    const body = JSON.parse(raw)
    const serialized = JSON.stringify(body.messages)
    const title = serialized.includes('Generate the session title from this JSON array')
    const recovered = serialized.includes('[RECOVER]')
    if (!title) modelRequests++
    if (!title && !recovered && body.messages.some(message => message.role === 'tool')) {
      response.writeHead(402, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'Controlled insufficient account balance', type: 'insufficient_balance', code: '402' } }))
      return
    }
    const delta = title ? { role: 'assistant', content: 'Failure test' } : recovered
      ? { role: 'assistant', content: 'RECOVERED_AFTER_FAILURE' }
      : { role: 'assistant', content: 'PARTIAL_BEFORE_FAILURE', reasoning_content: 'READ_REASONING_BEFORE_FAILURE',
        tool_calls: [{ index: 0, id: 'read-failure-test', type: 'function',
          function: { name: 'read', arguments: JSON.stringify({ file_path: fixture, limit: 1 }) } }] }
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`
      + `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: title || recovered ? 'stop' : 'tool_calls' }],
        usage: { prompt_tokens: 10, completion_tokens: 2 } })}\n\n`
      + 'data: [DONE]\n\n')
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const manager = createZHostManager({ runtimeRoot: resolveTaskWeaverRuntimeRoot({ appPath: process.cwd(), isPackaged: false }),
  userDataPath: home, executable: process.execPath, environment: { ...process.env, TASKWEAVER_FAILURE_TEST_KEY: 'local-only' } })
let chat
const modelKey = 'failure-test/mock-model'
const id = (await appState.getState()).conversationId
const wc = { isDestroyed: () => false, send(channel, event) { if (channel === 'chat:stream') events.push(event) } }
const options = text => ({ conversationId: id, text, modelKey, cwdOverride: home, agentPreset: 'taskweaver-code', webContents: wc })
try {
  const { api } = await manager.start()
  assert.equal((await api.settings.update({ ns: 'llm-pi-ai', patch: { providers: { 'failure-test': {
    api: 'openai-completions', baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKeyEnv: 'TASKWEAVER_FAILURE_TEST_KEY',
    retryPolicy: { mode: 'normal', maxRetries: 0 },
    models: [{ id: 'mock-model', contextWindow: 100_000, maxTokens: 1024 }],
  } } } })).result.ok, true)
  chat = createDshChatService({ hostManager: manager, userDataPath: home, getWorkspacePath: () => home,
    getPermissionMode: () => 'ask', profileStore: { getThinkingLevel: async () => null },
    onTurnCompleted: persist,
    modelService: { getDshModelConfig: async () => ({ provider: 'failure-test', id: 'mock-model', name: 'Mock', contextWindow: 100_000, maxTokens: 1024 }),
      listProvidersAuth: async () => [{ id: 'failure-test', configured: true }] } })
  let failure
  try { await chat.send(options('Read the fixture, then summarize it.')) } catch (error) { failure = error }
  assert.ok(failure && /402|balance/i.test(failure.message), 'provider error must propagate, not fabricate success')
  assert.equal(chat.isBusy(id), false)
  assert.equal(modelRequests, 2, 'one tool step, one failed model step; no retry')
  assert.ok(events.some(event => event.type === 'delta' && event.full.includes('PARTIAL_BEFORE_FAILURE')))
  assert.ok(events.some(event => event.type === 'tool' && event.status === 'done' && event.toolName === 'read'))
  const terminal = events.findLast(event => event.type === 'error')
  assert.equal(terminal.full, 'PARTIAL_BEFORE_FAILURE', 'failure event must retain visible partial output')
  assert.equal(terminal.fullThinking, 'READ_REASONING_BEFORE_FAILURE')
  assert.equal(terminal.turnId, events.find(event => event.type === 'start').turnId)
  assert.equal(failure.partialResult?.text, 'PARTIAL_BEFORE_FAILURE', 'IPC failure can persist partial result')
  assert.equal(failure.partialResult?.usage.inputTokens, 10)
  assert.equal(failure.partialResult?.usage.outputTokens, 2)
  assert.equal(failure.partialResult?.nativePersisted, true)
  const saved = (await appState.getConversationState(id)).messages
  assert.equal(saved.filter(row => row.id === `z-turn-${terminal.turnId}`).length, 1)
  assert.equal(saved.find(row => row.id === `z-turn-${terminal.turnId}`).text, 'PARTIAL_BEFORE_FAILURE')
  assert.equal(saved.find(row => row.id === `z-turn-${terminal.turnId}`).thinking, 'READ_REASONING_BEFORE_FAILURE')
  assert.equal(saved.find(row => row.id === `z-turn-${terminal.turnId}`).interrupted, true)
  assert.equal(saved.filter(row => row.id.endsWith('-error')).length, 1)
  // Delayed/repeated delivery is idempotent for both transcript and accounting.
  await persist({ conversationId: id, modelKey, result: failure.partialResult, errorMessage: failure.message })
  assert.equal((await appState.getConversationState(id)).messages.length, saved.length)
  const ledger = JSON.parse(await fs.readFile(path.join(home, 'taskweaver-model-usage.json'), 'utf8'))
  assert.equal(ledger.records.length, 1)
  assert.equal(ledger.records[0].totalTokens, 12, 'reported usage from before failure is counted once')
  const history = (await api.sessions.history({ sessionId: chat.getSessionId(id), maxMessages: 1000 })).result.value.events.map(row => row.event)
  assert.ok(history.some(event => event.type === 'assistant/message' && JSON.stringify(event.data).includes('PARTIAL_BEFORE_FAILURE')))
  assert.equal(history.findLast(event => event.type === 'turn/end').data.reason.kind, 'error')
  assert.equal((await chat.send(options('[RECOVER] Answer a new independent question.'))).text, 'RECOVERED_AFTER_FAILURE')
  assert.equal(chat.isBusy(id), false)
  const restarted = createAppStateStore(home, home)
  assert.equal((await restarted.getConversationState(id)).messages.filter(row => row.text === 'PARTIAL_BEFORE_FAILURE').length, 1)
  assert.equal(await fs.readFile(fixture, 'utf8'), 'READ_ONLY_FAILURE_FIXTURE\n')
  console.log('real Host failed turn: partial output, tool read, native history, reported usage and next-turn recovery survive provider error')
} finally {
  await chat?.stop().catch(() => {})
  await manager.stop().catch(() => {})
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await fs.rm(home, { recursive: true, force: true })
}
