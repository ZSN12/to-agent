import path from 'node:path'

/**
 * Prevent destructive workspace operations from racing an Agent writing to
 * the same project, while allowing unrelated workspaces to keep running.
 */
export function createWorkspaceOperationGuard(getConversationRuntimeContext) {
  const lockedWorkspaces = new Set()

  async function assertConversationCanRun(conversationId, workspacePath = null) {
    const context = workspacePath
      ? { workspacePath }
      : await getConversationRuntimeContext(conversationId)
    if (context?.workspacePath && lockedWorkspaces.has(path.resolve(context.workspacePath))) {
      throw new Error('此工作区正在执行文件或恢复点操作，请稍后重试 Agent 任务')
    }
  }

  async function withWorkspaceOperation(workspacePath, busyConversationIds, operation) {
    if (!workspacePath) return operation()
    const targetPath = path.resolve(workspacePath)
    if (lockedWorkspaces.has(targetPath)) {
      throw new Error('此工作区正在执行其他文件恢复操作，请稍后重试')
    }
    // Reserve synchronously before the first await. A new Agent turn checks
    // this same set after claiming its conversation lock, closing the race
    // between the busy check and the actual file operation.
    lockedWorkspaces.add(targetPath)
    try {
      for (const conversationId of busyConversationIds) {
        const runtimeContext = await getConversationRuntimeContext(conversationId)
        if (!runtimeContext?.workspacePath) {
          throw new Error('有会话正在运行，无法确认其工作区；请稍后再执行工作区变更')
        }
        if (path.resolve(runtimeContext.workspacePath) === targetPath) {
          throw new Error('此工作区仍有会话正在执行任务，请等待完成后再修改文件或恢复点')
        }
      }
      return await operation()
    } finally {
      lockedWorkspaces.delete(targetPath)
    }
  }

  return { assertConversationCanRun, withWorkspaceOperation }
}
