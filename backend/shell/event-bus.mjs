import { EventEmitter } from 'node:events'

/** Fan-out IPC push events to shell HTTP/SSE subscribers. */
export const shellEventBus = new EventEmitter()
shellEventBus.setMaxListeners(200)

export function broadcastShellEvent(channel, payload) {
  shellEventBus.emit('push', { channel, payload })
}
