import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { decideExecutionMode, resolveExecutionMode, selectModelForTask, shouldUpgradeFailedTask, workModeExecutionOverride } from '../electron/backend/orchestration-policy.mjs'
import { executeDag, validateAndOrderTasks } from '../electron/backend/dag-scheduler.mjs'
import { getTaskProfile, getToolsForSingleAgent, getToolsForTask } from '../electron/backend/task-profile.mjs'
import { classifySubtaskFailure, runWithSubtaskRetries } from '../electron/backend/subtask-retry.mjs'
import {
  createOrchestrationService,
  assessSubtaskCompletion,
  collectPlannerPathHints,
  completeReadOnlyPlanScopes,
  createPlannerProgressRelay,
  requiresReadOnlyPlan,
  resolveOrchestrationAgentPreset,
  summarizeExecutionEvidence,
  validatePlanForRequest,
} from '../electron/backend/orchestration-service.mjs'

{
  let now = 1_000
  const events = []
  const relay = createPlannerProgressRelay({
    isDestroyed: () => false,
    send: (channel, event) => events.push({ channel, ...event }),
  }, 'planner-progress-test', { now: () => now, heartbeatMs: 60_000 })
  assert.match(events.at(-1).text, /正在分析任务并生成 DAG/)
  relay.webContents.send('chat:stream', { type: 'thinking_delta', delta: 'PRIVATE_REASONING' })
  assert.match(events.at(-1).text, /Planner 正在分析任务关系/)
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE_REASONING/, 'planner relay must never expose private reasoning text')
  relay.webContents.send('chat:stream', { type: 'delta', delta: '{"tasks":[]}' })
  assert.match(events.at(-1).text, /Planner 正在整理任务计划/)
  assert.doesNotMatch(JSON.stringify(events), /tasks/)
  now += 12_000
  relay.update('计划未通过校验，正在进行一次有限修正')
  assert.match(events.at(-1).text, /已等待 12 秒/)
  relay.dispose()
}

assert.equal(requiresReadOnlyPlan('只读分析当前代码，不得修改文件。'), true)
assert.deepEqual(validatePlanForRequest([
  { id: 'T1', taskType: 'research', scopePaths: ['src/App.tsx'] },
  { id: 'T2', taskType: 'review', scopePaths: ['electron/backend'] },
], '只读分析当前代码，不得修改文件。').map(({ taskType, scopePaths }) => [taskType, scopePaths]), [
  ['research', ['src/App.tsx']],
  ['review', ['electron/backend']],
])
assert.throws(() => validatePlanForRequest([
  { id: 'T1', taskType: 'research' },
], '只读分析当前代码，不得修改文件。'), /缺少 scopePaths 数组/)
assert.throws(() => validatePlanForRequest([
  { id: 'T1', taskType: 'research', scopePaths: ['../outside'] },
], '只读分析当前代码，不得修改文件。'), /不能包含绝对路径、通配符或 \.\./)
assert.throws(() => validatePlanForRequest([
  { id: 'T1', taskType: 'research', scopePaths: ['.'] },
], '只读分析当前代码，不得修改文件。'), /不能把整个工作区作为单个搜索范围/)
assert.throws(() => validatePlanForRequest([
  { id: 'T3', taskType: 'implementation' },
], '只读分析当前代码，不得修改文件。'), /只读请求包含非只读子任务类型/)
assert.deepEqual(validatePlanForRequest([
  { id: 'T1', taskType: 'implementation' },
], '实现一个新功能').map(({ taskType }) => taskType), ['implementation'])
const explicitParallelResearchRequest = '只读分析当前毕设代码，要求两项独立研究并行完成后交叉汇总。不得修改文件。'
assert.equal(validatePlanForRequest([
  { id: 'T1', taskType: 'research', scopePaths: ['src'], dependsOn: [] },
  { id: 'T2', taskType: 'research', scopePaths: ['electron/backend'], dependsOn: [] },
], explicitParallelResearchRequest).length, 2, '明确指定两项独立研究时应接受恰好两个并行研究节点')
assert.throws(() => validatePlanForRequest([
  { id: 'T1', taskType: 'research', scopePaths: ['src'], dependsOn: [] },
  { id: 'T2', taskType: 'research', scopePaths: ['electron/backend'], dependsOn: [] },
  { id: 'T3', taskType: 'review', scopePaths: ['docs'], dependsOn: ['T1', 'T2'] },
], explicitParallelResearchRequest), /并行研究任务数量不匹配/, '不得把编排器最终汇总扩成第三个 Agent')
assert.throws(() => validatePlanForRequest([
  { id: 'T1', taskType: 'research', scopePaths: ['src'], dependsOn: [] },
  { id: 'T2', taskType: 'research', scopePaths: ['electron/backend'], dependsOn: ['T1'] },
], explicitParallelResearchRequest), /并行研究任务数量不匹配/, '明确要求独立并行时不能串行依赖')

assert.equal(summarizeExecutionEvidence({ source: 'z-host-tool-events', observedToolCalls: [] }).label, 'Host 未观测到工具调用')
assert.deepEqual(assessSubtaskCompletion({ taskType: 'research' }, {
  text: '候选路径是 src/app。',
  executionEvidence: { observedToolCalls: [{ toolName: 'grep', status: 'done' }] },
}), {
  complete: false,
  reason: 'Host 未记录到成功的文件读取；搜索结果不足以证明源码或审查依据已被阅读核实。',
})
assert.deepEqual(assessSubtaskCompletion({ taskType: 'review' }, {
  text: '候选路径是 src/app。',
  executionEvidence: { observedToolCalls: [{ toolName: 'grep', status: 'done' }] },
}), {
  complete: false,
  reason: 'Host 未记录到成功的文件读取；搜索结果不足以证明源码或审查依据已被阅读核实。',
})
assert.deepEqual(assessSubtaskCompletion({ taskType: 'research' }, {
  text: '已读取并核实。',
  executionEvidence: { observedToolCalls: [{ toolName: 'read', status: 'done' }] },
}), { complete: true, reason: '' })
assert.deepEqual(assessSubtaskCompletion({ taskType: 'research' }, {
  text: '',
  executionEvidence: { observedToolCalls: [{ toolName: 'read', status: 'done' }] },
}), {
  complete: false,
  reason: 'Agent 未返回最终文本；不能仅凭工具调用将子任务标记为完成。',
}, 'successful reads without a final answer must not mark a subtask complete')
const codeModeReadEvidence = {
  source: 'z-host-tool-events',
  observedToolCalls: [{ toolName: 'read', status: 'done', inputSummary: 'README.md' }],
}
assert.deepEqual(assessSubtaskCompletion({ taskType: 'research' }, { text: '已完成。', executionEvidence: codeModeReadEvidence }), {
  complete: true,
  reason: '',
}, 'Code Mode nested read events must satisfy the read-only completion evidence gate')
assert.equal(summarizeExecutionEvidence(codeModeReadEvidence).successfulReadCount, 1)
const scopeDeniedEvidence = {
  source: 'z-host-tool-events',
  observedToolCalls: [{ toolName: 'read', status: 'done', inputSummary: 'register-ipc.mjs' }],
  omittedToolCalls: 5,
  scopeDeniedToolCalls: 2,
}
assert.deepEqual(assessSubtaskCompletion({ taskType: 'research' }, {
  text: '请求链路尚有一段未核实。',
  executionEvidence: scopeDeniedEvidence,
}), {
  complete: false,
  reason: 'Host 拒绝了 2 次超出只读子任务范围的工具调用；当前路径计划可能缺少必要证据，需补足范围后再标记完成。',
}, 'a read-only subtask with Host-enforced scope denials must not be reported as complete')
assert.deepEqual(assessSubtaskCompletion({ taskType: 'research' }, {
  text: '已读取分配文件并闭合调用链，结论完整。',
  executionEvidence: scopeDeniedEvidence,
}), { complete: true, reason: '' },
'a denied exploratory call alone must not invalidate a final answer that reports complete evidence')
for (const text of [
  '未能从源码读取核实（超出允许文件范围，按停止条件未扩展）：electron/preload.cjs。',
  '尚未从源码核实 dsh-chat-service.mjs，因此调用链仍有证据缺口。',
]) {
  assert.equal(assessSubtaskCompletion({ taskType: 'research' }, {
    text,
    executionEvidence: scopeDeniedEvidence,
  }).complete, false, 'observed MiMo evidence-gap language must keep a scoped read-only task in review')
}
assert.equal(assessSubtaskCompletion({ taskType: 'research' }, {
  text: '已闭合任务要求的启动链路。不确定项：相邻 UI 文件未核实且有证据缺口，运行时假设也未验证。',
  executionEvidence: scopeDeniedEvidence,
}).complete, true, 'non-blocking uncertainty outside the stated acceptance scope must not turn a fully evidenced task into review')
assert.equal(summarizeExecutionEvidence(scopeDeniedEvidence).scopeDeniedToolCalls, 2)
assert.match(summarizeExecutionEvidence(scopeDeniedEvidence).label, /越界拒绝 2/)
assert.deepEqual(assessSubtaskCompletion({ taskType: 'implementation' }, { text: '已完成。' }), { complete: true, reason: '' })
assert.equal(summarizeExecutionEvidence({
  source: 'z-host-tool-events',
  observedToolCalls: [{ toolName: 'grep', status: 'done' }],
}).label, 'Host 工具记录：搜索 1', 'grep 不应被误报为已读取文件正文')

const plannerHints = await collectPlannerPathHints(process.cwd(), '检查 agent session 和 dsh chat service', { maxVisited: 1200, limit: 90 })
assert.ok(plannerHints.paths.includes('package.json'), '路径索引应包含根目录清单')
assert.ok(plannerHints.paths.includes('electron/backend/dsh-chat-service.mjs'), '路径索引应定位相关后端源码')
assert.ok(plannerHints.paths.length <= 90, '路径索引必须有严格输出上限')
assert.ok(!plannerHints.paths.some((candidate) => candidate.startsWith('node_modules/')), '路径索引不得扫描依赖目录')
assert.ok(!plannerHints.paths.some((candidate) => candidate.startsWith('vendor/')), '路径索引不得让 vendored 源码挤占产品源码候选')
const callChainHints = await collectPlannerPathHints(process.cwd(), '只读检查从前端到 Host 的 Agent 请求调用链和 IPC', { maxVisited: 1200, limit: 90 })
for (const candidate of [
  'src/features/app/useAppBackend.ts',
  'electron/preload.cjs',
  'electron/backend/register-ipc.mjs',
  'electron/backend/dsh-chat-service.mjs',
  'electron/agent/z-host/z-api-client.mjs',
  'electron/agent/z-host/spawn-host.mjs',
]) {
  assert.ok(callChainHints.paths.includes(candidate), `端到端调用链索引应暴露关键桥接文件：${candidate}`)
}
assert.ok(!callChainHints.paths.some((candidate) => candidate.startsWith('vendor/')), '调用链索引不得混入 vendored 路径')
const closedPlanScopes = completeReadOnlyPlanScopes([
  { id: 'T1', title: '应用启动入口链路调研', taskType: 'research', description: '梳理 Electron 从启动到 renderer 就绪；停止条件：链路闭合后立即停止，不深入 Agent 业务逻辑。', scopePaths: ['electron/main.cjs', 'electron/preload.cjs', 'src/main.tsx', 'src/App.tsx'] },
  { id: 'T2', title: 'Agent 请求链路调研', taskType: 'research', description: '梳理一次 Agent 请求从前端发起到后端执行的调用链；停止条件：调用闭合后立即停止，不检查启动窗口细节。', scopePaths: ['electron/preload.cjs', 'electron/backend/register-ipc.mjs', 'electron/backend/dsh-chat-service.mjs'] },
], explicitParallelResearchRequest.replace('只读分析当前毕设代码，要求两项独立研究并行完成后交叉汇总。不得修改文件。', '只读分析应用启动入口和 Agent 请求链路，要求两项独立研究并行完成后交叉汇总。不得修改文件。'), [
  'package.json', 'index.html', 'src/features/app/useAppBackend.ts', 'electron/preload.cjs',
  'electron/backend/register-ipc.mjs', 'electron/backend/dsh-chat-service.mjs',
  'electron/backend/orchestration-service.mjs', 'electron/agent/z-host/index.mjs',
  'electron/agent/z-host/z-api-client.mjs', 'electron/agent/z-host/spawn-host.mjs',
])
assert.ok(closedPlanScopes[0].scopePaths.includes('package.json') && closedPlanScopes[0].scopePaths.includes('index.html'),
  'startup chain scope must include the app manifest and HTML entry when the request explicitly asks for startup order')
assert.ok(!closedPlanScopes[0].scopePaths.includes('electron/backend/dsh-chat-service.mjs')
  && !closedPlanScopes[0].scopePaths.includes('electron/agent/z-host/index.mjs'),
'a startup task that explicitly excludes Agent business logic must not inherit request-chain files')
assert.ok(closedPlanScopes[1].scopePaths.includes('src/features/app/useAppBackend.ts')
  && closedPlanScopes[1].scopePaths.includes('electron/agent/z-host/spawn-host.mjs'),
'an Agent request-chain task must include the renderer send logic and exact Host implementation files')
assert.ok(!closedPlanScopes[1].scopePaths.includes('package.json') && !closedPlanScopes[1].scopePaths.includes('index.html'),
  'a request-chain task that explicitly excludes startup details must not inherit startup files')
assert.ok(closedPlanScopes[1].description.includes('electron/agent/z-host/spawn-host.mjs'), 'added evidence paths must be visible in the assigned task description')

const boundedPlanInput = [
  { id: 'T1', title: '梳理应用启动入口', taskType: 'research', description: '只读研究且范围仅限 package.json、electron/main.cjs、src/main.tsx。不要做目录发现或读取其他文件；完成后立即汇报。', scopePaths: ['package.json', 'electron/main.cjs', 'src/main.tsx'] },
  { id: 'T2', title: '梳理 Agent 请求链路', taskType: 'research', description: '范围仅限 src/features/app/useAppBackend.ts、electron/preload.cjs、electron/backend/register-ipc.mjs、electron/backend/dsh-chat-service.mjs。确认渲染端 chat:send 到 api.sessions.prompt 的调用关系；不要 glob，不要继续检查 Host、权限、审批、响应投影等旁支，两端调用关系已证实后立即汇报。', scopePaths: ['src/features/app/useAppBackend.ts', 'electron/preload.cjs', 'electron/backend/register-ipc.mjs', 'electron/backend/dsh-chat-service.mjs'] },
]
const boundedPlan = completeReadOnlyPlanScopes(boundedPlanInput,
  '只读分析应用启动入口和 Agent 请求链路，要求两项独立研究并行完成后交叉汇总。不得修改文件。', [
    'package.json', 'index.html', 'src/features/app/useAppBackend.ts', 'electron/preload.cjs',
    'electron/backend/register-ipc.mjs', 'electron/backend/dsh-chat-service.mjs',
    'electron/backend/orchestration-service.mjs', 'electron/agent/z-host/index.mjs',
    'electron/agent/z-host/z-api-client.mjs', 'electron/agent/z-host/spawn-host.mjs',
  ])
assert.deepEqual(boundedPlan.map(({ scopePaths }) => scopePaths), boundedPlanInput.map(({ scopePaths }) => scopePaths),
  'explicitly bounded read-only tasks must not have paths appended, even when the request suggests broader chain coverage')
assert.deepEqual(boundedPlan.map(({ description }) => description), boundedPlanInput.map(({ description }) => description),
  'explicit scope and stop instructions must pass through unchanged')

assert.equal(decideExecutionMode('你好').mode, 'single-agent')
assert.equal(decideExecutionMode('读一下整个项目的代码，梳理目录和主要模块').mode, 'single-agent', '只读仓库走读不应因为涉及多个领域而自动编排')
assert.equal(decideExecutionMode('请简要概览当前毕设项目的仓库结构：只查看根目录条目，然后阅读 package.json、electron/main.cjs、src/main.tsx，概括主要目录/入口及它们如何连接。只读，不要修改文件、构建或测试。').mode, 'single-agent', '验收 B 的仓库结构概览必须留在单 Agent')
assert.equal(decideExecutionMode('看看当前代码有哪些前端、后端和测试问题').mode, 'single-agent', '跨领域只读审查仍应保持单 Agent')
assert.equal(decideExecutionMode('修复一个按钮样式').mode, 'single-agent')
assert.equal(decideExecutionMode('请使用多智能体处理这个任务').mode, 'multi-agent')
assert.equal(decideExecutionMode('请使用 multi-agent skill').mode, 'multi-agent')
assert.equal(decideExecutionMode('不要启用多智能体，即使要实现完整前后端平台和安全、测试、部署').mode, 'single-agent')
assert.equal(decideExecutionMode('实现一个完整平台，同时涵盖前端、后端 API、测试、安全和部署').mode, 'single-agent',
  '任务复杂度本身不应在用户未选择多 Agent 时启动 DAG')
assert.equal(decideExecutionMode('实现一个前端页面和后端接口').mode, 'single-agent')
assert.equal(decideExecutionMode('为完整平台实现前端页面与后端 API').mode, 'single-agent',
  '多领域请求未显式选择多 Agent 时也应默认单 Agent')
assert.equal(workModeExecutionOverride('goal'), 'multi-agent', 'Goal Composer 模式代表用户明确选择多 Agent')
assert.equal(workModeExecutionOverride('plan'), 'single-agent')
assert.equal(workModeExecutionOverride('code'), null, '常规 Composer 模式不覆盖单 Agent 默认')
const readOnlyDecision = decideExecutionMode('读一下项目结构并概括主要入口')
assert.equal(resolveExecutionMode(readOnlyDecision, workModeExecutionOverride('code')).mode, 'single-agent',
  '只读任务在普通 Composer 模式下默认保持单 Agent')
assert.equal(resolveExecutionMode(readOnlyDecision, workModeExecutionOverride('goal')).mode, 'multi-agent',
  '用户显式切换到目标/多智能体模式后，即使只读任务也按所选 DAG 模式执行')
const complexCodeDecision = decideExecutionMode('实现一个完整平台，同时涵盖前端、后端 API、测试、安全和部署')
assert.equal(resolveExecutionMode(complexCodeDecision, workModeExecutionOverride('code')).mode, 'single-agent')
assert.equal(resolveExecutionMode(complexCodeDecision, workModeExecutionOverride('goal')).mode, 'multi-agent')

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
const optInOnlyCatalog = { models: [
  { key: 'opted-out-primary', name: 'Primary', available: true, profile: { tier: 'strong', enabledForAllocation: false } },
  { key: 'legacy-unconfigured', name: 'Legacy', available: true, profile: { tier: 'cheap' } },
] }
assert.equal(
  selectModelForTask('research', optInOnlyCatalog, 'opted-out-primary').model,
  null,
  'models must be explicitly opted in; do not silently fall back to a costly or unconfigured model',
)
const unregisteredRouteCatalog = { models: [
  { key: 'catalog-only', name: 'Catalog only', available: true, routeRegistered: false, profile: { tier: 'cheap', enabledForAllocation: true } },
] }
assert.equal(
  selectModelForTask('research', unregisteredRouteCatalog, 'catalog-only').model,
  null,
  'catalog availability must not make a model routable when the host route is unregistered',
)

assert.equal(shouldUpgradeFailedTask('test'), true)
assert.equal(shouldUpgradeFailedTask('research'), false)
const upgradePick = selectModelForTask('review', catalog, 'balanced', { excludeModelKeys: ['strong'] })
assert.notEqual(upgradePick.model.key, 'strong')

const retriedModels = []
const retryExclusions = []
const retryEvidence = []
const retryOutcome = await runWithSubtaskRetries({
  task: { id: 'T-retry', taskType: 'test', title: '验证失败升级' },
  initialModelKey: 'model-a',
  maxRetries: 2,
  run: async (modelKey, evidenceBundle) => {
    retriedModels.push(modelKey)
    if (modelKey !== 'model-a') {
      assert.equal(evidenceBundle.failure_class, 'execution', 'upgrade attempts must receive L4 failure evidence')
      retryEvidence.push(evidenceBundle)
    }
    if (modelKey !== 'model-c') throw new Error(`${modelKey} failed`)
    return { text: 'done' }
  },
  chooseModel: async ({ excludeModelKeys }) => {
    retryExclusions.push(excludeModelKeys)
    const next = ['model-b', 'model-c'].find((key) => !excludeModelKeys.includes(key))
    return next ? { modelKey: next, displayName: next } : null
  },
  onRetry: async ({ evidenceBundle }) => assert.ok(evidenceBundle.attempted_actions.length > 0),
})
assert.deepEqual(retriedModels, ['model-a', 'model-b', 'model-c'])
assert.equal(retryOutcome.modelKey, 'model-c')
assert.equal(retryOutcome.attempts, 2)
assert.deepEqual(retryExclusions, [['model-a'], ['model-a', 'model-b']])
assert.equal(retryOutcome.evidenceBundle.task_id, 'T-retry')
assert.match(retryOutcome.evidenceBundle.error_summary, /model-b failed/)
assert.deepEqual(retryOutcome.evidenceBundle.attempted_actions.map((item) => item.split(':')[0]), ['model-a', 'model-b'])
assert.equal(retryEvidence.length, 2)

assert.equal(classifySubtaskFailure(Object.assign(new Error('permission denied'), { code: 'EACCES' })).kind, 'environment')
assert.deepEqual(classifySubtaskFailure(Object.assign(new Error('tool policy stopped the turn'), { code: 'AGENT_BLOCKED' })), {
  kind: 'policy-blocked',
  retryable: false,
  reason: '工具或安全策略已阻止本轮；更换模型重试可能重复触发相同阻止，不自动重试',
})
assert.equal(classifySubtaskFailure(Object.assign(new Error('no final response'), { code: 'AGENT_EMPTY_RESPONSE' })).retryable, false,
  'empty completed turns must not trigger a potentially costly model upgrade')
assert.equal(classifySubtaskFailure(Object.assign(new Error('rate limit'), { status: 429 })).retryable, true)
assert.equal(classifySubtaskFailure(Object.assign(new Error('invalid api key'), { status: 401 })).kind, 'configuration')
assert.equal(classifySubtaskFailure(new Error('request aborted'), { signal: { aborted: true } }).retryable, false)

let environmentRetryChoices = 0
await assert.rejects(runWithSubtaskRetries({
  task: { id: 'T-env', taskType: 'implementation' },
  initialModelKey: 'model-a',
  maxRetries: 2,
  run: async () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }) },
  chooseModel: async () => { environmentRetryChoices += 1; return { modelKey: 'model-b' } },
}), (error) => error.evidenceBundle?.failure_class === 'environment')
assert.equal(environmentRetryChoices, 0, 'environment errors must not trigger model upgrades')

let blockedRetryAttempts = 0
let blockedRetryChoices = 0
await assert.rejects(runWithSubtaskRetries({
  task: { id: 'T-blocked', taskType: 'research' },
  initialModelKey: 'model-a',
  maxRetries: 3,
  run: async () => {
    blockedRetryAttempts += 1
    throw Object.assign(new Error('search cycle stopped'), { code: 'AGENT_BLOCKED' })
  },
  chooseModel: async () => { blockedRetryChoices += 1; return { modelKey: 'model-b' } },
}), (error) => error.code === 'AGENT_BLOCKED' && error.evidenceBundle?.failure_class === 'policy-blocked')
assert.equal(blockedRetryAttempts, 1, 'a policy loop-breaker must not cause a second billable model attempt')
assert.equal(blockedRetryChoices, 0, 'policy-blocked turns must not trigger automatic model upgrades')

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
        if (opts.webContents?.send && opts.text.includes('Planner Agent')) {
          opts.webContents.send('chat:stream', { type: 'thinking_delta', delta: 'PRIVATE_REASONING' })
          opts.webContents.send('chat:stream', { type: 'delta', delta: '__UNSAFE_PLANNER_JSON__' })
        }
        if (opts.text.includes('上次输出无法解析')) {
          return {
            text: JSON.stringify({
              tasks: [
                { id: 'T1', title: '架构分析', taskType: 'research', role: 'Architect', description: '探索分析代码架构', scopePaths: ['README.md'], dependsOn: [] },
                { id: 'T2', title: '功能实现', taskType: 'implementation', role: 'Developer', description: '编写特性实现', dependsOn: ['T1'] },
              ],
            }),
            usage,
          }
        }
        if (opts.text.includes('Planner Agent') || opts.text.includes('子任务执行结果')) {
          const planJson = JSON.stringify({
            tasks: [
              { id: 'T1', title: '架构分析', taskType: 'research', role: 'Architect', description: '探索分析代码架构', scopePaths: ['README.md'], dependsOn: [] },
              { id: 'T2', title: '功能实现', taskType: 'implementation', role: 'Developer', description: '编写特性实现', dependsOn: ['T1'] },
            ],
          })
          return opts.text.includes('子任务执行结果')
            ? (() => {
              assert.match(opts.text, /runtimeObservedActions/, '汇总必须收到 Host 实际观测的工具记录')
              assert.match(opts.text, /evidenceAssessment/, '汇总必须收到后端按 Host 事件计算的证据摘要')
              assert.match(opts.text, /最终回复保持精炼.*800–1500 个中文字符/, '汇总应保留证据同时避免复述长篇子任务结果')
              assert.match(opts.text, /README\.md/, '汇总的工具记录应包含实际工具目标')
              return { text: '汇总：子任务已全部完成。', usage }
            })()
            : { text: planJson, usage }
        }
      }
      const taskLabel = opts.taskId || 'unknown'
      opts.webContents.send('chat:stream', {
        type: 'tool', id: `${taskLabel}-read`, taskId: taskLabel,
        toolName: 'read', status: 'running', inputSummary: 'README.md',
      })
      opts.webContents.send('chat:stream', {
        type: 'tool', id: `${taskLabel}-read`, taskId: taskLabel,
        toolName: 'read', status: 'done', inputSummary: 'README.md', resultSummary: 'read ok', durationMs: 12,
      })
      return {
        text: `在目录 ${opts.cwd} 成功完成 ${taskLabel}（preset=${opts.agentPreset}，model=${opts.modelKey}）`,
        ...(taskLabel === 'T2' ? { fileChanges: [{ path: 'src/changed.ts', addedLines: 3, deletedLines: 1 }] } : {}),
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

  const selectedSkill = { name: 'mock-review', baseDir: '/skills/mock-review', instructions: 'Skill guidance marker.' }
  const result = await orchestration.planAndExecute({
    text: '<taskweaver_skill_instructions>Skill guidance marker.</taskweaver_skill_instructions>\n\n帮我重构项目并实现新功能',
    primaryModelKey: 'mock/strong',
    conversationId,
    webContents: mockWebContents,
    skill: selectedSkill,
    skillAlreadyApplied: true,
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
  assert.match(plannerTurn.text, /工作区路径索引：仅路径名，不含文件正文/)
  assert.match(plannerTurn.text, /不要额外创建只负责.*汇总.*review 子任务/)
  assert.match(plannerTurn.text, /用户明确给出.*DAG 必须恰好包含 N 个互相独立的 research 节点/)
  assert.match(plannerTurn.text, /端到端链路\/跨文件调用关系问题，scopePaths 必须覆盖闭合结论所需的每个环节/,
    'the planner must scope all necessary files for a requested cross-file chain')
  assert.match(plannerTurn.text, /独立任务表示彼此无依赖，不要求文件范围完全不重叠/,
    'independent DAG tasks may share a necessary bridge file to close a call chain')
  assert.match(plannerTurn.text, /README\.md/)
  assert.equal(plannerTurn.text.split('Skill guidance marker.').length - 1, 1,
    'a Skill already included by the user-facing prompt pipeline is not injected a second time into planning')
  assert.match(plannerTurn.sessionKey, /^tw-orchestration-/)
  assert.equal(plannerTurn.conversationId, conversationId)
  assert.equal(plannerTurn.progressOnly, true, 'the planner should opt into safe phase-only progress forwarding')

  const subtaskKeys = new Set(dshTurns.filter((turn) => turn.taskId).map((turn) => turn.sessionKey))
  assert.equal(subtaskKeys.size, 2, '每个子任务应使用独立 sessionKey')
  assert.ok(!subtaskKeys.has(plannerTurn.sessionKey), '子任务 sessionKey 不应与 planner 相同')

  const t1Turn = dshTurns.find((turn) => turn.taskId === 'T1')
  const t2Turn = dshTurns.find((turn) => turn.taskId === 'T2')
  assert.equal(t1Turn.agentPreset, 'taskweaver-readonly')
  assert.equal(t1Turn.progressOnly, false, 'ordinary child agents must not use the planner progress channel')
  assert.match(t1Turn.text, /<taskweaver-readonly-scope-v1>\{"paths":\["README\.md"\]\}<\/taskweaver-readonly-scope-v1>/,
    '每个只读子 Agent 的路径范围必须以机器可执行 marker 传入 Host')
  assert.match(t1Turn.text, /scopePaths 是执行层强制白名单.*不要对父目录或工作区执行 glob\/ls/,
    '只读子 Agent 必须知道精确文件已授权，避免宽泛目录搜索与无关范围缺口')
  assert.equal(t2Turn.agentPreset, 'taskweaver-code')
  assert.match(t2Turn.text, /<taskweaver_skill_instructions>/,
    'selected Skill guidance remains available to eligible implementation subtasks')

  const progressMsgs = streamEvents.filter((e) => e.payload.type === 'progress')
  const taskMsgs = streamEvents.filter((e) => e.payload.type === 'tasks')
  assert.ok(progressMsgs.length > 0, '应推送进度更新')
  assert.ok(progressMsgs.some((e) => /Planner 正在分析任务关系/.test(e.payload.text)), 'Planner reasoning chunks should become safe stage progress')
  assert.ok(progressMsgs.some((e) => /Planner 正在整理任务计划/.test(e.payload.text)), 'Planner text chunks should become safe stage progress')
  assert.doesNotMatch(JSON.stringify(streamEvents), /PRIVATE_REASONING|__UNSAFE_PLANNER_JSON__/, 'planner stream relay must not expose private reasoning or unvalidated plan JSON')
  assert.ok(taskMsgs.length > 0, '应推送 DAG 任务列表广播')

  assert.equal(stateTasks[0].status, 'done')
  assert.equal(stateTasks[1].status, 'done')
  assert.match(stateTasks[0].messages.at(-1).text, /成功完成/)
  assert.match(stateTasks[1].messages.at(-1).text, /成功完成/)
  assert.deepEqual(stateTasks[0].messages.at(-1).executionEvidence, {
    source: 'z-host-tool-events',
    observedToolCalls: [{ toolName: 'read', status: 'done', inputSummary: 'README.md', resultSummary: 'read ok', durationMs: 12 }],
    omittedToolCalls: 0,
    scopeDeniedToolCalls: 0,
  }, '子 Agent 消息应携带 Host 实际观测到的工具证据')
  assert.equal(stateTasks[0].executionEvidenceSummary.label, 'Host 工具记录：读取 1', '任务状态应展示 Host 实际观测到的文件读取次数')
  assert.equal(stateTasks[0].messages.at(-1).executionEvidenceSummary.successfulReadCount, 1)
  assert.deepEqual(stateTasks[1].messages.at(-1).fileChanges, [{ path: 'src/changed.ts', addedLines: 3, deletedLines: 1 }],
    'DAG child file summaries should remain on the child task result')
  assert.deepEqual(result.assistant.fileChanges, [{ path: 'src/changed.ts', addedLines: 3, deletedLines: 1 }],
    'DAG file summaries should reach the synthesized assistant message')
  assert.match(result.assistant.text, /汇总/)

  const correctionTurns = []
  const correctionRuntime = {
    async runAgentTurn(opts) {
      correctionTurns.push(opts)
      const usage = { inputTokens: 1, outputTokens: 1, costUsd: 0, elapsedMs: 1 }
      if (opts.agentPreset === 'taskweaver-planner') {
        if (opts.text.includes('子任务执行结果')) return { text: '两个研究结论已汇总。', usage }
        if (opts.text.includes('请求约束校验拒绝')) {
          return { text: JSON.stringify({ tasks: [
            { id: 'T1', title: '启动入口', taskType: 'research', description: '读取入口源码', scopePaths: ['electron/main.cjs'], dependsOn: [] },
            { id: 'T2', title: 'Agent 请求链路', taskType: 'research', description: '读取 Agent 源码', scopePaths: ['electron/backend'], dependsOn: [] },
          ] }), usage }
        }
        return { text: JSON.stringify({ tasks: [
          { id: 'T1', title: '启动入口', taskType: 'research', description: '读取入口源码', scopePaths: ['electron/main.cjs'], dependsOn: [] },
          { id: 'T2', title: 'Agent 请求链路', taskType: 'research', description: '读取 Agent 源码', scopePaths: ['electron/backend'], dependsOn: [] },
          { id: 'T3', title: '交叉汇总', taskType: 'review', description: '汇总 T1 和 T2', scopePaths: ['electron/backend'], dependsOn: ['T1', 'T2'] },
        ] }), usage }
      }
      opts.webContents.send('chat:stream', {
        type: 'tool', id: `${opts.taskId}-read`, taskId: opts.taskId,
        toolName: 'read', status: 'done', inputSummary: 'README.md', resultSummary: 'read ok', durationMs: 1,
      })
      return { text: `${opts.taskId} verified`, usage }
    },
  }
  const correctionService = createOrchestrationService({
    modelService: mockModelService,
    appState: mockAppState,
    getWorkspacePath: () => repo,
    getWorkspaceTrusted: () => true,
    agentDataPath: agentData,
    userDataPath: userData,
    getAppPreferences: async () => ({ worktreeIsolation: false }),
    dshRuntime: correctionRuntime,
  })
  const correctedPlan = await correctionService.planAndExecute({
    text: explicitParallelResearchRequest,
    primaryModelKey: 'mock/strong',
    conversationId: randomUUID(),
    webContents: mockWebContents,
  })
  assert.equal(correctedPlan.tasks.length, 2, '被拒绝的额外汇总 Agent 不得进入实际 DAG')
  assert.equal(correctionTurns.filter((turn) => turn.taskId).length, 2, '必须先校验并重写计划，再启动两个只读子 Agent')
  const correctedPlannerTurns = correctionTurns.filter((turn) => turn.agentPreset === 'taskweaver-planner')
  assert.equal(correctedPlannerTurns.length, 3, '应执行初次规划、一次约束修正和最终汇总')
  assert.match(correctedPlannerTurns[1].text, /请求约束校验拒绝/)
  assert.ok(correctedPlan.tasks.every((task) => task.taskType === 'research' && task.status === 'done'))

  const blockedTurns = []
  const blockedRuntime = {
    async runAgentTurn(opts) {
      blockedTurns.push(opts)
      const usage = { inputTokens: 3, outputTokens: 0, costUsd: 0, elapsedMs: 10 }
      if (opts.agentPreset === 'taskweaver-planner') {
        if (opts.text.includes('子任务执行结果')) {
          assert.match(opts.text, /未完成：/)
          assert.match(opts.text, /任务未生成结果/, 'dependent tasks must not pass their plan description off as an Agent result')
          return { text: '明确汇报一个受阻子任务和一个依赖阻塞子任务。', usage }
        }
        return { text: JSON.stringify({ tasks: [
          { id: 'T1', title: '读取入口', taskType: 'research', description: '读取入口源码并说明结论', scopePaths: ['electron/main.cjs'], dependsOn: [] },
          { id: 'T2', title: '依赖复核', taskType: 'review', description: '依赖 T1 的发现做只读复核', scopePaths: ['electron/backend'], dependsOn: ['T1'] },
        ] }), usage }
      }
      assert.equal(opts.taskId, 'T1', 'T2 must not run after its prerequisite is blocked')
      opts.webContents.send('chat:stream', {
        type: 'tool', id: 'blocked-read', taskId: 'T1', toolName: 'read',
        status: 'running', inputSummary: 'electron/main.cjs',
      })
      opts.webContents.send('chat:stream', {
        type: 'tool', id: 'blocked-read', taskId: 'T1', toolName: 'read',
        status: 'done', inputSummary: 'electron/main.cjs', resultSummary: 'read ok', durationMs: 8,
      })
      throw Object.assign(new Error('重複文件搜索已被熔断'), { code: 'AGENT_BLOCKED' })
    },
  }
  const blockedService = createOrchestrationService({
    modelService: mockModelService,
    appState: mockAppState,
    getWorkspacePath: () => repo,
    getWorkspaceTrusted: () => true,
    agentDataPath: agentData,
    userDataPath: userData,
    getAppPreferences: async () => ({ worktreeIsolation: false, subtaskUpgradeMax: 2 }),
    dshRuntime: blockedRuntime,
  })
  const blockedPlan = await blockedService.planAndExecute({
    text: '只读分析代码，不得修改文件。',
    primaryModelKey: 'mock/strong',
    conversationId: randomUUID(),
    webContents: mockWebContents,
  })
  const blockedT1 = blockedPlan.tasks.find((task) => task.id === 'T1')
  const blockedT2 = blockedPlan.tasks.find((task) => task.id === 'T2')
  assert.deepEqual(blockedPlan.failedTaskIds.sort(), ['T1', 'T2'])
  assert.equal(blockedTurns.filter((turn) => turn.taskId === 'T1').length, 1,
    'a loop-breaker rejection must not be retried on another model')
  assert.equal(blockedTurns.some((turn) => turn.taskId === 'T2'), false,
    'dependent tasks must not execute when prerequisite work was blocked')
  assert.equal(blockedT1.status, 'review')
  assert.match(blockedT1.messages.at(-1).text, /未完成：/)
  assert.deepEqual(blockedT1.messages.at(-1).executionEvidence, {
    source: 'z-host-tool-events',
    observedToolCalls: [{
      toolName: 'read', status: 'done', inputSummary: 'electron/main.cjs',
      resultSummary: 'read ok', durationMs: 8,
    }],
    omittedToolCalls: 0,
    scopeDeniedToolCalls: 0,
  }, 'tool evidence must survive a terminal blocked turn')
  assert.equal(blockedT2.status, 'review')
  assert.equal(blockedT2.messages.at(-1).author, 'orchestrator', 'a dependent task without an Agent result must retain no fabricated result')

  const scopeDeniedRuntime = {
    async runAgentTurn(opts) {
      const usage = { inputTokens: 2, outputTokens: 2, costUsd: 0, elapsedMs: 1 }
      if (opts.agentPreset === 'taskweaver-planner') {
        if (opts.text.includes('子任务执行结果')) return { text: '该任务因范围不足待复核。', usage }
        return { text: JSON.stringify({ tasks: [
          { id: 'T1', title: '只读分析', taskType: 'research', description: '读取已分配文件并核实结论', scopePaths: ['electron/main.cjs'], dependsOn: [] },
          { id: 'T2', title: '依赖复核', taskType: 'review', description: '依赖 T1 的发现做只读复核', scopePaths: ['electron/backend'], dependsOn: ['T1'] },
        ] }), usage }
      }
      opts.webContents.send('chat:stream', {
        type: 'tool', id: 'scope-denied-read', taskId: 'T1', toolName: 'read',
        status: 'running', inputSummary: 'electron/main.cjs',
      })
      opts.webContents.send('chat:stream', {
        type: 'tool', id: 'scope-denied-read', taskId: 'T1', toolName: 'read',
        status: 'error', inputSummary: 'electron/main.cjs',
        resultSummary: 'TaskWeaver read-only scope denied read at electron/other.mjs before execution.',
        durationMs: 1,
      })
      return { text: '部分链路尚未核实。', usage }
    },
  }
  const scopeDeniedService = createOrchestrationService({
    modelService: mockModelService,
    appState: mockAppState,
    getWorkspacePath: () => repo,
    getWorkspaceTrusted: () => true,
    agentDataPath: agentData,
    userDataPath: userData,
    getAppPreferences: async () => ({ worktreeIsolation: false, subtaskUpgradeMax: 0 }),
    dshRuntime: scopeDeniedRuntime,
  })
  const scopeDeniedPlan = await scopeDeniedService.planAndExecute({
    text: '只读分析代码，不得修改文件。',
    primaryModelKey: 'mock/strong',
    conversationId: randomUUID(),
    webContents: mockWebContents,
  })
  assert.deepEqual(scopeDeniedPlan.failedTaskIds.sort(), ['T1', 'T2'])
  const scopeDeniedTask = scopeDeniedPlan.tasks.find((task) => task.id === 'T1')
  assert.equal(scopeDeniedTask.status, 'review', 'a model answer must not hide an enforced path-scope denial')
  assert.match(scopeDeniedTask.messages.at(-1).text, /Host 拒绝了 1 次超出只读子任务范围/)
  assert.match(scopeDeniedTask.messages.at(-1).text, /部分链路尚未核实/, 'the partial Agent answer should remain visible after the incomplete label')
  assert.equal(scopeDeniedTask.messages.at(-1).executionEvidence.scopeDeniedToolCalls, 1)
  assert.match(scopeDeniedTask.executionEvidenceSummary.label, /越界拒绝 1/)
  assert.equal(scopeDeniedPlan.tasks.find((task) => task.id === 'T2').status, 'review', 'dependent review must not proceed on an incomplete scoped task')

  console.log('orchestration checks passed: preset mapping, explicit-only DAG execution, routing, worktree, and publish')
} finally {
  await fs.rm(tmpBase, { recursive: true, force: true })
}
