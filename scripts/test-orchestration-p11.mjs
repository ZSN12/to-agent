import assert from 'node:assert/strict'
import './test-dag-plan-approval.mjs'
import './test-dag-acceptance.mjs'
import './test-dag-budget.mjs'
import './test-dag-run-replay.mjs'
import './test-dag-writer-retry-safety.mjs'
import './test-planner-hints.mjs'
import './test-planner-retries.mjs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  createNodeDeadline,
  resolveNodeTimeouts,
  waitForNodeTurn,
} from '../desktop/backend/orchestration/node-deadline.mjs'
import { createDagPauseControl } from '../desktop/backend/orchestration/pause-control.mjs'
import { executeDag } from '../desktop/backend/dag-scheduler.mjs'
import { createOrchestrationService } from '../desktop/backend/orchestration-service.mjs'
import { createNodeWorktree, removeTaskWorktree } from '../desktop/backend/worktree-service.mjs'
import { TraceStore } from '../desktop/backend/orchestration/trace-store.mjs'
import { RunStore } from '../desktop/backend/orchestration/run-store.mjs'
import { UsageLedger } from '../desktop/backend/orchestration/usage-ledger.mjs'
import { layoutTasks } from '../desktop/backend/orchestration/planner.mjs'
import { buildOrchestrationTraceCsv } from '../src/features/orchestration/orchestration-trace-csv.mjs'
import {
  classifySubtaskFailure,
  runWithSubtaskRetries,
} from '../desktop/backend/subtask-retry.mjs'
import {
  nextTaskTier,
  selectModelForTask,
  shouldUpgradeFailedTask,
} from '../desktop/backend/orchestration-policy.mjs'

const timeouts = resolveNodeTimeouts('research')
assert.equal(timeouts.timeoutMs, 10 * 60 * 1000)
assert.equal(timeouts.idleTimeoutMs, 3 * 60 * 1000)
assert.equal(resolveNodeTimeouts('implementation').timeoutMs, 20 * 60 * 1000)
assert.deepEqual(resolveNodeTimeouts('review', {
  dagReadOnlyTimeoutMs: 30_000,
  dagIdleTimeoutMs: 5_000,
}), { timeoutMs: 30_000, idleTimeoutMs: 5_000 })

const timeoutDeadline = createNodeDeadline({ timeoutMs: 20, idleTimeoutMs: 0 })
await assert.rejects(
  waitForNodeTurn(new Promise(() => {}), timeoutDeadline.signal),
  (error) => error.code === 'ETASK_TIMEOUT' && error.retryable === false,
  'a turn that ignores AbortSignal must still release the scheduler at the node limit',
)
timeoutDeadline.dispose()

const idleDeadline = createNodeDeadline({ timeoutMs: 1_000, idleTimeoutMs: 20 })
await new Promise((resolve) => setTimeout(resolve, 10))
idleDeadline.touch()
await assert.rejects(
  waitForNodeTurn(new Promise(() => {}), idleDeadline.signal),
  (error) => error.code === 'ETASK_IDLE_TIMEOUT',
  'stream activity resets the idle timer, then inactivity aborts the attempt',
)
idleDeadline.dispose()

assert.equal(classifySubtaskFailure(Object.assign(new Error('idle'), { code: 'ETASK_IDLE_TIMEOUT' })).kind, 'timeout')
assert.equal(shouldUpgradeFailedTask('research', { kind: 'timeout', retryable: true }), true,
  'read-only nodes can fail over after one timeout')

const statuses = new Map()
const deadlineDag = await executeDag([
  { id: 'T1', title: 'hang', taskType: 'research', description: 'mock never-resolving node', dependsOn: [] },
  { id: 'T2', title: 'dependent', taskType: 'review', description: 'wait for T1', dependsOn: ['T1'] },
], {
  execute: async () => {
    const deadline = createNodeDeadline({ timeoutMs: 20, idleTimeoutMs: 0 })
    try {
      return await waitForNodeTurn(new Promise(() => {}), deadline.signal)
    } finally {
      deadline.dispose()
    }
  },
  onTaskChange: async (task) => statuses.set(task.id, task.statusLabel),
})
assert.deepEqual([...deadlineDag.failed].sort(), ['T1', 'T2'])
assert.equal(statuses.get('T1'), '超时')
assert.match(statuses.get('T2'), /依赖任务 T1 未完成/)

let activeReadOnlyNodes = 0
let peakReadOnlyNodes = 0
const cappedDag = await executeDag(Array.from({ length: 5 }, (_, index) => ({
  id: `T${index + 1}`,
  title: `read ${index + 1}`,
  taskType: 'research',
  description: 'independent read-only task',
  dependsOn: [],
})), {
  maxConcurrency: 3,
  execute: async (task) => {
    activeReadOnlyNodes += 1
    peakReadOnlyNodes = Math.max(peakReadOnlyNodes, activeReadOnlyNodes)
    await new Promise((resolve) => setTimeout(resolve, 5))
    activeReadOnlyNodes -= 1
    return { text: `done ${task.id}` }
  },
})
assert.equal(cappedDag.failed.size, 0)
assert.equal(peakReadOnlyNodes, 3, 'a run-level concurrency cap limits five independent ready nodes to three active nodes')

const criticalPathStartOrder = []
await executeDag([
  { id: 'short', title: 'short branch', taskType: 'research', description: 'one node', dependsOn: [] },
  { id: 'long-1', title: 'long branch start', taskType: 'research', description: 'two node branch', dependsOn: [] },
  { id: 'long-2', title: 'long branch middle', taskType: 'research', description: 'three node branch', dependsOn: ['long-1'] },
  { id: 'long-3', title: 'long branch end', taskType: 'research', description: 'three node branch', dependsOn: ['long-2'] },
], {
  maxConcurrency: 1,
  execute: async (task) => {
    criticalPathStartOrder.push(task.id)
    return { text: task.id }
  },
})
assert.equal(criticalPathStartOrder[0], 'long-1', 'the initial ready set starts its longest branch first')
assert.equal(criticalPathStartOrder[1], 'long-2', 'when a longer continuation is ready, it outranks the short branch')

let completeFirstPausedNode
let firstPausedNodeStarted
const firstPausedNodeStartedPromise = new Promise((resolve) => { firstPausedNodeStarted = resolve })
const pauseControl = createDagPauseControl(new AbortController().signal)
const pauseEvents = []
const pausedDag = executeDag([
  { id: 'pause-1', title: 'first', taskType: 'research', description: 'first node', dependsOn: [] },
  { id: 'pause-2', title: 'second', taskType: 'research', description: 'second node', dependsOn: ['pause-1'] },
], {
  maxConcurrency: 1,
  pauseGate: () => pauseControl.waitUntilResumed(),
  execute: async (task) => {
    pauseEvents.push(`start:${task.id}`)
    if (task.id === 'pause-1') {
      firstPausedNodeStarted()
      await new Promise((resolve) => { completeFirstPausedNode = resolve })
    }
    return { text: task.id }
  },
})
await firstPausedNodeStartedPromise
assert.equal(pauseControl.pause(), true)
completeFirstPausedNode()
await new Promise((resolve) => setTimeout(resolve, 20))
assert.deepEqual(pauseEvents, ['start:pause-1'], 'pausing waits for active work but prevents the next dependent node from starting')
assert.equal(pauseControl.resume(), true)
await pausedDag
assert.deepEqual(pauseEvents, ['start:pause-1', 'start:pause-2'])

const conflictStatuses = new Map()
await executeDag([
  { id: 'T-conflict', title: 'merge upstream', taskType: 'test', description: 'mock branch conflict', dependsOn: [] },
], {
  execute: async () => {
    const error = new Error('upstream branch conflict')
    error.code = 'WORKTREE_MERGE_CONFLICT'
    throw error
  },
  onTaskChange: async (task) => conflictStatuses.set(task.id, task.statusLabel),
})
assert.equal(conflictStatuses.get('T-conflict'), '上游改动冲突')

const retryState = { dirty: false }
const attemptEvidence = []
let runAttempt = 0
const retryResult = await runWithSubtaskRetries({
  task: { id: 'T-write', taskType: 'implementation', title: '幂等重试' },
  initialModelKey: 'balanced-model',
  maxRetries: 2,
  run: async (modelKey, evidence) => {
    runAttempt += 1
    if (runAttempt === 1) {
      retryState.dirty = true
      throw new Error('agent failed after a partial edit')
    }
    assert.equal(retryState.dirty, false, 'retry starts with the failed attempt work removed')
    assert.deepEqual(evidence.related_files, ['src/partial.ts'])
    assert.match(evidence.diff, /partial edit/)
    attemptEvidence.push(evidence)
    return { text: `completed by ${modelKey}` }
  },
  prepareRetry: async () => ({
    allowRetry: true,
    evidenceBundle: { related_files: ['src/partial.ts'], diff: '+partial edit' },
  }),
  chooseModel: async ({ previousModelKey }) => {
    assert.equal(previousModelKey, 'balanced-model')
    return { modelKey: 'strong-model', displayName: 'Strong' }
  },
  onRetry: async () => { retryState.dirty = false },
  canRetry: ({ failure, attempt }) => failure.kind === 'execution' && attempt === 1,
})
assert.equal(retryResult.modelKey, 'strong-model')
assert.equal(retryResult.attempts, 1)
assert.equal(attemptEvidence.length, 1)

const threeTierCatalog = { models: [
  { key: 'cheap', name: 'Cheap', available: true, profile: { tier: 'cheap', enabledForAllocation: true }, costPerMillion: { input: 0, output: 0 } },
  { key: 'balanced', name: 'Balanced', available: true, profile: { tier: 'balanced', enabledForAllocation: true }, costPerMillion: { input: 0, output: 0 } },
  { key: 'strong', name: 'Strong', available: true, profile: { tier: 'strong', enabledForAllocation: true }, costPerMillion: { input: 0, output: 0 } },
] }
assert.equal(nextTaskTier('implementation', 'balanced'), 'strong')
assert.equal(selectModelForTask('implementation', threeTierCatalog, 'cheap', {
  minTier: 'balanced',
  preferTier: 'strong',
}).model.key, 'strong', 'retries exclude lower tiers and prefer the next higher tier')
assert.equal(selectModelForTask('implementation', threeTierCatalog, 'cheap', {
  minTier: 'strong',
}).model.key, 'strong')

const execFileAsync = promisify(execFile)
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-p11-followup-'))
const repo = path.join(tempRoot, 'repo')
const userDataPath = path.join(tempRoot, 'user-data')
const agentDataPath = path.join(tempRoot, 'agent-data')
await Promise.all([fs.mkdir(repo), fs.mkdir(userDataPath), fs.mkdir(agentDataPath)])
const recoveryStore = new RunStore({ agentDataPath })
const recoveryConversationId = randomUUID()
const recoveryRunId = randomUUID()
await recoveryStore.saveRun(recoveryConversationId, recoveryRunId, {
  status: 'paused',
  tasks: [
    { id: 'queued', status: 'queued', statusLabel: '排队中', runStatus: 'paused' },
    { id: 'running', status: 'running', statusLabel: '执行中', runStatus: 'paused' },
    { id: 'done', status: 'done', statusLabel: '已完成', runStatus: 'finalizing' },
  ],
})
await recoveryStore.recoverIncompleteRuns()
const recoveredRun = await recoveryStore.loadRun(recoveryConversationId, recoveryRunId)
assert.equal(recoveredRun.status, 'interrupted', 'paused runs are surfaced as interrupted after app recovery')
assert.equal(recoveredRun.tasks.find((task) => task.id === 'queued').status, 'interrupted')
assert.equal(recoveredRun.tasks.find((task) => task.id === 'running').statusLabel, '已中断')
assert.equal(recoveredRun.tasks.find((task) => task.id === 'done').runStatus, 'completed', 'crash recovery keeps saved successful nodes reusable')
const cancelledRunId = randomUUID()
await recoveryStore.saveRun(recoveryConversationId, cancelledRunId, {
  status: 'cancelled',
  tasks: [{ id: 'cancelled', status: 'cancelled', statusLabel: '已停止', runStatus: 'cancelled' }],
})
await recoveryStore.recoverIncompleteRuns()
assert.equal((await recoveryStore.loadRun(recoveryConversationId, cancelledRunId)).tasks[0].runStatus, 'cancelled',
  'recovery keeps terminal cancellation states intact')
const conversationId = randomUUID()
const runId = randomUUID()
const taskId = 'T1'
await execFileAsync('git', ['init', '-b', 'main'], { cwd: repo })
await execFileAsync('git', ['config', 'user.name', 'TaskWeaver Test'], { cwd: repo })
await execFileAsync('git', ['config', 'user.email', 'test@taskweaver.local'], { cwd: repo })
await fs.writeFile(path.join(repo, 'base.txt'), 'baseline\n')
await execFileAsync('git', ['add', '-A'], { cwd: repo })
await execFileAsync('git', ['commit', '-m', 'baseline'], { cwd: repo })
const worktree = await createNodeWorktree({
  workspacePath: repo,
  conversationId,
  runId,
  taskId,
  userDataPath,
  baseCommit: null,
})
const taskForFollowup = {
  id: taskId,
  runId,
  taskType: 'implementation',
  title: '隔离追问',
  description: '在已有节点 worktree 中继续',
  role: '实现 Agent',
  modelKey: 'model-a',
  dshSessionKey: `tw-orchestration-${conversationId}-${runId}-${taskId}`,
  execCwd: worktree.path,
  execBranch: worktree.branchName,
  worktreeIsolated: true,
  writeScopes: ['src'],
  permissionMode: 'ask',
  messages: [],
}
let storedTasks = [taskForFollowup]
const sessionState = {
  workspacePath: repo,
  messages: [{ author: 'user', text: '修改 src 中的文件' }],
  get tasks() { return storedTasks },
}
const appState = {
  getConversationState: async () => sessionState,
  setTasksForConversation: async (_conversationId, tasks) => { storedTasks = tasks },
}
const runtimeCalls = []
const permissionContexts = []
const orchestration = createOrchestrationService({
  modelService: { listCatalog: async () => ({ models: [] }) },
  appState,
  getWorkspacePath: async () => { throw new Error('follow-up must not fall back to the mutable current workspace') },
  agentDataPath,
  userDataPath,
  permissionService: {
    withExecution: async (mode, _webContents, fn, metadata) => {
      permissionContexts.push({ mode, ...metadata })
      return fn()
    },
  },
  dshRuntime: {
    runAgentTurn: async (options) => {
      runtimeCalls.push(options)
      return { text: 'continued in isolated worktree', usage: { inputTokens: 1, outputTokens: 1 } }
    },
  },
})
await orchestration.sendTaskMessage({
  taskId,
  text: '继续修改',
  conversationId,
  workspacePath: path.join(tempRoot, 'wrong-workspace'),
})
assert.equal(runtimeCalls[0].cwd, worktree.path, 'follow-up uses the node worktree rather than the caller workspace')
assert.equal(runtimeCalls[0].permissionMode, 'ask')
assert.deepEqual(permissionContexts[0].writeScopes, ['src'], 'follow-up retains the original write scope')
assert.equal(permissionContexts[0].workspacePath, worktree.path)
await removeTaskWorktree({ workspacePath: repo, conversationId, runId, taskId, userDataPath, force: true })
await assert.rejects(
  orchestration.sendTaskMessage({ taskId, text: '继续修改', conversationId }),
  /worktree 已被删除/,
  'a follow-up must not silently fall back after its worktree is removed',
)
assert.equal(runtimeCalls.length, 1)

const traceRoot = path.join(tempRoot, 'trace-data')
await fs.mkdir(traceRoot)
const traceStore = new TraceStore({ agentDataPath: traceRoot, now: () => '2026-10-10T00:00:00.000Z' })
await Promise.all([
  traceStore.append(conversationId, runId, { type: 'node_started', taskId: 'T1', startedAt: '2026-10-10T00:00:00.000Z' }),
  traceStore.append(conversationId, runId, {
    type: 'model_call',
    taskId: 'T1',
    modelKey: 'model-a',
    outcome: 'success',
    usage: { inputTokens: 12, outputTokens: 8, costUsd: 0.02, apiKey: 'must-not-persist' },
  }),
  traceStore.append(conversationId, runId, { type: 'node_finished', taskId: 'T1', durationMs: 10 }),
])
await traceStore.flush(conversationId, runId)
const traceFile = path.join(traceRoot, 'orchestration', conversationId, runId, 'trace.jsonl')
const traceText = await fs.readFile(traceFile, 'utf8')
const traceRows = traceText.trim().split('\n').map((line) => JSON.parse(line))
assert.deepEqual(traceRows.map((row) => row.type), ['node_started', 'model_call', 'node_finished'])
assert.deepEqual(traceRows[1].usage, { inputTokens: 12, outputTokens: 8, costUsd: 0.02 })
assert.equal(traceText.includes('must-not-persist'), false, 'trace stores token/cost metrics but excludes unrelated usage fields')

const usageLedger = new UsageLedger()
usageLedger.record({ runId, taskId: 'T1', attempt: 1, modelKey: 'model-a', usage: { inputTokens: 12, outputTokens: 8, costUsd: 0.02 }, outcome: 'failed' })
usageLedger.record({ runId, taskId: 'T1', attempt: 2, modelKey: 'model-b', usage: { promptTokens: 4, completionTokens: 6, costUsd: 0.01 }, outcome: 'success' })
assert.equal(usageLedger.getSummary().totalTokens, 30, 'ledger totals use the runtime input/output usage field names')
assert.equal(usageLedger.getTaskSummary('T1').attempts, 2)
assert.equal(usageLedger.getTaskSummary('T1').costUsd, 0.03)

const layered = layoutTasks([
  { id: 'T1', dependsOn: [] },
  { id: 'T2', dependsOn: ['T1'] },
  { id: 'T3', dependsOn: [] },
  { id: 'T4', dependsOn: ['T3'] },
])
assert.equal(layered[0].y, layered[2].y, 'independent nodes share a DAG layer')
assert.ok(layered[1].y > layered[0].y, 'dependent nodes render below their prerequisites')
assert.ok(layered[3].y > layered[2].y)

const csv = buildOrchestrationTraceCsv([{
  id: 'T-csv',
  runId,
  title: '=HYPERLINK("https://invalid")',
  taskType: 'implementation',
  status: 'done',
  statusLabel: '已完成',
  duration: '1.2s',
  durationMs: 1200,
  startedAt: '2026-10-10T00:00:00.000Z',
  endedAt: '2026-10-10T00:00:01.200Z',
  routeReason: 'strong tier',
  dependsOn: [],
  messages: [],
  usageSummary: {
    attempts: 2,
    inputTokens: 16,
    outputTokens: 14,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0.03,
    byModel: [
      { modelKey: 'model-a', attempts: 1, inputTokens: 12, outputTokens: 8, costUsd: 0.02 },
      { modelKey: 'model-b', attempts: 1, inputTokens: 4, outputTokens: 6, costUsd: 0.01 },
    ],
  },
}])
assert.equal((csv.match(/T-csv/g) ?? []).length, 2, 'CSV has one row per model cost contribution')
assert.match(csv, /'=HYPERLINK/)
assert.match(csv, /"1200"/)

await fs.rm(tempRoot, { recursive: true, force: true })

console.log('P11.3–P11.4 and P11.14 focused checks passed: retries, timeout, run trace, usage totals, layered layout, and CSV export')
