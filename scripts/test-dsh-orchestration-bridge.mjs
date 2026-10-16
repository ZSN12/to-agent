import assert from 'node:assert/strict'
import { createHandleEnvelope } from '../backend/dsh-chat/envelope-dispatch.mjs'

function harness({ allowed = true, runOrchestration }) {
  const turn = {
    orchestrationContext: { text: 'full prompt', rawText: 'original request', allowed },
    orchestrationAllowed: allowed,
    multiAgentTaskCount: 0,
    webContents: {},
  }
  const responses = []
  const deps = {
    sessions: new Map([['conversation', { sessionId: 'session', ownerConversationId: 'conversation' }]]),
    running: new Map([['conversation', turn]]),
    observedSequences: new Map(),
    queueSnapshots: new Map(),
    pendingQuestions: new Map(),
    conversationHub: null,
    fanoutMuxFrame() {},
    registerPendingApproval() { return true },
    settleApproval() {},
    emitPermission() {},
    emitUserQuestion() {},
    orchestrationRuns: new Map(),
    runOrchestration,
    getPermissionMode: () => 'ask',
    emit() {},
    finishTurn() {},
    recoverSession() {},
    toolOutputStore: null,
  }
  return {
    turn,
    responses,
    dispatch: createHandleEnvelope(deps),
    api: { respond: async (response) => { responses.push(response); return { accepted: true } } },
  }
}

async function waitFor(predicate) {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  assert.fail('timed out waiting for orchestration bridge')
}

const frame = {
  type: 'orchestration/requested', sessionId: 'session', callId: 'tool-call', goal: 'feature goal',
}

{
  let received
  const bridge = harness({
    runOrchestration: async (request) => {
      received = request
      return {
        assistant: { text: 'DAG done' }, runId: 'run-1',
        tasks: [{ id: 'A' }, { id: 'B' }], failedTaskIds: ['B'],
      }
    },
  })
  await bridge.dispatch(bridge.api, { rpcId: 'rpc-1', payload: frame })
  await waitFor(() => bridge.responses.length === 1)
  assert.equal(received.conversationId, 'conversation')
  assert.equal(received.callId, 'tool-call')
  assert.equal(received.goal, 'feature goal')
  assert.equal(received.context, bridge.turn.orchestrationContext)
  assert.equal(received.signal.aborted, false)
  assert.equal(bridge.turn.multiAgentTaskCount, 2)
  assert.deepEqual(bridge.responses[0], {
    type: 'client-response', rpcId: 'rpc-1', result: { ok: true, value: {
      sessionId: 'session', summary: 'DAG done', runId: 'run-1',
      taskCount: 2, failedTaskCount: 1, cancelled: false,
    } },
  })
}

{
  let signal
  const bridge = harness({
    runOrchestration: ({ signal: requestSignal }) => new Promise((resolve, reject) => {
      signal = requestSignal
      requestSignal.addEventListener('abort', () => reject(requestSignal.reason), { once: true })
    }),
  })
  await bridge.dispatch(bridge.api, { rpcId: 'rpc-2', payload: frame })
  await waitFor(() => signal !== undefined)
  await bridge.dispatch(bridge.api, {
    rpcId: 'cancel-frame-2', payload: { type: 'orchestration/cancelled', sessionId: 'session', orchestrationRpcId: 'rpc-2' },
  })
  await waitFor(() => bridge.responses.length === 1)
  assert.equal(signal.aborted, true)
  assert.equal(bridge.responses[0].result.error.code, 'cancelled')
}

{
  const bridge = harness({ runOrchestration: async () => assert.fail('a stale cancellation must not start a DAG') })
  await bridge.dispatch(bridge.api, {
    rpcId: 'cancel-frame-stale', payload: {
      type: 'orchestration/cancelled', sessionId: 'session', orchestrationRpcId: 'rpc-stale',
    },
  })
  assert.deepEqual(bridge.responses[0], {
    type: 'client-response', rpcId: 'rpc-stale',
    result: { ok: false, error: { code: 'cancelled', message: 'DAG runner is no longer active', details: {} } },
  })
}

{
  const bridge = harness({ allowed: false, runOrchestration: async () => assert.fail('denied orchestration must not run') })
  await bridge.dispatch(bridge.api, { rpcId: 'rpc-3', payload: frame })
  assert.equal(bridge.responses[0].result.ok, false)
  assert.match(bridge.responses[0].result.error.message, /不能启动 DAG/)
}

console.log('DAG orchestration desktop bridge checks passed')
