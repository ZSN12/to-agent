import { useMemo } from 'react'
import type { ChatMessage } from '../../types'
import { isDshContextMessage } from '../dsh-runtime/dshTranscriptMessages'

export function useInterruptedTurn(
  messages: ChatMessage[],
  sending: boolean,
  dismissedInterruptId: string | null,
) {
  return useMemo(() => {
    if (sending) return null

    let lastUserRequest: ChatMessage | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.author === 'user' && !msg.behavior) {
        lastUserRequest = msg
        break
      }
    }

    if (!lastUserRequest) return null
    if (lastUserRequest.id === dismissedInterruptId) return null

    const requestIndex = messages.findIndex((m) => m.id === lastUserRequest.id)
    const hasResponse = messages.slice(requestIndex + 1).some((m) =>
      (m.author === 'orchestrator' || m.author === 'agent') && !isDshContextMessage(m),
    )

    if (hasResponse) return null

    return { id: lastUserRequest.id, text: lastUserRequest.text }
  }, [messages, sending, dismissedInterruptId])
}
