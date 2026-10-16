import {
  commitNodeResult,
  createIntegrationWorktree,
  createNodeWorktree,
} from '../worktree-service.mjs'

const WRITING_TASK_TYPES = new Set(['implementation', 'test'])
const WORKTREE_TASK_TYPES = new Set(['implementation', 'test', 'review'])

function getAncestorWriters(task, tasksById, writerBranches, orderedIds) {
  const visited = new Set()
  const ancestors = new Set()
  const visit = (current) => {
    for (const dependencyId of current?.dependsOn ?? []) {
      if (visited.has(dependencyId)) continue
      visited.add(dependencyId)
      const dependency = tasksById.get(dependencyId)
      if (!dependency) continue
      if (WRITING_TASK_TYPES.has(dependency.taskType) && writerBranches.has(dependencyId)) {
        ancestors.add(dependencyId)
      }
      visit(dependency)
    }
  }
  visit(task)
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
}) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]))
  const orderedIds = tasks.map((task) => task.id)
  const writerBranches = initialWriterBranches instanceof Map
    ? new Map(initialWriterBranches)
    : new Map(Object.entries(initialWriterBranches ?? {}))

  return {
    enabled: enabled === true,
    async create(task) {
      if (!enabled || !WORKTREE_TASK_TYPES.has(task.taskType)) return null
      const mergeFrom = getAncestorWriters(task, tasksById, writerBranches, orderedIds)
      return createNodeWorktree({
        workspacePath,
        conversationId,
        runId,
        taskId: task.id,
        userDataPath,
        baseCommit,
        mergeFrom,
        signal,
      })
    },
    async commit(task) {
      if (!enabled || !WRITING_TASK_TYPES.has(task.taskType)) return null
      const result = await commitNodeResult({
        workspacePath,
        conversationId,
        runId,
        taskId: task.id,
        userDataPath,
        summary: `TaskWeaver ${task.taskType} ${task.id}: ${task.title}`,
        signal,
      })
      writerBranches.set(task.id, result.branchName)
      return result
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
  }
}
