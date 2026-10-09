import { ipcHandle } from '../ipc-utils.mjs'
import { routePermissionPromptResponse } from '../permission-prompt-bridge.mjs'

/**
 * @param {{
 *   ipcMain: import('electron').IpcMain,
 *   refreshWorkspaceCache: () => Promise<void>,
 *   getCachedWorkspace: () => string | null,
 *   permissionRulesStore: {
 *     listRules: (opts: { workspacePath: string | null }) => Promise<unknown>,
 *     addRule: (rule: unknown) => Promise<unknown>,
 *     removeRule: (ruleId: string) => Promise<unknown>,
 *     clearRules: (opts: { workspacePath?: string | null, globalOnly?: boolean }) => Promise<unknown>,
 *   },
 *   approvalAudit: { listRecent: (conversationId: string, limit: number) => Promise<unknown[]> },
 *   resolveIpcConversationId: (requested?: string | null) => Promise<string | null>,
 *   chat: { respondApproval: (id: string, decision: unknown) => Promise<unknown>, answerUserQuestion: (id: string, answer: unknown) => Promise<boolean>, cancelUserQuestion: (id: string) => Promise<boolean> },
 * }} ctx
 */
export function registerPermissionsIpc(ctx) {
  const {
    ipcMain,
    refreshWorkspaceCache,
    getCachedWorkspace,
    permissionRulesStore,
    approvalAudit,
    resolveIpcConversationId,
    chat,
  } = ctx

  ipcHandle(ipcMain, 'permission:listRules', async () => {
    await refreshWorkspaceCache()
    return permissionRulesStore.listRules({ workspacePath: getCachedWorkspace() })
  })

  ipcHandle(ipcMain, 'permission:addRule', async (_event, rule) => {
    await refreshWorkspaceCache()
    const cachedWorkspace = getCachedWorkspace()
    const enriched = {
      ...rule,
      workspacePath: rule?.scope === 'workspace' ? (rule.workspacePath || cachedWorkspace) : null,
    }
    return permissionRulesStore.addRule(enriched)
  })

  ipcHandle(ipcMain, 'permission:removeRule', async (_event, ruleId) => {
    return permissionRulesStore.removeRule(ruleId)
  })

  ipcHandle(ipcMain, 'permission:clearRules', async (_event, options) => {
    await refreshWorkspaceCache()
    return permissionRulesStore.clearRules({
      workspacePath: options?.workspaceOnly ? getCachedWorkspace() : undefined,
      globalOnly: options?.globalOnly,
    })
  })

  ipcHandle(ipcMain, 'permission:listApprovalAudit', async (_event, requestedConversationId) => {
    const conversationId = await resolveIpcConversationId(requestedConversationId)
    if (!conversationId) return []
    const rows = await approvalAudit.listRecent(conversationId, 30)
    return rows.map((row) => ({
      type: row.type,
      time: row.timestamp ?? row.time ?? 0,
      conversationId,
      id: row.id,
      toolName: row.toolName,
      callId: row.callId,
      reason: row.reason,
      outcome: row.outcome,
      risk: row.risk,
      decision: row.decision,
      verdict: row.verdict,
    }))
  })

  ipcHandle(ipcMain, 'permission:respondPrompt', async (_event, id, response) => {
    const ok = await routePermissionPromptResponse(id, response, {
      respondHostApproval: (approvalId, decision) => chat.respondApproval(approvalId, decision),
    })
    return { ok }
  })

  ipcHandle(ipcMain, 'userQuestions:answer', async (_event, id, answer) => ({
    ok: await chat.answerUserQuestion(id, answer),
  }))

  ipcHandle(ipcMain, 'userQuestions:cancel', async (_event, id) => ({
    ok: await chat.cancelUserQuestion(id),
  }))
}
