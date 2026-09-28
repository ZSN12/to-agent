import { canRunSubtasksInParallel } from './task-profile.mjs'

export function validateAndOrderTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length < 2 || tasks.length > 6) {
    throw new Error('多 Agent 计划必须包含 2 到 6 个子任务')
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

async function runOneTask(task, { execute, onTaskChange, signal, results, failed }) {
  if (signal?.aborted) {
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
    const result = await execute(running, dependencyResults)
    if (signal?.aborted) {
      failed.add(task.id)
      await onTaskChange?.({ ...running, status: 'cancelled', statusLabel: '已停止' })
      return
    }
    results.set(task.id, result)
    await onTaskChange?.({ ...running, status: 'done', statusLabel: '已完成' }, { result })
  } catch (error) {
    failed.add(task.id)
    if (signal?.aborted) {
      await onTaskChange?.({ ...running, status: 'cancelled', statusLabel: '已停止' })
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    await onTaskChange?.({ ...running, status: 'review', statusLabel: '需要处理', error: message })
  }
}

/**
 * 波次调度：同一波中若全是 research/review 则并行；含 implementation/test 则串行，避免写冲突。
 */
export async function executeDag(tasks, { execute, onTaskChange, signal }) {
  const ordered = validateAndOrderTasks(tasks)
  const byId = new Map(ordered.map((task) => [task.id, task]))
  const pending = new Set(ordered.map((task) => task.id))
  const results = new Map()
  const failed = new Set()

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
      break
    }

    for (const id of [...pending]) {
      const task = byId.get(id)
      const blocked = task.dependsOn.find((dependency) => failed.has(dependency))
      if (blocked) {
        pending.delete(id)
        failed.add(id)
        await onTaskChange?.({ ...task, status: 'review', statusLabel: `依赖任务 ${blocked} 未完成` })
      }
    }

    const ready = [...pending].filter((id) => {
      const task = byId.get(id)
      return task.dependsOn.every((dependency) => results.has(dependency))
    })

    if (!ready.length) break

    const batch = ready.map((id) => byId.get(id))
    const runner = async (task) => {
      pending.delete(task.id)
      await runOneTask(task, { execute, onTaskChange, signal, results, failed })
    }

    if (canRunSubtasksInParallel(batch)) {
      await Promise.all(batch.map((task) => runner(task)))
    } else {
      for (const task of batch) {
        await runner(task)
      }
    }
  }

  return { results, failed, cancelled: Boolean(signal?.aborted) }
}
