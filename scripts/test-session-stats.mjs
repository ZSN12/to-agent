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
let legacyContextFallbackCalls = 0
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
  const fallback = { sessionStats: { turns: 4, steps: 7, toolCalls: 5,
    llmMs: 800, toolMs: 120, ttftMs: 60, ttftSteps: 2, decodeMs: 300, decodeTokens: 90 },
  tokenUsage: { uncachedInputTokens: 12, outputTokens: 3 } }
  chat = createDshChatService({ userDataPath: home, getWorkspacePath: () => home,
    hostManager: { async start() { return { api } }, async stop() {} },
    appState: { async getConversationState() {
      legacyContextFallbackCalls += 1
      return { messages: [{ author: 'orchestrator', usage: { contextTokens: 800, contextWindow: 1000 } }] }
    } },
    conversationHub: { async getProjections() { fallbackCalls++; return fallback } },
  })
  projections = { sessionStats: { turns: 2, steps: 6, toolCalls: 3,
    llmMs: 1_200, toolMs: 450, ttftMs: 300, ttftSteps: 3, decodeMs: 1_000, decodeTokens: 240 },
  tokenUsage: { uncachedInputTokens: 100,
    outputTokens: 20, cacheReadTokens: 900, cacheWriteTokens: 40 },
  contextPressure: { projectedTokens: 250, contextWindow: 1000 } }
  const cold = await chat.getSessionStatsSnapshot('cold')
  assert.deepEqual(calls, [{ sessionId: 'native-cold', maxMessages: 1 }])
  assert.equal(fallbackCalls, 0, 'cold session stats should not depend on prior UI subscription')
  assert.deepEqual(cold.tokens, { input: 100, output: 20, cacheRead: 900, cacheWrite: 40, total: 1060 })
  assert.equal(cold.userMessages, 2)
  assert.equal(cold.assistantMessages, 6)
  assert.equal(cold.toolCalls, 3, 'tool-call count comes from the Host sessionStats projection')
  assert.deepEqual(
    [cold.llmMs, cold.toolMs, cold.ttftMs, cold.ttftSteps, cold.decodeMs, cold.decodeTokens],
    [1_200, 450, 300, 3, 1_000, 240],
    'timing and decode stats come from the Host projection through the stats RPC',
  )
  assert.equal(cold.agentPreset, 'code', 'cold session stats should expose the durable Host preset from its mapping')
  assert.equal(cold.contextPercent, 25)
  assert.equal(legacyContextFallbackCalls, 0, 'Host pressure takes precedence over saved UI usage')
  projections = { tokenUsage: { totals: { uncachedInputTokens: 30, outputTokens: 4, cacheReadTokens: 60 } },
    contextPressure: { pressureTokens: 0, contextWindow: 1000 } }
  const nested = await chat.getSessionStatsSnapshot('cold')
  assert.equal(nested.tokens.total, 94)
  assert.equal(nested.toolCalls, 0, 'missing projection fields have no process-local counter fallback')
  assert.deepEqual(
    [nested.llmMs, nested.toolMs, nested.ttftMs, nested.ttftSteps, nested.decodeMs, nested.decodeTokens],
    [0, 0, 0, 0, 0, 0],
    'absent Host fields do not reuse stale process-local values',
  )
  assert.equal(nested.contextPercent, 0, 'zero pressure is data, not missing')
  assert.equal(nested.contextTokens, 0)
  assert.equal(legacyContextFallbackCalls, 0, 'zero pressure must not be replaced by a stale UI usage sample')
  unavailable = true
  const recovered = await chat.getSessionStatsSnapshot('cold')
  assert.equal(recovered.tokens.total, 15)
  assert.equal(fallbackCalls, 1)
  unavailable = false
  projections = null
  const presetOnly = await chat.getSessionStatsSnapshot('cold')
  assert.equal(presetOnly.userMessages, 0)
  assert.equal(presetOnly.agentPreset, 'code', 'preset remains visible before the first projected turn')
  assert.equal(presetOnly.contextTokens, 800, 'saved UI usage remains a compatibility fallback when Host pressure is absent')
  assert.equal(legacyContextFallbackCalls, 2, 'saved usage remains a fallback for each contextless Host read')
  const unmapped = await chat.getSessionStatsSnapshot('unmapped')
  assert.equal(unmapped.userMessages, 4)
  assert.equal(unmapped.toolCalls, 5, 'legacy Hub projections retain Host tool-call count')
  assert.equal(unmapped.agentPreset, undefined, 'unmapped legacy projections must not claim a preset')
  assert.equal(unmapped.contextTokens, 800)
  assert.equal(legacyContextFallbackCalls, 3)
  assert.equal(fallbackCalls, 2)
  assert.equal(chat.isBusyAny(), false, 'reading stats never starts an Agent turn')
  console.log('session stats: Host projections, RPC totals, zero-pressure precedence and legacy fallback pass')
} finally {
  await chat?.stop()
  await fs.rm(home, { recursive: true, force: true })
}
