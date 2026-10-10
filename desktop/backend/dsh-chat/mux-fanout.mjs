const MUX_FANOUT_TYPES = new Set([
  'session/event',
  'session/projection',
  'session/queue',
  'session/subscribed',
  'session/jobs',
])

/** Fan out mux frames to renderer watchers subscribed per conversation. */
export function createDshMuxFanout({ muxWatchers, conversationIdForSession }) {
  function fanoutMuxFrame(envelope) {
    const frame = envelope?.payload
    if (!frame?.sessionId || !MUX_FANOUT_TYPES.has(frame.type)) return
    const conversationId = conversationIdForSession(frame.sessionId)
    if (!conversationId) return
    const watchers = muxWatchers.get(conversationId)
    if (!watchers?.size) return
    const payload = { conversationId, rpcId: envelope.rpcId, frame }
    for (const wc of watchers) {
      if (wc.isDestroyed?.()) continue
      try { wc.send('chat:mux', payload) } catch { /* renderer may be closing */ }
    }
  }

  function subscribeMux(conversationId, webContents) {
    if (!conversationId || !webContents || webContents.isDestroyed?.()) return
    let set = muxWatchers.get(conversationId)
    if (!set) {
      set = new Set()
      muxWatchers.set(conversationId, set)
    }
    set.add(webContents)
    const onDestroyed = () => {
      set.delete(webContents)
      if (set.size === 0) muxWatchers.delete(conversationId)
      webContents.removeListener?.('destroyed', onDestroyed)
    }
    webContents.once?.('destroyed', onDestroyed)
  }

  function unsubscribeMux(conversationId, webContents) {
    const set = muxWatchers.get(conversationId)
    if (!set) return
    set.delete(webContents)
    if (set.size === 0) muxWatchers.delete(conversationId)
  }

  return { fanoutMuxFrame, subscribeMux, unsubscribeMux }
}
