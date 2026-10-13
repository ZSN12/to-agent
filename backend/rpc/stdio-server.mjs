import { EventEmitter } from 'node:events'

const MAX_MESSAGE_SIZE = 8 * 1024 * 1024 // 8 MB limit
const REVERSE_REQUEST_TIMEOUT_MS = 60_000 // 60s reverse request timeout
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1
const BATCH_FLUSH_INTERVAL_MS = 16 // 16ms event batching
const BATCH_FLUSH_SIZE_BYTES = 32 * 1024 // 32 KB threshold

/**
 * Protect stdout so only valid JSON-RPC frames are emitted.
 * Directs all console.log/info/debug to stderr.
 */
export function guardStdout() {
  const toStderr = (...args) => {
    try {
      console.error(...args)
    } catch {}
  }
  console.log = toStderr
  console.info = toStderr
  console.debug = toStderr
}

export class StdioJsonRpcServer extends EventEmitter {
  #router
  #stdin
  #stdout
  #buffer = ''
  #activeRequests = new Map() // id -> AbortController
  #pendingReverseRequests = new Map() // id -> { resolve, reject, timer }
  #nextReverseId = 1
  #pendingNotifications = []
  #pendingBatchBytes = 0
  #batchTimer = null
  #isShutdown = false
  #contractHash = ''
  #backendVersion = '1.2.1'
  #reverseRequestTimeoutMs

  /**
   * @param {{
   *   router: import('./router.mjs').RpcRouter,
   *   stdin?: NodeJS.ReadableStream,
   *   stdout?: NodeJS.WritableStream,
   *   contractHash?: string,
   *   backendVersion?: string,
   *   reverseRequestTimeoutMs?: number,
   * }} options
   */
  constructor({
    router,
    stdin = process.stdin,
    stdout = process.stdout,
    contractHash = '',
    backendVersion = '1.2.1',
    reverseRequestTimeoutMs = REVERSE_REQUEST_TIMEOUT_MS,
  }) {
    super()
    if (!Number.isSafeInteger(reverseRequestTimeoutMs)
      || reverseRequestTimeoutMs < 1
      || reverseRequestTimeoutMs > MAX_TIMER_DELAY_MS) {
      throw new RangeError(`reverseRequestTimeoutMs must be an integer between 1 and ${MAX_TIMER_DELAY_MS}`)
    }
    this.#router = router
    this.#stdin = stdin
    this.#stdout = stdout
    this.#contractHash = contractHash
    this.#backendVersion = backendVersion
    this.#reverseRequestTimeoutMs = reverseRequestTimeoutMs
  }

  start() {
    this.#stdin.setEncoding('utf8')
    this.#stdin.on('data', (chunk) => this.#onData(chunk))
    this.#stdin.on('end', () => {
      this.shutdown()
    })
  }

  #onData(chunk) {
    this.#buffer += chunk
    if (this.#buffer.length > MAX_MESSAGE_SIZE * 2) {
      // Buffer exceeded safety threshold without newline delimiter
      this.#sendError(null, -32600, 'Invalid Request: message size exceeded 8MB limit')
      this.#buffer = ''
      return
    }

    let newlineIndex
    while ((newlineIndex = this.#buffer.indexOf('\n')) !== -1) {
      const line = this.#buffer.slice(0, newlineIndex).trim()
      this.#buffer = this.#buffer.slice(newlineIndex + 1)
      if (!line) continue

      if (Buffer.byteLength(line, 'utf8') > MAX_MESSAGE_SIZE) {
        this.#sendError(null, -32600, 'Invalid Request: frame exceeds 8MB limit')
        continue
      }

      this.#handleLine(line)
    }
  }

  async #handleLine(line) {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      this.#sendError(null, -32700, 'Parse error: invalid JSON')
      return
    }

    // 1. Response to a reverse request sent from backend -> Swift
    if (msg.id != null && (msg.result !== undefined || msg.error !== undefined) && !msg.method) {
      const pending = this.#pendingReverseRequests.get(msg.id)
      if (pending) {
        this.#pendingReverseRequests.delete(msg.id)
        clearTimeout(pending.timer)
        if (msg.error) {
          const err = new Error(msg.error.message || 'Reverse request failed')
          /** @type {any} */ (err).code = msg.error.code
          pending.reject(err)
        } else {
          pending.resolve(msg.result)
        }
      }
      return
    }

    // 2. Cancellation: $/cancelRequest
    if (msg.method === '$/cancelRequest') {
      const targetId = msg.params?.id
      if (targetId != null && this.#activeRequests.has(targetId)) {
        this.#activeRequests.get(targetId).abort()
        this.#activeRequests.delete(targetId)
      }
      return
    }

    // 3. Handshake: initialize
    if (msg.method === 'initialize') {
      const result = {
        protocolVersion: 1,
        contractHash: this.#contractHash,
        backendVersion: this.#backendVersion,
      }
      this.#sendResponse(msg.id, result)
      return
    }

    // 4. Standard Request / Notification
    const isNotification = msg.id == null
    const abortController = isNotification ? null : new AbortController()
    if (!isNotification) {
      this.#activeRequests.set(msg.id, abortController)
    }

    try {
      const result = await this.#router.dispatch(msg.method, msg.params, abortController?.signal)
      if (!isNotification) {
        this.#sendResponse(msg.id, result)
      }
    } catch (err) {
      if (!isNotification) {
        const code = typeof err?.code === 'number' ? err.code : -32603
        this.#sendError(msg.id, code, err?.message || 'Internal error', err?.data)
      }
    } finally {
      if (!isNotification) {
        this.#activeRequests.delete(msg.id)
      }
    }
  }

  /**
   * Send a JSON-RPC response to a client request.
   */
  #sendResponse(id, result) {
    this.#flushBatchedNotifications()
    this.#writeLine(JSON.stringify({ jsonrpc: '2.0', id, result }))
  }

  /**
   * Send a JSON-RPC error.
   */
  #sendError(id, code, message, data) {
    const error = { code, message }
    if (data !== undefined) error.data = data
    this.#flushBatchedNotifications()
    this.#writeLine(JSON.stringify({ jsonrpc: '2.0', id, error }))
  }

  /**
   * Send an unsolicited notification to the client (supports batching for stream events).
   * @param {string} method Channel or event name
   * @param {any} params Payload
   */
  sendNotification(method, params) {
    if (this.#isShutdown) return

    // Coalesce high-frequency events: chat:stream and terminal:data
    if (method === 'chat:stream' || method === 'terminal:data') {
      this.#enqueueBatchedNotification(method, params)
      return
    }

    // Preserve arrival order around lifecycle/low-frequency notifications.
    this.#flushBatchedNotifications()
    this.#writeLine(JSON.stringify({ jsonrpc: '2.0', method, params }))
  }

  #enqueueBatchedNotification(method, params) {
    const serialized = JSON.stringify({ jsonrpc: '2.0', method, params })
    this.#pendingNotifications.push(serialized)
    this.#pendingBatchBytes += Buffer.byteLength(serialized, 'utf8')

    if (this.#pendingBatchBytes >= BATCH_FLUSH_SIZE_BYTES) {
      this.#flushBatchedNotifications()
      return
    }

    if (!this.#batchTimer) {
      this.#batchTimer = setTimeout(() => {
        this.#batchTimer = null
        this.#flushBatchedNotifications()
      }, BATCH_FLUSH_INTERVAL_MS)
      this.#batchTimer.unref?.()
    }
  }

  #flushBatchedNotifications() {
    if (this.#batchTimer) {
      clearTimeout(this.#batchTimer)
      this.#batchTimer = null
    }
    if (this.#pendingNotifications.length === 0) return

    const lines = this.#pendingNotifications.join('\n')
    this.#pendingNotifications = []
    this.#pendingBatchBytes = 0
    this.#writeLine(lines)
  }

  /**
   * Send a reverse request to the client (Swift/Host) and await reply.
   * Method typically starts with '$platform/'.
   * @param {string} method
   * @param {any} [params]
   * @returns {Promise<any>}
   */
  async sendReverseRequest(method, params) {
    if (this.#isShutdown) {
      throw new Error('Cannot send reverse request: server is shutdown')
    }

    const id = this.#nextReverseId++
    return new Promise((resolve, reject) => {
      this.#flushBatchedNotifications()
      const timer = setTimeout(() => {
        this.#pendingReverseRequests.delete(id)
        reject(new Error(`Reverse request "${method}" (id: ${id}) timed out after ${this.#reverseRequestTimeoutMs}ms`))
      }, this.#reverseRequestTimeoutMs)
      timer.unref?.()

      this.#pendingReverseRequests.set(id, { resolve, reject, timer })
      const payload = { jsonrpc: '2.0', id, method, params }
      this.#writeLine(JSON.stringify(payload))
    })
  }

  #writeLine(content) {
    if (this.#isShutdown) return
    try {
      this.#stdout.write(content + '\n')
    } catch (e) {
      console.error('Failed to write to stdout:', e)
    }
  }

  shutdown() {
    if (this.#isShutdown) return
    this.#isShutdown = true
    this.#flushBatchedNotifications()

    for (const [id, req] of this.#pendingReverseRequests) {
      clearTimeout(req.timer)
      req.reject(new Error('Server shutdown'))
    }
    this.#pendingReverseRequests.clear()

    for (const controller of this.#activeRequests.values()) {
      controller.abort()
    }
    this.#activeRequests.clear()

    this.emit('shutdown')
  }
}

export function createStdioJsonRpcServer(options) {
  return new StdioJsonRpcServer(options)
}
