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

console.log('dag-scheduler 测试通过')
