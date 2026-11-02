/**
 * DAG 任务状态分发微批节流器 (TaskChangeBatcher)
 * 用于在并发 DAG 节点同时推进时，对高频的普通进度更新进行极短窗口 (30~50ms) 内的合并去重，
 * 同时保证关键终态 (done / failed / cancelled / review) 立即无延迟 flush。
 */

export const CRITICAL_STATUSES = Object.freeze(new Set([
  'done',
  'failed',
  'cancelled',
  'review',
]))

export class TaskChangeBatcher {
  /**
   * @param {(taskChange: any, meta?: any) => Promise<void> | void} onTaskChange 底层真实回调
   * @param {object} [options]
   * @param {number} [options.windowMs=40] 节流窗口 (毫秒)
   * @param {(error: any) => void} [options.onFailure] Stop active work if a lifecycle callback fails.
   */
  constructor(onTaskChange, options = {}) {
    this.onTaskChange = onTaskChange
    this.windowMs = options.windowMs ?? 40
    this.onFailure = options.onFailure

    // 存储待分发的更新项: Array<{ taskId: string, taskChange: any, meta: any, isCritical: boolean }>
    this.queue = []
    // 快速索引待发的普通状态项: taskId -> entry in this.queue
    this.pendingNormalEntries = new Map()

    this.timer = null
    this.isFlushing = false
    this.flushChain = Promise.resolve()
    this.failure = null
  }

  /**
   * 判断某个更新是否是关键终态
   * @param {any} taskChange
   * @param {any} [meta]
   * @returns {boolean}
   */
  isCritical(taskChange, meta) {
    if (!taskChange) return false
    if (CRITICAL_STATUSES.has(taskChange.status)) return true
    if (meta && (meta.result !== undefined || meta.error !== undefined)) return true
    return false
  }

  /**
   * 分发一次任务状态更新
   * @param {any} taskChange
   * @param {any} [meta]
   * @returns {Promise<void>}
   */
  async dispatch(taskChange, meta) {
    if (this.failure) throw this.failure
    if (!this.onTaskChange) return

    const critical = this.isCritical(taskChange, meta)
    const taskId = taskChange?.id

    if (!critical && this.windowMs > 0) {
      // 普通状态 (如 running/progress): 在极短窗口内合并去重
      const existing = taskId ? this.pendingNormalEntries.get(taskId) : null
      if (existing) {
        // 同一任务的普通更新合并去重，更新为最新进度
        existing.taskChange = taskChange
        existing.meta = meta
      } else {
        const entry = { taskId, taskChange, meta, isCritical: false }
        this.queue.push(entry)
        if (taskId) this.pendingNormalEntries.set(taskId, entry)
      }

      // 启动微批定时器 (若尚未启动)
      if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null
          this.flush().catch(() => {})
        }, this.windowMs)
        if (typeof this.timer?.unref === 'function') {
          this.timer.unref()
        }
      }
      return
    }

    // 关键终态 (done / failed / cancelled / review) 必须立即无延迟 flush
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    // 压入关键终态
    const entry = { taskId, taskChange, meta, isCritical: true }
    this.queue.push(entry)
    if (taskId) {
      // 关键终态不再作为 pendingNormal
      this.pendingNormalEntries.delete(taskId)
    }

    // 立即无延迟 flush
    return this.flush()
  }

  /**
   * 立即将所有未决消息全部无延迟分发
   * @returns {Promise<void>}
   */
  async flush() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    if (this.queue.length === 0) {
      return this.flushChain
    }

    // 串行执行以保证状态流转顺序性与并发安全
    this.flushChain = this.flushChain.then(async () => {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.queue.length)
        this.pendingNormalEntries.clear()

        for (const item of batch) {
          try {
            await this.onTaskChange(item.taskChange, item.meta)
          } catch (error) {
            // Lifecycle callbacks persist execution evidence. Once one fails,
            // no later update may hide the failure or release a dependent node.
            this.failure = error
            this.queue = []
            this.pendingNormalEntries.clear()
            this.onFailure?.(error)
            throw error
          }
        }
      }
    })
    // Timer-driven flushes have no awaiting caller. Keep their rejection
    // observed while preserving it for the next dispatch/final flush.
    this.flushChain.catch(() => {})

    return this.flushChain
  }

  /**
   * 获取当前待发队列长度
   */
  getPendingCount() {
    return this.queue.length
  }

  /**
   * 释放资源与定时器
   */
  dispose() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.queue = []
    this.pendingNormalEntries.clear()
  }
}
