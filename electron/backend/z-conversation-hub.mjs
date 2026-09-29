import { serializeDshConversationView } from './dsh-snapshot-serialize.mjs'
import {
  createTaskWeaverConversationRuntime,
  fakeSessionRemotes,
  loadSessionManagerClass,
} from './dsh-conversation-runtime.mjs'

/**
 * 投影推送的合并窗口（约一帧）。
 * 一次流式回答会产生成百上千个 mux 帧（实测单轮最多 973 个），
 * 若逐帧做「取快照 → 序列化含累计全文 → IPC」会退化成 O(n²)。
 * 这里按窗口合并：帧到达只标脏，由定时器统一推送。
 */
const PUBLISH_COALESCE_MS = 16

/**
 * TaskWeaver-owned DSH Session projection hub (single mux consumer via dsh-chat-service).
 * @param {{ runtimeRoot: string, fakeRemote?: () => unknown, coalesceMs?: number }} options
 */
export function createZConversationHub({ runtimeRoot, fakeRemote = fakeSessionRemotes, coalesceMs = PUBLISH_COALESCE_MS }) {
  /** @type {import('@z/dsh-client-runtime').SessionManager | null} */
  let manager = null
  let initPromise = null
  /** @type {Map<string, { sessionId: string, unsub?: () => void, webContents?: import('electron').WebContents, onUpdate?: (view: unknown) => void }>} */
  const attachments = new Map()
  /** @type {import('@z/dsh-api-remotes/client').IApiClient | null} */
  let apiRef = null
  /** @type {Set<string>} 待推送的 conversationId */
  const dirty = new Set()
  let flushTimer = null

  async function ensureManager() {
    if (manager) return manager
    if (initPromise) return initPromise
    initPromise = (async () => {
      if (!apiRef) throw new Error('Z API 未绑定（需先启动 DSH Host）')
      const SessionManager = await loadSessionManagerClass(runtimeRoot)
      const conversation = await createTaskWeaverConversationRuntime(runtimeRoot)
      const remoteFactory = typeof fakeRemote === 'function' ? fakeRemote : fakeSessionRemotes
      manager = new SessionManager(
        apiRef,
        remoteFactory(),
        undefined,
        undefined,
        conversation,
      )
      return manager
    })().catch((error) => {
      initPromise = null
      throw error
    })
    return initPromise
  }

  function emitView(conversationId, view) {
    const entry = attachments.get(conversationId)
    entry?.onUpdate?.(view)
    if (!entry?.webContents || entry.webContents.isDestroyed?.()) return
    try {
      entry.webContents.send('chat:dshView', view)
    } catch { /* window closing */ }
  }

  /** 立即取快照并推送（不做合并）。 */
  function publishNow(conversationId) {
    const entry = attachments.get(conversationId)
    if (!entry || !manager) return
    const session = manager.get(entry.sessionId)
    const snapshot = session.getSnapshot()
    const view = serializeDshConversationView(snapshot, {
      conversationId,
      sessionId: entry.sessionId,
      projections: session.projections,
    })
    emitView(conversationId, view)
  }

  function flushDirty() {
    flushTimer = null
    if (dirty.size === 0) return
    const pending = [...dirty]
    dirty.clear()
    for (const conversationId of pending) publishNow(conversationId)
  }

  /**
   * 标脏并安排一次合并推送。
   * 流式期间帧速率远高于渲染帧率，逐帧推送只会让序列化与 IPC 白跑（且负载是 O(n²)）。
   */
  function publish(conversationId) {
    if (!conversationId) return
    dirty.add(conversationId)
    if (flushTimer) return
    if (coalesceMs <= 0) {
      flushDirty()
      return
    }
    flushTimer = setTimeout(flushDirty, coalesceMs)
    flushTimer.unref?.()
  }

  /** 丢弃某会话的待推送标记（detach / 关闭时避免向已销毁窗口发送）。 */
  function dropPending(conversationId) {
    dirty.delete(conversationId)
    if (dirty.size === 0 && flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
  }

  async function attachSession(conversationId, sessionId, webContents = undefined) {
    if (!conversationId || !sessionId) return
    const prior = attachments.get(conversationId)
    prior?.unsub?.()
    const mgr = await ensureManager()
    const session = mgr.get(sessionId)
    const unsub = session.subscribe(() => publish(conversationId))
    attachments.set(conversationId, {
      sessionId,
      webContents,
      unsub,
      onUpdate: prior?.onUpdate,
    })
    void session.open().then(() => publish(conversationId)).catch((error) => {
      console.warn('[z-conversation-hub] open:', error instanceof Error ? error.message : error)
    })
  }

  return {
    /** @param {import('@z/dsh-api-remotes/client').IApiClient} api */
    bindApi(api) {
      apiRef = api
    },

    async handleMuxEnvelope(envelope) {
      if (!envelope?.payload) return
      try {
        const mgr = await ensureManager()
        mgr.handleMuxEnvelope(envelope)
        for (const [conversationId, entry] of attachments) {
          if (entry.sessionId === envelope.payload.sessionId) publish(conversationId)
        }
      } catch (error) {
        console.warn('[z-conversation-hub] mux:', error instanceof Error ? error.message : error)
      }
    },

    handleHostEnvelope(_envelope) { /* TaskWeaver mux path only */ },

    attachSession,
    /** @deprecated alias */
    attach: attachSession,

    detachSession(conversationId) {
      const entry = attachments.get(conversationId)
      entry?.unsub?.()
      attachments.delete(conversationId)
      dropPending(conversationId)
    },

    detach(conversationId) {
      const entry = attachments.get(conversationId)
      entry?.unsub?.()
      attachments.delete(conversationId)
      dropPending(conversationId)
    },

    subscribe(conversationId, webContents, onUpdate) {
      const entry = attachments.get(conversationId)
      if (!entry?.sessionId) return
      entry.webContents = webContents
      if (typeof onUpdate === 'function') entry.onUpdate = onUpdate
      // 首次订阅需要立刻出内容，不走合并窗口。
      publishNow(conversationId)
    },

    async getView(conversationId) {
      const entry = attachments.get(conversationId)
      if (!entry?.sessionId) return null
      const mgr = await ensureManager()
      const session = mgr.get(entry.sessionId)
      return serializeDshConversationView(session.getSnapshot(), {
        conversationId,
        sessionId: entry.sessionId,
        projections: session.projections,
      })
    },

    getSessionIdForConversation(conversationId) {
      return attachments.get(conversationId)?.sessionId ?? null
    },
  }
}
