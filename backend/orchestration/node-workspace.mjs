import {
  captureNodeWorktreeFailureEvidence,
  commitNodeResult,
  createIntegrationWorktree,
  createNodeWorktree,
  removeTaskWorktree,
  resetNodeWorktree,
} from '../worktree-service.mjs'

const WRITING_TASK_TYPES = new Set(['implementation', 'test'])
const WORKTREE_TASK_TYPES = new Set(['implementation', 'test', 'review'])

function getAncestorWriters(task, tasksById, writerBranches, orderedIds) {
  const visited = new Set()
  const ancestors = new Set()
  const stack = []
  const initialDependencies = task?.dependsOn ?? []
  for (let index = initialDependencies.length - 1; index >= 0; index -= 1) {
    const dependencyId = initialDependencies[index]
    if (visited.has(dependencyId)) continue
    visited.add(dependencyId)
    stack.push(dependencyId)
  }

  while (stack.length > 0) {
    const dependencyId = stack.pop()
    const dependency = tasksById.get(dependencyId)
    if (!dependency) continue
    if (WRITING_TASK_TYPES.has(dependency.taskType) && writerBranches.has(dependencyId)) {
      ancestors.add(dependencyId)
    }

    const dependencies = dependency.dependsOn ?? []
    for (let index = dependencies.length - 1; index >= 0; index -= 1) {
      const ancestorId = dependencies[index]
      if (visited.has(ancestorId)) continue
      visited.add(ancestorId)
      stack.push(ancestorId)
    }
  }

  return orderedIds.filter((id) => ancestors.has(id)).map((id) => writerBranches.get(id))
}

/** Owns the run's Git branch graph and keeps uncommitted changes in the UI-only worktrees. */
export function createNodeWorkspaceRegistry({
  enabled,
  workspacePath,
  conversationId,
  runId,
  userDataPath,
  baseCommit,
  tasks,
  signal,
  initialWriterBranches = null,
  resumeTaskRunIds = null,
}) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]))
  const orderedIds = tasks.map((task) => task.id)
  const writerBranches = initialWriterBranches instanceof Map
    ? new Map(initialWriterBranches)
    : new Map(Object.entries(initialWriterBranches ?? {}))
  const resumedTaskRunIds = resumeTaskRunIds instanceof Map
    ? new Map(resumeTaskRunIds)
    : new Map(Object.entries(resumeTaskRunIds ?? {}))
  const runIdForTask = (task) => resumedTaskRunIds.get(task.id) || runId
  const createdWorktrees = new Map()

  return {
    enabled: enabled === true,
    async create(task) {
      if (!enabled || !WORKTREE_TASK_TYPES.has(task.taskType)) return null
      const mergeFrom = getAncestorWriters(task, tasksById, writerBranches, orderedIds)
      const taskRunId = runIdForTask(task)
      const result = await createNodeWorktree({
        workspacePath,
        conversationId,
        runId: taskRunId,
        taskId: task.id,
        userDataPath,
        baseCommit,
        mergeFrom,
        signal,
      })
      createdWorktrees.set(task.id, {
        taskId: task.id,
        path: result.path,
        runId: taskRunId,
      })
      return { ...result, resumedFromCheckpoint: resumedTaskRunIds.has(task.id) }
    },
    async commit(task) {
      if (!enabled || !WRITING_TASK_TYPES.has(task.taskType)) return null
      const result = await commitNodeResult({
        workspacePath,
        conversationId,
        runId: runIdForTask(task),
        taskId: task.id,
        userDataPath,
        summary: `TaskWeaver ${task.taskType} ${task.id}: ${task.title}`,
        signal,
      })
      writerBranches.set(task.id, result.branchName)
      return result
    },
    async captureFailureEvidence(task, { startCommit } = {}) {
      return captureNodeWorktreeFailureEvidence({
        workspacePath, conversationId, runId: runIdForTask(task),
        taskId: task.id, userDataPath, startCommit,
      })
    },
    async reset(task, { startCommit } = {}) {
      return resetNodeWorktree({
        workspacePath, conversationId, runId: runIdForTask(task),
        taskId: task.id, userDataPath, startCommit,
      })
    },
    async createIntegration() {
      if (!enabled || writerBranches.size === 0) return null
      return createIntegrationWorktree({
        workspacePath,
        conversationId,
        runId,
        userDataPath,
        baseCommit,
        mergeFrom: orderedIds.map((id) => writerBranches.get(id)).filter(Boolean),
        signal,
      })
    },
    getWriterBranches() {
      return new Map(writerBranches)
    },
    async cleanupAll({ completedTaskIds = null, preserveTaskIds = new Set() } = {}) {
      if (!enabled) return { cleaned: [], preserved: [], errors: [] }
      const completedFilter = completedTaskIds
        ? (completedTaskIds instanceof Set ? completedTaskIds : new Set(completedTaskIds))
        : null
      const preserveFilter = preserveTaskIds instanceof Set ? preserveTaskIds : new Set(preserveTaskIds ?? [])

      const cleaned = []
      const preserved = []
      const errors = []

      for (const [taskId, info] of Array.from(createdWorktrees.entries())) {
        if (taskId === 'integration') {
          preserved.push({ taskId, reason: 'integration_preview' })
          continue
        }
        if (preserveFilter.has(taskId)) {
          preserved.push({ taskId, reason: 'preserved' })
          continue
        }
        if (completedFilter && !completedFilter.has(taskId)) {
          preserved.push({ taskId, reason: 'not_completed' })
          continue
        }

        try {
          const removeRes = await removeTaskWorktree({
            workspacePath,
            conversationId,
            runId: info.runId,
            taskId,
            userDataPath,
          })
          if (removeRes.removed) {
            cleaned.push(taskId)
            createdWorktrees.delete(taskId)
          } else {
            preserved.push({ taskId, reason: 'not_found' })
          }
        } catch (err) {
          preserved.push({ taskId, reason: err instanceof Error ? err.message : String(err) })
        }
      }

      return { cleaned, preserved, errors }
    },
  }
}
