#!/usr/bin/env node

/**
 * Measure the current DAG implementation on deterministic graphs supported by
 * the runtime node limit. Timings are local measurements, not before/after
 * performance claims.
 *
 * Run: node scripts/benchmark-dag-performance.mjs
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { validateAndOrderTasks, executeDag } from '../backend/dag-scheduler.mjs'
import { DAG_NODE_LIMIT_DEFAULT, DAG_NODE_LIMIT_MAX } from '../backend/orchestration/dag-limits.mjs'
import { computeTransitiveClosure } from '../backend/orchestration/transitive-closure.mjs'

const scenarios = [
  { name: 'small', nodes: 3, avgDeps: 1, iterations: 1000, seed: 0x13579bdf },
  { name: 'default-limit', nodes: DAG_NODE_LIMIT_DEFAULT, avgDeps: 2, iterations: 500, seed: 0x2468ace0 },
  { name: 'max-supported', nodes: DAG_NODE_LIMIT_MAX, avgDeps: 2.5, iterations: 250, seed: 0x10203040 },
]

/** Small deterministic PRNG so each run uses the same graph fixtures. */
function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** Generate a deterministic acyclic graph by only depending on earlier tasks. */
function generateTestDAG(nodeCount, avgDependencies, seed) {
  const random = createRandom(seed)
  const tasks = []

  for (let i = 0; i < nodeCount; i++) {
    const baseDependencies = Math.floor(avgDependencies)
    const fractionalDependency = random() < avgDependencies - baseDependencies ? 1 : 0
    const dependencyCount = Math.min(i, baseDependencies + fractionalDependency)
    const candidates = Array.from({ length: i }, (_, index) => index)

    // Partial Fisher-Yates shuffle selects unique dependencies without retries.
    const dependsOn = []
    for (let j = 0; j < dependencyCount; j++) {
      const selected = j + Math.floor(random() * (candidates.length - j))
      ;[candidates[j], candidates[selected]] = [candidates[selected], candidates[j]]
      dependsOn.push(`task-${candidates[j]}`)
    }

    tasks.push({
      id: `task-${i}`,
      title: `Test Task ${i}`,
      description: `Description for task ${i}`,
      taskType: i % 3 === 0 ? 'research' : 'implementation',
      dependsOn,
    })
  }

  return tasks
}

function percentile(sortedSamples, fraction) {
  return sortedSamples[Math.max(0, Math.ceil(sortedSamples.length * fraction) - 1)] ?? 0
}

async function measure(iterations, runOnce) {
  const warmupIterations = Math.min(50, Math.max(10, Math.floor(iterations * 0.1)))
  for (let i = 0; i < warmupIterations; i++) await runOnce()

  const samples = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await runOnce()
    samples.push(performance.now() - start)
  }

  const sortedSamples = [...samples].sort((a, b) => a - b)
  const totalMs = samples.reduce((total, sample) => total + sample, 0)
  return {
    totalMs,
    averageMs: totalMs / iterations,
    p50Ms: percentile(sortedSamples, 0.5),
    p95Ms: percentile(sortedSamples, 0.95),
    operationsPerSecond: iterations / (totalMs / 1000),
  }
}

function printMetrics(label, metrics) {
  console.log(`  ${label}: avg ${metrics.averageMs.toFixed(3)} ms, P50 ${metrics.p50Ms.toFixed(3)} ms, P95 ${metrics.p95Ms.toFixed(3)} ms, ${metrics.operationsPerSecond.toFixed(0)} ops/s`)
}

async function benchmarkScenario(scenario) {
  const { name, nodes, avgDeps, iterations, seed } = scenario
  const tasks = generateTestDAG(nodes, avgDeps, seed)
  const options = { maxNodes: nodes }

  console.log(`\n--- ${name}: ${nodes} 节点, 平均依赖 ${avgDeps}, seed 0x${seed.toString(16)}, ${iterations} 次测量 ---`)

  const topologicalSort = await measure(iterations, () => validateAndOrderTasks(tasks, options))
  const transitiveClosure = await measure(iterations, () => {
    const closure = computeTransitiveClosure(tasks)
    if (tasks.length >= 2) closure.hasPath(tasks[0].id, tasks[tasks.length - 1].id)
  })

  const mockExecute = async () => ({ success: true })
  const dagExecution = await measure(iterations, () => executeDag(tasks, {
    execute: mockExecute,
    maxConcurrency: Math.min(10, nodes),
    maxNodes: nodes,
  }))

  printMetrics('拓扑排序', topologicalSort)
  printMetrics('传递闭包', transitiveClosure)
  printMetrics('DAG 执行', dagExecution)

  return { name, nodes, seed, iterations, topologicalSort, transitiveClosure, dagExecution }
}

async function main() {
  console.log('=== TaskWeaver DAG 当前版本性能测量 ===')
  console.log(`Node.js: ${process.version}`)
  console.log(`平台: ${process.platform} ${process.arch}`)
  console.log(`运行时 DAG 节点上限: 默认 ${DAG_NODE_LIMIT_DEFAULT}, 最大 ${DAG_NODE_LIMIT_MAX}`)
  console.log('固定随机种子生成图；每项先预热，再报告本机测量结果。不同设备和负载下的耗时不可直接比较。')

  const results = []
  for (const scenario of scenarios) results.push(await benchmarkScenario(scenario))

  console.log('\n=== 汇总（平均 ms/次） ===')
  console.log('场景                 节点    拓扑排序    传递闭包    DAG 执行')
  console.log('─'.repeat(66))
  for (const result of results) {
    console.log(
      `${result.name.padEnd(20)} ${String(result.nodes).padStart(4)} ${result.topologicalSort.averageMs.toFixed(3).padStart(12)} ${result.transitiveClosure.averageMs.toFixed(3).padStart(12)} ${result.dagExecution.averageMs.toFixed(3).padStart(12)}`
    )
  }
  console.log('\n测量完成（仅反映当前代码版本，不代表相对旧版本的提升）。')

  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    dagLimits: { default: DAG_NODE_LIMIT_DEFAULT, maximum: DAG_NODE_LIMIT_MAX },
    scenarios: results,
    interpretation: '本机当前版本测量；图规模受运行时 12 节点上限约束，不构成大规模对照或统计显著性结论。',
  }
  const outputIndex = process.argv.indexOf('--output')
  if (outputIndex !== -1) {
    const outputPath = process.argv[outputIndex + 1]
    if (!outputPath) throw new Error('--output requires a path')
    const absolutePath = path.resolve(outputPath)
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(`已保存结构化结果：${absolutePath}`)
  }
}

main().catch((error) => {
  console.error('基准测量失败:', error)
  process.exitCode = 1
})
