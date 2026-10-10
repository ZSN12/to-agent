import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createOrchestrationService } from '../desktop/backend/orchestration-service.mjs'
import { RunStore } from '../desktop/backend/orchestration/run-store.mjs'

const execFileAsync = promisify(execFile)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const datasetPath = path.resolve(scriptDir, '../eval/orchestration/tasks.json')
const dataset = JSON.parse(await fs.readFile(datasetPath, 'utf8'))
const sourceRepo = path.resolve(scriptDir, '..', 'eval', 'orchestration', dataset.sampleRepo)
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-orchestration-eval-'))
const originalEvaluationMode = process.env.TASKWEAVER_EVAL
process.env.TASKWEAVER_EVAL = '1'

function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) throw new Error(`评测数据包含无效路径：${String(value)}`)
  const normalized = path.normalize(value)
  if (normalized === '.' || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`评测数据路径越界：${value}`)
  }
  return normalized
}

function makeAcceptance(criterion, passed, evidence) {
  return `<taskweaver-acceptance-v1>${JSON.stringify({
    results: [{ criterion, passed, evidence }],
  })}</taskweaver-acceptance-v1>`
}

function extractCriterion(prompt, fallback) {
  return prompt.match(/【本节点验收点】\s*\n\d+\. ([^\n]+)/)?.[1] ?? fallback
}

function extractCaseId(prompt) {
  return prompt.match(/\[orchestration-eval:([A-Z]\d+)\]/)?.[1] ?? null
}

async function listFiles(directory, base = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(absolute, base))
    else if (entry.isFile()) files.push(path.relative(base, absolute).split(path.sep).join('/'))
  }
  return files.sort()
}

async function hashTree(directory) {
  const hashes = []
  for (const relativePath of await listFiles(directory)) {
    const bytes = await fs.readFile(path.join(directory, relativePath))
    hashes.push([relativePath, Buffer.from(bytes).toString('base64')])
  }
  return JSON.stringify(hashes)
}

function parsePlanForCase(testCase) {
  if (testCase.category === '只读调研') {
    return {
      tasks: [{
        id: 'T1',
        title: testCase.name,
        taskType: 'research',
        role: '调研 Agent',
        description: `[orchestration-eval:${testCase.id}] ${testCase.request}`,
        acceptance: [testCase.criterion],
        scopePaths: testCase.readFiles.map(safeRelativePath),
        dependsOn: [],
      }],
    }
  }

  return {
    tasks: [
      {
        id: 'T1',
        title: testCase.name,
        taskType: 'implementation',
        role: '实现 Agent',
        description: `[orchestration-eval:${testCase.id}] ${testCase.request}`,
        acceptance: [testCase.criterion],
        writeScopes: Object.entries(testCase.patches ?? {})
          .filter(([, content]) => typeof content === 'string')
          .map(([filePath]) => safeRelativePath(filePath)),
        dependsOn: [],
      },
      {
        id: 'T2',
        title: `${testCase.name}回归验证`,
        taskType: 'test',
        role: '测试 Agent',
        description: `[orchestration-eval:${testCase.id}] 在隔离样例仓库运行指定回归测试。`,
        acceptance: [testCase.testCriterion],
        dependsOn: ['T1'],
      },
    ],
  }
}

function acceptanceText(prompt, criterion, passed, evidence) {
  return `${prompt.includes('【本节点验收点】') ? '评测节点已执行。' : ''}\n${makeAcceptance(criterion, passed, evidence)}`
}

async function runCase(testCase) {
  const caseRoot = path.join(tempRoot, testCase.id)
  const workspacePath = path.join(caseRoot, 'workspace')
  const agentDataPath = path.join(caseRoot, 'agent-data')
  await fs.mkdir(caseRoot, { recursive: true })
  await Promise.all([
    fs.cp(sourceRepo, workspacePath, { recursive: true }),
    fs.mkdir(agentDataPath, { recursive: true }),
  ])

  const baseline = await hashTree(workspacePath)
  const conversationId = randomUUID()
  const calls = []
  const stateByConversation = new Map([[conversationId, { workspacePath, messages: [], tasks: [] }]])
  const model = {
    key: 'mock/balanced',
    name: 'Deterministic mock',
    available: true,
    routeRegistered: true,
    profile: { tier: 'balanced', enabledForAllocation: true },
    costPerMillion: { input: 0, output: 0 },
  }
  const runtime = {
    getSessionId: () => `eval-${testCase.id}`,
    async runAgentTurn(options) {
      if (options.agentPreset === 'tw-taskweaver-planner') {
        if (options.text.includes('子任务结果：')) {
          return { text: `评测 ${testCase.id} 汇总完成。`, usage: { inputTokens: 8, outputTokens: 3, costUsd: 0.000011 } }
        }
        return { text: JSON.stringify(parsePlanForCase(testCase)), usage: { inputTokens: 12, outputTokens: 5, costUsd: 0.000017 } }
      }

      const caseId = extractCaseId(options.text)
      assert.equal(caseId, testCase.id, 'each task prompt should carry the dataset case id')
      calls.push(options.taskId)
      const criterion = extractCriterion(options.text, testCase.criterion)
      const taskUsage = { inputTokens: 10, outputTokens: 4, costUsd: 0.000014 }

      if (testCase.category === '只读调研') {
        for (const filePath of testCase.readFiles) {
          const safePath = safeRelativePath(filePath)
          options.webContents.send('chat:stream', {
            type: 'tool',
            taskId: options.taskId,
            id: `${options.taskId}-${safePath}`,
            toolName: 'read',
            status: 'done',
            inputSummary: safePath,
            resultSummary: 'deterministic fixture read',
          })
        }
        return {
          text: `按读取的文件核对了导出与行为。\n${makeAcceptance(criterion, true, `Host read events: ${testCase.readFiles.join(', ')}`)}`,
          usage: taskUsage,
        }
      }

      if (options.taskId === 'T1') {
        const changes = []
        for (const [relativePath, content] of Object.entries(testCase.patches ?? {})) {
          if (typeof content !== 'string') continue
          const safePath = safeRelativePath(relativePath)
          const absolutePath = path.join(options.cwd, safePath)
          await fs.mkdir(path.dirname(absolutePath), { recursive: true })
          await fs.writeFile(absolutePath, content, 'utf8')
          changes.push({ path: safePath, status: 'modified', additions: content.split('\n').length - 1, deletions: 0 })
        }
        return {
          text: acceptanceText(options.text, criterion, changes.length > 0, changes.map((change) => change.path).join(', ') || '没有匹配到修复文件'),
          fileChanges: changes,
          usage: taskUsage,
        }
      }

      if (options.taskId === 'T2') {
        const outputs = []
        let passed = true
        for (const filePath of testCase.testFiles) {
          const safePath = safeRelativePath(filePath)
          options.webContents.send('chat:stream', {
            type: 'tool',
            taskId: options.taskId,
            id: `${options.taskId}-${safePath}`,
            toolName: 'read',
            status: 'done',
            inputSummary: safePath,
            resultSummary: 'deterministic fixture test read',
          })
          try {
            const result = await execFileAsync(process.execPath, ['--test', safePath], {
              cwd: options.cwd,
              timeout: 30_000,
              maxBuffer: 1_000_000,
            })
            outputs.push(`${safePath}: PASS\n${result.stdout}`)
          } catch (error) {
            passed = false
            outputs.push(`${safePath}: FAIL\n${error.stdout ?? ''}\n${error.stderr ?? ''}`)
          }
        }
        return {
          text: `${outputs.join('\n').slice(0, 8_000)}\n${makeAcceptance(criterion, passed, outputs.map((item) => item.split('\n')[0]).join('; '))}`,
          usage: taskUsage,
        }
      }

      throw new Error(`未知评测节点：${options.taskId}`)
    },
  }
  const appState = {
    getConversationState: async (id) => stateByConversation.get(id) ?? { workspacePath, messages: [], tasks: [] },
    setTasksForConversation: async (id, tasks) => {
      const state = stateByConversation.get(id) ?? { workspacePath, messages: [] }
      state.tasks = tasks
      stateByConversation.set(id, state)
    },
  }
  const service = createOrchestrationService({
    modelService: { listCatalog: async () => ({ models: [model] }) },
    appState,
    getWorkspacePath: async () => workspacePath,
    agentDataPath,
    getAppPreferences: async () => ({
      dagPlanApproval: 'never',
      maxSubtaskConcurrency: 1,
      worktreeIsolation: false,
      selfHealingLoop: false,
      subtaskUpgradeMax: 0,
      dagBudgetTokens: 2_000_000,
      dagBudgetUsd: 100,
    }),
    dshRuntime: runtime,
  })

  const started = performance.now()
  const result = await service.planAndExecute({
    text: testCase.request,
    rawText: testCase.request,
    primaryModelKey: model.key,
    conversationId,
    workspacePath,
    permissionMode: testCase.category === '只读调研' ? 'readonly' : 'ask',
    workspaceTrusted: true,
    dagPlanApprovalOverride: 'never',
    webContents: { send() {} },
  })
  const elapsedMs = performance.now() - started
  const successful = result.failedTaskIds.length === 0
    && result.tasks.length > 0
    && result.tasks.every((task) => task.status === 'done')
  if (testCase.category === '只读调研') {
    assert.equal(await hashTree(workspacePath), baseline, `${testCase.id} must not mutate the sample repository`)
  } else if (successful) {
    for (const [relativePath, content] of Object.entries(testCase.patches ?? {})) {
      if (typeof content !== 'string') continue
      assert.equal(await fs.readFile(path.join(workspacePath, safeRelativePath(relativePath)), 'utf8'), content)
    }
  }

  const runId = result.tasks[0]?.runId
  const tracePath = runId && path.join(agentDataPath, 'orchestration', conversationId, runId, 'trace.jsonl')
  const trace = tracePath ? (await fs.readFile(tracePath, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []
  const callsFromTrace = trace.filter((event) => event.type === 'model_call')
  const tokens = callsFromTrace.reduce((sum, event) => sum
    + (Number(event.usage?.inputTokens ?? event.usage?.promptTokens) || 0)
    + (Number(event.usage?.outputTokens ?? event.usage?.completionTokens) || 0), 0)
  const costUsd = callsFromTrace.reduce((sum, event) => sum + (Number(event.usage?.costUsd) || 0), 0)
  return {
    id: testCase.id,
    name: testCase.name,
    category: testCase.category,
    passed: successful,
    elapsedMs: Math.round(elapsedMs),
    tokens,
    costUsd,
    taskCalls: calls.length,
    failedTaskIds: result.failedTaskIds,
  }
}

function renderMarkdown(results) {
  const lines = [
    '# TaskWeaver DAG 固定样例仓库 mock 回归',
    '',
    `数据集版本：${dataset.version}；运行模式：确定性 orchestration adapter mock；用量与费用是脚本合成值，不代表模型质量或真实 API 价格。`,
    '',
    '| ID | 类别 | 任务 | 结果 | 耗时 (ms) | Token | 合成费用 (USD) |',
    '| --- | --- | --- | --- | ---: | ---: | ---: |',
    ...results.map((result) => `| ${result.id} | ${result.category} | ${result.name} | ${result.passed ? 'PASS' : 'FAIL'} | ${result.elapsedMs} | ${result.tokens} | ${result.costUsd.toFixed(6)} |`),
    '',
    `通过 ${results.filter((result) => result.passed).length}/${results.length}；总 Token ${results.reduce((sum, result) => sum + result.tokens, 0)}；总合成费用 $${results.reduce((sum, result) => sum + result.costUsd, 0).toFixed(6)}。`,
    '',
    '这份 mock 回归验证固定任务、调度、验收门槛和测试执行链路。单 Agent / DAG / DAG + 交叉审查的真实模型对照仍需单独运行并记录提供方、模型、重复次数与评审结果。',
  ]
  return `${lines.join('\n')}\n`
}

try {
  assert.equal(dataset.tasks.length, 10, 'P11.15 dataset should contain ten fixed tasks')
  const results = []
  for (const testCase of dataset.tasks) {
    results.push(await runCase(testCase))
    const latest = results.at(-1)
    console.log(`${latest.passed ? 'PASS' : 'FAIL'} ${latest.id} ${latest.name} ${latest.elapsedMs}ms`)
  }
  const markdown = renderMarkdown(results)
  console.log(markdown)
  const outputPath = process.argv.find((arg) => arg.startsWith('--out='))?.slice('--out='.length)
  if (outputPath) {
    const resolved = path.resolve(outputPath)
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, markdown, 'utf8')
    console.log(`结果已写入 ${resolved}`)
  }
  if (results.some((result) => !result.passed)) process.exitCode = 1
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
  if (originalEvaluationMode === undefined) delete process.env.TASKWEAVER_EVAL
  else process.env.TASKWEAVER_EVAL = originalEvaluationMode
}
