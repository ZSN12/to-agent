/**
 * From DSH @deepseek-ai/dsh-sandbox/escalation.ts (MIT).
 */
export const WIDER_MODES = {
  'read-only': ['workspace-write', 'danger-full-access'],
  'workspace-write': ['danger-full-access'],
}

export const ESCALATION_TARGETS = ['workspace-write', 'danger-full-access']

export function validateEscalationArgs(sandboxPermissions, justification) {
  if (sandboxPermissions !== undefined && justification === undefined) {
    throw new Error('invalid escalation: sandbox_permissions requires a justification')
  }
  if (justification !== undefined && sandboxPermissions === undefined) {
    throw new Error('invalid escalation: justification is only valid together with sandbox_permissions')
  }
  if (justification !== undefined && justification.trim().length === 0) {
    throw new Error('invalid justification: expected a non-empty sentence')
  }
}

export function sandboxDenialMarker(mode) {
  return `[sandbox: file access denied under ${mode} mode]`
}

export function escalationHintMarker(subject) {
  return `[sandbox: escalation available — retry this exact ${subject} once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`
}

export function isWiderMode(currentMode, requestedMode) {
  return (WIDER_MODES[currentMode] ?? []).includes(requestedMode)
}

/**
 * @param {{ requestedMode: string, effectiveMode: string, justification: string, subject: string }} request
 * @param {{ approver?: { request: (req: object) => Promise<string> }, callId: string, toolName: string, signal?: AbortSignal }} approval
 */
export async function approveEscalation(request, approval) {
  const { requestedMode: mode, effectiveMode, justification, subject } = request
  if (!isWiderMode(effectiveMode, mode)) {
    throw new Error(`sandbox escalation to "${mode}" is not strictly wider than this call's current "${effectiveMode}" mode`)
  }
  if (!approval.approver) {
    throw new Error(`sandbox escalation to "${mode}" requires approval, but no approval service is composed`)
  }
  const outcome = await approval.approver.request({
    toolName: approval.toolName,
    callId: approval.callId,
    reason: `escalate sandbox to ${mode}: ${justification}`,
    signal: approval.signal,
  })
  if (outcome === 'allowed-once') return mode
  if (outcome === 'rejected') throw new Error(`the user rejected escalating this ${subject} to "${mode}"`)
  if (outcome === 'cancelled') throw new Error(`approval for escalating to "${mode}" was cancelled`)
  throw new Error(`sandbox escalation to "${mode}" requires approval, but no approval channel is available`)
}
