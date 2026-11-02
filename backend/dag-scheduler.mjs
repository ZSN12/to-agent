import {
  canRunScopedImplementationTasksConcurrently,
  canRunSubtasksInParallel,
  isReadOnlyTaskType,
} from './task-profile.mjs'
import {
  DAG_NODE_LIMIT_DEFAULT,
  DAG_NODE_LIMIT_MAX,
  DAG_NODE_LIMIT_MIN,
} from './orchestration/dag-limits.mjs'
import { IncrementalReadyQueue } from './orchestration/performance-utils.mjs'
import { TaskChangeBatcher } from './orchestration/state-batcher.mjs'

export { TaskChangeBatcher }

/**
 * 拓扑排序 - 单遍初始化入度与出边，再执行 Kahn 算法。
 */
export function validateAndOrderTasks(tasks, { maxNodes = DAG_NODE_LIMIT_DEFAULT } = {}) {
  if (!Number.isInteger(maxNodes) || maxNodes < DAG_NODE_LIMIT_MIN || maxNodes > DAG_NODE_LIMIT_MAX) {
    throw new Error(`DAG 节点上限必须是 ${DAG_NODE_LIMIT_MIN} 到 ${DAG_NODE_LIMIT_MAX} 之间的整数`)
  }
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > maxNodes) {
    throw new Error(`DAG 计划必须包含 1 到 ${maxNodes} 个子任务`)
  }

  const byId = new Map()
  // 用对象记录入度与出边。
  const incoming = Object.create(null)
  const outgoing = Object.create(null)

  // 单次遍历完成验证和初始化
  for (const task of tasks) {
    if (!task || typeof task.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(task.id)) {
      throw new Error('DAG 中存在无效的任务 ID')
    }
    if (byId.has(task.id)) throw new Error(`DAG 中任务 ID 重复：${task.id}`)
    if (typeof task.title !== 'string' || !task.title.trim() || typeof task.description !== 'string' || !task.description.trim()) {
      throw new Error(`任务 ${task.id} 缺少标题或目标说明`)
    }

    const normalized = { ...task, dependsOn: Array.isArray(task.dependsOn) ? [...new Set(task.dependsOn)] : [] }
    byId.set(task.id, normalized)
    incoming[task.id] = 0
    outgoing[task.id] = []
  }

  // 边构建 - 直接操作数组和对象
  for (const task of byId.values()) {
    for (const dependency of task.dependsOn) {
      if (!byId.has(dependency) || dependency === task.id) {
        throw new Error(`任务 ${task.id} 依赖了无效任务：${dependency}`)
      }
      incoming[task.id]++
      outgoing[dependency].push(task.id)
    }
  }

  // Kahn 算法 - 避免 filter，直接收集入度为 0 的节点
  const ready = []
  for (const id in incoming) {
    if (incoming[id] === 0) ready.push(id)
  }

  const ordered = []
  while (ready.length) {
    const id = ready.shift()
    ordered.push(byId.get(id))

    for (const childId of outgoing[id]) {
      // 使用前置递减，减少一次赋值
      if (--incoming[childId] === 0) ready.push(childId)
    }
  }

  if (ordered.length !== tasks.length) throw new Error('任务依赖存在循环，无法执行 DAG')
  return ordered
}

async function runOneTask(task, {
  execute,
  onTaskChange,
  signal,
  getTaskSignal,
  results,
  failed,
  parallelWriteIsolation = false,
}) {
  const perTaskSignal = getTaskSignal?.(task.id)
  const taskSignal = perTaskSignal && signal
    ? AbortSignal.any([signal, perTaskSignal])
    : perTaskSignal ?? signal
  const isCancelled = () => signal?.aborted || taskSignal?.aborted
  if (isCancelled()) {
    failed.add(task.id)
    await onTaskChange?.({ ...task, status: 'cancelled', statusLabel: '已停止' })
    return
  }
  const blockedBy = task.dependsOn.find((dependency) => failed.has(dependency))
  if (blockedBy) {
    failed.add(task.id)
    await onTaskChange?.({ ...task, status: 'review', statusLabel: `依赖任务 ${blockedBy} 未完成` })
    return
  }

  const running = { ...task, status: 'running', statusLabel: '执行中' }
  await onTaskChange?.(running)
  try {
    const dependencyResults = Object.fromEntries(task.dependsOn.map((id) => [id, results.get(id)]))
    const result = await execute(running, dependencyResults, taskSignal, { parallelWriteIsolation })
    if (isCancelled()) {
      failed.add(task.id)
      await onTaskChange?.({ ...running, status: 'cancelled', statusLabel: '已停止' })
      return
    }
    if (result?.completionAssessment?.complete === false) {
      failed.add(task.id)
      const reason = String(result.completionAssessment.reason || '执行证据不足')
      await onTaskChange?.({
        ...running,
        status: 'review',
        statusLabel: /验证|验收/.test(reason) ? reason : `证据不足：${reason}`,
        error: reason,
      }, { result, incomplete: true })
      return
    }
    results.set(task.id, result)
    await onTaskChange?.({ ...running, status: 'done', statusLabel: '已完成' }, { result })
  } catch (error) {
    failed.add(task.id)
    if (isCancelled()) {
      await onTaskChange?.({ ...running, status: 'cancelled', statusLabel: '已停止' })
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    const statusLabel = ['ETASK_TIMEOUT', 'ETASK_IDLE_TIMEOUT'].includes(error?.code)
      ? '超时'
      : error?.code === 'WORKTREE_MERGE_CONFLICT'
        ? '上游改动冲突'
        : '需要处理'
    await onTaskChange?.({ ...running, status: 'review', statusLabel, error: message }, { error })
  }
}

/**
 * 逆拓扑顺序计算关键路径，避免展开子节点数组。
 */
function computeCriticalPath(ordered, dependents) {
  const depth = Object.create(null)

  // 初始化所有节点深度为 1
  for (const task of ordered) {
    depth[task.id] = 1
  }

  // 反向遍历，每个节点深度 = 1 + max(子节点深度)
  for (let i = ordered.length - 1; i >= 0; i--) {
    const id = ordered[i].id
    const children = dependents.get(id)

    if (!children || children.length === 0) continue

    let maxChildDepth = 0
    for (const childId of children) {
      const childDepth = depth[childId]
      if (childDepth > maxChildDepth) maxChildDepth = childDepth
    }
    depth[id] = 1 + maxChildDepth
  }

  return depth
}

/**
 * Schedule newly-ready nodes without waiting for an unrelated task wave to drain.
 * Read-only work may overlap. Implementation work may overlap only when the
 * caller opted in and every writer has isolated, non-overlapping write scopes.
 * Test tasks remain exclusive so they never share a workspace with active writers.
 */
export async function executeDag(tasks, {
  execute,
  onTaskChange,
  signal,
  getTaskSignal,
  maxConcurrency = null,
  maxConcurrencyPerProvider = null,
  maxNodes = DAG_NODE_LIMIT_DEFAULT,
  getTaskProvider = (task) => task?.provider ?? task?.modelProvider ?? String(task?.modelKey ?? '').split('/')[0] ?? '',
  allowParallelImplementation = false,
  checkBudget = null,
  pauseGate = null,
  initialResults: seededResults = null,
  initialFailedIds = [],
  pendingTaskIds = null,
  stateBatchWindowMs = 40,
}) {
  if (maxConcurrency !== null && (!Number.isInteger(maxConcurrency) || maxConcurrency < 1)) {
    throw new Error('DAG 并发上限必须是正整数')
  }
  if (maxConcurrencyPerProvider !== null
    && (!Number.isInteger(maxConcurrencyPerProvider) || maxConcurrencyPerProvider < 1)) {
    throw new Error('DAG 提供方并发上限必须是正整数')
  }

  const executionController = new AbortController()
  signal = signal
    ? AbortSignal.any([signal, executionController.signal])
    : executionController.signal
  const batcher = typeof onTaskChange === 'function'
    ? new TaskChangeBatcher(onTaskChange, {
      windowMs: stateBatchWindowMs,
      onFailure: (error) => executionController.abort(error),
    })
    : null
  const notifyTaskChange = batcher
    ? (task, meta) => batcher.dispatch(task, meta)
    : onTaskChange

  const ordered = validateAndOrderTasks(tasks, { maxNodes })
  const byId = new Map(ordered.map((task) => [task.id, task]))
  const orderIndex = new Map(ordered.map((task, index) => [task.id, index]))
  const dependents = new Map(ordered.map((task) => [task.id, []]))
  for (const task of ordered) {
    for (const dependencyId of task.dependsOn) dependents.get(dependencyId)?.push(task.id)
  }

  // 优化的关键路径计算
  const remainingPath = computeCriticalPath(ordered, dependents)

  const pendingIds = pendingTaskIds === null ? new Set(ordered.map((task) => task.id)) : new Set(pendingTaskIds)
  for (const id of pendingIds) {
    if (!byId.has(id)) throw new Error(`DAG 待执行节点不存在：${id}`)
  }
  const results = seededResults instanceof Map ? new Map(seededResults) : new Map(Object.entries(seededResults ?? {}))
  for (const id of results.keys()) {
    if (!byId.has(id) || pendingIds.has(id)) throw new Error(`DAG 已完成节点状态无效：${id}`)
  }
  const pending = new Set([...pendingIds].filter((id) => !results.has(id)))
  const failed = new Set(initialFailedIds.filter((id) => byId.has(id) && !pending.has(id) && !results.has(id)))
  const running = new Map()
  const runningTasks = new Map()
  const concurrencyLimit = maxConcurrency ?? ordered.length

  // 创建增量就绪队列 - 避免每轮都过滤整个任务数组
  const readyQueue = new IncrementalReadyQueue(
    ordered.filter((task) => pending.has(task.id)),
    dependents
  )
  // Seeded results are already-completed nodes. Account for their outgoing
  // edges so pending descendants only wait on dependencies that still need to run.
  for (const id of results.keys()) readyQueue.markCompleted(id)

  const cancelAllPending = async (statusLabel = '已停止') => {
    for (const id of [...pending]) {
      const task = byId.get(id)
      pending.delete(id)
      failed.add(id)
      readyQueue.remove(id)
      await notifyTaskChange?.({ ...task, status: 'cancelled', statusLabel })
    }
  }

  try {
    while (pending.size > 0) {
      await pauseGate?.()
      if (signal?.aborted) {
        await cancelAllPending()
      } else if (checkBudget) {
        const budgetExceededReason = await checkBudget()
        if (budgetExceededReason) {
          await cancelAllPending(budgetExceededReason)
          break
        }
      }

      for (const id of [...pending]) {
        const task = byId.get(id)
        if (getTaskSignal?.(id)?.aborted) {
          pending.delete(id)
          failed.add(id)
          readyQueue.remove(id)
          await notifyTaskChange?.({ ...task, status: 'cancelled', statusLabel: '已停止' })
          continue
        }
        const blocked = task.dependsOn.find((dependency) => failed.has(dependency))
        if (blocked) {
          pending.delete(id)
          failed.add(id)
          readyQueue.remove(id)
          await notifyTaskChange?.({ ...task, status: 'review', statusLabel: `依赖任务 ${blocked} 未完成` })
        }
      }

      // 使用增量就绪队列替代全量过滤
      const ready = readyQueue.getAllReady((a, b) =>
        (remainingPath[b.id] ?? 0) - (remainingPath[a.id] ?? 0) ||
        (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)
      )

      let readyWithinProviderLimit = ready
      if (maxConcurrencyPerProvider !== null) {
        const activeByProvider = new Map()
        for (const activeTask of runningTasks.values()) {
          const provider = String(getTaskProvider(activeTask) ?? '').trim() || 'unknown'
          activeByProvider.set(provider, (activeByProvider.get(provider) ?? 0) + 1)
        }
        readyWithinProviderLimit = []
        for (const task of ready) {
          const provider = String(getTaskProvider(task) ?? '').trim() || 'unknown'
          const activeForProvider = activeByProvider.get(provider) ?? 0
          if (activeForProvider >= maxConcurrencyPerProvider) continue
          readyWithinProviderLimit.push(task)
          activeByProvider.set(provider, activeForProvider + 1)
        }
      }

      if (!signal?.aborted && readyWithinProviderLimit.length > 0) {
        const availableSlots = Math.max(0, concurrencyLimit - running.size)
        const activeTasks = [...runningTasks.values()]
        const runningIsReadOnly = activeTasks.every((task) => isReadOnlyTaskType(task.taskType))
        const readyIsReadOnly = readyWithinProviderLimit.every((task) => isReadOnlyTaskType(task.taskType))
        const readyImplementations = readyWithinProviderLimit.filter((task) => task.taskType === 'implementation')
        const canRunIsolatedWriters = allowParallelImplementation
          && readyImplementations.length > 0
          && activeTasks.every((task) => task.parallelWriteIsolation)
          // Read-only nodes in the same ready set must not suppress a safe
          // implementation batch; only active and ready writers share scopes.
          && canRunScopedImplementationTasksConcurrently([...activeTasks, ...readyImplementations])

        const launch = (task, parallelWriteIsolation = false) => {
          pending.delete(task.id)
          readyQueue.remove(task.id)
          const promise = runOneTask(task, {
            execute,
            onTaskChange: notifyTaskChange,
            signal,
            getTaskSignal,
            results,
            failed,
            parallelWriteIsolation,
          }).finally(() => {
            running.delete(task.id)
            runningTasks.delete(task.id)
            // 任务完成后，增量更新就绪队列
            readyQueue.markCompleted(task.id)
          })
          running.set(task.id, promise)
          runningTasks.set(task.id, { ...task, parallelWriteIsolation })
        }

        if (availableSlots > 0) {
          if (canRunIsolatedWriters) {
            for (const task of readyImplementations.slice(0, availableSlots)) launch(task, true)
          } else if (running.size === 0 && !canRunSubtasksInParallel(readyWithinProviderLimit)) {
            // Preserve the existing stable order for mixed/read-write ready nodes.
            launch(readyWithinProviderLimit[0])
          } else if (runningIsReadOnly && readyIsReadOnly) {
            // A newly-ready read-only node can start as soon as a slot opens; it
            // does not wait for unrelated read-only siblings to finish.
            for (const task of readyWithinProviderLimit.slice(0, availableSlots)) launch(task)
          }
        }
      }

      if (running.size > 0) {
        await Promise.race(running.values())
      } else if (pending.size > 0) {
        // A validated DAG with no running node and no ready node has no path to
        // progress (for example, every remaining branch depends on a failed node).
        // Failed dependencies are normally removed above; leave any unexpected
        // remainder visible as failed instead of spinning forever.
        for (const id of [...pending]) {
          const task = byId.get(id)
          const blockedBy = task.dependsOn.find((dependency) => failed.has(dependency))
          pending.delete(id)
          failed.add(id)
          readyQueue.remove(id)
          await notifyTaskChange?.({
            ...task,
            status: 'review',
            statusLabel: blockedBy ? `依赖任务 ${blockedBy} 未完成` : 'DAG 无法继续调度',
          })
        }
      }
    }

    // A cancellation can empty the pending set while active runs are still
    // unwinding. Do not return before their cancellation and status updates settle.
    if (running.size > 0) await Promise.all(running.values())

    return { results, failed, cancelled: Boolean(signal?.aborted) }
  } catch (error) {
    executionController.abort(error)
    throw error
  } finally {
    // An evidence-persistence failure can reject one node while siblings are
    // still unwinding. Settle them before the caller releases run resources.
    await Promise.allSettled(running.values())
    try {
      await batcher?.flush()
    } finally {
      batcher?.dispose()
    }
  }
}
