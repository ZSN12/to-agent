import assert from 'node:assert/strict'
import {
  CircuitState,
  RouteCircuitBreaker,
} from '../backend/orchestration/circuit-breaker.mjs'
import {
  selectModelForTask,
  recordRouteSuccess,
  recordRouteFailure,
} from '../backend/orchestration-policy.mjs'
import {
  TaskChangeBatcher,
} from '../backend/orchestration/state-batcher.mjs'
import { executeDag } from '../backend/dag-scheduler.mjs'

console.log('--- 开始测试故障路由自动熔断器与状态分发微批节流 ---')

// ==========================================
// 1. 熔断器三种状态流转与自动恢复
// ==========================================
console.log('测试 1: 熔断器 CLOSED -> OPEN -> HALF_OPEN -> CLOSED 状态流转')

let mockTime = 1_000_000
const breaker = new RouteCircuitBreaker({
  failureThreshold: 3,
  windowMs: 30_000,
  cooldownMs: 45_000,
  now: () => mockTime,
})

const domainA = 'deepseek'

// 初始状态应为 CLOSED
assert.equal(breaker.getState(domainA), CircuitState.CLOSED)
assert.equal(breaker.isAvailable(domainA), true)
assert.equal(breaker.getActiveBreaks().length, 0)

// 失败 1 次
breaker.recordFailure(domainA, new Error('ETIMEDOUT'))
assert.equal(breaker.getState(domainA), CircuitState.CLOSED)
assert.equal(breaker.isAvailable(domainA), true)

// 失败 2 次
mockTime += 2000
breaker.recordFailure(domainA, new Error('502 Bad Gateway'))
assert.equal(breaker.getState(domainA), CircuitState.CLOSED)
assert.equal(breaker.isAvailable(domainA), true)

// 失败 3 次 (达到阈值，触发熔断 OPEN)
mockTime += 1000
breaker.recordFailure(domainA, new Error('Network socket disconnected'))
assert.equal(breaker.getState(domainA), CircuitState.OPEN)
assert.equal(breaker.isAvailable(domainA), false)

const activeBreaks = breaker.getActiveBreaks()
assert.equal(activeBreaks.length, 1)
assert.equal(activeBreaks[0].domain, domainA)
assert.equal(activeBreaks[0].state, CircuitState.OPEN)
assert.equal(activeBreaks[0].failureCount, 3)

// 冷却中 (经过 20 秒，尚未达到 45 秒)
mockTime += 20_000
assert.equal(breaker.getState(domainA), CircuitState.OPEN)
assert.equal(breaker.isAvailable(domainA), false)

// 冷却时间结束 (再经过 26 秒，累计 46 秒 > 45 秒)，跃迁到 HALF_OPEN
mockTime += 26_000
assert.equal(breaker.getState(domainA), CircuitState.HALF_OPEN)

// HALF_OPEN 允许单次半开试探
assert.equal(breaker.isAvailable(domainA), true, '第一次试探应允许通过')
// 并发第二次试探应被拒绝
assert.equal(breaker.isAvailable(domainA), false, '试探期间第二次并发请求应被拒绝')

// 试探成功，重置为 CLOSED
breaker.recordSuccess(domainA)
assert.equal(breaker.getState(domainA), CircuitState.CLOSED)
assert.equal(breaker.isAvailable(domainA), true)
assert.equal(breaker.getActiveBreaks().length, 0)
console.log('✓ 熔断器三种状态流转与试探成功恢复测试通过')

// ==========================================
// 2. 半开试探失败重新熔断
// ==========================================
console.log('测试 2: 半开试探失败立即重新触发 OPEN 熔断')

// 快速制造 3 次失败再次触发熔断
breaker.recordFailure(domainA, new Error('err1'))
breaker.recordFailure(domainA, new Error('err2'))
breaker.recordFailure(domainA, new Error('err3'))
assert.equal(breaker.getState(domainA), CircuitState.OPEN)

// 冷却结束进入 HALF_OPEN
mockTime += 46_000
assert.equal(breaker.getState(domainA), CircuitState.HALF_OPEN)
assert.equal(breaker.isAvailable(domainA), true)

// 半开试探失败
breaker.recordFailure(domainA, new Error('Probe failed with 503'))
assert.equal(breaker.getState(domainA), CircuitState.OPEN, '试探失败应立即重新熔断')
assert.equal(breaker.isAvailable(domainA), false)
console.log('✓ 半开试探失败立即重新熔断测试通过')

// Cancelled or otherwise unclassified probes must release only their own lease.
let leaseTime = 10_000
const leaseBreaker = new RouteCircuitBreaker({
  failureThreshold: 1,
  cooldownMs: 10,
  now: () => leaseTime,
})
leaseBreaker.recordFailure('lease-domain', { code: 'ETIMEDOUT' })
leaseTime += 10
assert.equal(leaseBreaker.getState('lease-domain'), CircuitState.HALF_OPEN)
const firstLease = leaseBreaker.acquireTrial('lease-domain')
assert.equal(typeof firstLease, 'string')
assert.equal(leaseBreaker.canAttempt('lease-domain'), false)
assert.equal(leaseBreaker.releaseTrial('lease-domain', firstLease), true)
assert.equal(leaseBreaker.canAttempt('lease-domain'), true)
assert.equal(leaseBreaker.releaseTrial('lease-domain', firstLease), false, 'a lease can only be released once')
const secondLease = leaseBreaker.acquireTrial('lease-domain')
assert.equal(typeof secondLease, 'string')
leaseBreaker.recordSuccess('lease-domain')
assert.equal(leaseBreaker.releaseTrial('lease-domain', secondLease), false, 'stale leases cannot release a later probe')

// 未释放的半开试探租约在 TTL 超时后自动回收，杜绝永久死锁
leaseBreaker.recordFailure('lease-domain', { code: 'ECONNRESET' })
leaseTime += 10
assert.equal(leaseBreaker.getState('lease-domain'), CircuitState.HALF_OPEN)
const leakedLease = leaseBreaker.acquireTrial('lease-domain')
assert.equal(typeof leakedLease, 'string')
assert.equal(leaseBreaker.canAttempt('lease-domain'), false)
// 模拟租约被调用方遗忘/异常丢失，时间流逝超过 trialTimeoutMs (默认 60s)
leaseTime += 65_000
assert.equal(leaseBreaker.canAttempt('lease-domain'), true, '超时租约应被自动回收，不发生永久死锁')
const recoveredLease = leaseBreaker.acquireTrial('lease-domain')
assert.equal(typeof recoveredLease, 'string')
leaseBreaker.recordSuccess('lease-domain')

console.log('✓ 半开试探租约可安全释放且不影响其他试探')

// ==========================================
// 3. 滑动窗口淘汰过期失败测试
// ==========================================
console.log('测试 3: 滑动窗口过期失败淘汰')

const domainB = 'anthropic'
mockTime = 2_000_000
breaker.reset(domainB)

// t=0s, 失败 2 次
breaker.recordFailure(domainB, new Error('err1'))
mockTime += 1000
breaker.recordFailure(domainB, new Error('err2'))
assert.equal(breaker.getState(domainB), CircuitState.CLOSED)

// 时间前进 35 秒 (超过 30s 窗口)
mockTime += 35_000
// 此时发生第 3 次失败，但前 2 次已过期淘汰，当前有效失败数为 1
breaker.recordFailure(domainB, new Error('err3'))
assert.equal(breaker.getState(domainB), CircuitState.CLOSED, '过期失败淘汰后不应触发熔断')
assert.equal(breaker.isAvailable(domainB), true)
console.log('✓ 滑动窗口过期淘汰测试通过')

// ==========================================
// 4. selectModelForTask 熔断自动排除与可解释理由测试
// ==========================================
console.log('测试 4: selectModelForTask 集成自动排除与可解释理由')

const testCatalog = {
  models: [
    {
      key: 'cursor/composer-2.5',
      provider: 'cursor',
      name: 'Cursor Composer 2.5',
      available: true,
      routeRegistered: true,
      profile: { enabledForAllocation: true, tier: 'balanced' },
      cost: { input: 0.5, output: 1.5 },
    },
    {
      key: 'deepseek/deepseek-chat',
      provider: 'deepseek',
      name: 'DeepSeek V3',
      available: true,
      routeRegistered: true,
      profile: { enabledForAllocation: true, tier: 'balanced' },
      cost: { input: 0.1, output: 0.2 },
    },
  ],
}

const mockBreaker = new RouteCircuitBreaker({
  failureThreshold: 3,
  windowMs: 30_000,
  cooldownMs: 45_000,
})

// 正常情况下，两者均可用
const normalRoute = selectModelForTask('implementation', testCatalog, 'cursor/composer-2.5', {
  circuitBreaker: mockBreaker,
})
assert.ok(normalRoute.model, '正常情况下应选出模型')

// 模拟 cursor 连续失败 3 次触发熔断
mockBreaker.recordFailure('cursor', new Error('ETIMEDOUT'))
mockBreaker.recordFailure('cursor', new Error('ETIMEDOUT'))
mockBreaker.recordFailure('cursor', new Error('ETIMEDOUT'))
assert.equal(mockBreaker.getState('cursor'), CircuitState.OPEN)

// 再次进行模型选择，应自动跳过 cursor，选择 deepseek
const routedAfterBreak = selectModelForTask('implementation', testCatalog, 'cursor/composer-2.5', {
  circuitBreaker: mockBreaker,
})
assert.equal(routedAfterBreak.modelKey, 'deepseek/deepseek-chat', 'cursor 熔断后应自动降级/切换到 deepseek')
assert.ok(
  routedAfterBreak.reasons.some((r) => r.includes('该提供方近期多次故障已临时熔断')),
  'reasons 中应包含“该提供方近期多次故障已临时熔断”可解释说明'
)
assert.ok(routedAfterBreak.reason.includes('该提供方近期多次故障已临时熔断'))

// 当所有提供方都被熔断时
mockBreaker.recordFailure('deepseek', new Error('ECONNRESET'))
mockBreaker.recordFailure('deepseek', new Error('ECONNRESET'))
mockBreaker.recordFailure('deepseek', new Error('ECONNRESET'))
const allBrokenRoute = selectModelForTask('implementation', testCatalog, 'cursor/composer-2.5', {
  circuitBreaker: mockBreaker,
})
assert.equal(allBrokenRoute.model, null)
assert.ok(allBrokenRoute.reason.includes('该提供方近期多次故障已临时熔断'))

// 恢复 cursor
mockBreaker.recordSuccess('cursor')
const recoveredRoute = selectModelForTask('implementation', testCatalog, 'cursor/composer-2.5', {
  circuitBreaker: mockBreaker,
})
assert.ok(recoveredRoute.modelKey, '恢复后应可重新选择')
console.log('✓ selectModelForTask 熔断自动排除与可解释理由测试通过')

// ==========================================
// 5. recordRouteSuccess 与 recordRouteFailure 辅助方法测试
// ==========================================
console.log('测试 5: recordRouteSuccess 与 recordRouteFailure 路由记录联动')

const helperBreaker = new RouteCircuitBreaker({ failureThreshold: 2 })
const helperCatalog = {
  models: [
    { key: 'test/m1', provider: 'test-prov', available: true, routeRegistered: true, profile: { enabledForAllocation: true } },
  ],
}

// 模拟非路由错误 (比如语法错误)，不计入熔断
recordRouteFailure('test/m1', new Error('SyntaxError: unexpected token'), {
  catalog: helperCatalog,
  circuitBreaker: helperBreaker,
})
assert.equal(helperBreaker.getState('test-prov'), CircuitState.CLOSED)

// 模拟网络传输错误 (ETIMEDOUT)，计入熔断
recordRouteFailure('test/m1', { code: 'ETIMEDOUT', message: 'connection timed out' }, {
  catalog: helperCatalog,
  circuitBreaker: helperBreaker,
})
recordRouteFailure('test/m1', { status: 502, message: 'bad gateway' }, {
  catalog: helperCatalog,
  circuitBreaker: helperBreaker,
})
assert.equal(helperBreaker.getState('test-prov'), CircuitState.OPEN, '2 次传输错误后应熔断')

// 记录成功恢复
recordRouteSuccess('test/m1', { catalog: helperCatalog, circuitBreaker: helperBreaker })
assert.equal(helperBreaker.getState('test-prov'), CircuitState.CLOSED)
console.log('✓ recordRouteSuccess 与 recordRouteFailure 联动测试通过')

// ==========================================
// 6. DAG 状态分发微批节流 (TaskChangeBatcher) 测试
// ==========================================
console.log('测试 6: TaskChangeBatcher 普通更新合并去重与关键终态立即 flush')

const events = []
const batcher = new TaskChangeBatcher(async (taskChange, meta) => {
  events.push({ taskChange, meta, time: Date.now() })
}, { windowMs: 30 })

// 1. 同一任务短时间内连续发送多次普通进度更新 (running / progress)
await batcher.dispatch({ id: 'task-1', status: 'running', progress: 10 })
await batcher.dispatch({ id: 'task-1', status: 'running', progress: 50 })
await batcher.dispatch({ id: 'task-1', status: 'running', progress: 80 })

// 由于在窗口内且为普通状态，此时尚未 flush
assert.equal(events.length, 0, '节流窗口内普通状态不应立即触发底层回调')

// 等待 40ms，让定时器 flush
await new Promise((resolve) => setTimeout(resolve, 45))
assert.equal(events.length, 1, '窗口到期后应合并为 1 条更新')
assert.equal(events[0].taskChange.progress, 80, '去重后应保留最新进度 80')

// 2. 关键终态 (done / failed / cancelled / review) 必须立即无延迟 flush
events.length = 0
await batcher.dispatch({ id: 'task-2', status: 'running', progress: 20 })
assert.equal(events.length, 0, 'running 暂存未分发')

// 紧接着 task-2 发送 done 终态
await batcher.dispatch({ id: 'task-2', status: 'done', statusLabel: '已完成' }, { result: { ok: true } })
// 必须立即已经 flush，无需 setTimeout
assert.ok(events.length >= 1, '关键终态必须立即无延迟 flush')
const lastEvent = events.at(-1)
assert.equal(lastEvent.taskChange.status, 'done')
assert.equal(lastEvent.taskChange.statusLabel, '已完成')

// 3. 任务结束时自动 flush 未决消息
events.length = 0
await batcher.dispatch({ id: 'task-3', status: 'running', progress: 30 })
assert.equal(events.length, 0)
await batcher.flush()
assert.equal(events.length, 1, 'flush 必须清空所有未决消息')
assert.equal(events[0].taskChange.id, 'task-3')

batcher.dispose()
console.log('✓ TaskChangeBatcher 微批节流与立即 flush 测试通过')

// ==========================================
// 7. executeDag 与微批节流真实调度集成测试
// ==========================================
console.log('测试 7: executeDag 调度中自动微批节流验证')

const dagTasks = [
  { id: 'T1', title: 'Task 1', description: 'desc', taskType: 'research', dependsOn: [] },
  { id: 'T2', title: 'Task 2', description: 'desc', taskType: 'research', dependsOn: [] },
]

const receivedChanges = []
const dagResult = await executeDag(dagTasks, {
  maxConcurrency: 2,
  stateBatchWindowMs: 30,
  execute: async (task) => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    return { text: `done-${task.id}` }
  },
  onTaskChange: async (change, meta) => {
    receivedChanges.push({ id: change.id, status: change.status })
  },
})

assert.equal(dagResult.failed.size, 0)
assert.equal(dagResult.results.size, 2)
// 确保每个任务的关键终态 done 都已收到
assert.ok(receivedChanges.some((c) => c.id === 'T1' && c.status === 'done'))
assert.ok(receivedChanges.some((c) => c.id === 'T2' && c.status === 'done'))
console.log('✓ executeDag 真实调度与微批节流集成测试通过')

console.log('🎉 所有故障路由自动熔断器与微批节流测试全部通过！')
