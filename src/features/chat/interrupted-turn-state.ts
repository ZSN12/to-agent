import type { ChatMessage } from '../../types'
import { isDshContextMessage } from '../dsh-runtime/dshTranscriptMessages'

const DISMISSED_INTERRUPTED_TURNS_KEY = 'taskweaver.dismissed-interrupted-turns.v1'
const MAX_DISMISSED_INTERRUPTED_TURNS = 256

type StringStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): StringStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function loadDismissedInterruptedTurnIds(storage = browserStorage()): Set<string> {
  if (!storage) return new Set()
  try {
    const value: unknown = JSON.parse(storage.getItem(DISMISSED_INTERRUPTED_TURNS_KEY) ?? '[]')
    if (!Array.isArray(value)) return new Set()
    return new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0)
      .slice(-MAX_DISMISSED_INTERRUPTED_TURNS))
  } catch {
    return new Set()
  }
}

export function rememberDismissedInterruptedTurn(
  current: ReadonlySet<string>,
  messageId: string,
  storage = browserStorage(),
): Set<string> {
  const next = new Set(current)
  next.delete(messageId)
  next.add(messageId)
  while (next.size > MAX_DISMISSED_INTERRUPTED_TURNS) {
    const oldest = next.values().next().value
    if (oldest === undefined) break
    next.delete(oldest)
  }
  try {
    storage?.setItem(DISMISSED_INTERRUPTED_TURNS_KEY, JSON.stringify([...next]))
  } catch {
    // Dismissal still applies for the current app lifetime if storage is unavailable.
  }
  return next
}

export interface InterruptedTurnVisibility {
  sending: boolean
  loading: boolean
  running: boolean
  runningStatusReady: boolean
}

export function findInterruptedTurn(
  messages: ChatMessage[],
  visibility: InterruptedTurnVisibility,
  dismissedMessageIds: ReadonlySet<string>,
) {
  if (visibility.sending || visibility.loading || visibility.running || !visibility.runningStatusReady) return null

  let lastUserRequest: ChatMessage | null = null
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.author === 'user' && !message.behavior) {
      lastUserRequest = message
      break
    }
  }

  if (!lastUserRequest || dismissedMessageIds.has(lastUserRequest.id)) return null

  const requestIndex = messages.findIndex((message) => message.id === lastUserRequest.id)
  const hasResponse = messages.slice(requestIndex + 1).some((message) =>
    (message.author === 'orchestrator' || message.author === 'agent') && !isDshContextMessage(message),
  )
  if (hasResponse) return null

  return { id: lastUserRequest.id, text: lastUserRequest.text }
}

