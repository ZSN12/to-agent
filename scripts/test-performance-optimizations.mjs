#!/usr/bin/env node

/**
 * 性能优化集成测试
 * 验证所有优化是否正常工作且没有破坏现有功能
 *
 * 运行: node scripts/test-performance-optimizations.mjs
 */

import { validateAndOrderTasks, executeDag } from '../backend/dag-scheduler.mjs'
import assertStrict from 'node:assert/strict'
import { computeTransitiveClosure, canRunInParallel } from '../backend/orchestration/transitive-closure.mjs'
import { FastQueue, IncrementalReadyQueue, MinHeap, LRUCache } from '../backend/orchestration/performance-utils.mjs'
import { aggregateUsage, QueuedWriter } from '../backend/orchestration/aggregation-utils.mjs'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`✅ ${name}`)
    passed++
  } catch (error) {
    console.error(`❌ ${name}`)
    console.error(`   ${error.message}`)
    failed++
  }
}

async function testAsync(name, fn) {
  try {
    await fn()
    console.log(`✅ ${name}`)
    passed++
  } catch (error) {
    console.error(`❌ ${name}`)
    console.error(`   ${error.message}`)
    failed++
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed')
}

console.log('=== TaskWeaver 性能优化集成测试 ===\n')

// 测试 FastQueue
console.log('--- FastQueue 测试 ---')
test('FastQueue 基本操作', () => {
  const queue = new FastQueue()
  assert(queue.length === 0, 'Initial length should be 0')

  queue.enqueue('a')
  queue.enqueue('b')
  queue.enqueue('c')
  assert(queue.length === 3, 'Length should be 3')

  assert(queue.dequeue() === 'a', 'First dequeue should be a')
  assert(queue.dequeue() === 'b', 'Second dequeue should be b')
  assert(queue.length === 1, 'Length should be 1')

  assert(queue.peek() === 'c', 'Peek should be c')
  assert(queue.length === 1, 'Peek should not change length')

  assert(queue.dequeue() === 'c', 'Third dequeue should be c')
  assert(queue.dequeue() === null, 'Dequeue from empty should be null')
})

test('FastQueue 内存清理', () => {
  const queue = new FastQueue()

  // 添加超过 1000 个元素触发清理
  for (let i = 0; i < 1500; i++) {
    queue.enqueue(i)
  }

  // 移除大部分
  for (let i = 0; i < 1200; i++) {
    queue.dequeue()
  }

  // 应该已触发清理
  assert(queue.length === 300, 'Should have 300 items')
  assert(queue.items.length < 600, 'Consumed slots should be compacted out of the backing array')
  assert(queue.head < 300, 'Head should advance only within the compacted array')
})

// 测试 MinHeap
console.log('\n--- MinHeap 测试 ---')
test('MinHeap Top-K 选择', () => {
  const heap = new MinHeap(3, (a, b) => a - b)

  heap.push(5)
  heap.push(2)
  heap.push(8)
  heap.push(1)
  heap.push(9)
  heap.push(3)

  const result = heap.toSortedArray()
  assert(result.length === 3, 'Should have exactly 3 items')
  assert(result[0] === 9, 'First should be 9')
  assert(result[1] === 8, 'Second should be 8')
  assert(result[2] === 5, 'Third should be 5')
})

test('MinHeap 快照后继续 push 不破坏 Top-K', () => {
  const heap = new MinHeap(3, (a, b) => a - b)
  const inserted = [1, 2, 3]
  for (const value of inserted) heap.push(value)

  const snapshot = heap.toSortedArray()
  assertStrict.deepEqual(snapshot, [3, 2, 1], 'Snapshot should be in descending order')
  assertStrict.deepEqual(heap.items, [1, 2, 3], 'Snapshot must leave the heap backing array unchanged')

  inserted.push(4)
  heap.push(4)
  assertStrict.deepEqual(heap.toSortedArray(), [...inserted].sort((a, b) => b - a).slice(0, 3),
    'A later push should still produce the same Top-K as a full sort')
})

test('MinHeap 多层替换保留同分候选的稳定 Top-K', () => {
  const candidates = [
    'backend/a.ts', 'backend/b.ts', 'backend/c.ts', 'backend/d.ts',
    'src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts',
    'apps/a.ts', 'apps/b.ts', 'apps/c.ts', 'apps/d.ts',
    'docs/a.ts', 'docs/b.ts', 'docs/c.ts', 'docs/d.ts',
  ].map((candidate) => ({ candidate, score: 1 }))
  const compare = (a, b) => a.score - b.score || b.candidate.localeCompare(a.candidate)
  const heap = new MinHeap(7, compare)
  const inserted = []

  for (const candidate of candidates) {
    inserted.push(candidate)
    heap.push(candidate)
    const expected = [...inserted]
      .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
      .slice(0, 7)
      .map((item) => item.candidate)
    assertStrict.deepEqual(heap.toSortedArray().map((item) => item.candidate), expected,
      'multi-level replacements must preserve heap order and lexical boundary ties')
  }
})

// 测试 LRU Cache
console.log('\n--- LRUCache 测试 ---')
test('LRUCache 基本操作', () => {
  const cache = new LRUCache(3)

  cache.set('a', 1)
  cache.set('b', 2)
  cache.set('c', 3)

  assert(cache.get('a') === 1, 'Should get a')
  assert(cache.size === 3, 'Size should be 3')

  cache.set('d', 4) // 驱逐 b (因为 a 刚被访问)
  assert(cache.get('b') === undefined, 'b should be evicted')
  assert(cache.get('a') === 1, 'a should still exist')
  assert(cache.get('c') === 3, 'c should still exist')
  assert(cache.get('d') === 4, 'd should exist')
})

// 测试优化的拓扑排序
console.log('\n--- 拓扑排序测试 ---')
test('拓扑排序 - 简单 DAG', () => {
  const tasks = [
    { id: 'a', title: 'A', description: 'Task A', dependsOn: [] },
    { id: 'b', title: 'B', description: 'Task B', dependsOn: ['a'] },
    { id: 'c', title: 'C', description: 'Task C', dependsOn: ['a'] },
    { id: 'd', title: 'D', description: 'Task D', dependsOn: ['b', 'c'] },
  ]

  const ordered = validateAndOrderTasks(tasks)
  assert(ordered.length === 4, 'Should have 4 tasks')
  assert(ordered[0].id === 'a', 'First should be a')
  assert(ordered[ordered.length - 1].id === 'd', 'Last should be d')
})

test('拓扑排序 - 检测循环', () => {
  const tasks = [
    { id: 'a', title: 'A', description: 'Task A', dependsOn: ['b'] },
    { id: 'b', title: 'B', description: 'Task B', dependsOn: ['a'] },
  ]

  let thrown = false
  try {
    validateAndOrderTasks(tasks)
  } catch (error) {
    thrown = true
    assert(error.message.includes('循环'), 'Should mention cycle')
  }
  assert(thrown, 'Should throw on cycle')
})

// 测试传递闭包
console.log('\n--- 传递闭包测试 ---')
test('传递闭包 - 路径检测', () => {
  const tasks = [
    { id: 'a', dependsOn: [] },
    { id: 'b', dependsOn: ['a'] },
    { id: 'c', dependsOn: ['b'] },
    { id: 'd', dependsOn: ['a'] },
  ]

  const closure = computeTransitiveClosure(tasks)

  assert(closure.hasPath('c', 'a'), 'c -> a should exist')
  assert(closure.hasPath('c', 'b'), 'c -> b should exist')
  assert(!closure.hasPath('a', 'c'), 'a -> c should not exist')
  assert(!closure.hasPath('c', 'd'), 'c -> d should not exist')
  assert(canRunInParallel(closure, 'c', 'd'), 'c and d should be parallel')
})

test('传递闭包 - 祖先和后继', () => {
  const tasks = [
    { id: 'a', dependsOn: [] },
    { id: 'b', dependsOn: ['a'] },
    { id: 'c', dependsOn: ['b'] },
  ]

  const closure = computeTransitiveClosure(tasks)

  const ancestors = closure.getAncestors('c')
  assert(ancestors.includes('a'), 'Ancestors of c should include a')
  assert(ancestors.includes('b'), 'Ancestors of c should include b')

  const descendants = closure.getDescendants('a')
  assert(descendants.includes('b'), 'Descendants of a should include b')
  assert(descendants.includes('c'), 'Descendants of a should include c')
})

// 测试增量就绪队列
console.log('\n--- IncrementalReadyQueue 测试 ---')
test('IncrementalReadyQueue 基本操作', () => {
  const tasks = [
    { id: 'a', dependsOn: [] },
    { id: 'b', dependsOn: ['a'] },
    { id: 'c', dependsOn: ['a'] },
    { id: 'd', dependsOn: ['b', 'c'] },
  ]

  const dependents = new Map([
    ['a', ['b', 'c']],
    ['b', ['d']],
    ['c', ['d']],
    ['d', []],
  ])

  const queue = new IncrementalReadyQueue(tasks, dependents)

  assert(queue.hasReady(), 'Should have ready tasks')
  const ready = queue.getAllReady()
  assert(ready.length === 1, 'Should have 1 ready task')
  assert(ready[0].id === 'a', 'Ready task should be a')

  queue.remove('a')
  queue.markCompleted('a')

  const nextReady = queue.getAllReady()
  assert(nextReady.length === 2, 'Should have 2 ready tasks after a completes')
  assert(nextReady.some(t => t.id === 'b'), 'b should be ready')
  assert(nextReady.some(t => t.id === 'c'), 'c should be ready')
})

// 测试聚合工具
console.log('\n--- 聚合工具测试 ---')
test('aggregateUsage', () => {
  const buckets = [
    { date: '2024-01-01', provider: 'p1', model: 'm1', calls: 5, inputTokens: 100, outputTokens: 50, cacheReadTokens: 40, cacheWriteTokens: 5, totalTokens: 195, costUsd: 0.5 },
    { date: '2024-01-01', provider: 'p1', model: 'm1', calls: 3, inputTokens: 80, outputTokens: 40, cacheReadTokens: 20, totalTokens: 140, costUsd: 0.3 },
    { date: '2024-01-02', provider: 'p1', model: 'm1', calls: 2, inputTokens: 60, outputTokens: 30, totalTokens: 90, costUsd: 0.2 },
  ]

  const byDate = aggregateUsage(buckets, b => b.date)
  assert(byDate.length === 2, 'Should have 2 dates')

  const day1 = byDate.find(b => b.calls === 8)
  assert(day1.inputTokens === 180, 'Day 1 should have 180 input tokens')
  assert(day1.outputTokens === 90, 'Day 1 should have 90 output tokens')
  assert(day1.cacheReadTokens === 60, 'Day 1 should include cached input as a separate dimension')
  assert(day1.totalTokens === 335, 'Day 1 total should include input, cached input, output and cached writes')
  assert(Math.abs(day1.costUsd - 0.8) < 0.001, 'Day 1 should have 0.8 cost')
})

console.log('\n--- QueuedWriter 测试 ---')
await testAsync('QueuedWriter 批量写入', async () => {
  let writeCount = 0
  let finalData = null

  const writer = new QueuedWriter(async (prepareFn) => {
    writeCount++
    const data = await prepareFn({ value: 0 })
    finalData = data
  })

  // 快速入队多个写入
  const promises = []
  for (let i = 1; i <= 5; i++) {
    promises.push(writer.enqueue(async (data) => ({ value: data.value + i })))
  }

  await Promise.all(promises)

  assert(writeCount === 1, 'Should only write once for batched operations')
  assert(finalData.value === 15, 'Final value should be 1+2+3+4+5 = 15')
})

await testAsync('QueuedWriter 按键串行且回收空队列', async () => {
  const writer = new QueuedWriter()
  const events = []
  let releaseFirst
  const gate = new Promise((resolve) => { releaseFirst = resolve })
  const first = writer.enqueueForKey('same', async () => {
    events.push('first:start')
    await gate
    events.push('first:end')
  })
  const second = writer.enqueueForKey('same', async () => { events.push('second') })
  const other = writer.enqueueForKey('other', async () => { events.push('other') })
  await other
  assert(events.includes('other'), 'Unrelated keys should proceed independently')
  assert(!events.includes('second'), 'Writes for the same key must wait in order')
  releaseFirst()
  await Promise.all([first, second])
  assertStrict.deepEqual(events, ['first:start', 'other', 'first:end', 'second'])
  assert(writer.keyedQueueCount === 0, 'Settled keyed queues should be removed')
})

// 测试完整 DAG 执行
console.log('\n--- DAG 执行测试 ---')
await testAsync('DAG 执行 - 简单流程', async () => {
  const tasks = [
    { id: 'a', title: 'A', description: 'Task A', taskType: 'research', dependsOn: [] },
    { id: 'b', title: 'B', description: 'Task B', taskType: 'research', dependsOn: ['a'] },
    { id: 'c', title: 'C', description: 'Task C', taskType: 'research', dependsOn: ['a'] },
  ]

  const executionOrder = []
  const mockExecute = async (task) => {
    executionOrder.push(task.id)
    return { success: true }
  }

  const { results, failed } = await executeDag(tasks, {
    execute: mockExecute,
    maxConcurrency: 3,
  })

  assert(results.size === 3, 'Should complete 3 tasks')
  assert(failed.size === 0, 'Should have no failures')
  assert(executionOrder[0] === 'a', 'a should execute first')
  assert(executionOrder.includes('b'), 'b should execute')
  assert(executionOrder.includes('c'), 'c should execute')
})

// 总结
console.log('\n=================================')
console.log(`测试完成: ${passed} 通过, ${failed} 失败`)
console.log('=================================\n')

if (failed > 0) {
  process.exit(1)
}

console.log('✅ 所有性能优化测试通过！')
