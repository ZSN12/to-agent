/**
 * Subscribe to main-process DSH conversation projection (chat:dshView).
 */
import { useEffect, useState } from 'react'
import type { DshConversationView } from '../../shared/app-api'

function getBridge() {
  return window.taskweaver
}

export type DshConversationViewState = {
  view: DshConversationView | null
  subscribed: boolean
}

export function useDshConversationView(conversationId: string | null | undefined): DshConversationViewState {
  const [view, setView] = useState<DshConversationView | null>(null)
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    const bridge = getBridge()
    if (!conversationId || !bridge?.chat?.onDshView) {
      setView(null)
      setSubscribed(false)
      return
    }
    setSubscribed(true)
    void bridge.chat.getDshView?.(conversationId)?.then((res) => {
      if (res?.ok) setView(res.data ?? null)
    })
    return bridge.chat.onDshView((payload) => {
      if (payload.conversationId && payload.conversationId !== conversationId) return
      setView(payload)
    })
  }, [conversationId])

  return { view, subscribed }
}
