import { validateAndOrderTasks } from '../dag-scheduler.mjs'

function completedResult(task) {
  const completed = task?.status === 'done' || task?.status === 'completed' || task?.statusLabel === '已完成'
  if (!completed) return null
  const message = Array.isArray(task.messages)
    ? task.messages.findLast((item) => item?.author === 'agent')
    : null
  if (typeof message?.text !== 'string' || !message.text.trim()) return null
  return {
    text: message.text,
    usage: message.usage ?? {},
    fileChanges: Array.isArray(message.fileChanges) ? message.fileChanges : [],
    executionEvidence: message.executionEvidence ?? null,
    verification: message.verification ?? null,
    acceptanceAssessment: message.acceptanceAssessment ?? task.acceptanceAssessment ?? null,
    completionAssessment: { complete: true, reason: '' },
    worktreeIsolated: task.worktreeIsolated === true,
    ...(task.execBranch ? { execBranch: task.execBranch } : {}),
    ...(task.execCommit ? { execCommit: task.execCommit } : {}),
    ...(task.execCwd ? { execCwd: task.execCwd } : {}),
  }
}

function collectDescendants(taskId, dependents) {
  const result = new Set([taskId])
  const queue = [taskId]
  while (queue.length) {
    const current = queue.shift()
    for (const childId of dependents.get(current) ?? []) {
      if (result.has(childId)) continue
      result.add(childId)
      queue.push(childId)
    }
  }
  return result
}

/** Select reusable run-store outputs and the exact nodes that a replay may schedule. */
export function createRunReplay(sourceRun, { mode = 'checkpoint', taskId = null } = {}) {
  if (!sourceRun || !Array.isArray(sourceRun.tasks) || sourceRun.tasks.length === 0) {
    throw new Error('运行记录缺少可恢复的 DAG 节点')
  }
  const tasks = validateAndOrderTasks(sourceRun.tasks)
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const dependents = new Map(tasks.map((task) => [task.id, []]))
  for (const task of tasks) {
    for (const dependencyId of task.dependsOn ?? []) dependents.get(dependencyId).push(task.id)
  }

  let rerunIds = null
  if (mode === 'rerun') {
    if (!byId.has(taskId)) throw new Error(`运行记录中找不到节点：${taskId}`)
    rerunIds = collectDescendants(taskId, dependents)
  } else if (mode !== 'checkpoint') {
    throw new Error('运行记录重放模式无效')
  }

  const allResults = new Map()
  for (const task of tasks) {
    const result = completedResult(task)
    if (result) allResults.set(task.id, result)
  }

  if (rerunIds) {
    const requiredAncestors = new Set()
    const visitDependencies = (id) => {
      for (const dependencyId of byId.get(id)?.dependsOn ?? []) {
        if (rerunIds.has(dependencyId) || requiredAncestors.has(dependencyId)) continue
        requiredAncestors.add(dependencyId)
        visitDependencies(dependencyId)
      }
    }
    for (const id of rerunIds) visitDependencies(id)
    const missing = [...requiredAncestors].filter((id) => !allResults.has(id))
    if (missing.length) {
      throw new Error(`重跑前置节点尚未完成：${missing.join('、')}；请先从断点继续运行`)
    }
  }

  const initialResults = new Map()
  const pendingTaskIds = new Set()
  const initialFailedIds = new Set()
  for (const task of tasks) {
    const shouldRerun = rerunIds ? rerunIds.has(task.id) : !allResults.has(task.id)
    if (shouldRerun) {
      pendingTaskIds.add(task.id)
    } else if (allResults.has(task.id)) {
      initialResults.set(task.id, allResults.get(task.id))
    } else {
      initialFailedIds.add(task.id)
    }
  }
  if (pendingTaskIds.size === 0) {
    throw new Error(rerunIds ? '所选节点没有可重跑的后续任务' : '运行记录中没有未完成节点')
  }

  if (sourceRun.settings?.worktreeIsolation === true) {
    const checked = new Set()
    const requireWriterBranches = (taskId) => {
      const task = byId.get(taskId)
      if (!task || checked.has(taskId)) return
      checked.add(taskId)
      for (const dependencyId of task.dependsOn ?? []) {
        const dependency = byId.get(dependencyId)
        if (initialResults.has(dependencyId)
          && ['implementation', 'test'].includes(dependency?.taskType)
          && !dependency.execBranch) {
          throw new Error(`运行记录缺少已完成写节点 ${dependencyId} 的 worktree 分支，无法保证下游恢复使用相同代码`)
        }
        requireWriterBranches(dependencyId)
      }
    }
    for (const id of pendingTaskIds) requireWriterBranches(id)
  }

  const replayTasks = tasks.map((task) => {
    if (initialResults.has(task.id)) return { ...task, status: 'done', statusLabel: '已完成' }
    if (pendingTaskIds.has(task.id)) {
      return {
        ...task,
        status: 'queued',
        statusLabel: '排队中',
        startedAt: undefined,
        endedAt: undefined,
        duration: '',
        durationMs: null,
        error: undefined,
      }
    }
    return task
  })

  return { tasks: replayTasks, initialResults, initialFailedIds, pendingTaskIds }
}
