import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { createZHostManager, resolveTaskWeaverRuntimeRoot } from '../electron/agent/z-host/index.mjs'
import { createDshChatService } from '../electron/backend/dsh-chat-service.mjs'

// Real Host/compaction; deterministic local provider, no user data or external cost.
const root = process.cwd()
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-command-smoke-'))
const requests = []
const events = []
const muxFrames = []
const transportMux = []
let holdSummary = false
let summaryDelayMs = 0
let heldResponse
let answers = 0
let modelResponses = 0
const server = createServer((request, response) => {
  let raw = ''
  request.on('data', chunk => { raw += chunk.toString() })
  request.on('end', () => {
    const body = JSON.parse(raw)
    const messages = JSON.stringify(body.messages)
    const title = messages.includes('Generate the session title from this JSON array')
    const summary = messages.includes('You are now acting as a compaction engine')
    if (!title) requests.push({ summary, body })
    if (summary && holdSummary) { heldResponse = response; return }
    const content = title ? 'Command test' : summary ? 'Checkpoint: preserve FACT_COMMAND_TEST and pending file review.'
      : `FACT_COMMAND_TEST EVIDENCE_${++answers} ` + 'completed inspection evidence. '.repeat(700)
    const finish = () => {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`
        + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\n'
        + 'data: [DONE]\n\n')
      modelResponses += 1
    }
    if (summary && summaryDelayMs) setTimeout(finish, summaryDelayMs)
    else finish()
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const manager = createZHostManager({ runtimeRoot: resolveTaskWeaverRuntimeRoot({ appPath: root, isPackaged: false }),
  userDataPath: home, executable: process.execPath, environment: { ...process.env, TASKWEAVER_COMMAND_TEST_KEY: 'local-only' } })
let chat
const wc = { isDestroyed: () => false, send(channel, event) {
  if (channel === 'chat:stream') events.push(event)
  if (channel === 'chat:mux') muxFrames.push(event)
} }
const opts = (id, text) => ({ conversationId: id, text, modelKey: 'command-test/mock-model', cwdOverride: home,
  agentPreset: 'code', webContents: wc })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate, label) {
  const end = Date.now() + 15_000
  while (!predicate()) {
    if (Date.now() > end) throw new Error(`command deadline: ${label}`)
    await sleep(20)
  }
}
async function bounded(operation, label, timeoutMs = 10_000, diagnostics = null) {
  let timer
  try { return await Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(async () => {
      let extra = null
      try { extra = await diagnostics?.() ?? null } catch (error) { extra = { error: String(error) } }
      reject(new Error(`command deadline: ${label}; modelRequests=${requests.length}; modelResponses=${modelResponses}; recentFrames=${JSON.stringify(events.slice(-10).map(({ type, conversationId, phase, message, delta }) => ({ type, conversationId, phase, message, delta: typeof delta === 'string' ? delta.slice(0, 60) : undefined })))}; diagnostics=${JSON.stringify(extra)}`))
    }, timeoutMs)
  })]) } finally { clearTimeout(timer) }
}
try {
  const { api } = await manager.start()
  const instrumentedApi = Object.create(api)
  instrumentedApi.events = {
    ...api.events,
    async *mux(...args) {
      transportMux.push({ kind: 'open', at: Date.now() })
      try {
        for await (const envelope of api.events.mux(...args)) {
          transportMux.push({ kind: 'frame', at: Date.now(), type: envelope.payload?.type,
            sessionId: envelope.payload?.sessionId, seq: envelope.payload?.event?.seq,
            eventType: envelope.payload?.event?.type })
          yield envelope
        }
      } catch (error) {
        transportMux.push({ kind: 'error', at: Date.now(), message: String(error) })
        throw error
      } finally {
        transportMux.push({ kind: 'closed', at: Date.now() })
      }
    },
  }
  const chatHostManager = {
    start: async () => ({ api: instrumentedApi }),
    getApi: () => instrumentedApi,
    isRunning: () => manager.isRunning(),
    stop: () => manager.stop(),
  }
  assert.equal((await api.settings.update({ ns: 'llm-pi-ai', patch: { providers: { 'command-test': {
    api: 'openai-completions', baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKeyEnv: 'TASKWEAVER_COMMAND_TEST_KEY',
    models: [{ id: 'mock-model', contextWindow: 200_000, maxTokens: 8192 }],
  } } } })).result.ok, true)
  chat = createDshChatService({ hostManager: chatHostManager, userDataPath: home, getWorkspacePath: () => home,
    getPermissionMode: () => 'ask', profileStore: { getThinkingLevel: async () => null }, modelService: {
      getDshModelConfig: async () => ({ provider: 'command-test', id: 'mock-model', name: 'Mock', contextWindow: 200_000, maxTokens: 8192 }),
      listProvidersAuth: async () => [{ id: 'command-test', configured: true }],
    } })

  const id = `compact-${crypto.randomUUID()}`
  chat.subscribeMux(id, wc)
  const empty = await bounded(chat.send(opts(id, '/compact')), 'blank native command must settle without turn/end')
  assert.equal(chat.isBusy(id), false)
  assert.match(empty.text, /No compactable history/)
  assert.equal(requests.length, 0, 'blank compact must not become an LLM prompt')
  console.log('native blank compact returns immediately without model request or ghost busy state')

  await bounded(chat.send(opts(id, 'Read-only test: preserve FACT_COMMAND_TEST; summarize current inspection.')), 'initial answer')
  await bounded(chat.send(opts(id, 'Read-only test: checkpoint the pending file review.')), 'second answer')
  const before = (await api.sessions.history({ sessionId: chat.getSessionId(id), maxMessages: 100_000 })).result.value.events.map(row => row.event)
  const turnsBefore = before.filter(event => event.type === 'turn/end').length
  const compacted = await bounded(chat.send(opts(id, '/compact')), 'native summary command')
  assert.match(compacted.text, /Compacted/)
  assert.equal(compacted.usage?.inputTokens, 10, 'summary usage is recorded, not lost to mux/RPC ordering')
  assert.equal(compacted.usage?.outputTokens, 2)
  assert.equal(chat.isBusy(id), false)
  assert.equal(requests.filter(row => row.summary).length, 1)
  const after = (await api.sessions.history({ sessionId: chat.getSessionId(id), maxMessages: 100_000 })).result.value.events.map(row => row.event)
  assert.deepEqual(after.slice(0, before.length), before, 'compaction must retain the original log, not delete it')
  assert.equal(after.filter(event => event.type === 'turn/end').length, turnsBefore, 'manual compact is not an extra chat turn')
  assert.equal(after.filter(event => event.type === 'compaction/summary').length, 1)
  await bounded(chat.send(opts(id, 'Continue from the preserved checkpoint.')), 'answer after compaction')
  const resumed = requests.filter(row => !row.summary).at(-1)
  assert.ok(JSON.stringify(resumed.body.messages).includes('Checkpoint: preserve FACT_COMMAND_TEST'))
  assert.ok(!JSON.stringify(resumed.body.messages).includes('EVIDENCE_1'), 'old evidence replaced by checkpoint')
  assert.ok(JSON.stringify(resumed.body.messages).includes('EVIDENCE_2'), 'most recent message remains verbatim')
  console.log('native compact lands checkpoint, retains durable log and subsequent model uses smaller history')

  await assert.rejects(bounded(chat.send(opts(id, '/compact unsupported-argument')), 'invalid command'), /Usage: \/compact/)
  assert.equal(chat.isBusy(id), false)
  console.log('invalid command rejects and releases state')

  if (process.env.TASKWEAVER_SKIP_SLOW_COMPACT !== '1') {
    summaryDelayMs = 31_000
    const slowStart = Date.now()
    const slow = await bounded(chat.send(opts(id, '/compact')), 'maintenance survives 30-second transport deadline', 45_000)
    summaryDelayMs = 0
    assert.match(slow.text, /Compacted/)
    assert.equal(slow.usage?.outputTokens, 2)
    assert.ok(Date.now() - slowStart >= 30_000)
    assert.equal(chat.isBusy(id), false)
    console.log('real deployed client: 31-second compaction finishes beyond transport health deadline')

    const muxStart = muxFrames.length
    const followupStart = Date.now()
    const followup = await bounded(chat.send(opts(id, 'After the long compaction, answer this follow-up promptly.')),
      'prompt after long compaction must complete from live mux, before history reconciliation', 8_000, async () => {
        const sessionId = chat.getSessionId(id)
        const [history, sessions] = await Promise.all([
          api.sessions.history({ sessionId, maxMessages: 100_000 }),
          api.sessions.list({}),
        ])
        return {
          session: sessions.result?.value?.items?.find(row => row.sessionId === sessionId),
          history: history.result?.value?.events?.slice(-16).map(row => ({
            type: row.event?.type, seq: row.event?.seq, text: row.event?.data?.text?.slice?.(0, 80),
          })),
          mux: muxFrames.slice(muxStart).map(row => ({
            type: row.frame?.type, sessionId: row.frame?.sessionId,
            seq: row.frame?.event?.seq, eventType: row.frame?.event?.type,
          })),
          transportMux: transportMux.slice(-20),
        }
      })
    assert.match(followup.text, /FACT_COMMAND_TEST EVIDENCE_/)
    assert.ok(Date.now() - followupStart < 8_000, 'the live mux must finish well before the 10-second idle-history fallback')
    const sessionId = chat.getSessionId(id)
    assert.ok(muxFrames.slice(muxStart).some(row => row?.frame?.sessionId === sessionId
      && row.frame.type === 'session/event' && row.frame.event?.type === 'turn/end'),
    'the post-compaction terminal must arrive over the live mux, not only from history reconciliation')
    console.log('real deployed client: post-compaction follow-up receives turn/end live before idle-history fallback')
  }

  await sleep(1_500)
  const stopId = `compact-stop-${crypto.randomUUID()}`
  chat.subscribeMux(stopId, wc)
  await bounded(chat.send(opts(stopId, 'Read-only test: prepare a second history.')), 'prepare history for cancelled compact', 20_000, async () => {
    const sessionId = chat.getSessionId(stopId)
    const result = await api.sessions.history({ sessionId, maxMessages: 20 })
    const probe = new AbortController()
    const iterator = api.events.mux({}, probe.signal)[Symbol.asyncIterator]()
    const probeFrames = []
    try {
      for (let index = 0; index < 50; index += 1) {
        const next = await Promise.race([iterator.next(), sleep(500).then(() => null)])
        if (!next?.value) break
        probeFrames.push({ type: next.value.payload?.type, sessionId: next.value.payload?.sessionId, lastSeq: next.value.payload?.lastSeq })
        if (next.value.payload?.sessionId === sessionId) break
      }
    } finally { probe.abort(); await iterator.return?.() }
    return {
      sessionId,
      history: (result?.result?.value?.events ?? []).slice(-12).map(row => ({ type: row.event?.type, seq: row.event?.seq, error: row.event?.data?.error?.message })),
      mux: muxFrames.filter(row => row?.frame?.sessionId === sessionId).slice(-15).map(row => ({ type: row.frame?.type, seq: row.frame?.event?.seq, eventType: row.frame?.event?.type, lastSeq: row.frame?.lastSeq })),
      freshMuxProbe: probeFrames,
    }
  })
  await bounded(chat.send(opts(stopId, 'Read-only test: continue second history.')), 'second history for cancelled compact', 20_000)
  holdSummary = true
  const stopped = chat.send(opts(stopId, '/compact'))
  stopped.catch(() => {})
  await waitFor(() => heldResponse, 'summarizer HTTP reached')
  assert.equal(chat.isBusy(stopId), true)
  await assert.rejects(chat.send(opts(stopId, 'Do not enqueue during maintenance.')), /压缩|命令/)
  assert.equal(await bounded(chat.abort(stopId), 'abort in-flight compact'), true)
  await assert.rejects(bounded(stopped, 'cancelled compact settles'), /cancelled|取消/i)
  assert.equal(chat.isBusy(stopId), false)
  const stoppedHistory = (await api.sessions.history({ sessionId: chat.getSessionId(stopId), maxMessages: 100_000 })).result.value.events.map(row => row.event)
  assert.equal(stoppedHistory.filter(event => event.type === 'compaction/summary').length, 0)
  assert.equal(stoppedHistory.filter(event => event.type === 'compaction/end').length, 1)
  console.log('stopping native compaction cancels summary, preserves original conversation and releases busy state')

  const requestsBeforeUnsupported = requests.length
  await assert.rejects(chat.send({ ...opts(`readonly-${crypto.randomUUID()}`, '/compact'), agentPreset: 'taskweaver-readonly' }), /No native command/)
  assert.equal(requests.length, requestsBeforeUnsupported, 'unsupported native command must never fall through to model')
  console.log('unsupported preset fails closed; compact is never mistaken for a model/skill prompt')
} finally {
  await chat?.stop().catch(() => {})
  await manager.stop().catch(() => {})
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  await fs.rm(home, { recursive: true, force: true })
}
