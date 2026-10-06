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

// Real Host and Agent. Interrupt only the client mux connection, not the model
// request/Host process; reconnection may not enqueue the task a second time.
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-mux-recovery-'))
const store = createAppStateStore(home, home)
const usageStore = createUsageStore(home)
const persist = createChatTurnPersistence({ appState: store, usageStore })
const events = []
const commits = []
const requests = []
const permissionPrompts = []
const approvalReplies = []
const userQuestionPrompts = []
const userQuestionReplies = []
let muxOpens = 0
let approvalTargetSessionId = null
let approvalReplayCount = 0
let questionReplayCount = 0
let dropNext = false
let dropped = 0
let onDrop = () => {}
let failOpenOnce = false
let stallOpenOnce = false
let healthFailures = 0
const server = createServer((request, response) => {
  let raw = ''
  request.on('data', chunk => { raw += chunk.toString() })
  request.on('end', () => {
    const body = JSON.parse(raw)
    const messages = JSON.stringify(body.messages)
    const marker = [...messages.matchAll(/\[M:(live|gap|queued|open|health|cancel|offline|timeout|approval|parallelA|parallelB):([12])\]/g)].at(-1)
    const title = messages.includes('Generate the session title from this JSON array')
    const content = title ? 'Mux test' : `${marker?.[1]}-${marker?.[2]}`
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    const chunk = text => response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] })}\n\n`)
    const finish = () => {
      chunk('-AFTER')
      response.end('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n'
        + 'data: [DONE]\n\n')
    }
    if (title) { chunk(content); finish(); return }
    requests.push({ scenario: marker?.[1], turn: marker?.[2], finish, chunk })
    chunk(`${content}-BEFORE`)
    if (marker?.[2] === '2') finish()
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const manager = createZHostManager({ runtimeRoot: resolveTaskWeaverRuntimeRoot({ appPath: process.cwd(), isPackaged: false }),
  userDataPath: home, executable: process.execPath, environment: { ...process.env, TASKWEAVER_MUX_TEST_KEY: 'local-only' } })
let chat
const waitFor = async (predicate, label) => {
  const deadline = Date.now() + 20_000
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error(`mux recovery deadline: ${label}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
const wc = { isDestroyed: () => false, send(channel, event) {
  if (channel === 'chat:stream') events.push(event)
  if (channel === 'permission:prompt') permissionPrompts.push(event)
  if (channel === 'user-question:prompt') userQuestionPrompts.push(event)
} }
try {
  const { api } = await manager.start()
  assert.equal((await api.settings.update({ ns: 'llm-pi-ai', patch: { providers: { 'mux-test': {
    api: 'openai-completions', baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKeyEnv: 'TASKWEAVER_MUX_TEST_KEY',
    retryPolicy: { mode: 'normal', maxRetries: 0 }, models: [{ id: 'mock', contextWindow: 16_000, maxTokens: 1024 }],
  } } } })).result.ok, true)
  const proxy = Object.create(api)
  proxy.respond = async message => {
    if (message.rpcId === 'controlled-replayed-approval') {
      approvalReplies.push(message)
      return { accepted: true }
    }
    if (message.rpcId === 'controlled-replayed-question') {
      userQuestionReplies.push(message)
      return { accepted: true }
    }
    return api.respond(message)
  }
  proxy.host = { ...api.host, describe: async payload => {
    if (healthFailures > 0) { healthFailures--; throw new Error('controlled transient health RPC failure') }
    return api.host.describe(payload)
  } }
  proxy.events = { ...api.events, async *mux(payload, signal, opened) {
    muxOpens++
    if (failOpenOnce) { failOpenOnce = false; throw new Error('controlled reconnect open failure') }
    if (stallOpenOnce) {
      stallOpenOnce = false
      await new Promise(resolve => signal.aborted ? resolve() : signal.addEventListener('abort', resolve, { once: true }))
      return
    }
    const controller = new AbortController()
    const cancel = () => controller.abort()
    signal.addEventListener('abort', cancel, { once: true })
    try {
      for await (const envelope of api.events.mux(payload, controller.signal, opened)) {
        yield envelope
        if (envelope.payload?.type === 'session/subscribed'
          && envelope.payload.sessionId === approvalTargetSessionId) {
          if (approvalReplayCount === 1) {
            approvalReplayCount++
            yield {
              rpcId: 'controlled-replayed-approval',
              payload: {
                type: 'approval/requested',
                sessionId: approvalTargetSessionId,
                approvalId: 'controlled-approval-id',
                toolName: 'bash',
                reason: 'controlled reconnect replay test',
              },
            }
          }
          if (questionReplayCount === 1) {
            questionReplayCount++
            yield {
              rpcId: 'controlled-replayed-question',
              payload: {
                type: 'question/requested',
                sessionId: approvalTargetSessionId,
                questions: [{ id: 'controlled-choice', question: 'Controlled choice?', options: [{ label: 'yes' }, { label: 'no' }] }],
              },
            }
          }
        }
        if (envelope.payload?.type === 'session/event') yield envelope // deliberate at-least-once delivery
        if (dropNext && envelope.payload?.event?.type === 'assistant/chunk'
          && envelope.payload.event.data?.chunk?.text?.includes('-BEFORE')) {
          if (envelope.payload.sessionId === approvalTargetSessionId && approvalReplayCount === 0) {
            approvalReplayCount++
            yield {
              rpcId: 'controlled-replayed-approval',
              payload: {
                type: 'approval/requested',
                sessionId: approvalTargetSessionId,
                approvalId: 'controlled-approval-id',
                toolName: 'bash',
                reason: 'controlled reconnect replay test',
              },
            }
          }
          if (envelope.payload.sessionId === approvalTargetSessionId && questionReplayCount === 0) {
            questionReplayCount++
            yield {
              rpcId: 'controlled-replayed-question',
              payload: {
                type: 'question/requested',
                sessionId: approvalTargetSessionId,
                questions: [{ id: 'controlled-choice', question: 'Controlled choice?', options: [{ label: 'yes' }, { label: 'no' }] }],
              },
            }
          }
          dropNext = false
          dropped++
          onDrop(envelope.payload.sessionId)
          throw new Error('controlled mux transport disconnect')
        }
      }
    } finally { controller.abort(); signal.removeEventListener('abort', cancel) }
  } }
  const host = { start: async () => ({ api: proxy }), getApi: () => proxy,
    isRunning: () => manager.isRunning(), stop: () => manager.stop(),
    restart: async () => { throw new Error('a mux disconnect must not restart the live Host') } }
  chat = createDshChatService({ hostManager: host, userDataPath: home, getWorkspacePath: () => home,
    getPermissionMode: () => 'ask', profileStore: { getThinkingLevel: async () => null },
    onTurnCompleted: async result => { await persist(result); commits.push(result) },
    modelService: { getDshModelConfig: async () => ({ provider: 'mux-test', id: 'mock', name: 'Mock', contextWindow: 16_000, maxTokens: 1024 }),
      listProvidersAuth: async () => [{ id: 'mux-test', configured: true }] } })
  const options = (id, scenario, turn = '1') => ({ conversationId: id, modelKey: 'mux-test/mock',
    text: `[M:${scenario}:${turn}] Reply briefly.`, cwdOverride: home, agentPreset: 'taskweaver-readonly', webContents: wc })
  async function begin(scenario, action = () => {}) {
    const id = (await store.createThread({ workspacePath: home })).conversationId
    dropNext = true
    const before = dropped
    const previousOpens = muxOpens
    onDrop = action
    const promise = chat.send(options(id, scenario))
    promise.catch(() => {})
    await waitFor(() => dropped > before, `${scenario} injected disconnect`)
    return { id, promise, previousOpens, finish: () => requests.find(row => row.scenario === scenario && row.turn === '1').finish() }
  }
  if (!process.argv.includes('--parallel-only')) {
  const live = await begin('live')
  const native = (await api.sessions.list({})).result.value.items.find(row => row.sessionId === chat.getSessionId(live.id))
  assert.equal(native.running, true, 'native Agent is still executing despite a lost mux')
  assert.equal(chat.isBusy(live.id), true, 'transport loss must not falsely complete the Agent')
  assert.ok(!events.some(event => event.conversationId === live.id && event.type === 'error'))
  await waitFor(() => muxOpens > live.previousOpens + 1, 'live mux reopens')
  live.finish()
  assert.equal((await live.promise).text, 'live-1-BEFORE-AFTER')
  assert.equal(chat.isBusy(live.id), false)
  assert.equal(requests.filter(row => row.scenario === 'live').length, 1, 'reconnect does not repeat the prompt')
  assert.equal(events.filter(row => row.conversationId === live.id && row.type === 'done').length, 1)
  console.log('real Host: lost mux preserves the live Agent and completes once without duplicate prompt/output')

  const gap = await begin('gap', () => requests.find(row => row.scenario === 'gap').finish())
  const gapResult = await gap.promise
  assert.equal(gapResult.text, 'gap-1-BEFORE-AFTER')
  const gapHistory = (await api.sessions.history({ sessionId: chat.getSessionId(gap.id), maxMessages: 10 })).result.value.events
  const nativeEnd = gapHistory.findLast(row => row.event.type === 'turn/end').event.time
  assert.equal(gapResult.usage.elapsedMs, Math.max(0, nativeEnd - gapResult.startedAt), 'reconnect backoff must not inflate native task duration')
  assert.ok(gapResult.usage.elapsedMs < Date.now() - gapResult.startedAt)
  assert.equal(chat.isBusy(gap.id), false)
  assert.equal(requests.filter(row => row.scenario === 'gap').length, 1)
  assert.equal(events.filter(row => row.conversationId === gap.id && row.type === 'done').length, 1)
  console.log('real Host: turn ending inside the disconnect gap is recovered from native history')

  // Queue is accepted by the still-live Agent while its event channel is down.
  const queued = await begin('queued')
  assert.equal((await chat.send(options(queued.id, 'queued', '2'))).accepted, true)
  queued.finish()
  await queued.promise
  await waitFor(() => commits.filter(row => row.conversationId === queued.id).length === 2, 'both missing queued terminals persisted')
  assert.equal(chat.isBusy(queued.id), false)
  assert.deepEqual((await store.getConversationState(queued.id)).messages.map(row => row.text),
    ['queued-1-BEFORE-AFTER', 'queued-2-BEFORE-AFTER'])
  assert.equal(requests.filter(row => row.scenario === 'queued').length, 2)
  const ledger = JSON.parse(await fs.readFile(path.join(home, 'taskweaver-model-usage.json'), 'utf8')).records
  assert.equal(ledger.length, 4)
  assert.equal(ledger.reduce((sum, row) => sum + row.totalTokens, 0), 48)
  console.log('real Host: native history recovery retains queued answers and usage once')

  const open = await begin('open', () => { failOpenOnce = true; requests.find(row => row.scenario === 'open').finish() })
  assert.equal((await open.promise).text, 'open-1-BEFORE-AFTER')
  assert.equal(requests.filter(row => row.scenario === 'open').length, 1)
  assert.equal(muxOpens, open.previousOpens + 2, 'one failed reopen has one retry owner, not competing streams')
  console.log('real Host: failed reconnect open has one retry owner and recovers without competing mux generations')

  const health = await begin('health', () => { healthFailures = 1; requests.find(row => row.scenario === 'health').finish() })
  assert.equal((await health.promise).text, 'health-1-BEFORE-AFTER')
  assert.equal(requests.filter(row => row.scenario === 'health').length, 1)
  assert.equal(chat.isBusy(health.id), false)
  console.log('real Host: one failed health check never restarts the still-live Host or re-executes its task')

  const cancel = await begin('cancel', sessionId => { void api.sessions.cancel({ sessionId }) })
  const cancelled = await cancel.promise
  assert.equal(cancelled.cancelled, true)
  assert.equal(cancelled.text, 'cancel-1-BEFORE')
  assert.equal(chat.isBusy(cancel.id), false)
  assert.equal(requests.filter(row => row.scenario === 'cancel').length, 1)
  assert.equal(events.findLast(row => row.conversationId === cancel.id && row.type === 'done').interrupted, true)
  console.log('real Host: native cancellation during a disconnect gap recovers partial output and interrupted status')

  const offline = await begin('offline', () => { healthFailures = 5 })
  await assert.rejects(offline.promise, error => error.runContinues === true && /尚未确认/.test(error.message))
  assert.equal(chat.isBusy(offline.id), true)
  assert.equal((await api.sessions.list({})).result.value.items.find(row => row.sessionId === chat.getSessionId(offline.id)).running, true)
  assert.equal(commits.filter(row => row.conversationId === offline.id).length, 0, 'unknown state must not be accounted as completed')
  assert.equal(events.findLast(row => row.conversationId === offline.id && row.type === 'connection').state, 'unavailable')
  await chat.getSessionStatsSnapshot(offline.id) // explicit read re-establishes the mux
  await waitFor(() => events.some(row => row.conversationId === offline.id && row.type === 'connection' && row.state === 'restored'), 'explicit resync after retry exhaustion')
  offline.finish()
  await waitFor(() => commits.filter(row => row.conversationId === offline.id).length === 1, 'completed offline Agent persisted after resync')
  assert.equal(chat.isBusy(offline.id), false)
  assert.equal(requests.filter(row => row.scenario === 'offline').length, 1)
  assert.equal((await store.getConversationState(offline.id)).messages.at(-1).text, 'offline-1-BEFORE-AFTER')
  console.log('real Host: retry exhaustion reports unconfirmed running state; explicit resync later recovers one original task and one usage commit')

  const timeout = await begin('timeout', () => { stallOpenOnce = true; requests.find(row => row.scenario === 'timeout').finish() })
  assert.equal((await timeout.promise).text, 'timeout-1-BEFORE-AFTER')
  assert.equal(muxOpens, timeout.previousOpens + 2)
  assert.equal(requests.filter(row => row.scenario === 'timeout').length, 1)
  console.log('real Host: timed-out mux open is aborted and replaced once; completed Agent is recovered without re-execution')

  const approval = (await store.createThread({ workspacePath: home })).conversationId
  approvalTargetSessionId = `tw-${approval}`
  const approvalPreviousOpens = muxOpens
  const approvalDropCount = dropped
  onDrop = () => {}
  dropNext = true
  const approvalTurn = chat.send(options(approval, 'approval'))
  approvalTurn.catch(() => {})
  await waitFor(() => dropped === approvalDropCount + 1, 'approval scenario transport disconnect')
  await waitFor(() => permissionPrompts.length === 1, 'initial approval prompt')
  await waitFor(() => userQuestionPrompts.length === 1, 'initial user question prompt')
  await waitFor(() => approvalReplayCount === 2, 'approval request replay after mux reconnect')
  await waitFor(() => questionReplayCount === 2, 'user question replay after mux reconnect')
  await waitFor(() => muxOpens === approvalPreviousOpens + 1, 'single approval mux reconnect')
  assert.equal(permissionPrompts.length, 1, 'replayed approval must not duplicate its UI prompt')
  assert.equal(userQuestionPrompts.length, 1, 'replayed question must not duplicate its UI prompt')
  assert.equal(await chat.respondApproval(permissionPrompts[0].id, { action: 'allow' }), true)
  assert.equal(approvalReplies.length, 1, 'the user decision must produce exactly one response')
  assert.equal(approvalReplies[0].rpcId, 'controlled-replayed-approval')
  assert.equal(await chat.answerUserQuestion(userQuestionPrompts[0].id, {
    answers: [{ id: 'controlled-choice', selected: ['yes'] }],
  }), true)
  assert.equal(userQuestionReplies.length, 1, 'the user question answer must produce exactly one response')
  assert.deepEqual(userQuestionReplies[0].result.value, {
    sessionId: approvalTargetSessionId,
    answer: { answers: [{ id: 'controlled-choice', selected: ['yes'] }] },
  })
  requests.find(row => row.scenario === 'approval' && row.turn === '1').finish()
  assert.equal((await approvalTurn).text, 'approval-1-BEFORE-AFTER')
  assert.equal(requests.filter(row => row.scenario === 'approval').length, 1)
  assert.equal(permissionPrompts.length, 1)
  assert.equal(userQuestionPrompts.length, 1)
  console.log('real Host: injected approval and user-question requests replay across mux reconnect with one prompt and one response each')
  }

  const parallelA = (await store.createThread({ workspacePath: home })).conversationId
  const parallelB = (await store.createThread({ workspacePath: home })).conversationId
  const expectedParallelOpens = muxOpens || 1
  const dropsBeforeParallel = dropped
  const a = chat.send(options(parallelA, 'parallelA'))
  const b = chat.send(options(parallelB, 'parallelB'))
  a.catch(() => {})
  b.catch(() => {})
  await waitFor(() => requests.some(row => row.scenario === 'parallelA') && requests.some(row => row.scenario === 'parallelB'), 'two Agents execute concurrently')
  assert.equal(muxOpens, expectedParallelOpens, 'simultaneous first sends must share one initial mux consumer')
  assert.equal(chat.isBusy(parallelA), true)
  assert.equal(chat.isBusy(parallelB), true)
  onDrop = () => {
    requests.find(row => row.scenario === 'parallelA').finish()
    requests.find(row => row.scenario === 'parallelB').finish()
  }
  dropNext = true
  requests.find(row => row.scenario === 'parallelA').chunk('-BEFORE-DROP')
  const [resultA, resultB] = await Promise.all([a, b])
  assert.equal(dropped, dropsBeforeParallel + 1)
  assert.equal(muxOpens, expectedParallelOpens + 1, 'recovery must use one new generation, not a hidden second initial consumer')
  for (const id of [parallelA, parallelB]) assert.ok(events.some(row => row.conversationId === id && row.type === 'connection' && row.state === 'restored'))
  assert.equal(resultA.text, 'parallelA-1-BEFORE-BEFORE-DROP-AFTER')
  assert.equal(resultB.text, 'parallelB-1-BEFORE-AFTER')
  assert.equal(chat.isBusy(parallelA), false)
  assert.equal(chat.isBusy(parallelB), false)
  assert.equal((await store.getState()).conversationId, parallelB)
  assert.deepEqual((await store.getConversationState(parallelA)).messages.map(row => row.text), [resultA.text])
  assert.deepEqual((await store.getConversationState(parallelB)).messages.map(row => row.text), [resultB.text])
  assert.equal(requests.filter(row => /^parallel/.test(row.scenario)).length, 2)
  for (const id of [parallelA, parallelB]) assert.equal(events.filter(row => row.conversationId === id && row.type === 'done').length, 1)
  const parallelUsage = JSON.parse(await fs.readFile(path.join(home, 'taskweaver-model-usage.json'), 'utf8')).records
    .filter(row => row.conversationId === parallelA || row.conversationId === parallelB)
  assert.equal(parallelUsage.length, 2)
  assert.equal(parallelUsage.reduce((sum, row) => sum + row.totalTokens, 0), 24)
  console.log('real Host: one shared mux failure recovers two concurrently running Agents, isolated answers and usage without switching selection')
} finally {
  await chat?.stop().catch(() => {})
  await manager.stop().catch(() => {})
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await fs.rm(home, { recursive: true, force: true })
}
