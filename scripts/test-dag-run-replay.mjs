import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createOrchestrationService } from '../desktop/backend/orchestration-service.mjs'
import { RunStore } from '../desktop/backend/orchestration/run-store.mjs'
import { createRunReplay } from '../desktop/backend/orchestration/run-replay.mjs'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dag-replay-'))
try {
  const workspacePath = path.join(tempRoot, 'workspace')
  const agentDataPath = path.join(tempRoot, 'agent-data')
  await Promise.all([fs.mkdir(workspacePath), fs.mkdir(agentDataPath)])
  await fs.writeFile(path.join(workspacePath, 'README.md'), 'mock project\n')

  const conversationId = randomUUID()
  const sourceRunId = randomUUID()
  const store = new RunStore({ agentDataPath })
  const acceptance = (criterion) => `<taskweaver-acceptance-v1>${JSON.stringify({
    results: [{ criterion, passed: true, evidence: 'mock evidence' }],
  })}</taskweaver-acceptance-v1>`
  const makeTask = (id, dependsOn, status) => ({
    id,
    title: `节点 ${id}`,
    role: '调研',
    taskType: 'research',
    description: `只读核对节点 ${id}`,
    acceptance: [`${id} 有可核验结论`],
    scopePaths: ['README.md'],
    dependsOn,
    modelKey: 'mock/balanced',
    model: 'Mock Balanced',
    tier: 'balanced',
    status,
    statusLabel: status === 'done' ? '已完成' : '已中断',
    runStatus: status === 'done' ? 'completed' : 'interrupted',
    messages: status === 'done'
      ? [{ id: `${id}-old`, author: 'agent', name: '调研', time: '', text: `已完成 ${id}\n${acceptance(`${id} 有可核验结论`)}` }]
      : [{ id: `${id}-old`, author: 'agent', name: '调研', time: '', text: '未完成：模拟中断' }],
  })
  const source = {
    runId: sourceRunId,
    conversationId,
    status: 'interrupted',
    createdAt: new Date().toISOString(),
    originalText: '只读调研这组任务，不要修改文件。',
    primaryModelKey: 'mock/balanced',
    workspacePath,
    permissionMode: 'readonly',
    workspaceTrusted: false,
    settings: { worktreeIsolation: false, maxSubtaskConcurrency: 1 },
    tasks: [
      makeTask('T1', [], 'done'),
      makeTask('T2', ['T1'], 'interrupted'),
      makeTask('T3', ['T2'], 'interrupted'),
    ],
  }
  await store.saveRun(conversationId, sourceRunId, source)

  const checkpoint = createRunReplay(source)
  assert.deepEqual([...checkpoint.pendingTaskIds], ['T2', 'T3'])
  assert.deepEqual([...checkpoint.initialResults.keys()], ['T1'])
  const rerun = createRunReplay({ ...source, status: 'completed', tasks: source.tasks.map((task) => ({
    ...task,
    status: 'done',
    statusLabel: '已完成',
    runStatus: 'completed',
    messages: [{ id: `${task.id}-done`, author: 'agent', name: '调研', time: '', text: `已完成 ${task.id}\n${acceptance(`${task.id} 有可核验结论`)}` }],
  })) }, { mode: 'rerun', taskId: 'T2' })
  assert.deepEqual([...rerun.pendingTaskIds], ['T2', 'T3'])
  assert.deepEqual([...rerun.initialResults.keys()], ['T1'])

  const calls = []
  const states = new Map([[conversationId, { workspacePath, messages: [], tasks: [] }]])
  const appState = {
    getConversationState: async (id) => states.get(id) ?? { workspacePath, tasks: [], messages: [] },
    setTasksForConversation: async (id, tasks) => {
      const state = states.get(id) ?? { workspacePath, messages: [] }
      state.tasks = tasks
      states.set(id, state)
    },
  }
  const modelCatalog = { models: [{
    key: 'mock/balanced', name: 'Mock Balanced', available: true, routeRegistered: true,
    profile: { tier: 'balanced', enabledForAllocation: true },
    costPerMillion: { input: 0, output: 0 },
  }] }
  const runtime = {
    getSessionId: () => 'mock-planner-session',
    runAgentTurn: async (options) => {
      if (options.agentPreset === 'tw-taskweaver-planner') {
        return { text: '只读调研节点执行结束。', usage: { inputTokens: 1, outputTokens: 1 } }
      }
      calls.push({ conversationId: options.conversationId, taskId: options.taskId })
      const criterion = options.text.match(/\n\d+\. ([^\n]+)/)?.[1] ?? `${options.taskId} 有可核验结论`
      options.webContents.send('chat:stream', {
        type: 'tool', taskId: options.taskId, id: `${options.taskId}-read`,
        toolName: 'read', status: 'done', inputSummary: 'README.md', resultSummary: 'mock project',
      })
      return {
        text: `已读取 README.md，结论可核对。\n${acceptance(criterion)}`,
        usage: { inputTokens: 2, outputTokens: 1 },
      }
    },
  }
  const service = createOrchestrationService({
    modelService: { listCatalog: async () => modelCatalog },
    appState,
    getWorkspacePath: async () => workspacePath,
    agentDataPath,
    getAppPreferences: async () => ({ dagPlanApproval: 'write-only', worktreeIsolation: false, maxSubtaskConcurrency: 1 }),
    dshRuntime: runtime,
  })

  const resumeResult = await service.resumeRunFromCheckpoint({
    conversationId,
    runId: sourceRunId,
    workspacePath,
    permissionMode: 'readonly',
    workspaceTrusted: false,
    webContents: { send() {} },
  })
  assert.deepEqual(calls.map((call) => call.taskId), ['T2', 'T3'], 'checkpoint resume executes only nodes without saved successful results')
  assert.equal(resumeResult.failedTaskIds.length, 0)
  assert.ok(resumeResult.tasks.every((task) => task.status === 'done'))

  const resumedRunId = resumeResult.tasks[0].runId
  calls.length = 0
  const rerunResult = await service.rerunTaskFromRun({
    conversationId,
    runId: resumedRunId,
    taskId: 'T2',
    workspacePath,
    permissionMode: 'readonly',
    workspaceTrusted: false,
    webContents: { send() {} },
  })
  assert.deepEqual(calls.map((call) => call.taskId), ['T2', 'T3'], 'single-node rerun includes its downstream closure and reuses completed prerequisites')
  assert.equal(rerunResult.failedTaskIds.length, 0)
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}

console.log('DAG run replay focused tests passed')
