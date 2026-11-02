import type { TaskNode } from '../../types'

export type DagExecutionMetrics = {
  wallClockMs: number | null
  totalTaskDurationMs: number | null
  speedup: number | null
  tierDistribution: {
    low: number
    balanced: number
    high: number
    deterministic: number
    total: number
    lightweightRatio: number | null
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '暂不可计算'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function formatSpeedup(speedup: number | null | undefined, taskCount: number): string {
  if (speedup === null || speedup === undefined || !Number.isFinite(speedup) || speedup <= 0) return '暂不可计算'
  if (taskCount <= 1) return '单任务串行'
  if (speedup >= 1.05) return `${speedup.toFixed(1)}x 并行加速`
  return `${speedup.toFixed(1)}x (近似串行)`
}

export function computeDagExecutionMetrics(
  tasks: TaskNode[] = [],
  createdAt?: string,
  updatedAt?: string,
): DagExecutionMetrics {
  const safeTasks = Array.isArray(tasks) ? tasks : []

  // 1. 任务累计耗时之和（串行对照基线）
  let sumTaskMs = 0
  let hasValidTaskDuration = false
  for (const t of safeTasks) {
    if (typeof t.durationMs === 'number' && Number.isFinite(t.durationMs) && t.durationMs >= 0) {
      sumTaskMs += t.durationMs
      hasValidTaskDuration = true
    }
  }
  const totalTaskDurationMs = hasValidTaskDuration ? sumTaskMs : null

  // 2. 整体壁钟时间（Wall-clock time）
  let wallClockMs: number | null = null
  if (createdAt && updatedAt) {
    const start = Date.parse(createdAt)
    const end = Date.parse(updatedAt)
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      wallClockMs = end - start
    }
  }
  if (wallClockMs === null && safeTasks.length > 0) {
    const starts = safeTasks.map((t) => (t.startedAt ? Date.parse(t.startedAt) : NaN)).filter(Number.isFinite)
    const ends = safeTasks.map((t) => (t.endedAt ? Date.parse(t.endedAt) : NaN)).filter(Number.isFinite)
    if (starts.length > 0 && ends.length > 0) {
      const minStart = Math.min(...starts)
      const maxEnd = Math.max(...ends)
      if (maxEnd >= minStart) {
        wallClockMs = maxEnd - minStart
      }
    }
  }

  // 3. 并行加速比（Speedup）
  let speedup: number | null = null
  if (wallClockMs !== null && wallClockMs > 0 && totalTaskDurationMs !== null && totalTaskDurationMs > 0) {
    speedup = totalTaskDurationMs / wallClockMs
  }

  // 4. 异构模型档位分布（Tier distribution）
  const tierCounts = { low: 0, balanced: 0, high: 0, deterministic: 0 }
  let totalWithTier = 0
  for (const t of safeTasks) {
    const tier = t.tier
    if (tier && tier in tierCounts) {
      tierCounts[tier as keyof typeof tierCounts] += 1
      totalWithTier += 1
    }
  }
  const lightweightCount = tierCounts.low + tierCounts.balanced
  const lightweightRatio = totalWithTier > 0 ? (lightweightCount / totalWithTier) * 100 : null

  return {
    wallClockMs,
    totalTaskDurationMs,
    speedup,
    tierDistribution: {
      ...tierCounts,
      total: totalWithTier,
      lightweightRatio,
    },
  }
}
