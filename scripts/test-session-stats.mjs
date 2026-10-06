import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createDshChatService } from '../electron/backend/dsh-chat-service.mjs'

// Production bridge, cold persisted mapping, controlled native projections.
// No model request, user state, or GUI.
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-session-stats-'))
let chat
let projections
let unavailable = false
let fallbackCalls = 0
const calls = []
const api = {
  sessions: { async history(request) {
    calls.push(request)
    if (unavailable) throw new Error('controlled unavailable history')
    return { result: { ok: true, value: { events: [], projections: { values: projections } } } }
  } },
  events: { async *mux(_payload, signal, open) {
    open()
    if (!signal.aborted) await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
  } },
}
try {
  await fs.mkdir(path.join(home, 'taskweaver'))
  await fs.writeFile(path.join(home, 'taskweaver/dsh-session-map.json'), JSON.stringify({ version: 1,
    sessions: { cold: { sessionId: 'native-cold', cwd: home, agentPreset: 'code' } } }))
  const fallback = { sessionStats: { turns: 4, steps: 7 }, tokenUsage: { uncachedInputTokens: 12, outputTokens: 3 } }
  chat = createDshChatService({ userDataPath: home, getWorkspacePath: () => home,
    hostManager: { async start() { return { api } }, async stop() {} },
    conversationHub: { async getProjections() { fallbackCalls++; return fallback } },
  })
  projections = { sessionStats: { turns: 2, steps: 6 }, tokenUsage: { uncachedInputTokens: 100,
    outputTokens: 20, cacheReadTokens: 900, cacheWriteTokens: 40 },
  contextPressure: { projectedTokens: 250, contextWindow: 1000 } }
  const cold = await chat.getSessionStatsSnapshot('cold')
  assert.deepEqual(calls, [{ sessionId: 'native-cold', maxMessages: 1 }])
  assert.equal(fallbackCalls, 0, 'cold session stats should not depend on prior UI subscription')
  assert.deepEqual(cold.tokens, { input: 100, output: 20, cacheRead: 900, cacheWrite: 40, total: 1060 })
  assert.equal(cold.userMessages, 2)
  assert.equal(cold.assistantMessages, 6)
  assert.equal(cold.agentPreset, 'code', 'cold session stats should expose the durable Host preset from its mapping')
  assert.equal(cold.contextPercent, 25)
  projections = { tokenUsage: { totals: { uncachedInputTokens: 30, outputTokens: 4, cacheReadTokens: 60 } },
    contextPressure: { pressureTokens: 0, contextWindow: 1000 } }
  const nested = await chat.getSessionStatsSnapshot('cold')
  assert.equal(nested.tokens.total, 94)
  assert.equal(nested.contextPercent, 0, 'zero pressure is data, not missing')
  assert.equal(nested.contextTokens, 0)
  unavailable = true
  const recovered = await chat.getSessionStatsSnapshot('cold')
  assert.equal(recovered.tokens.total, 15)
  assert.equal(fallbackCalls, 1)
  unavailable = false
  projections = null
  const presetOnly = await chat.getSessionStatsSnapshot('cold')
  assert.equal(presetOnly.userMessages, 0)
  assert.equal(presetOnly.agentPreset, 'code', 'preset remains visible before the first projected turn')
  const unmapped = await chat.getSessionStatsSnapshot('unmapped')
  assert.equal(unmapped.userMessages, 4)
  assert.equal(unmapped.agentPreset, undefined, 'unmapped legacy projections must not claim a preset')
  assert.equal(fallbackCalls, 2)
  assert.equal(chat.isBusyAny(), false, 'reading stats never starts an Agent turn')
  console.log('session stats: cold mapping, native projections, nested totals, zero context pressure and unavailable-history fallback pass')
} finally {
  await chat?.stop()
  await fs.rm(home, { recursive: true, force: true })
}
