import fs from 'node:fs/promises'
import path from 'node:path'
import { requiresReadOnlyPlan } from './orchestration-service.mjs'
import { clockLabelZh } from './message-factory.mjs'

/**
 * @param {{
 *   profileStore: { getActiveModelKey: () => Promise<string> },
 *   getWorkspacePathForJob: (conversationId: string | null | undefined) => Promise<string | null>,
 *   appState: import('./app-state-store.mjs').AppStateStore,
 *   permissions: { withExecution: Function },
 *   getConversationRuntimeContext: (conversationId: string) => Promise<unknown>,
 *   withTurnLock: (conversationId: string, fn: () => Promise<unknown>) => Promise<unknown>,
 *   chatTurnPipeline: { runTurn: Function },
 * }} deps
 */
export function createScheduledJobRunHandler(deps) {
  const {
    profileStore,
    getWorkspacePathForJob,
    appState,
    permissions,
    getConversationRuntimeContext,
    withTurnLock,
    chatTurnPipeline,
  } = deps

  return async function runScheduledJob(job) {
    const modelKey = await profileStore.getActiveModelKey()
    const requestedWorkspacePath = job.workspacePath || await getWorkspacePathForJob(job.conversationId)
    if (!requestedWorkspacePath) throw new Error('定时任务没有绑定工作区，请先选择工作区并重新保存任务')
    const workspacePath = await fs.realpath(path.resolve(requestedWorkspacePath))
    const workspaceStat = await fs.stat(workspacePath)
    if (!workspaceStat.isDirectory() || workspacePath === path.parse(workspacePath).root) {
      throw new Error('定时任务工作区必须是已存在的非根目录')
    }
    const conversationId = job.conversationId
    if (!conversationId) throw new Error('定时任务缺少后台会话标识')
    const permissionMode = !job.multiAgent || requiresReadOnlyPlan(job.prompt) ? 'readonly' : 'ask'
    const timestamp = Date.now()
    await appState.createBackgroundConversation({
      conversationId,
      workspacePath,
      permissionMode,
      title: `定时任务：${job.title}`,
    })
    try {
      await permissions.withExecution(permissionMode, null, async () => {
        const runtimeContext = await getConversationRuntimeContext(conversationId)
        const outcome = await withTurnLock(conversationId, () => chatTurnPipeline.runTurn({
          webContents: null,
          text: job.prompt,
          modelKey,
          skillName: null,
          executionModeOverride: job.multiAgent ? 'multi-agent' : 'single-agent',
          workMode: 'code',
          conversationId,
          runtimeContext,
        }))
        if (outcome?.needsOrchestrationChoice) {
          throw new Error(outcome.reason || '定时任务无法弹出编排模式选择')
        }
      }, { conversationId })
    } catch (error) {
      await appState.appendMessagesToConversation(conversationId, {
        id: `scheduled-${job.id}-${timestamp}-error`,
        author: 'orchestrator',
        name: 'TaskWeaver',
        time: clockLabelZh(),
        timestamp: Date.now(),
        text: `定时任务执行失败：${error instanceof Error ? error.message : String(error)}`,
      }).catch(() => {})
      throw error
    }
  }
}
