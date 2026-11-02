import { useMemo } from 'react'
import type { ChatMessage } from '../../types'
import {
  findInterruptedTurn,
  type InterruptedTurnVisibility,
} from './interrupted-turn-state'

export function useInterruptedTurn(
  messages: ChatMessage[],
  visibility: InterruptedTurnVisibility,
  dismissedMessageIds: ReadonlySet<string>,
) {
  return useMemo(() => {
    return findInterruptedTurn(messages, visibility, dismissedMessageIds)
  }, [messages, visibility.sending, visibility.loading, visibility.running, visibility.runningStatusReady, dismissedMessageIds])
}
