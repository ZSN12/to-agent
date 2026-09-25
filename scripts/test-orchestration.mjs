import assert from 'node:assert/strict'
import { decideExecutionMode, selectModelForTask } from '../electron/backend/orchestration-policy.mjs'
import { executeDag, validateAndOrderTasks } from '../electron/backend/dag-scheduler.mjs'
import { getTaskProfile, getToolsForSingleAgent, getToolsForTask } from '../electron/backend/task-profile.mjs'

assert.equal(decideExecutionMode('你好').mode, 'single-agent')
assert.equal(decideExecutionMode('修复一个按钮样式').mode, 'single-agent')
assert.equal(decideExecutionMode('请使用多智能体处理这个任务').mode, 'multi-agent')
assert.equal(decideExecutionMode('请使用 multi-agent skill').mode, 'multi-agent')
assert.equal(decideExecutionMode('不要启用多智能体，即使要实现完整前后端平台和安全、测试、部署').mode, 'single-agent')
assert.equal(decideExecutionMode('实现一个完整平台，同时涵盖前端、后端 API、测试、安全和部署').mode, 'multi-agent')
assert.equal(decideExecutionMode('实现一个前端页面和后端接口').mode, 'single-agent')
assert.equal(decideExecutionMode('为完整平台实现前端页面与后端 API').mode, 'ask-user')

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

console.log('orchestration checks passed: opt-in gate, complexity gate, model/tool routing, DAG ordering, failures')
