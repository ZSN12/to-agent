import {
  Z_MAX_RECONNECT_ATTEMPTS,
  Z_INITIAL_RECONNECT_DELAY_MS,
  Z_MAX_RECONNECT_DELAY_MS,
} from '../config.mjs'
import { rpcValue } from './prelude.mjs'

/** Host mux SSE stream, reconnect backoff, and ensureReady handshake. */
export function createHostMuxRuntime({
  hostManager,
  conversationHub,
  sessions,
  running,
  emit,
  finishTurn,
  handleEnvelope,
}) {
  let muxAbort = null
  let muxTask = null
  let muxGeneration = 0
  let reconnectTask = null
  let reconnectAttempt = 0
  let readyPromise = null
  let establishingReady = false
  let stopped = false

  async function startMuxStream(api) {
    const generation = ++muxGeneration
    muxAbort = new AbortController()
    const activeController = muxAbort
    const activeSignal = muxAbort.signal
    let connected = false
    let markMuxOpen
    let rejectMuxOpen
    const muxOpened = new Promise((resolve, reject) => {
      markMuxOpen = () => { connected = true; resolve() }
      rejectMuxOpen = reject
    })
    const openTimer = setTimeout(() => {
      rejectMuxOpen(new Error('Z 事件通道连接超时'))
      activeController.abort()
    }, 8_000)
    openTimer.unref?.()
    muxTask = (async () => {
      try {
        for await (const envelope of api.events.mux({}, activeSignal, markMuxOpen)) {
          markMuxOpen()
          await handleEnvelope(api, envelope)
        }
        if (!activeSignal.aborted) throw new Error('Z 事件流意外关闭')
      } catch (error) {
        rejectMuxOpen(error)
        if (!activeSignal.aborted && !stopped && generation === muxGeneration) {
          for (const [conversationId, turn] of running) {
            turn.recovering = true
            if (!turn.silentText) emit(turn.eventConversationId ?? conversationId, turn.webContents,
              { type: 'connection', state: 'reconnecting', message: '正在恢复会话连接，任务未被自动停止…' })
          }
          muxTask = null
          muxAbort = null
          // A pre-open failure belongs to startMuxStream's awaiting caller.
          // Scheduling here as well would open two competing generations.
          if (connected) {
            const retry = scheduleReconnect(api)
            reconnectTask = retry
            await retry
            if (reconnectTask === retry) reconnectTask = null
          }
        }
      } finally {
        clearTimeout(openTimer)
        if (!connected && generation === muxGeneration) {
          muxTask = null
          muxAbort = null
        }
      }
    })()
    try {
      await muxOpened
    } finally {
      // This timeout only bounds the initial handshake. Leaving it armed after
      // the SSE stream opens silently aborts every healthy mux after 8 seconds;
      // because the abort then looks intentional, the reconnect path is skipped.
      clearTimeout(openTimer)
    }
    if (![...running.values()].some(turn => turn.recovering)) reconnectAttempt = 0
  }

  function reportUnconfirmedRuns(message) {
    for (const [sessionKey, turn] of running) {
      const target = turn.eventConversationId ?? sessionKey
      if (typeof hostManager.isRunning === 'function' && !hostManager.isRunning()) {
        finishTurn(sessionKey, turn, target, { reason: 'error', error: { message: 'Z Host 已停止；已保留此前输出，未自动重复执行。', code: 'HOST_INTERRUPTED' } })
        continue
      }
      turn.connectionFailed = true
      if (!turn.silentText) emit(target, turn.webContents, { type: 'connection', state: 'unavailable', message })
      if (!turn.initialResolved) {
        turn.initialResolved = true
        const error = new Error(message)
        // Unknown remote state is not a terminal. The UI must retain its run
        // and partial stream; do not account a partial as a completed call.
        error.runContinues = true
        error.turnId = turn.turnId
        turn.reject(error)
      }
    }
  }

  async function scheduleReconnect(api) {
    if (stopped || reconnectAttempt >= Z_MAX_RECONNECT_ATTEMPTS) {
      if (reconnectAttempt >= Z_MAX_RECONNECT_ATTEMPTS) {
        console.error(`Z 事件流重连已达到最大尝试次数 (${Z_MAX_RECONNECT_ATTEMPTS})，停止重连`)
        reportUnconfirmedRuns('会话连接暂不可用，后台任务状态尚未确认；未自动停止或重复执行，请检查连接后再同步。')
      }
      return
    }
    reconnectAttempt += 1
    const delay = Math.min(
      Z_INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempt - 1),
      Z_MAX_RECONNECT_DELAY_MS
    )
    console.warn(`Z 事件流将在 ${delay}ms 后进行第 ${reconnectAttempt} 次重连...`)
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, delay)
      timer.unref?.()
    })
    if (stopped) return
    try {
      console.log(`正在重连 Z 事件流 (尝试 ${reconnectAttempt}/${Z_MAX_RECONNECT_ATTEMPTS})...`)
      let reconnectApi = api
      if (typeof hostManager.isRunning === 'function' && !hostManager.isRunning()) {
        readyPromise = null
        reconnectApi = (await hostManager.start()).api
      } else {
        reconnectApi = hostManager.getApi?.() ?? api
        // A failed health RPC is not proof the child died. Do not destroy all
        // live Agents because one connection/health check failed transiently.
        rpcValue(await reconnectApi.host.describe({}), '检查 Z Host')
      }
      conversationHub?.bindApi?.(reconnectApi)
      readyPromise = Promise.resolve(reconnectApi)
      await startMuxStream(reconnectApi)
      console.log('Z 事件流重连成功')
      const activeSessions = [...sessions.entries()]
      if (activeSessions.length > 0) {
        console.log(`正在恢复 ${activeSessions.length} 个活跃会话的监听器...`)
      }
    } catch (error) {
      console.error(`Z 事件流重连失败：${error instanceof Error ? error.message : String(error)}`)
      if (!stopped && reconnectAttempt < Z_MAX_RECONNECT_ATTEMPTS) {
        await scheduleReconnect(api)
      } else if (!stopped) {
        reportUnconfirmedRuns('会话连接暂不可用，后台任务状态尚未确认；未自动停止或重复执行，请检查连接后再同步。')
      }
    }
  }

  async function ensureReady() {
    if (stopped) throw new Error('Z Host 已关闭')
    // Both a not-yet-running child and an already-running child with a pending
    // first mux handshake share this promise. Never install a second opener
    // merely because the first caller has not reached startMuxStream yet.
    if (readyPromise && establishingReady) return readyPromise
    if (readyPromise && (typeof hostManager.isRunning !== 'function' || hostManager.isRunning())) {
      if (reconnectTask && [...running.values()].some(turn => turn.connectionFailed)) await reconnectTask
      // After retry exhaustion, a new explicit read/send may re-establish the
      // stream. During backoff, do not create a competing mux consumer.
      if (!muxTask && !reconnectTask) {
        establishingReady = true
        readyPromise = readyPromise.then(async api => { await startMuxStream(api); return api }).catch(error => {
          readyPromise = null
          throw error
        }).finally(() => { establishingReady = false })
      }
      return readyPromise
    }
    if (readyPromise) {
      // A fulfilled API promise can outlive the host child it points to.
      // Discard the dead transport before starting a fresh host/client pair.
      readyPromise = null
      muxAbort?.abort()
      muxAbort = null
      muxTask = null
    }
    establishingReady = true
    readyPromise = (async () => {
      const { api } = await hostManager.start()
      conversationHub?.bindApi?.(api)
      if (!muxTask) {
        await startMuxStream(api)
      }
      return api
    })().catch((error) => {
      readyPromise = null
      throw error
    }).finally(() => { establishingReady = false })
    return readyPromise
  }

  async function prepareShutdown() {
    stopped = true
    reconnectAttempt = Z_MAX_RECONNECT_ATTEMPTS
    muxAbort?.abort()
    await muxTask?.catch(() => {})
  }

  return {
    ensureReady,
    getReadyPromise: () => readyPromise,
    getStopped: () => stopped,
    setReconnectAttempt: (n) => { reconnectAttempt = n },
    prepareShutdown,
    getMuxTask: () => muxTask,
    getReconnectTask: () => reconnectTask,
  }
}
