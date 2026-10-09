import {
  canRunScopedImplementationTasksConcurrently,
  canRunSubtasksInParallel,
  isReadOnlyTaskType,
} from './task-profile.mjs'

export function validateAndOrderTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 6) {
    throw new Error('DAG 计划必须包含 1 到 6 个子任务')
  }

  const byId = new Map()
  for (const task of tasks) {
    if (!task || typeof task.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(task.id)) {
      throw new Error('DAG 中存在无效的任务 ID')
    }
    if (byId.has(task.id)) throw new Error(`DAG 中任务 ID 重复：${task.id}`)
    if (typeof task.title !== 'string' || !task.title.trim() || typeof task.description !== 'string' || !task.description.trim()) {
      throw new Error(`任务 ${task.id} 缺少标题或目标说明`)
    }
    byId.set(task.id, { ...task, dependsOn: Array.isArray(task.dependsOn) ? [...new Set(task.dependsOn)] : [] })
  }

  const incoming = new Map([...byId.keys()].map((id) => [id, 0]))
  const outgoing = new Map([...byId.keys()].map((id) => [id, []]))
  for (const task of byId.values()) {
    for (const dependency of task.dependsOn) {
      if (!byId.has(dependency) || dependency === task.id) {
        throw new Error(`任务 ${task.id} 依赖了无效任务：${dependency}`)
      }
      incoming.set(task.id, incoming.get(task.id) + 1)
      outgoing.get(dependency).push(task.id)
    }
  }

  const ready = [...byId.keys()].filter((id) => incoming.get(id) === 0)
  const ordered = []
  while (ready.length) {
    const id = ready.shift()
    ordered.push(byId.get(id))
    for (const childId of outgoing.get(id)) {
      incoming.set(childId, incoming.get(childId) - 1)
      if (incoming.get(childId) === 0) ready.push(childId)
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
  const taskSignal = getTaskSignal?.(task.id) ?? signal
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
        statusLabel: `证据不足：${reason}`,
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
    await onTaskChange?.({ ...running, status: 'review', statusLabel: '需要处理', error: message }, { error })
  }
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
  allowParallelImplementation = false,
}) {
  if (maxConcurrency !== null && (!Number.isInteger(maxConcurrency) || maxConcurrency < 1)) {
    throw new Error('DAG 并发上限必须是正整数')
  }
  const ordered = validateAndOrderTasks(tasks)
  const byId = new Map(ordered.map((task) => [task.id, task]))
  const pending = new Set(ordered.map((task) => task.id))
  const results = new Map()
  const failed = new Set()
  const running = new Map()
  const runningTasks = new Map()
  const concurrencyLimit = maxConcurrency ?? ordered.length

  const cancelAllPending = async (statusLabel = '已停止') => {
    for (const id of [...pending]) {
      const task = byId.get(id)
      pending.delete(id)
      failed.add(id)
      await onTaskChange?.({ ...task, status: 'cancelled', statusLabel })
    }
  }

  while (pending.size > 0) {
    if (signal?.aborted) {
      await cancelAllPending()
    }

    for (const id of [...pending]) {
      const task = byId.get(id)
      if (getTaskSignal?.(id)?.aborted) {
        pending.delete(id)
        failed.add(id)
        await onTaskChange?.({ ...task, status: 'cancelled', statusLabel: '已停止' })
        continue
      }
      const blocked = task.dependsOn.find((dependency) => failed.has(dependency))
      if (blocked) {
        pending.delete(id)
        failed.add(id)
        await onTaskChange?.({ ...task, status: 'review', statusLabel: `依赖任务 ${blocked} 未完成` })
      }
    }

    const ready = ordered.filter((task) => pending.has(task.id)
      && task.dependsOn.every((dependency) => results.has(dependency)))

    if (!signal?.aborted && ready.length > 0) {
      const availableSlots = Math.max(0, concurrencyLimit - running.size)
      const activeTasks = [...runningTasks.values()]
      const runningIsReadOnly = activeTasks.every((task) => isReadOnlyTaskType(task.taskType))
      const readyIsReadOnly = ready.every((task) => isReadOnlyTaskType(task.taskType))
      const readyImplementations = ready.filter((task) => task.taskType === 'implementation')
      const canRunIsolatedWriters = allowParallelImplementation
        && readyImplementations.length > 0
        && activeTasks.every((task) => task.parallelWriteIsolation)
        // Read-only nodes in the same ready set must not suppress a safe
        // implementation batch; only active and ready writers share scopes.
        && canRunScopedImplementationTasksConcurrently([...activeTasks, ...readyImplementations])

      const launch = (task, parallelWriteIsolation = false) => {
        pending.delete(task.id)
        const promise = runOneTask(task, {
          execute,
          onTaskChange,
          signal,
          getTaskSignal,
          results,
          failed,
          parallelWriteIsolation,
        }).finally(() => {
          running.delete(task.id)
          runningTasks.delete(task.id)
        })
        running.set(task.id, promise)
        runningTasks.set(task.id, { ...task, parallelWriteIsolation })
      }

      if (availableSlots > 0) {
        if (canRunIsolatedWriters) {
          for (const task of readyImplementations.slice(0, availableSlots)) launch(task, true)
        } else if (running.size === 0 && !canRunSubtasksInParallel(ready)) {
          // Preserve the existing stable order for mixed/read-write ready nodes.
          launch(ready[0])
        } else if (runningIsReadOnly && readyIsReadOnly) {
          // A newly-ready read-only node can start as soon as a slot opens; it
          // does not wait for unrelated read-only siblings to finish.
          for (const task of ready.slice(0, availableSlots)) launch(task)
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
        await onTaskChange?.({
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
}
