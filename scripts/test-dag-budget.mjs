import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createOrchestrationService } from '../desktop/backend/orchestration-service.mjs'
import { RunStore } from '../desktop/backend/orchestration/run-store.mjs'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dag-budget-'))
try {
  const workspacePath = path.join(tempRoot, 'workspace')
  const agentDataPath = path.join(tempRoot, 'agent-data')
  await Promise.all([fs.mkdir(workspacePath), fs.mkdir(agentDataPath)])
  await fs.writeFile(path.join(workspacePath, 'README.md'), 'budget mock\n')
  const conversationId = randomUUID()
  const taskCalls = []
  const synthesisCalls = []
  const states = new Map([[conversationId, { workspacePath, messages: [], tasks: [] }]])
  const appState = {
    getConversationState: async (id) => states.get(id) ?? { workspacePath, messages: [], tasks: [] },
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
        if (options.text.includes('子任务结果：')) {
          synthesisCalls.push(options.text)
          return { text: 'T1 已完成，T2 因预算停止。', usage: { inputTokens: 1, outputTokens: 1 } }
        }
        return {
          text: JSON.stringify({ tasks: [
            { id: 'T1', title: '预算内节点', taskType: 'research', description: '读取 README', acceptance: ['README 结论有读取证据'], scopePaths: ['README.md'], dependsOn: [] },
            { id: 'T2', title: '预算后节点', taskType: 'research', description: '读取 T1 之后的补充材料', acceptance: ['补充结论有读取证据'], scopePaths: ['README.md'], dependsOn: ['T1'] },
          ] }),
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      }
      taskCalls.push(options.taskId)
      options.webContents.send('chat:stream', {
        type: 'tool', taskId: options.taskId, id: `${options.taskId}-read`,
        toolName: 'read', status: 'done', inputSummary: 'README.md', resultSummary: 'budget mock',
      })
      const criterion = options.text.match(/【本节点验收点】\s*\n\d+\. ([^\n]+)/)?.[1]
      return {
        text: `README 已读取。\n<taskweaver-acceptance-v1>${JSON.stringify({ results: [{
          criterion, passed: true, evidence: 'README.md 的 Host read 记录',
        }] })}</taskweaver-acceptance-v1>`,
        usage: { inputTokens: 4, outputTokens: 1 },
      }
    },
  }
  const service = createOrchestrationService({
    modelService: { listCatalog: async () => modelCatalog },
    appState,
    getWorkspacePath: async () => workspacePath,
    agentDataPath,
    getAppPreferences: async () => ({
      dagPlanApproval: 'never',
      maxSubtaskConcurrency: 1,
      worktreeIsolation: false,
      dagBudgetTokens: 3,
      dagBudgetUsd: 100,
    }),
    dshRuntime: runtime,
  })

  const result = await service.planAndExecute({
    text: '只读调研 README 的预算样例，不要修改文件。',
    primaryModelKey: 'mock/balanced',
    conversationId,
    workspacePath,
    permissionMode: 'readonly',
    dagPlanApprovalOverride: 'never',
    webContents: { send() {} },
  })
  assert.deepEqual(taskCalls, ['T1'], 'a completed node that crosses budget prevents launching the next node')
  const t2 = result.tasks.find((task) => task.id === 'T2')
  assert.match(t2.statusLabel, /超出预算/)
  assert.ok(synthesisCalls[0].includes('超出预算'), 'the summary receives the budget stop reason')
  const runId = result.tasks[0].runId
  const run = await new RunStore({ agentDataPath }).loadRun(conversationId, runId)
  assert.equal(run.settings.dagBudgetTokens, 3, 'the run record snapshots the token budget')
  assert.equal(run.settings.dagBudgetUsd, 100, 'the run record snapshots the cost budget')
  assert.equal(run.settings.maxProviderConcurrency, 2, 'the run record snapshots the per-provider concurrency ceiling')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}

console.log('DAG budget focused tests passed')
