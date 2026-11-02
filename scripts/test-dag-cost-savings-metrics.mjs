import assert from 'node:assert/strict'
import { computeDagExecutionMetrics, formatDuration, formatSpeedup } from '../src/features/orchestration/dag-metrics.ts'

console.log('Testing computeDagExecutionMetrics...')

// 1. Empty / invalid tasks fallback
{
  const emptyMetrics = computeDagExecutionMetrics([])
  assert.equal(emptyMetrics.wallClockMs, null)
  assert.equal(emptyMetrics.totalTaskDurationMs, null)
  assert.equal(emptyMetrics.speedup, null)
  assert.equal(emptyMetrics.tierDistribution.total, 0)
  assert.equal(emptyMetrics.tierDistribution.lightweightRatio, null)
}

// 2. Formatting tests
{
  assert.equal(formatDuration(null), '暂不可计算')
  assert.equal(formatDuration(undefined), '暂不可计算')
  assert.equal(formatDuration(-1), '暂不可计算')
  assert.equal(formatDuration(450), '450ms')
  assert.equal(formatDuration(12400), '12.4s')
  assert.equal(formatDuration(135000), '2m 15s')

  assert.equal(formatSpeedup(null, 3), '暂不可计算')
  assert.equal(formatSpeedup(1.0, 1), '单任务串行')
  assert.equal(formatSpeedup(1.02, 3), '1.0x (近似串行)')
  assert.equal(formatSpeedup(2.34, 4), '2.3x 并行加速')
}

// 3. Parallel tasks with concurrency speedup & tier distribution
{
  const mockTasks = [
    {
      id: 'task-1',
      tier: 'low',
      startedAt: '2026-10-31T10:00:00.000Z',
      endedAt: '2026-10-31T10:00:10.000Z',
      durationMs: 10_000,
    },
    {
      id: 'task-2',
      tier: 'low',
      startedAt: '2026-10-31T10:00:00.000Z',
      endedAt: '2026-10-31T10:00:10.000Z',
      durationMs: 10_000,
    },
    {
      id: 'task-3',
      tier: 'balanced',
      startedAt: '2026-10-31T10:00:00.000Z',
      endedAt: '2026-10-31T10:00:10.000Z',
      durationMs: 10_000,
    },
    {
      id: 'task-4',
      tier: 'high',
      startedAt: '2026-10-31T10:00:10.000Z',
      endedAt: '2026-10-31T10:00:20.000Z',
      durationMs: 10_000,
    },
  ]

  // Wall clock time: 20 seconds (10:00:00 to 10:00:20)
  // Task sum: 40 seconds
  // Speedup: 40 / 20 = 2.0x
  const metrics = computeDagExecutionMetrics(
    mockTasks,
    '2026-10-31T10:00:00.000Z',
    '2026-10-31T10:00:20.000Z'
  )

  assert.equal(metrics.wallClockMs, 20_000)
  assert.equal(metrics.totalTaskDurationMs, 40_000)
  assert.equal(metrics.speedup, 2.0)
  assert.equal(metrics.tierDistribution.total, 4)
  assert.equal(metrics.tierDistribution.low, 2)
  assert.equal(metrics.tierDistribution.balanced, 1)
  assert.equal(metrics.tierDistribution.high, 1)
  assert.equal(metrics.tierDistribution.lightweightRatio, 75) // 3 out of 4 = 75%
}

// 4. Fallback to task startedAt / endedAt when run timestamps are missing
{
  const mockTasks = [
    {
      id: 'task-a',
      startedAt: '2026-10-31T12:00:00.000Z',
      endedAt: '2026-10-31T12:00:05.000Z',
      durationMs: 5_000,
      tier: 'low',
    },
    {
      id: 'task-b',
      startedAt: '2026-10-31T12:00:00.000Z',
      endedAt: '2026-10-31T12:00:05.000Z',
      durationMs: 5_000,
      tier: 'high',
    },
  ]

  const metrics = computeDagExecutionMetrics(mockTasks)
  assert.equal(metrics.wallClockMs, 5_000)
  assert.equal(metrics.totalTaskDurationMs, 10_000)
  assert.equal(metrics.speedup, 2.0)
  assert.equal(metrics.tierDistribution.low, 1)
  assert.equal(metrics.tierDistribution.high, 1)
  assert.equal(metrics.tierDistribution.lightweightRatio, 50)
}

console.log('All computeDagExecutionMetrics tests passed!')
