/**
 * TaskWeaver-side adapter: subscribe to raw Z Host mux frames for the active
 * conversation. Feeds future @z/dsh-client-runtime Session / ui-conversation
 * wiring without re-encoding events in dsh-chat-service.
 */
import { useEffect, useRef, useState } from 'react'
import type { DshMuxFramePayload } from '../../shared/app-api'

function getBridge() {
  return window.taskweaver
}

export type DshMuxTapeState = {
  /** Latest frames for the subscribed conversation (bounded ring buffer). */
  frames: readonly DshMuxFramePayload[]
  /** Last session/projection key applied (debug / stats). */
  lastProjectionKey: string | null
  /** Whether subscribeMux succeeded for current id. */
  subscribed: boolean
}

const MAX_FRAMES = 800

export function useDshMuxTape(conversationId: string | null | undefined): DshMuxTapeState {
  const framesRef = useRef<DshMuxFramePayload[]>([])
  const [version, setVersion] = useState(0)
  const [subscribed, setSubscribed] = useState(false)
  const lastProjectionKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const bridge = getBridge()
    if (!conversationId || !bridge?.chat?.subscribeMux) {
      setSubscribed(false)
      return
    }
    framesRef.current = []
    lastProjectionKeyRef.current = null
    setVersion((v) => v + 1)
    let active = true
    void bridge.chat.subscribeMux(conversationId).then((res) => {
      if (active) setSubscribed(Boolean(res?.ok))
    })
    return () => {
      active = false
      setSubscribed(false)
      void bridge.chat.unsubscribeMux?.(conversationId)
    }
  }, [conversationId])

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge?.chat?.onMux || !conversationId) return
    return bridge.chat.onMux((payload) => {
      if (payload.conversationId !== conversationId) return
      framesRef.current.push(payload)
      if (payload.frame.type === 'session/projection' && payload.frame.key) {
        lastProjectionKeyRef.current = payload.frame.key
      }
      if (framesRef.current.length > MAX_FRAMES) {
        framesRef.current.splice(0, framesRef.current.length - MAX_FRAMES)
      }
      setVersion((v) => v + 1)
    })
  }, [conversationId])

  // version bumps when frames change; expose snapshot for consumers
  void version

  return {
    frames: framesRef.current,
    lastProjectionKey: lastProjectionKeyRef.current,
    subscribed,
  }
}
