import {
  Z_APPROVAL_PROMPT_TIMEOUT_MS,
  Z_APPROVAL_PROMPT_GRACE_PERIOD_MS,
} from '../config.mjs'
import { resolveDshApprovalBridgeAction } from '../dsh-permission-map.mjs'

/**
 * DSH approval RPC bridge + renderer permission prompts + user-question flow.
 */
export function createDshApprovalBridge({
  pendingApprovals,
  pendingQuestions,
  getEnsureReady,
  hostManager,
  getReadyPromise,
  logApprovalEvent,
  getPermissionMode,
}) {
  function registerPendingApproval(id, entry) {
    if (pendingApprovals.has(id)) return false

    const cleanupTimeoutId = setTimeout(() => {
      if (pendingApprovals.get(id) === entry) {
        console.error(`Approval ${id} 未在超时时间内处理，强制清理以防止内存泄漏`)
        pendingApprovals.delete(id)
        if (entry?.timeoutId) clearTimeout(entry.timeoutId)
        if (entry?.cleanupTimeoutId) clearTimeout(entry.cleanupTimeoutId)
      }
    }, Z_APPROVAL_PROMPT_TIMEOUT_MS + Z_APPROVAL_PROMPT_GRACE_PERIOD_MS)
    cleanupTimeoutId.unref?.()

    entry.cleanupTimeoutId = cleanupTimeoutId
    pendingApprovals.set(id, entry)
    return true
  }

  async function sendApprovalOutcome(pending, allowed) {
    const api = await getEnsureReady()
    await api.respond({
      type: 'client-response',
      rpcId: pending.rpcId,
      result: {
        ok: true,
        value: {
          sessionId: pending.sessionId,
          approvalId: pending.approvalId,
          outcome: allowed === true ? 'allowed-once' : 'rejected',
        },
      },
    })
  }

  function clearApprovalTimer(pending) {
    if (pending?.timeoutId) clearTimeout(pending.timeoutId)
    if (pending?.cleanupTimeoutId) clearTimeout(pending.cleanupTimeoutId)
  }

  async function settleApproval(id, response, { skipMapDelete = false } = {}) {
    const pending = pendingApprovals.get(id)
    if (!pending) return false
    if (!skipMapDelete) pendingApprovals.delete(id)
    clearApprovalTimer(pending)
    const allowed = response?.action === 'allow-once' || response?.action === 'allow'
    if (logApprovalEvent && pending.conversationId) {
      const outcome = allowed
        ? 'allowed-once'
        : (response?.reason === 'timeout' ? 'timeout' : 'denied')
      void Promise.resolve(logApprovalEvent(pending.conversationId, 'approval/decided', {
        id,
        outcome,
        reason: response?.reason,
      })).catch(() => {})
    }
    await sendApprovalOutcome(pending, allowed)
    return true
  }

  async function rejectPendingApprovals({ conversationId = null, reason = 'context-changed' } = {}) {
    const targets = [...pendingApprovals.entries()].filter(([, entry]) =>
      !conversationId || entry.conversationId === conversationId,
    )
    for (const [id] of targets) {
      await settleApproval(id, { action: 'deny', reason }).catch(() => {})
    }
    return targets.length
  }

  function emitPermission(conversationId, webContents, frame, permissionMode) {
    const id = `dsh-approval-${frame.sessionId}-${frame.approvalId}`
    const bridgeAction = resolveDshApprovalBridgeAction(permissionMode, frame)
    if (bridgeAction === 'allow') {
      const registered = registerPendingApproval(id, {
        rpcId: frame.rpcId,
        sessionId: frame.sessionId,
        approvalId: frame.approvalId,
        conversationId,
      })
      if (!registered) return
      void settleApproval(id, { action: 'allow-once' })
      return
    }
    if (!webContents || webContents.isDestroyed?.()) {
      const registered = registerPendingApproval(id, {
        rpcId: frame.rpcId,
        sessionId: frame.sessionId,
        approvalId: frame.approvalId,
        conversationId,
      })
      if (!registered) return
      void settleApproval(id, { action: 'deny' })
      return
    }
    const timeoutId = setTimeout(() => {
      void settleApproval(id, { action: 'deny', reason: 'timeout' })
    }, Z_APPROVAL_PROMPT_TIMEOUT_MS)
    timeoutId.unref?.()
    const registered = registerPendingApproval(id, {
      rpcId: frame.rpcId,
      sessionId: frame.sessionId,
      approvalId: frame.approvalId,
      conversationId,
      timeoutId,
    })
    if (!registered) {
      clearTimeout(timeoutId)
      return
    }
    try {
      if (logApprovalEvent && conversationId) {
        void Promise.resolve(logApprovalEvent(conversationId, 'approval/asked', {
          id,
          toolName: frame.toolName || 'Z 工具',
          reason: frame.reason || '该操作需要权限确认。',
        })).catch(() => {})
      }
      webContents.send('permission:prompt', {
        id,
        conversationId,
        tool: frame.toolName || 'Z 工具',
        reason: frame.reason || '该操作需要权限确认。',
        detail: frame.reason || 'Z 请求执行需要授权的操作。',
        allowAlways: false,
      })
    } catch {
      void settleApproval(id, { action: 'deny' })
    }
  }

  function emitUserQuestion(conversationId, webContents, envelope) {
    const id = envelope.rpcId
    if (typeof id !== 'string' || !id) return
    const existing = pendingQuestions.get(id)
    if (existing) {
      if (webContents && !webContents.isDestroyed?.() && existing.webContents !== webContents) {
        existing.webContents = webContents
        webContents.send('user-question:prompt', {
          id, conversationId, questions: existing.questions,
        })
      }
      return
    }
    if (!conversationId) {
      void Promise.resolve(hostManager.getApi?.() ?? getReadyPromise()).then(api => api?.respond({
        type: 'client-response', rpcId: id,
        result: { ok: false, error: { code: 'cancelled', message: 'Conversation is unavailable.' } },
      })).catch(() => {})
      return
    }
    const entry = {
      rpcId: id,
      sessionId: envelope.payload.sessionId,
      conversationId,
      questions: envelope.payload.questions,
      webContents,
    }
    pendingQuestions.set(id, entry)
    if (!webContents || webContents.isDestroyed?.()) return
    try {
      webContents.send('user-question:prompt', {
        id, conversationId, questions: entry.questions,
      })
    } catch (error) {
      console.error('发送用户问题提示失败：', error)
    }
  }

  async function answerUserQuestion(id, answer) {
    const pending = pendingQuestions.get(id)
    if (!pending) return false
    const api = await getEnsureReady()
    const receipt = await api.respond({
      type: 'client-response',
      rpcId: pending.rpcId,
      result: { ok: true, value: { sessionId: pending.sessionId, answer } },
    })
    if (receipt?.accepted === false) return false
    pendingQuestions.delete(id)
    return true
  }

  async function cancelUserQuestion(id) {
    const pending = pendingQuestions.get(id)
    if (!pending) return false
    const api = await getEnsureReady()
    const receipt = await api.respond({
      type: 'client-response',
      rpcId: pending.rpcId,
      result: {
        ok: false,
        error: {
          code: 'cancelled',
          message: 'the user dismissed the question to speak instead',
          details: {},
        },
      },
    })
    if (receipt?.accepted === false) return false
    pendingQuestions.delete(id)
    return true
  }

  async function respondApproval(id, response) {
    if (response?.action === 'deny') return settleApproval(id, { action: 'deny' })
    if (response?.action === 'allow-once' || response?.action === 'allow') {
      return settleApproval(id, { action: 'allow-once' })
    }
    return false
  }

  return {
    registerPendingApproval,
    settleApproval,
    rejectPendingApprovals,
    emitPermission,
    emitUserQuestion,
    answerUserQuestion,
    cancelUserQuestion,
    respondApproval,
  }
}
