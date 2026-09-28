import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { decideExecutionMode, selectModelForTask, shouldUpgradeFailedTask } from '../electron/backend/orchestration-policy.mjs'
import { executeDag, validateAndOrderTasks } from '../electron/backend/dag-scheduler.mjs'
import { getTaskProfile, getToolsForSingleAgent, getToolsForTask } from '../electron/backend/task-profile.mjs'
import { runWithSubtaskRetries } from '../electron/backend/subtask-retry.mjs'
import {
  createOrchestrationService,
  resolveOrchestrationAgentPreset,
} from '../electron/backend/orchestration-service.mjs'

assert.equal(decideExecutionMode('你好').mode, 'single-agent')
assert.equal(decideExecutionMode('修复一个按钮样式').mode, 'single-agent')
assert.equal(decideExecutionMode('请使用多智能体处理这个任务').mode, 'multi-agent')
assert.equal(decideExecutionMode('请使用 multi-agent skill').mode, 'multi-agent')
assert.equal(decideExecutionMode('不要启用多智能体，即使要实现完整前后端平台和安全、测试、部署').mode, 'single-agent')
assert.equal(decideExecutionMode('实现一个完整平台，同时涵盖前端、后端 API、测试、安全和部署').mode, 'multi-agent')
assert.equal(decideExecutionMode('实现一个前端页面和后端接口').mode, 'single-agent')
assert.equal(decideExecutionMode('为完整平台实现前端页面与后端 API').mode, 'ask-user')

assert.equal(resolveOrchestrationAgentPreset({ noTools: true }), 'taskweaver-planner')
assert.equal(resolveOrchestrationAgentPreset({ taskType: 'research' }), 'taskweaver-readonly')
assert.equal(resolveOrchestrationAgentPreset({ taskType: 'review' }), 'taskweaver-readonly')
assert.equal(resolveOrchestrationAgentPreset({ taskType: 'implementation' }), 'taskweaver-code')
assert.equal(resolveOrchestrationAgentPreset({ taskType: 'test' }), 'taskweaver-code')

const catalog = { models: [
  { key: 'cheap', name: 'Cheap', available: true, profile: { tier: 'cheap', enabledForAllocation: true }, costPerMillion: { input: 0.1, output: 0.2 } },
  { key: 'balanced', name: 'Balanced', available: true, profile: { tier: 'balanced', enabledForAllocation: true }, costPerMillion: { input: 1, output: 2 } },
  { key: 'strong', name: 'Strong', available: true, profile: { tier: 'strong', enabledForAllocation: true }, costPerMillion: { input: 5, output: 10 } },
  { key: 'disabled', name: 'Disabled', available: true, profile: { tier: 'cheap', enabledForAllocation: false }, costPerMillion: { input: 0, output: 0 } },
] }
assert.equal(selectModelForTask('research', catalog, 'balanced').model.key, 'cheap')
assert.equal(selectModelForTask('implementation', catalog, 'balanced').model.key, 'balanced')
assert.equal(selectModelForTask('review', catalog, 'balanced').model.key, 'strong')
assert.notEqual(selectModelForTask('test', catalog, 'disabled').model.key, 'disabled')

assert.equal(shouldUpgradeFailedTask('test'), true)
assert.equal(shouldUpgradeFailedTask('research'), false)
const upgradePick = selectModelForTask('review', catalog, 'balanced', { excludeModelKeys: ['strong'] })
assert.notEqual(upgradePick.model.key, 'strong')

const retriedModels = []
const retryExclusions = []
const retryOutcome = await runWithSubtaskRetries({
  initialModelKey: 'model-a',
  maxRetries: 2,
  run: async (modelKey) => {
    retriedModels.push(modelKey)
    if (modelKey !== 'model-c') throw new Error(`${modelKey} failed`)
    return { text: 'done' }
  },
  chooseModel: async ({ excludeModelKeys }) => {
    retryExclusions.push(excludeModelKeys)
    const next = ['model-b', 'model-c'].find((key) => !excludeModelKeys.includes(key))
    return next ? { modelKey: next, displayName: next } : null
  },
})
assert.deepEqual(retriedModels, ['model-a', 'model-b', 'model-c'])
assert.equal(retryOutcome.modelKey, 'model-c')
assert.equal(retryOutcome.attempts, 2)
assert.deepEqual(retryExclusions, [['model-a'], ['model-a', 'model-b']])

let disabledRetryAttempts = 0
await assert.rejects(runWithSubtaskRetries({
  initialModelKey: 'model-a',
  maxRetries: 3,
  canRetry: false,
  run: async () => {
    disabledRetryAttempts += 1
    throw new Error('must not retry')
  },
  chooseModel: async () => ({ modelKey: 'model-b' }),
}), /must not retry/)
assert.equal(disabledRetryAttempts, 1)

let exhaustedRetryAttempts = 0
await assert.rejects(runWithSubtaskRetries({
  initialModelKey: 'model-a',
  maxRetries: 1,
  run: async () => {
    exhaustedRetryAttempts += 1
    throw new Error(`failure ${exhaustedRetryAttempts}`)
  },
  chooseModel: async () => ({ modelKey: 'model-b' }),
}), /failure 2/)
assert.equal(exhaustedRetryAttempts, 2)

assert.deepEqual(getToolsForTask('research'), ['read', 'grep', 'find', 'ls'])
assert.deepEqual(getToolsForTask('review'), ['read', 'grep', 'find', 'ls'])
assert.ok(getToolsForTask('test').includes('bash'))
assert.equal(getToolsForTask('test').includes('write'), false)
assert.ok(getToolsForTask('implementation').includes('write'))
assert.equal(getTaskProfile('review').id, 'read-only')
assert.deepEqual(getToolsForSingleAgent(), ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'])

const tasks = [
  { id: 'T3', title: '测试', description: '运行测试', dependsOn: ['T2'] },
  { id: 'T1', title: '调研', description: '检查现状', dependsOn: [] },
  { id: 'T2', title: '实现', description: '修改代码', dependsOn: ['T1'] },
]
assert.deepEqual(validateAndOrderTasks(tasks).map((task) => task.id), ['T1', 'T2', 'T3'])
assert.throws(() => validateAndOrderTasks([
  { id: 'A', title: 'A', description: 'a', dependsOn: ['B'] },
  { id: 'B', title: 'B', description: 'b', dependsOn: ['A'] },
]), /循环/)
assert.throws(() => validateAndOrderTasks([{ ...tasks[0], dependsOn: ['missing'] }, tasks[1], tasks[2]]), /无效任务/)

const changed = []
const outcome = await executeDag([
  { id: 'T1', title: '失败', description: '故意失败', dependsOn: [] },
  { id: 'T2', title: '阻塞', description: '依赖 T1', dependsOn: ['T1'] },
  { id: 'T3', title: '独立', description: '不依赖 T1', dependsOn: [] },
], {
  execute: async (task) => {
    if (task.id === 'T1') throw new Error('模拟失败')
    return { text: 'ok' }
  },
  onTaskChange: (task) => changed.push(task),
})
assert.deepEqual([...outcome.failed].sort(), ['T1', 'T2'])
assert.equal(changed.find((task) => task.id === 'T2' && task.status === 'review').statusLabel, '依赖任务 T1 未完成')
assert.equal(changed.find((task) => task.id === 'T3' && task.status === 'done').statusLabel, '已完成')

const controller = new AbortController()
const cancelled = []
const stopped = await executeDag(tasks, {
  signal: controller.signal,
  execute: async (task) => {
    controller.abort()
    return { text: task.id }
  },
  onTaskChange: (task) => cancelled.push(task),
})
assert.equal(stopped.cancelled, true)
assert.deepEqual(cancelled.filter((task) => task.status === 'cancelled').map((task) => task.id), ['T1', 'T2', 'T3'])

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-orchestration-e2e-'))
const repo = path.join(tmpBase, 'repo')
const userData = path.join(tmpBase, 'user-data')
const agentData = path.join(tmpBase, 'agent-data')
await fs.mkdir(repo, { recursive: true })
await fs.mkdir(userData, { recursive: true })
await fs.mkdir(agentData, { recursive: true })

try {
  await execFileAsync('git', ['init'], { cwd: repo })
  await fs.writeFile(path.join(repo, 'README.md'), '# Test Project\n', 'utf8')
  await execFileAsync('git', ['add', '.'], { cwd: repo })
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repo })

  const mockCatalog = [
    { key: 'mock/cheap', name: 'Mock Cheap', available: true, profile: { tier: 'cheap', enabledForAllocation: true }, costPerMillion: { input: 0.1, output: 0.2 } },
    { key: 'mock/balanced', name: 'Mock Balanced', available: true, profile: { tier: 'balanced', enabledForAllocation: true }, costPerMillion: { input: 1, output: 2 } },
    { key: 'mock/strong', name: 'Mock Strong', available: true, profile: { tier: 'strong', enabledForAllocation: true }, costPerMillion: { input: 5, output: 10 } },
  ]

  const mockModelService = {
    listCatalog: async () => ({ models: mockCatalog }),
    getRuntime: async () => ({
      getModel: (provider, id) => ({ provider, id, name: id, api: 'mock' }),
      getAvailable: async () => mockCatalog.map((c) => {
        const [provider, ...parts] = c.key.split('/')
        return { provider, id: parts.join('/') }
      }),
    }),
  }

  let stateTasks = []
  const mockAppState = {
    getState: async () => ({ tasks: stateTasks, messages: [] }),
    setTasks: async (tasks) => { stateTasks = tasks },
    appendOutputLog: async () => {},
  }

  const streamEvents = []
  const mockWebContents = {
    isDestroyed: () => false,
    send: (channel, payload) => {
      streamEvents.push({ channel, payload })
    },
  }

  const dshTurns = []
  const mockDshRuntime = {
    async runAgentTurn(opts) {
      dshTurns.push(opts)
      const usage = {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0.001,
        elapsedMs: 50,
        tokensPerSecond: 400,
        contextTokens: 30,
        contextWindow: 128000,
        contextPercent: 0.01,
      }
      if (opts.agentPreset === 'taskweaver-planner') {
        if (opts.text.includes('上次输出无法解析')) {
          return {
            text: JSON.stringify({
              tasks: [
                { id: 'T1', title: '架构分析', taskType: 'research', role: 'Architect', description: '探索分析代码架构', dependsOn: [] },
                { id: 'T2', title: '功能实现', taskType: 'implementation', role: 'Developer', description: '编写特性实现', dependsOn: ['T1'] },
              ],
            }),
            usage,
          }
        }
        if (opts.text.includes('Planner Agent') || opts.text.includes('子任务执行结果')) {
          const planJson = JSON.stringify({
            tasks: [
              { id: 'T1', title: '架构分析', taskType: 'research', role: 'Architect', description: '探索分析代码架构', dependsOn: [] },
              { id: 'T2', title: '功能实现', taskType: 'implementation', role: 'Developer', description: '编写特性实现', dependsOn: ['T1'] },
            ],
          })
          return opts.text.includes('子任务执行结果')
            ? { text: '汇总：子任务已全部完成。', usage }
            : { text: planJson, usage }
        }
      }
      const taskLabel = opts.taskId || 'unknown'
      return {
        text: `在目录 ${opts.cwd} 成功完成 ${taskLabel}（preset=${opts.agentPreset}，model=${opts.modelKey}）`,
        usage,
      }
    },
  }

  const conversationId = randomUUID()
  const orchestration = createOrchestrationService({
    modelService: mockModelService,
    appState: mockAppState,
    getWorkspacePath: () => repo,
    getWorkspaceTrusted: () => true,
    agentDataPath: agentData,
    userDataPath: userData,
    getAppPreferences: async () => ({ worktreeIsolation: true, subtaskUpgradeMax: 1 }),
    dshRuntime: mockDshRuntime,
  })

  const result = await orchestration.planAndExecute({
    text: '帮我重构项目并实现新功能',
    primaryModelKey: 'mock/strong',
    conversationId,
    webContents: mockWebContents,
  })

  assert.equal(result.tasks.length, 2, 'DAG 应成功规划 2 个子任务')
  assert.equal(stateTasks.length, 2, 'appState 应保存 2 个子任务')

  assert.equal(stateTasks[0].id, 'T1')
  assert.equal(stateTasks[0].modelKey, 'mock/cheap', 'research 子任务应自动路由到 cheap 模型')
  assert.ok(stateTasks[0].routeReason, '应保留 routeReason')
  assert.equal(stateTasks[1].id, 'T2')
  assert.equal(stateTasks[1].modelKey, 'mock/balanced', 'implementation 子任务应自动路由到 balanced 模型')

  assert.equal(stateTasks[1].worktreeIsolated, true, 'implementation 子任务在开启隔离选项时应在 worktree 运行')

  const plannerTurn = dshTurns.find((turn) => turn.agentPreset === 'taskweaver-planner' && turn.text.includes('Planner Agent'))
  assert.ok(plannerTurn, '应通过 DSH 调用 planner preset')
  assert.match(plannerTurn.sessionKey, /^tw-orchestration-/)
  assert.equal(plannerTurn.conversationId, conversationId)

  const subtaskKeys = new Set(dshTurns.filter((turn) => turn.taskId).map((turn) => turn.sessionKey))
  assert.equal(subtaskKeys.size, 2, '每个子任务应使用独立 sessionKey')
  assert.ok(!subtaskKeys.has(plannerTurn.sessionKey), '子任务 sessionKey 不应与 planner 相同')

  const t1Turn = dshTurns.find((turn) => turn.taskId === 'T1')
  const t2Turn = dshTurns.find((turn) => turn.taskId === 'T2')
  assert.equal(t1Turn.agentPreset, 'taskweaver-readonly')
  assert.equal(t2Turn.agentPreset, 'taskweaver-code')

  const progressMsgs = streamEvents.filter((e) => e.payload.type === 'progress')
  const taskMsgs = streamEvents.filter((e) => e.payload.type === 'tasks')
  assert.ok(progressMsgs.length > 0, '应推送进度更新')
  assert.ok(taskMsgs.length > 0, '应推送 DAG 任务列表广播')

  assert.equal(stateTasks[0].status, 'done')
  assert.equal(stateTasks[1].status, 'done')
  assert.match(stateTasks[0].messages.at(-1).text, /成功完成/)
  assert.match(stateTasks[1].messages.at(-1).text, /成功完成/)
  assert.match(result.assistant.text, /汇总/)

  console.log('orchestration checks passed: preset mapping, DSH-only DAG execution, routing, worktree, and publish')
} finally {
  await fs.rm(tmpBase, { recursive: true, force: true })
}
