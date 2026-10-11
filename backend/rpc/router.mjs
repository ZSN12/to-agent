/**
 * JSON-RPC Router for dispatching method calls from Swift or other clients.
 * Replaces ipcMain.handle / router.
 */

export class RpcRouter {
  #handlers = new Map()

  /**
   * Register a method handler.
   * @param {string} channel Method name / channel name
   * @param {(...args: any[]) => Promise<any> | any} handler Receives the original
   *   channel args, followed by a request context `{ signal }`.
   */
  handle(channel, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`Handler for channel "${channel}" must be a function`)
    }
    this.#handlers.set(channel, handler)
  }

  /**
   * Check if a channel has a registered handler.
   * @param {string} channel
   * @returns {boolean}
   */
  has(channel) {
    return this.#handlers.has(channel)
  }

  /**
   * Dispatch an incoming request.
   * @param {string} method
   * @param {any[]} params
   * @param {AbortSignal} [signal]
   * @returns {Promise<any>}
   */
  async dispatch(method, params = [], signal) {
    const handler = this.#handlers.get(method)
    if (!handler) {
      const err = new Error(`Method not found: ${method}`)
      err.code = -32601
      throw err
    }

    if (signal?.aborted) throw createRpcCancellationError()

    // Keep every IPC argument in its existing position and append request
    // context as a separate final argument for handlers that need cancellation.
    const args = Array.isArray(params) ? params : [params]
    const context = Object.freeze({ signal })

    try {
      const result = await handler(...args, context)
      if (signal?.aborted) throw createRpcCancellationError()
      return result
    } catch (error) {
      // A handler may reject for another reason while cancellation is in
      // flight. Report the JSON-RPC cancellation consistently in that case.
      if (signal?.aborted) throw createRpcCancellationError()
      throw error
    }
  }

  /**
   * Get all registered channels.
   * @returns {string[]}
   */
  registeredChannels() {
    return Array.from(this.#handlers.keys())
  }
}

export function createRpcCancellationError() {
  const error = new Error('Request cancelled')
  error.code = -32800
  return error
}

export function createRpcRouter() {
  return new RpcRouter()
}
