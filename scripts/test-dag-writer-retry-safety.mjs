import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createOrchestrationService } from '../desktop/backend/orchestration-service.mjs'
import { RunStore } from '../desktop/backend/orchestration/run-store.mjs'

const execFileAsync = promisify(execFile)
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dag-writer-retry-'))
try {
  const workspacePath = path.join(tempRoot, 'workspace')
  const agentDataPath = path.join(tempRoot, 'agent-data')
  await Promise.all([fs.mkdir(workspacePath), fs.mkdir(agentDataPath)])
  await fs.mkdir(path.join(workspacePath, 'src'))
  await fs.writeFile(path.join(workspacePath, 'src', 'baseline.mjs'), 'export const baseline = true\n')
  await execFileAsync('git', ['init', '--quiet'], { cwd: workspacePath })
  await execFileAsync('git', ['config', 'user.name', 'TaskWeaver Test'], { cwd: workspacePath })
  await execFileAsync('git', ['config', 'user.email', 'taskweaver-test@example.invalid'], { cwd: workspacePath })
  await execFileAsync('git', ['add', 'src/baseline.mjs'], { cwd: workspacePath })
  await execFileAsync('git', ['commit', '--quiet', '-m', 'baseline'], { cwd: workspacePath })

  const conversationId = randomUUID()
  const states = new Map([[conversationId, { workspacePath, messages: [], tasks: [] }]])
  const appState = {
    getConversationState: async (id) => states.get(id) ?? { workspacePath, messages: [], tasks: [] },
    setTasksForConversation: async (id, tasks) => {
      const state = states.get(id) ?? { workspacePath, messages: [] }
      state.tasks = tasks
      states.set(id, state)
    },
  }
  const models = [
    { key: 'mock/balanced', name: 'Balanced', available: true, routeRegistered: true, profile: { tier: 'balanced', enabledForAllocation: true }, costPerMillion: { input: 0, output: 0 } },
    { key: 'mock/strong', name: 'Strong', available: true, routeRegistered: true, profile: { tier: 'strong', enabledForAllocation: true }, costPerMillion: { input: 0, output: 0 } },
  ]
  let writerCalls = 0
  const runtime = {
    getSessionId: () => 'writer-retry-safety-planner',
    async runAgentTurn(options) {
      if (options.agentPreset === 'tw-taskweaver-planner') {
        if (options.text.includes('子任务结果：')) return { text: '写节点失败后停止，没有再次写入。' }
        return {
          text: JSON.stringify({ tasks: [{
            id: 'T1',
            title: '模拟部分写入失败',
            taskType: 'implementation',
            role: '实现 Agent',
            description: '写入一半后抛出异常，验证共享工作区的写节点不会在脏状态上自动重试。',
            acceptance: ['实现文件完成且通过验证'],
            writeScopes: ['src/partial.mjs'],
            dependsOn: [],
          }] }),
          usage: { inputTokens: 1, outputTokens: 1 },
        }
      }
      writerCalls += 1
      await fs.writeFile(path.join(options.cwd, 'src', 'partial.mjs'), 'export const partial = true\n')
      throw new Error('agent failed after a partial edit')
    },
  }
  const service = createOrchestrationService({
    modelService: { listCatalog: async () => ({ models }) },
    appState,
    getWorkspacePath: async () => workspacePath,
    agentDataPath,
    getAppPreferences: async () => ({
      dagPlanApproval: 'never',
      maxSubtaskConcurrency: 1,
      worktreeIsolation: false,
      subtaskUpgradeMax: 2,
      dagBudgetTokens: 100_000,
      dagBudgetUsd: 1,
    }),
    dshRuntime: runtime,
  })

  const result = await service.planAndExecute({
    text: '实现一个文件并验证，不要只做调研。',
    primaryModelKey: 'mock/balanced',
    conversationId,
    workspacePath,
    permissionMode: 'ask',
    workspaceTrusted: true,
    dagPlanApprovalOverride: 'never',
    webContents: { send() {} },
  })

  assert.equal(writerCalls, 1, 'a dirty shared workspace must not run a second writer attempt')
  assert.deepEqual(result.failedTaskIds, ['T1'], 'the failed writer remains failed and is not reported complete')
  assert.equal(await fs.readFile(path.join(workspacePath, 'src', 'partial.mjs'), 'utf8'), 'export const partial = true\n',
    'the safety guard must preserve the user-visible partial edit rather than silently deleting it')

  const runId = result.tasks[0].runId
  const runStore = new RunStore({ agentDataPath })
  const tracePath = path.join(agentDataPath, 'orchestration', conversationId, runId, 'trace.jsonl')
  const trace = (await fs.readFile(tracePath, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
  assert.equal(trace.some((event) => event.type === 'node_retry'), false, 'the trace must not claim an unsafe retry was attempted')
  const run = await runStore.loadRun(conversationId, runId)
  const writerTask = run.tasks.find((task) => task.id === 'T1')
  assert.notEqual(writerTask.status, 'done', 'a partially written task must not be persisted as completed')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}

console.log('DAG writer retry safety integration check passed')
