import assert from 'node:assert/strict'
import { renderMarkdown, summarizeReport } from './parity-bench-summary.mjs'
import { summarizeHostStepTimings } from './host-step-timings.mjs'

const readSmoke = summarizeReport({
  modelKey: 'xiaomi/mimo-v2.6-flash',
  agentPreset: 'standard',
  requests: 2,
  requestAttemptEstimate: 3,
  requestHeaderSnapshots: 1,
  retryScheduledCount: 1,
  retryStartedCount: 1,
  steps: 2,
  hostStepTimings: [
    { turn: 1, step: 1, startedAtMs: 100, firstChunkAfterStepMs: 20, firstChunkType: 'text-delta', firstTextAfterStepMs: 20, assistantMessageAtMs: 180, stepDurationMs: 200, retryScheduledCount: 1, retryStartedCount: 1, requestHeaderSnapshotCount: 1, content: 'PRIVATE STEP BODY' },
  ],
  elapsedMs: 12000,
  firstTextMs: 3000,
  toolCalls: [
    { name: 'read', arguments: { file_path: '/private/workspace/src/secret.ts' } },
    { name: 'grep', arguments: { pattern: 'credential=secret-value' } },
  ],
  nestedToolCalls: [],
  result: { text: 'PRIVATE ANSWER' },
  thinking: 'PRIVATE REASONING',
  turnEnd: { reason: 'completed' },
}, 1)
assert.equal(readSmoke.schemaVersion, 2)
assert.equal(readSmoke.reportType, 'read-smoke')
assert.equal(readSmoke.hostToolCalls, 2)
assert.deepEqual(readSmoke.toolCounts, { read: 1, grep: 1 })
assert.equal(readSmoke.status, 'completed')
assert.equal(readSmoke.elapsedMs, 12000)
assert.equal(readSmoke.requestAttemptsEstimated, 3)
assert.equal(readSmoke.requestHeaderSnapshots, 1)
assert.equal(readSmoke.hostStepTimings[0].firstChunkAfterStepMs, 20)
assert.equal(readSmoke.hostStepTimings[0].firstTextAfterStepMs, 20)
assert.equal(readSmoke.hostStepTimings[0].stepDurationMs, 200)
assert.doesNotMatch(JSON.stringify(readSmoke), /private\/workspace|secret-value|PRIVATE ANSWER|PRIVATE REASONING/)
assert.doesNotMatch(JSON.stringify(readSmoke), /PRIVATE STEP BODY/)

const legacyReadSmoke = summarizeReport({ requests: 1, steps: 4, elapsedMs: 5000, toolCalls: [], nestedToolCalls: [] }, 6)
assert.equal(legacyReadSmoke.requestHeaderSnapshots, 1)
assert.equal(legacyReadSmoke.requestAttemptsEstimated, null)
assert.equal(Object.hasOwn(legacyReadSmoke, 'requests'), false)

const hostStepTrace = summarizeHostStepTimings([
  { type: 'step/start', time: 1000, data: { turn: 1, step: 1 } },
  { type: 'request/header', time: 1001, data: { header: { system: 'PRIVATE SYSTEM PROMPT' } } },
  { type: 'llm/retry', time: 1050, data: { turn: 1, step: 1, failure: { message: 'PRIVATE ERROR' } } },
  { type: 'llm/retry-started', time: 1060, data: { turn: 1, step: 1 } },
  { type: 'assistant/chunk', time: 1100, data: { turn: 1, step: 1, chunk: { type: 'reasoning-delta', text: 'PRIVATE THINKING' } } },
  { type: 'assistant/chunk', time: 1125, data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'PRIVATE ANSWER' } } },
  { type: 'assistant/message', time: 1180, data: { turn: 1, step: 1, message: { content: 'PRIVATE ANSWER' } } },
  { type: 'step/end', time: 1200, data: { turn: 1, step: 1 } },
  { type: 'step/start', time: 2000, data: { turn: 1, step: 2 } },
  { type: 'step/end', time: 2100, data: { turn: 1, step: 2 } },
], 900)
assert.equal(hostStepTrace.length, 2)
assert.equal(hostStepTrace[0].startedAtMs, 100)
assert.equal(hostStepTrace[0].firstChunkAfterStepMs, 100)
assert.equal(hostStepTrace[0].firstTextAfterStepMs, 125)
assert.equal(hostStepTrace[0].stepDurationMs, 200)
assert.equal(hostStepTrace[0].retryScheduledCount, 1)
assert.equal(hostStepTrace[0].retryStartedCount, 1)
assert.equal(hostStepTrace[0].requestHeaderSnapshotCount, 1)
assert.equal(hostStepTrace[1].firstChunkAfterStepMs, null)
assert.doesNotMatch(JSON.stringify(hostStepTrace), /PRIVATE/)

const dag = summarizeReport({
  modelKey: 'xiaomi/mimo-v2.6-flash',
  realPlanner: true,
  elapsedMs: 60000,
  concurrentAgentTurnOverlapMs: 18000,
  parallelOverlapMs: 20000,
  plannerRuns: [{ usage: { elapsedMs: 5000, inputTokens: 800, outputTokens: 100 }, text: 'PRIVATE PLAN' }],
  tasks: [
    {
      id: 'T1', taskType: 'research', status: 'done',
      executionEvidence: {
        observedToolCalls: [
          { toolName: 'read', status: 'done', durationMs: 7, inputSummary: '/private/workspace/a.ts', resultSummary: 'secret excerpt' },
          { toolName: 'grep', status: 'done', durationMs: 9, inputSummary: 'secret query' },
        ],
        omittedToolCalls: 1,
        scopeDeniedToolCalls: 0,
      },
    },
    {
      id: 'T2', taskType: 'review', status: 'review',
      executionEvidence: {
        observedToolCalls: [{ toolName: 'read', status: 'error', durationMs: 3, inputSummary: '/private/workspace/b.ts' }],
        omittedToolCalls: 0,
        scopeDeniedToolCalls: 1,
      },
    },
  ],
  taskHistories: [
    { id: 'T1', turns: [{ startedAt: 1000, finishedAt: 2000 }], calls: [{ name: 'read' }, { name: 'grep' }, { name: 'read' }] },
    { id: 'T2', turns: [{ startedAt: 1000, finishedAt: 3000 }], calls: [{ name: 'read' }] },
  ],
  taskTimings: {
    T1: { startedAtMs: 100, finishedAtMs: 1100 },
    T2: { startedAtMs: 100, finishedAtMs: 2100 },
  },
  synthesis: { usage: { elapsedMs: 4000, inputTokens: 900, outputTokens: 200 }, text: 'PRIVATE SYNTHESIS' },
  checks: { allTasksDone: false, concurrentAgentTurnsVerified: true, safelyStopped: true },
  events: [{ text: 'PRIVATE EVENT' }],
}, 2)
assert.equal(dag.reportType, 'dag-live')
assert.equal(dag.plannerMode, 'live')
assert.equal(dag.status, 'incomplete')
assert.equal(dag.hostTurns, 2)
assert.equal(dag.hostToolCalls, 4)
assert.deepEqual(dag.toolCounts, { read: 3, grep: 1 })
assert.equal(dag.parallelOverlapMs, 18000)
assert.equal(dag.plannerUsage.reportedModelTimeMs, 5000)
assert.equal(dag.finalAssistantUsage.outputTokens, 200)
assert.equal(dag.finalAssistantUsage.reportedModelTimeMs, 4000)
assert.equal(dag.tasks[0].elapsedMs, 1000)
assert.equal(dag.tasks[0].historyToolCalls, 3)
assert.equal(dag.tasks[0].evidenceObservedToolCalls, 2)
assert.equal(dag.tasks[0].omittedToolCalls, 1)
assert.equal(dag.tasks[0].observedToolDurationMs, 16)
assert.equal(dag.tasks[0].modelUsage, null)
assert.equal(dag.tasks[1].failedToolCalls, 1)
assert.equal(dag.tasks[1].scopeDeniedToolCalls, 1)
assert.doesNotMatch(JSON.stringify(dag), /private\/workspace|secret excerpt|secret query|PRIVATE PLAN|PRIVATE SYNTHESIS|PRIVATE EVENT/)

const missing = summarizeReport({ realPlanner: false, tasks: [], taskHistories: [], checks: {} }, 3)
assert.equal(missing.plannerMode, 'fixture')
assert.equal(missing.elapsedMs, null)
assert.equal(missing.parallelOverlapMs, null)
assert.equal(missing.status, 'incomplete')

const unknown = summarizeReport({ text: 'not a recognized report' }, 4)
assert.equal(unknown.reportType, 'unknown')
assert.equal(unknown.elapsedMs, null)
assert.equal(unknown.hostToolCalls, null)

const lifecycle = summarizeReport({
  modelKey: 'xiaomi/mimo-v2.6-flash',
  agentPreset: 'taskweaver-readonly',
  startedAt: 123,
  elapsedMs: 51000,
  cases: [
    {
      name: 'queued-follow-up-preserves-both-turns', status: 'passed', elapsedMs: 49000, firstTextMs: 12000,
      tools: ['read', 'grep', 'read'], errors: ['PRIVATE ERROR BODY'], retries: 1, misroutedEvents: 0,
      accepted: { queued: true },
      completedTurns: [
        { text: 'PRIVATE FIRST ANSWER', turnId: 'private-turn-1', busyAtEmission: true, continuing: true },
        { text: 'PRIVATE NEXT ANSWER', turnId: 'private-turn-2', busyAtEmission: true, continuing: false },
      ],
    },
    { name: 'parallel-independent-sessions', status: 'passed', elapsedMs: 20000, overlapped: true,
      sessions: [{ id: 'private-session-id', firstTextMs: 4000, tools: ['read'], misroutedEvents: 0 }] },
  ],
  observations: [{ severity: 'warning', message: 'PRIVATE WARNING TEXT' }],
  cwd: '/private/workspace', runtimeRoot: '/private/runtime',
}, 4)
assert.equal(lifecycle.reportType, 'lifecycle-smoke')
assert.equal(lifecycle.status, 'completed')
assert.equal(lifecycle.caseCount, 2)
assert.equal(lifecycle.passedCases, 2)
assert.equal(lifecycle.warningCount, 1)
assert.equal(lifecycle.hostToolCalls, 4)
assert.equal(lifecycle.cases[0].queuedAccepted, true)
assert.equal(lifecycle.cases[0].completedTurnCount, 2)
assert.equal(lifecycle.cases[0].turnIdsDistinct, true)
assert.deepEqual(lifecycle.cases[0].continuationFlags, [true, false])
assert.equal(lifecycle.cases[1].sessionOverlapped, true)
assert.doesNotMatch(JSON.stringify(lifecycle), /PRIVATE|private-session-id|private-turn|private\/workspace|private\/runtime/)

const failedLifecycle = summarizeReport({
  startedAt: 1,
  cases: [{ name: 'focused-file-read', status: 'failed', elapsedMs: 7000, errorCategory: 'provider-billing',
    httpStatus: 402, failureStage: 'agent-terminal-error-before-tool', confirmedToolCalls: 0,
    error: 'PRIVATE PROVIDER ERROR' }],
}, 5)
assert.equal(failedLifecycle.status, 'failed')
assert.equal(failedLifecycle.cases[0].errorCount, 1)
assert.equal(failedLifecycle.cases[0].errorCategories[0], 'provider-billing')
assert.equal(failedLifecycle.cases[0].httpStatus, 402)
assert.equal(failedLifecycle.cases[0].failureStage, 'agent-terminal-error-before-tool')
assert.equal(failedLifecycle.cases[0].toolCallCount, 0)
assert.doesNotMatch(JSON.stringify(failedLifecycle), /PRIVATE PROVIDER ERROR/)

const markdown = renderMarkdown([readSmoke, dag, lifecycle])
assert.match(markdown, /read-smoke/)
assert.match(markdown, /估算模型请求 3 次/)
assert.match(markdown, /request\/header 快照 1 次/)
assert.match(markdown, /DAG\/live/)
assert.match(markdown, /T2 review/)
assert.match(markdown, /漏记 1/)
assert.match(markdown, /lifecycle 明细/)
assert.match(markdown, /completed events 2/)
assert.match(markdown, /—/)
assert.doesNotMatch(markdown, /private\/workspace|secret-value|PRIVATE ANSWER/)

console.log('parity benchmark summary checks passed: versioned read-smoke/DAG schemas, null metrics, evidence counters, and privacy')
