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

// Real deployed Host and durable inbox; only the model HTTP endpoint is controlled.
// No external provider request or user session/config is used.
const root = process.cwd()
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-queue-smoke-'))
const fixture = path.join(home, 'queue-fixture.txt')
await fs.writeFile(fixture, 'QUEUED_FAILURE_READ_FIXTURE\n')
const appState = createAppStateStore(home, home)
const usageStore = createUsageStore(home)
const persist = createChatTurnPersistence({ appState, usageStore })
const commits = []
const runtimeRoot = resolveTaskWeaverRuntimeRoot({ appPath: root, resourcesPath: null, isPackaged: false, env: process.env })
const requests = []
const events = []
const queues = new Map()
const server = createServer((request, response) => {
  let raw = ''
  request.on('data', chunk => { raw += chunk.toString() })
  request.on('end', () => {
    const body = JSON.parse(raw)
    const match = [...JSON.stringify(body.messages).matchAll(/\[Q:(multi|remove|edit|abort|fail):([123])\]/g)].at(-1)
    if (!match) { response.writeHead(400); response.end('missing scenario marker'); return }
    const [, scenario, turn] = match
    if (scenario === 'fail' && turn === '2' && body.messages.some(message => message.role === 'tool')) {
      response.writeHead(402, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'Controlled queued failure', type: 'insufficient_balance' } }))
      requests.push({ scenario, turn, failed: true, body })
      return
    }
    const respond = (content = `${scenario}-answer-${turn}`) => {
      const toolStep = scenario === 'fail' && turn === '2'
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content,
        ...(toolStep ? { tool_calls: [{ index: 0, id: 'queued-read', type: 'function',
          function: { name: 'read', arguments: JSON.stringify({ file_path: fixture, limit: 1 }) } }] } : {}) }, finish_reason: null }] })}\n\n`
        + `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: toolStep ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } })}\n\n`
        + 'data: [DONE]\n\n')
    }
    if (JSON.stringify(body.messages).includes('Generate the session title from this JSON array')) { respond('Queue test'); return }
    requests.push({ scenario, turn, body, respond })
    if (turn !== '1') respond()
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const manager = createZHostManager({ runtimeRoot, userDataPath: home, executable: process.execPath,
  environment: { ...process.env, TASKWEAVER_QUEUE_TEST_KEY: 'opaque-local-test-key' } })
let chat
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(fn, label) {
  const deadline = Date.now() + 20_000
  while (!fn()) {
    if (Date.now() > deadline) throw new Error(`queue test deadline: ${label}`)
    await sleep(20)
  }
}
const wc = { isDestroyed: () => false, send(channel, event) {
  if (channel === 'chat:stream') events.push(event)
  if (channel === 'chat:mux' && event.frame.type === 'session/queue') queues.set(event.conversationId, event.frame.items)
} }
const opts = (id, text) => ({ conversationId: id, text, modelKey: 'queue-test/mock-model',
  cwdOverride: home, agentPreset: 'taskweaver-code', webContents: wc })
async function begin(scenario) {
  const id = (await appState.createThread({ workspacePath: home })).conversationId
  chat.subscribeMux(id, wc)
  const promise = chat.send(opts(id, `[Q:${scenario}:1] Reply briefly.`))
  promise.catch(() => {})
  await waitFor(() => requests.some(row => row.scenario === scenario && row.turn === '1'), `${scenario} first HTTP request`)
  return { id, promise, release: () => requests.find(row => row.scenario === scenario && row.turn === '1').respond() }
}
function pending(id) { return (queues.get(id) ?? []).filter(item => item.placement === 'queued') }
function done(id) { return events.filter(event => event.conversationId === id && event.type === 'done') }
try {
  const { api } = await manager.start()
  const configured = await api.settings.update({ ns: 'llm-pi-ai', patch: { providers: {
    'queue-test': { api: 'openai-completions', baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      apiKeyEnv: 'TASKWEAVER_QUEUE_TEST_KEY', retryPolicy: { mode: 'normal', maxRetries: 0 },
      models: [{ id: 'mock-model', contextWindow: 8192, maxTokens: 128 }] },
  } } })
  assert.equal(configured.result.ok, true)
  chat = createDshChatService({ hostManager: manager, userDataPath: home, getWorkspacePath: () => root,
    getPermissionMode: () => 'ask', profileStore: { getThinkingLevel: async () => null },
    onTurnCompleted: async turn => { await persist(turn); commits.push(turn) },
    modelService: { getDshModelConfig: async () => ({ provider: 'queue-test', id: 'mock-model', name: 'Mock', contextWindow: 8192, maxTokens: 128 }),
      listProvidersAuth: async () => [{ id: 'queue-test', configured: true }] } })

  const multi = await begin('multi')
  for (const n of [2, 3]) assert.equal((await chat.send(opts(multi.id, `[Q:multi:${n}] Reply briefly.`))).queued, true)
  await waitFor(() => pending(multi.id).length === 2, 'two prompts accepted')
  multi.release()
  await multi.promise
  await waitFor(() => done(multi.id).length === 3, 'three native answers')
  assert.equal(chat.isBusy(multi.id), false)
  assert.deepEqual(done(multi.id).map(event => event.full), ['multi-answer-1', 'multi-answer-2', 'multi-answer-3'])
  assert.deepEqual(done(multi.id).map(event => event.continuing), [true, true, false])
  assert.equal(new Set(done(multi.id).map(event => event.turnId)).size, 3)
  await waitFor(() => commits.filter(turn => turn.conversationId === multi.id).length === 3, 'three durable commits, not just the first IPC reply')
  assert.deepEqual((await appState.getConversationState(multi.id)).messages.map(message => message.text),
    ['multi-answer-1', 'multi-answer-2', 'multi-answer-3'])
  console.log('real Host: two queued follow-ups preserve three distinct answers and finish')

  const remove = await begin('remove')
  for (const n of [2, 3]) await chat.send(opts(remove.id, `[Q:remove:${n}] Must not execute.`))
  await waitFor(() => pending(remove.id).length === 2, 'removable queue')
  for (const remaining of [1, 0]) {
    assert.equal((await chat.mutateQueue('followUp', 0, 'remove', null, remove.id)).ok, true)
    await waitFor(() => pending(remove.id).length === remaining, 'removed prompt reflected in native queue')
  }
  remove.release()
  await remove.promise
  await waitFor(() => done(remove.id).length >= 1, 'first removal scenario turn ends')
  assert.equal(done(remove.id)[0].continuing, false, 'removing every queued prompt must make the remaining turn terminal')
  assert.equal(chat.isBusy(remove.id), false, 'removed prompts must not leave a phantom busy run')
  const removalHistory = await api.sessions.history({ sessionId: chat.getSessionId(remove.id) })
  const removalEvents = removalHistory.result.value.events.map(row => row.event)
  assert.ok(removalEvents.filter(event => event.type === 'user/message')
    .every(event => !JSON.stringify(event.data.content).match(/\[Q:remove:[23]\]/)), 'deleted prompts must never be consumed into history')
  assert.equal(requests.filter(row => row.scenario === 'remove' && row.turn !== '1').length, 0, 'deleted prompts must not be sent to the model')
  console.log('real Host: deleting queued prompts prevents execution and releases busy state')

  const edit = await begin('edit')
  await chat.send(opts(edit.id, '[Q:edit:2] ORIGINAL_QUEUED_CONTENT'))
  await waitFor(() => pending(edit.id).length === 1, 'editable queue')
  assert.equal((await chat.mutateQueue('followUp', 0, 'update', '[Q:edit:2] EDITED_QUEUED_CONTENT', edit.id)).ok, true)
  await waitFor(() => JSON.stringify(pending(edit.id)).includes('EDITED_QUEUED_CONTENT'), 'edit committed')
  edit.release()
  await edit.promise
  await waitFor(() => done(edit.id).length === 2, 'edited turn finishes')
  assert.equal(chat.isBusy(edit.id), false)
  const editedRequest = JSON.stringify(requests.find(row => row.scenario === 'edit' && row.turn === '2').body.messages)
  assert.ok(editedRequest.includes('EDITED_QUEUED_CONTENT'))
  assert.ok(!editedRequest.includes('ORIGINAL_QUEUED_CONTENT'))
  console.log('real Host: replacing one queued occurrence does not invent an extra turn')

  const abort = await begin('abort')
  await chat.send(opts(abort.id, '[Q:abort:2] Must not execute.'))
  await waitFor(() => pending(abort.id).length === 1, 'queued before abort')
  assert.equal(await chat.abort(abort.id), true)
  assert.equal((await abort.promise).cancelled, true)
  assert.equal(chat.isBusy(abort.id), false)
  assert.ok(done(abort.id).at(-1).interrupted)
  assert.equal(done(abort.id).at(-1).continuing, false)
  await waitFor(() => pending(abort.id).length === 0, 'stop must not leave old prompts to resume on the next send')
  await sleep(100)
  assert.equal(requests.filter(row => row.scenario === 'abort').length, 1)
  const resumed = await chat.send(opts(abort.id, '[Q:abort:3] This is a new request after Stop.'))
  assert.equal(resumed.text, 'abort-answer-3')
  assert.equal(chat.isBusy(abort.id), false)
  assert.equal(requests.filter(row => row.scenario === 'abort' && row.turn === '2').length, 0,
    'a fresh send must never awaken the follow-up that Stop cancelled')
  console.log('real Host: abort cancels the live turn and pending follow-up without background execution')

  const failure = await begin('fail')
  await chat.send(opts(failure.id, '[Q:fail:2] Read the fixture then summarize it.'))
  await waitFor(() => pending(failure.id).length === 1, 'queued failure accepted')
  const selected = await appState.createThread({ workspacePath: home })
  failure.release()
  await failure.promise
  await waitFor(() => events.some(event => event.conversationId === failure.id && event.type === 'error'), 'queued native failure')
  await waitFor(() => commits.filter(turn => turn.conversationId === failure.id).length === 2, 'queued failure durable commit without IPC caller')
  assert.equal(chat.isBusy(failure.id), false)
  assert.equal((await appState.getState()).conversationId, selected.conversationId, 'background completion must not switch selection')
  assert.equal((await appState.getState()).messages.length, 0)
  const restarted = createAppStateStore(home, home)
  const failedMessages = (await restarted.getConversationState(failure.id)).messages
  assert.equal(failedMessages.filter(message => message.text === 'fail-answer-2').length, 1)
  assert.equal(failedMessages.find(message => message.text === 'fail-answer-2').interrupted, true)
  assert.equal(failedMessages.filter(message => message.id.endsWith('-error')).length, 1)
  const ledger = JSON.parse(await fs.readFile(path.join(home, 'taskweaver-model-usage.json'), 'utf8'))
  const records = ledger.records.filter(row => row.conversationId === failure.id)
  assert.equal(records.length, 2)
  assert.equal(records.reduce((sum, row) => sum + row.totalTokens, 0), 24)
  assert.equal(await fs.readFile(fixture, 'utf8'), 'QUEUED_FAILURE_READ_FIXTURE\n')
  console.log('real Host: queued failure persists partial output, error and reported usage in the background and survives app-state restart')
} finally {
  await chat?.stop().catch(() => {})
  await manager.stop().catch(() => {})
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await fs.rm(home, { recursive: true, force: true })
}
