import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createOrchestrationService } from '../backend/orchestration-service.mjs'
import {
  crossProviderReviewRequestOverride,
  prepareCrossProviderReviewTasks,
  resolveCrossProviderReviewEnabled,
  selectCrossProviderReviewRoute,
} from '../backend/orchestration/cross-provider-review.mjs'

const execFileAsync = promisify(execFile)

assert.equal(crossProviderReviewRequestOverride('请启用跨提供方审查'), true)
assert.equal(crossProviderReviewRequestOverride('本轮不要跨提供方审查'), false)
assert.equal(crossProviderReviewRequestOverride('修复代码'), null)
assert.equal(resolveCrossProviderReviewEnabled('关闭跨提供方审查', true), false)
assert.equal(resolveCrossProviderReviewEnabled('修复代码', true), true)
assert.equal(resolveCrossProviderReviewEnabled('修复代码', false), false)

const baseTasks = [{
  id: 'T1',
  title: '实现修复',
  taskType: 'implementation',
  description: '修改 widget',
  acceptance: ['widget 修复结果通过读取证据核对'],
  writeScopes: ['src/widget.js'],
  dependsOn: [],
}]
const prepared = prepareCrossProviderReviewTasks(baseTasks)
assert.equal(prepared.reason, null)
assert.equal(prepared.task.taskType, 'review')
assert.deepEqual(prepared.task.dependsOn, ['T1'])
assert.deepEqual(prepared.task.scopePaths, ['src/widget.js'])
assert.equal(prepareCrossProviderReviewTasks([{ ...baseTasks[0], writeScopes: [] }]).reason, 'implementation_scope_missing')
assert.equal(prepareCrossProviderReviewTasks(Array.from({ length: 6 }, (_, index) => ({
  id: `T${index + 1}`,
  title: `实现 ${index + 1}`,
  taskType: 'implementation',
  writeScopes: ['src/widget.js'],
}))).reason, 'dag_node_limit')

const catalog = { models: [
  { key: 'alpha/strong', provider: 'alpha', name: 'Alpha Strong', available: true, profile: { tier: 'strong', enabledForAllocation: true } },
  { key: 'alpha/balanced', provider: 'alpha', name: 'Alpha Balanced', available: true, profile: { tier: 'balanced', enabledForAllocation: true } },
  { key: 'beta/strong', provider: 'beta', name: 'Beta Strong', available: true, profile: { tier: 'strong', enabledForAllocation: true } },
] }
const crossRoute = selectCrossProviderReviewRoute({
  catalog,
  primaryModelKey: 'alpha/strong',
  implementationModelKeys: ['alpha/balanced'],
})
assert.equal(crossRoute.model.key, 'beta/strong', 'cross-provider review prefers the different provider strong model')
assert.equal(crossRoute.crossProvider, true)
assert.equal(selectCrossProviderReviewRoute({
  catalog: { models: catalog.models.filter((model) => model.provider === 'alpha') },
  primaryModelKey: 'alpha/strong',
  implementationModelKeys: ['alpha/balanced'],
}).model, null, 'cross-provider review does not fall back to the implementation provider')

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-cross-review-'))
const repo = path.join(root, 'repo')
const userDataPath = path.join(root, 'user-data')
const agentDataPath = path.join(root, 'agent-data')
await fs.mkdir(path.join(repo, 'src'), { recursive: true })
await fs.mkdir(userDataPath, { recursive: true })
await fs.mkdir(agentDataPath, { recursive: true })
try {
  await execFileAsync('git', ['init'], { cwd: repo })
  await fs.writeFile(path.join(repo, 'src/widget.js'), 'export const widget = 1\n')
  await execFileAsync('git', ['add', '.'], { cwd: repo })
  await execFileAsync('git', ['commit', '-m', 'initial'], {
    cwd: repo,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'TaskWeaver Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'TaskWeaver Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    },
  })

  const runCatalog = {
    models: [
      { ...catalog.models[0], api: 'anthropic-messages' },
      { ...catalog.models[1], api: 'anthropic-messages', costPerMillion: { input: 1, output: 2 } },
      { ...catalog.models[2], api: 'anthropic-messages', costPerMillion: { input: 3, output: 4 } },
    ],
  }
  const modelService = {
    listCatalog: async () => runCatalog,
    getRuntime: async () => ({
      getModel: (provider, id) => ({ provider, id, name: id, api: 'anthropic-messages' }),
      getAvailable: async () => runCatalog.models.map((model) => ({
        provider: model.provider,
        id: model.key.slice(model.provider.length + 1),
      })),
    }),
  }
  const appState = {
    tasks: [],
    getState: async () => ({ tasks: appState.tasks, messages: [] }),
    setTasks: async (tasks) => { appState.tasks = tasks },
    appendOutputLog: async () => {},
  }
  const turns = []
  const runtime = {
    async runAgentTurn(options) {
      turns.push(options)
      const usage = { inputTokens: 10, outputTokens: 10, costUsd: 0.001 }
      if (options.agentPreset === 'tw-taskweaver-planner' && options.text.includes('Planner Agent')) {
        return {
          text: JSON.stringify({ tasks: [{
            id: 'T1',
            title: '修复 widget',
            taskType: 'implementation',
            role: '实现',
            description: '修复 widget 的值',
            acceptance: ['widget 结果有文件变更证据'],
            writeScopes: ['src/widget.js'],
            dependsOn: [],
          }] }),
          usage,
        }
      }
      if (options.agentPreset === 'tw-taskweaver-planner') return { text: '实现和独立审查已完成。', usage }

      const taskId = options.taskId
      if (options.agentPreset === 'tw-taskweaver-readonly') {
        options.webContents.send('chat:stream', {
          type: 'tool',
          id: `${taskId}-read`,
          taskId,
          toolName: 'read',
          status: 'done',
          inputSummary: 'src/widget.js',
          resultSummary: 'export const widget = 2',
        })
      }
      const acceptanceBlock = options.text.match(/【本节点验收点】\s*\n([\s\S]*?)\n请在最终回答末尾/)?.[1] ?? ''
      const criteria = [...acceptanceBlock.matchAll(/^\d+\. (.+)$/gm)].map((match) => match[1])
      if (criteria.length === 0) criteria.push('结果完成')
      return {
        text: `完成 ${taskId}。\n<taskweaver-acceptance-v1>${JSON.stringify({
          results: criteria.map((criterion) => ({ criterion, passed: true, evidence: '读取 src/widget.js 并核对结果' })),
        })}</taskweaver-acceptance-v1>`,
        ...(taskId === 'T1' ? { fileChanges: [{ path: 'src/widget.js', addedLines: 1, deletedLines: 1 }] } : {}),
        usage,
      }
    },
  }
  const service = createOrchestrationService({
    modelService,
    appState,
    getWorkspacePath: async () => repo,
    getWorkspaceTrusted: () => true,
    agentDataPath,
    userDataPath,
    getAppPreferences: async () => ({
      dagPlanApproval: 'never',
      dagCrossProviderReview: false,
      worktreeIsolation: false,
      maxSubtaskConcurrency: 1,
      subtaskUpgradeMax: 0,
    }),
    dshRuntime: runtime,
  })
  const webContents = { isDestroyed: () => false, send: () => {} }
  const result = await service.planAndExecute({
    text: '请修改 widget，并启用跨提供方审查。',
    primaryModelKey: 'alpha/strong',
    conversationId: 'cross-provider-review-test',
    webContents,
    workspacePath: repo,
  })
  const implementationTask = result.tasks.find((task) => task.id === 'T1')
  const reviewTask = result.tasks.find((task) => task.crossProviderReview === true)
  assert.ok(implementationTask)
  assert.ok(reviewTask, 'the opted-in code-change DAG includes a review node')
  assert.equal(implementationTask.modelKey, 'alpha/balanced')
  assert.equal(reviewTask.modelKey, 'beta/strong')
  assert.equal(reviewTask.routeDecision.crossProvider, true)
  assert.equal(reviewTask.status, 'done', JSON.stringify(reviewTask, null, 2))
  const reviewTurn = turns.find((turn) => turn.taskId === reviewTask.id)
  assert.equal(reviewTurn.modelKey, 'beta/strong')
  assert.match(reviewTurn.text, /<taskweaver-readonly-scope-v1>\{"paths":\["src\/widget.js"\]\}<\/taskweaver-readonly-scope-v1>/)
  assert.deepEqual(reviewTask.dependsOn, ['T1'])
} finally {
  await fs.rm(root, { recursive: true, force: true })
}

console.log('Cross-provider DAG review tests passed.')
