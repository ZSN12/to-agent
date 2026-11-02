import type { ChatMessage } from '../../types'

type TurnStatusMessage = Pick<ChatMessage, 'callout' | 'statusNote' | 'errorCode'>

/** Legacy callouts may contain an informational note; only classify explicit errors as failures. */
export function isFailedTurnMessage(message: TurnStatusMessage): boolean {
  const callout = message.callout?.trim() ?? ''
  return Boolean(message.errorCode?.trim()) || /^执行失败(?:[：:，,]|$)/.test(callout)
}

/** Read the new status note and retain informational callouts saved by older versions. */
export function turnStatusNote(message: TurnStatusMessage): string | null {
  if (isFailedTurnMessage(message)) return null
  return message.statusNote?.trim() || message.callout?.trim() || null
}
