import assert from 'node:assert/strict'
import { validateAndOrderTasks, executeDag } from '../backend/dag-scheduler.mjs'

const tasks = validateAndOrderTasks([
  { id: 'T1', title: '调研 A', description: '读代码', taskType: 'research', dependsOn: [] },
  { id: 'T2', title: '调研 B', description: '读配置', taskType: 'research', dependsOn: [] },
  { id: 'T3', title: '实现', description: '写代码', taskType: 'implementation', dependsOn: ['T1', 'T2'] },
])

assert.equal(tasks.length, 3)

const order = []
let active = 0
let maxParallel = 0
await executeDag(tasks, {
  execute: async (task) => {
    active += 1
    maxParallel = Math.max(maxParallel, active)
    order.push(task.id)
    await new Promise((resolve) => setTimeout(resolve, 10))
    active -= 1
    return { text: `ok-${task.id}` }
  },
  onTaskChange: async () => {},
})

assert.deepEqual(order.slice(0, 2).sort(), ['T1', 'T2'])
assert.equal(order[2], 'T3')
assert.equal(maxParallel, 2, '独立 research 任务应并行执行')

const serialOrder = []
let serialActive = 0
let serialMaxParallel = 0
await executeDag(tasks.slice(0, 2), {
  maxConcurrency: 1,
  execute: async (task) => {
    serialActive += 1
    serialMaxParallel = Math.max(serialMaxParallel, serialActive)
    serialOrder.push(task.id)
    await new Promise((resolve) => setTimeout(resolve, 5))
    serialActive -= 1
    return { text: `serial-${task.id}` }
  },
  onTaskChange: async () => {},
})
assert.deepEqual(serialOrder, ['T1', 'T2'])
assert.equal(serialMaxParallel, 1, 'maxConcurrency=1 serializes independent research tasks for benchmark replay')
await assert.rejects(executeDag(tasks.slice(0, 2), { maxConcurrency: 0, execute: async () => ({ text: 'never' }) }), /正整数/)
await assert.rejects(executeDag(tasks.slice(0, 2), { maxConcurrencyPerProvider: 0, execute: async () => ({ text: 'never' }) }), /提供方并发上限/)

const providerTasks = [
  { id: 'A1', title: 'provider A 1', description: 'A', taskType: 'research', provider: 'provider-a', dependsOn: [] },
  { id: 'A2', title: 'provider A 2', description: 'A', taskType: 'research', provider: 'provider-a', dependsOn: [] },
  { id: 'A3', title: 'provider A 3', description: 'A', taskType: 'research', provider: 'provider-a', dependsOn: [] },
  { id: 'B1', title: 'provider B 1', description: 'B', taskType: 'research', provider: 'provider-b', dependsOn: [] },
  { id: 'B2', title: 'provider B 2', description: 'B', taskType: 'research', provider: 'provider-b', dependsOn: [] },
]
const activeByProvider = new Map()
let providerConcurrencyPeak = 0
let providerAPeak = 0
let providerBPeak = 0
const providerLimited = await executeDag(providerTasks, {
  maxConcurrency: 4,
  maxConcurrencyPerProvider: 1,
  getTaskProvider: (task) => task.provider,
  execute: async (task) => {
    const active = (activeByProvider.get(task.provider) ?? 0) + 1
    activeByProvider.set(task.provider, active)
    providerConcurrencyPeak = Math.max(providerConcurrencyPeak, [...activeByProvider.values()].reduce((sum, count) => sum + count, 0))
    if (task.provider === 'provider-a') providerAPeak = Math.max(providerAPeak, active)
    if (task.provider === 'provider-b') providerBPeak = Math.max(providerBPeak, active)
    await new Promise((resolve) => setTimeout(resolve, 5))
    activeByProvider.set(task.provider, activeByProvider.get(task.provider) - 1)
    return { text: task.id }
  },
})
assert.equal(providerLimited.failed.size, 0)
assert.equal(providerLimited.results.size, providerTasks.length)
assert.equal(providerAPeak, 1, 'same-provider nodes must respect their independent concurrency ceiling')
assert.equal(providerBPeak, 1, 'each provider receives its own concurrency ceiling')
assert.equal(providerConcurrencyPeak, 2, 'different providers may run concurrently while each stays capped')

const seededRandom = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

for (let seed = 1; seed <= 24; seed += 1) {
  const random = seededRandom(seed)
  const count = 2 + Math.floor(random() * 7)
  const generated = Array.from({ length: count }, (_, index) => ({
    id: `R${index + 1}`,
    title: `random research ${index + 1}`,
    description: 'seeded property DAG',
    taskType: 'research',
    dependsOn: Array.from({ length: index }, (_, dependencyIndex) => dependencyIndex)
      .filter(() => random() < 0.28)
      .map((dependencyIndex) => `R${dependencyIndex + 1}`),
  }))
  const startedAt = new Map()
  const finishedAt = new Map()
  let eventSequence = 0
  const generatedResult = await executeDag(generated, {
    maxConcurrency: 4,
    execute: async (task) => {
      startedAt.set(task.id, ++eventSequence)
      await new Promise((resolve) => setTimeout(resolve, Math.floor(random() * 3)))
      finishedAt.set(task.id, ++eventSequence)
      return { text: task.id }
    },
  })
  assert.equal(generatedResult.failed.size, 0, `seed ${seed} must terminate without failed nodes`)
  assert.equal(generatedResult.results.size, count, `seed ${seed} must execute every node`)
  for (const task of generated) {
    for (const dependencyId of task.dependsOn) {
      assert.ok(finishedAt.get(dependencyId) < startedAt.get(task.id), `seed ${seed}: dependency ${dependencyId} must finish before ${task.id} starts`)
    }
  }
}

for (let seed = 1; seed <= 16; seed += 1) {
  const random = seededRandom(seed * 97)
  const activePaths = new Set()
  let activeWriters = 0
  let peakWriters = 0
  const writers = Array.from({ length: 6 }, (_, index) => ({
    id: `W${index + 1}`,
    title: `random writer ${index + 1}`,
    description: 'seeded overlapping writer property',
    taskType: 'implementation',
    writeScopes: [`src/group-${Math.floor(random() * 3)}.ts`],
    dependsOn: [],
  }))
  const writerResult = await executeDag(writers, {
    maxConcurrency: 4,
    allowParallelImplementation: true,
    execute: async (task) => {
      const scope = task.writeScopes[0]
      assert.equal(activePaths.has(scope), false, `seed ${seed}: overlapping write scope ${scope} must not run concurrently`)
      activePaths.add(scope)
      activeWriters += 1
      peakWriters = Math.max(peakWriters, activeWriters)
      await new Promise((resolve) => setTimeout(resolve, Math.floor(random() * 3)))
      activeWriters -= 1
      activePaths.delete(scope)
      return { text: task.id }
    },
  })
  assert.equal(writerResult.failed.size, 0, `seed ${seed} writer DAG must terminate`)
  assert.equal(writerResult.results.size, writers.length)
  assert.ok(peakWriters <= 3, `seed ${seed} must respect the run concurrency cap`)
}

const evidenceGateTasks = validateAndOrderTasks([
  { id: 'R1', title: '代码调研', description: '阅读代码', taskType: 'research', dependsOn: [] },
  { id: 'S1', title: '汇总', description: '基于调研汇总', taskType: 'review', dependsOn: ['R1'] },
])
const evidenceGateStates = []
const evidenceGate = await executeDag(evidenceGateTasks, {
  execute: async (task) => task.id === 'R1'
    ? { text: '搜索到了候选文件，但没有读取文件', completionAssessment: { complete: false, reason: '无成功读取' } }
    : { text: '不得执行到此处' },
  onTaskChange: async (task, meta) => evidenceGateStates.push({ id: task.id, status: task.status, label: task.statusLabel, incomplete: meta?.incomplete }),
})
assert.deepEqual([...evidenceGate.failed].sort(), ['R1', 'S1'])
assert.equal(evidenceGate.results.has('R1'), false, '证据不足的 research 不能作为成功依赖')
assert.equal(evidenceGate.results.has('S1'), false, '依赖证据不足 research 的汇总不得执行')
assert.equal(evidenceGateStates.find((item) => item.id === 'R1' && item.status === 'review')?.incomplete, true)
assert.match(evidenceGateStates.find((item) => item.id === 'R1' && item.status === 'review')?.label ?? '', /证据不足/)
assert.match(evidenceGateStates.find((item) => item.id === 'S1')?.label ?? '', /依赖任务 R1 未完成/)

const blockedErrorStates = []
const blockedFailure = await executeDag([
  { id: 'B1', title: '受策略阻止', description: '检查文件', taskType: 'research', dependsOn: [] },
  { id: 'B2', title: '依赖汇总', description: '汇总结果', taskType: 'review', dependsOn: ['B1'] },
], {
  execute: async () => { throw Object.assign(new Error('重复搜索循环已熔断'), { code: 'AGENT_BLOCKED' }) },
  onTaskChange: async (task, meta) => blockedErrorStates.push({ task, error: meta?.error }),
})
assert.deepEqual([...blockedFailure.failed].sort(), ['B1', 'B2'])
assert.equal(blockedFailure.results.has('B1'), false, 'blocked Agent work must not be accepted as a successful DAG result')
assert.equal(blockedErrorStates.find(({ task }) => task.id === 'B1' && task.status === 'review')?.error?.code, 'AGENT_BLOCKED',
  'DAG review state must preserve the underlying agent failure for evidence/reporting')
assert.match(blockedErrorStates.find(({ task }) => task.id === 'B1' && task.status === 'review')?.error?.message ?? '', /重复搜索循环/)

console.log('dag-scheduler 测试通过')
