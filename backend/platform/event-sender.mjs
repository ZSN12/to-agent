import { EventEmitter } from 'node:events'

/**
 * Electron WebContents-shaped event target for a single backend host client.
 * IPC consumers can keep using sender.send()/once('destroyed') while the
 * platform decides how events reach its UI (stdio notifications for RPC).
 */
export class PlatformEventSender extends EventEmitter {
  #sendEvent
  #destroyed = false

  constructor(sendEvent) {
    super()
    if (typeof sendEvent !== 'function') {
      throw new TypeError('PlatformEventSender requires a sendEvent function')
    }
    this.#sendEvent = sendEvent
    // A backend can have multiple terminal sessions and mux subscriptions.
    this.setMaxListeners(0)
  }

  send(channel, payload) {
    if (this.#destroyed) return
    this.#sendEvent(channel, payload)
  }

  isDestroyed() {
    return this.#destroyed
  }

  destroy() {
    if (this.#destroyed) return
    this.#destroyed = true
    this.emit('destroyed')
  }
}
