import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createOrchestrationService } from '../backend/orchestration-service.mjs'

const execFileAsync = promisify(execFile)

function model(key, tier, capabilityTier) {
  return {
    key,
    name: key,
    available: true,
    routeRegistered: true,
    capabilityTier: {
      tier: capabilityTier,
      status: 'rated',
      source: 'lmarena',
      overridden: false,
    },
    profile: { tier, enabledForAllocation: true },
    costPerMillion: { input: 0, output: 0 },
  }
}

async function runScenario({
  baseline = 'bad',
  mutateFirstAttempt = false,
  firstAttemptCost = 0,
  budgetUsd = 1,
  expectRetry,
}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-dag-validation-escalation-'))
  try {
    const workspacePath = path.join(tempRoot, 'workspace')
    const userDataPath = path.join(tempRoot, 'user-data')
    const agentDataPath = path.join(tempRoot, 'agent-data')
    await Promise.all([fs.mkdir(workspacePath), fs.mkdir(userDataPath), fs.mkdir(agentDataPath)])
    await fs.mkdir(path.join(workspacePath, 'src'))
    await fs.writeFile(path.join(workspacePath, 'src', 'output.txt'), `${baseline}\n`)
    await fs.writeFile(path.join(workspacePath, 'verify.mjs'), [
      "import { readFileSync } from 'node:fs'",
      "const value = readFileSync(new URL('./src/output.txt', import.meta.url), 'utf8').trim()",
      "if (value !== 'good') { console.error(`expected good, received ${value}`); process.exit(1) }",
      "console.log('verification passed')",
      '',
    ].join('\n'))
    await fs.writeFile(path.join(workspacePath, 'package.json'), JSON.stringify({
      name: 'dag-validation-escalation-fixture',
      type: 'module',
      scripts: { typecheck: 'node verify.mjs' },
    }, null, 2))
    await execFileAsync('git', ['init', '--quiet'], { cwd: workspacePath })
    await execFileAsync('git', ['config', 'user.name', 'TaskWeaver Test'], { cwd: workspacePath })
    await execFileAsync('git', ['config', 'user.email', 'taskweaver-test@example.invalid'], { cwd: workspacePath })
    await execFileAsync('git', ['add', 'package.json', 'verify.mjs', 'src/output.txt'], { cwd: workspacePath })
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
    const cheap = model('mock/cheap', 'cheap', 'weak')
    const balancedWeak = model('mock/balanced-weak', 'balanced', 'weak')
    const strong = model('mock/strong', 'strong', 'strong')
    let catalogReads = 0
    const modelService = {
      async listCatalog() {
        catalogReads += 1
        const models = catalogReads === 1 ? [cheap] : [cheap, balancedWeak, strong]
        return { models, capabilityTierStatus: { stale: false } }
      },
    }
    const modelKeys = []
    const prompts = []
    const criterion = '验证脚本确认输出文件内容为 good'
    const makeResult = (text, usage, fileChanges) => ({
      text: `${text}\n<taskweaver-acceptance-v1>${JSON.stringify({ results: [{
        criterion,
        passed: true,
        evidence: 'typecheck 验证命令实际执行并记录退出码',
      }] })}</taskweaver-acceptance-v1>`,
      usage,
      fileChanges,
    })
    const runtime = {
      getSessionId: () => 'mock-validation-escalation-planner',
      async runAgentTurn(options) {
        if (options.agentPreset === 'tw-taskweaver-planner') {
          if (options.text.includes('子任务结果：')) return { text: '验证通过。', usage: { inputTokens: 1, outputTokens: 1 } }
          return {
            text: JSON.stringify({ tasks: [{
              id: 'T1',
              title: '修复验证失败',
              taskType: 'implementation',
              role: '实现 Agent',
              description: '确保验证脚本读取到 good。',
              acceptance: [criterion],
              writeScopes: ['src/output.txt'],
              route: { tier_adjust: -1, needs_vision: false, reason: '轻量初次执行' },
              dependsOn: [],
            }] }),
            usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
          }
        }

        modelKeys.push(options.modelKey)
        prompts.push(options.text)
        if (modelKeys.length === 1) {
          if (mutateFirstAttempt) {
            await fs.writeFile(path.join(options.cwd, 'src', 'output.txt'), 'bad\n')
          }
          return makeResult('初次实现已提交，等待验证。', {
            inputTokens: 10,
            outputTokens: 5,
            costUsd: firstAttemptCost,
          }, [{ path: 'src/output.txt' }])
        }

        await fs.writeFile(path.join(options.cwd, 'src', 'output.txt'), 'good\n')
        return makeResult('已根据失败证据修复输出。', {
          inputTokens: 12,
          outputTokens: 7,
          costUsd: 0,
        }, [{ path: 'src/output.txt' }])
      },
    }
    const service = createOrchestrationService({
      modelService,
      appState,
      getWorkspacePath: async () => workspacePath,
      userDataPath,
      agentDataPath,
      getAppPreferences: async () => ({
        dagPlanApproval: 'never',
        maxSubtaskConcurrency: 1,
        worktreeIsolation: false,
        subtaskUpgradeMax: 2,
        dagBudgetTokens: 100_000,
        dagBudgetUsd: budgetUsd,
      }),
      dshRuntime: runtime,
    })

    const result = await service.planAndExecute({
      text: '请实现并验证输出文件。',
      primaryModelKey: cheap.key,
      conversationId,
      workspacePath,
      permissionMode: 'ask',
      workspaceTrusted: true,
      dagPlanApprovalOverride: 'never',
      webContents: { send() {} },
    })

    const runId = result.tasks[0].runId
    const tracePath = path.join(agentDataPath, 'orchestration', conversationId, runId, 'trace.jsonl')
    const trace = (await fs.readFile(tracePath, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
    const retries = trace.filter((event) => event.type === 'node_retry')
    assert.equal(retries.length, expectRetry ? 1 : 0)
    return {
      result,
      modelKeys,
      prompts,
      trace,
      retries,
      workspacePath,
      agentDataPath,
      conversationId,
      runId,
      task: result.tasks.find((task) => task.id === 'T1'),
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

const upgraded = await runScenario({ expectRetry: true })
assert.deepEqual(upgraded.modelKeys, ['mock/cheap', 'mock/strong'],
  'a verification failure strictly upgrades weak capability to strong, skipping a higher route profile with the same weak capability')
assert.equal(upgraded.task.status, 'done')
assert.equal(upgraded.task.messages.at(-1)?.verification?.status, 'passed')
assert.match(upgraded.prompts[1], /npm run typecheck/)
assert.match(upgraded.prompts[1], /exit_code/)
assert.match(upgraded.prompts[1], /expected good, received bad/)
assert.equal(upgraded.retries[0].failureCount, 1)
assert.equal(upgraded.retries[0].previousModel, 'mock/cheap')
assert.equal(upgraded.retries[0].modelKey, 'mock/strong')
assert.equal(upgraded.retries[0].previousCapabilityTier, 'weak')
assert.equal(upgraded.retries[0].capabilityTier, 'strong')
assert.match(upgraded.retries[0].escalationReason, /严格能力升档 weak→strong/)

const dirty = await runScenario({ baseline: 'good', mutateFirstAttempt: true, expectRetry: false })
assert.deepEqual(dirty.modelKeys, ['mock/cheap'], 'a verification failure in a dirty shared workspace is not retried')
assert.equal(dirty.task.status, 'review')
assert.equal(dirty.retries.length, 0)

const overBudget = await runScenario({ firstAttemptCost: 2, budgetUsd: 1, expectRetry: false })
assert.deepEqual(overBudget.modelKeys, ['mock/cheap'], 'a verification failure over budget is not retried')
assert.equal(overBudget.retries.length, 0)
assert.ok(overBudget.trace.some((event) => event.type === 'budget_exceeded' && event.retryBlocked === true),
  'the retry budget gate is recorded in the audit trace')

console.log('DAG verification failure escalation integration checks passed')
