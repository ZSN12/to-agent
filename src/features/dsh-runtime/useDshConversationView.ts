/**
 * Subscribe to main-process DSH conversation projection (chat:dshView).
 */
import { useEffect, useState } from 'react'
import type { DshConversationView } from '../../shared/app-api'
import { matchDshConversationView } from './matchDshConversationView'
export { matchDshConversationView } from './matchDshConversationView'

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
    let active = true
    setView(null)
    setSubscribed(true)
    void bridge.chat.getDshView?.(conversationId)?.then((res) => {
      if (!active || !res?.ok) return
      const currentView = matchDshConversationView(res.data, conversationId)
      if (currentView) setView(currentView)
    })
    const unsubscribe = bridge.chat.onDshView((payload) => {
      if (!active) return
      const currentView = matchDshConversationView(payload, conversationId)
      if (currentView) setView(currentView)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [conversationId])

  return { view, subscribed }
}
