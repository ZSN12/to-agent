import assert from 'node:assert/strict'
import { validateAndOrderTasks, executeDag } from '../electron/backend/dag-scheduler.mjs'

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

console.log('dag-scheduler 测试通过')
