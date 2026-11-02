#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { IncrementalReadyQueue } from '../backend/orchestration/performance-utils.mjs'
import { computeTransitiveClosure } from '../backend/orchestration/transitive-closure.mjs'

const NODE_COUNTS = [5, 15, 30, 50]
const SAMPLE_COUNT = 7
const ITERATIONS = 400

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

function createDag(nodeCount, seed) {
  const random = createRandom(seed)
  const tasks = []
  for (let index = 0; index < nodeCount; index += 1) {
    const parents = Array.from({ length: index }, (_, parent) => parent)
    const targetCount = Math.min(index, Math.round(1 + random() * 2))
    const dependsOn = []
    for (let offset = 0; offset < targetCount; offset += 1) {
      const selected = offset + Math.floor(random() * (parents.length - offset))
      ;[parents[offset], parents[selected]] = [parents[selected], parents[offset]]
      dependsOn.push(`task-${parents[offset]}`)
    }
    tasks.push({ id: `task-${index}`, dependsOn })
  }
  return tasks
}

function makeContext(tasks) {
  const dependents = new Map(tasks.map((task) => [task.id, []]))
  const orderIndex = new Map(tasks.map((task, index) => [task.id, index]))
  for (const task of tasks) {
    for (const dependency of task.dependsOn) dependents.get(dependency).push(task.id)
  }

  const criticalPath = Object.create(null)
  for (const task of tasks) criticalPath[task.id] = 1
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const task = tasks[index]
    for (const child of dependents.get(task.id)) {
      criticalPath[task.id] = Math.max(criticalPath[task.id], 1 + criticalPath[child])
    }
  }

  const compareReady = (left, right) =>
    criticalPath[right.id] - criticalPath[left.id] || orderIndex.get(left.id) - orderIndex.get(right.id)
  return { dependents, compareReady }
}

/** Reference Kahn scheduler: rescan pending tasks for ready work each turn. */
function scheduleByRescan(tasks) {
  const { compareReady } = makeContext(tasks)
  const pending = new Set(tasks.map((task) => task.id))
  const completed = new Set()
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const order = []

  while (pending.size > 0) {
    const ready = tasks.filter((task) =>
      pending.has(task.id) && task.dependsOn.every((dependency) => completed.has(dependency)))
    if (ready.length === 0) throw new Error('generated graph unexpectedly contains a cycle')
    ready.sort(compareReady)
    const task = ready[0]
    pending.delete(task.id)
    completed.add(task.id)
    order.push(byId.get(task.id).id)
  }
  return order
}

/** The production IncrementalReadyQueue, run with a single scheduling slot. */
function scheduleIncrementally(tasks) {
  const { dependents, compareReady } = makeContext(tasks)
  const queue = new IncrementalReadyQueue(tasks, dependents)
  const order = []

  while (order.length < tasks.length) {
    const task = queue.getAllReady(compareReady)[0]
    if (!task) throw new Error('incremental scheduler became stuck')
    queue.remove(task.id)
    queue.markCompleted(task.id)
    order.push(task.id)
  }
  return order
}

function referenceHasPath(tasksById, fromId, toId) {
  if (fromId === toId) return false
  const visited = new Set()
  const stack = [...(tasksById.get(fromId)?.dependsOn ?? [])]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === toId) return true
    if (visited.has(current)) continue
    visited.add(current)
    stack.push(...(tasksById.get(current)?.dependsOn ?? []))
  }
  return false
}

function runClosureQueries(tasks, useClosure) {
  const closure = useClosure ? computeTransitiveClosure(tasks) : null
  const tasksById = new Map(tasks.map((task) => [task.id, task]))
  let reachablePairs = 0
  for (const from of tasks) {
    for (const to of tasks) {
      const reachable = useClosure
        ? closure.hasPath(from.id, to.id)
        : referenceHasPath(tasksById, from.id, to.id)
      if (reachable) reachablePairs += 1
    }
  }
  return reachablePairs
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right)
  return {
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(4)),
    p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(4)),
    samplesMs: samples.map((value) => Number(value.toFixed(4))),
  }
}

function measurePair(reference, optimized, iterations) {
  for (let index = 0; index < 5; index += 1) {
    reference()
    optimized()
  }
  const referenceSamples = []
  const optimizedSamples = []
  let checksum = 0
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const run = (fn) => {
      const start = performance.now()
      for (let iteration = 0; iteration < iterations; iteration += 1) checksum += fn().length
      return (performance.now() - start) / iterations
    }
    if (sample % 2 === 0) {
      referenceSamples.push(run(reference))
      optimizedSamples.push(run(optimized))
    } else {
      optimizedSamples.push(run(optimized))
      referenceSamples.push(run(reference))
    }
  }
  return { reference: summarize(referenceSamples), optimized: summarize(optimizedSamples), checksum }
}

function measureClosurePair(tasks) {
  const referenceValue = runClosureQueries(tasks, false)
  const optimizedValue = runClosureQueries(tasks, true)
  assert.equal(optimizedValue, referenceValue, 'transitive closure must match repeated DFS for every node pair')
  const referenceSamples = []
  const optimizedSamples = []
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const run = (fn) => {
      const start = performance.now()
      const value = fn()
      assert.equal(value, referenceValue)
      return performance.now() - start
    }
    if (sample % 2 === 0) {
      referenceSamples.push(run(() => runClosureQueries(tasks, false)))
      optimizedSamples.push(run(() => runClosureQueries(tasks, true)))
    } else {
      optimizedSamples.push(run(() => runClosureQueries(tasks, true)))
      referenceSamples.push(run(() => runClosureQueries(tasks, false)))
    }
  }
  return {
    reference: summarize(referenceSamples),
    optimized: summarize(optimizedSamples),
    matrixBytes: tasks.length * tasks.length,
    queryPairs: tasks.length * tasks.length,
    reachablePairs: optimizedValue,
  }
}

function toCsv(rows) {
  const header = [
    'nodes', 'edges', 'averageDependencies', 'scanMedianMs', 'incrementalMedianMs',
    'scheduleSpeedup', 'dfsAllPairsMedianMs', 'closureAllPairsMedianMs',
    'closureMatrixBytes', 'queryPairs', 'reachablePairs',
  ]
  const lines = rows.map((row) => [
    row.nodes,
    row.edges,
    row.averageDependencies,
    row.scheduling.reference.medianMs,
    row.scheduling.optimized.medianMs,
    Number((row.scheduling.reference.medianMs / row.scheduling.optimized.medianMs).toFixed(3)),
    row.transitiveClosure.reference.medianMs,
    row.transitiveClosure.optimized.medianMs,
    row.transitiveClosure.matrixBytes,
    row.transitiveClosure.queryPairs,
    row.transitiveClosure.reachablePairs,
  ])
  return `${[header, ...lines].map((line) => line.join(',')).join('\n')}\n`
}

const results = NODE_COUNTS.map((nodes, index) => {
  const seed = 0x5eed0000 + nodes
  const tasks = createDag(nodes, seed)
  const scannedOrder = scheduleByRescan(tasks)
  const incrementalOrder = scheduleIncrementally(tasks)
  assert.deepEqual(incrementalOrder, scannedOrder, 'ready-queue scheduler must preserve reference schedule order')

  const scheduling = measurePair(
    () => scheduleByRescan(tasks),
    () => scheduleIncrementally(tasks),
    ITERATIONS,
  )
  const transitiveClosure = measureClosurePair(tasks)
  const edges = tasks.reduce((count, task) => count + task.dependsOn.length, 0)
  const row = {
    nodes,
    seed,
    edges,
    averageDependencies: Number((edges / nodes).toFixed(3)),
    scheduling: {
      reference: scheduling.reference,
      optimized: scheduling.optimized,
      speedup: Number((scheduling.reference.medianMs / scheduling.optimized.medianMs).toFixed(3)),
      iterationsPerSample: ITERATIONS,
      maxOrderDelta: 0,
    },
    transitiveClosure,
    algorithmicMemory: {
      closureMatrixBytes: transitiveClosure.matrixBytes,
      closureQueryCount: transitiveClosure.queryPairs,
      measuredProcessMemory: false,
    },
  }
  console.log(
    `${nodes} nodes/${edges} edges: rescan ${row.scheduling.reference.medianMs.toFixed(4)} ms/op, ` +
    `incremental ${row.scheduling.optimized.medianMs.toFixed(4)} ms/op (${row.scheduling.speedup}x); ` +
    `DFS ${transitiveClosure.reference.medianMs.toFixed(4)} ms, closure ${transitiveClosure.optimized.medianMs.toFixed(4)} ms, ` +
    `${transitiveClosure.matrixBytes} matrix bytes`,
  )
  return row
})

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  samples: SAMPLE_COUNT,
  iterationsPerSample: ITERATIONS,
  runtimeDagMaximum: 12,
  benchmarkScope: 'Standalone scheduling and reachability algorithms; 15/30/50-node cases intentionally bypass the production request cap and do not execute real model tasks.',
  reference: 'Repeated full scan for the next ready node and repeated DFS for each reachability query.',
  optimized: 'Production IncrementalReadyQueue and production Uint8Array transitive closure.',
  results,
  interpretation: 'Same-machine deterministic microbenchmark. The closure matrix byte count is exact for its Uint8Array; JavaScript object overhead and process RSS are not measured. This does not imply that production DAG execution accepts more than 12 nodes.',
}

const outputIndex = process.argv.indexOf('--output')
if (outputIndex !== -1) {
  const outputPath = process.argv[outputIndex + 1]
  if (!outputPath) throw new Error('--output requires a path')
  const absolutePath = path.resolve(outputPath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await fs.writeFile(absolutePath.replace(/\.json$/i, '.csv'), toCsv(results), 'utf8')
  console.log(`Saved JSON and CSV results to ${absolutePath}`)
}
console.log(JSON.stringify(report, null, 2))
