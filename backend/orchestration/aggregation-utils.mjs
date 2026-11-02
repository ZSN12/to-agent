/**
 * 通用数据聚合工具 - 减少重复的累加模式
 */

/**
 * 通用聚合函数 - 参数化的累加器
 * @param {Array} items 要聚合的项数组
 * @param {Function} keyFn 生成聚合键的函数 (item) => string
 * @param {Function} accumulatorFn 累加器函数 (accumulator, item) => void
 * @param {Function} initialValueFn 初始值生成函数 () => Object
 * @returns {Array} 聚合后的结果数组
 */
function aggregateBy(items, keyFn, accumulatorFn, initialValueFn) {
  const byKey = new Map()

  for (const item of items) {
    const key = keyFn(item)
    if (!byKey.has(key)) {
      byKey.set(key, initialValueFn(key, item))
    }
    const accumulator = byKey.get(key)
    accumulatorFn(accumulator, item)
  }

  return Array.from(byKey.values())
}

/**
 * 使用量聚合器 - 专门用于累加 tokens 和 cost
 * @param {Array} buckets 桶数组
 * @param {Function} keyFn 分组键函数
 * @param {Function} metadataFn 额外元数据函数 (可选)
 * @returns {Array} 聚合结果
 */
export function aggregateUsage(buckets, keyFn, metadataFn = null) {
  return aggregateBy(
    buckets,
    keyFn,
    (acc, bucket) => {
      acc.calls += bucket.calls ?? 0
      acc.inputTokens += bucket.inputTokens ?? 0
      acc.outputTokens += bucket.outputTokens ?? 0
      acc.cacheReadTokens += bucket.cacheReadTokens ?? 0
      acc.cacheWriteTokens += bucket.cacheWriteTokens ?? 0
      acc.reasoningTokens += bucket.reasoningTokens ?? 0
      acc.totalTokens += bucket.totalTokens ?? 0
      acc.costUsd += bucket.costUsd ?? 0

      // 更新模型名称（使用最新的）
      if (bucket.modelName) {
        acc.modelName = bucket.modelName
      }
    },
    (key, bucket) => ({
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      ...(metadataFn ? metadataFn(key, bucket) : {}),
    })
  )
}

/**
 * 队列式写入管理器 - 统一处理异步写入队列
 */
export class QueuedWriter {
  constructor(writeFn = null) {
    this.writeFn = writeFn
    this.queue = []
    this.writing = false
    this.drainScheduled = false
    this.keyedQueues = new Map()
  }

  /**
   * 入队一个写入操作
   * @param {Function} prepareFn 准备数据的函数 (currentData) => newData
   * @returns {Promise<void>}
   */
  async enqueue(prepareFn) {
    if (typeof this.writeFn !== 'function') {
      throw new TypeError('QueuedWriter.enqueue requires a batch write function')
    }
    const promise = new Promise((resolve, reject) => {
      this.queue.push({ prepareFn, resolve, reject })
    })

    if (!this.writing && !this.drainScheduled) {
      this.drainScheduled = true
      queueMicrotask(() => {
        this.drainScheduled = false
        this.#drain().catch(() => {
          // 错误已在 drain 中处理
        })
      })
    }

    return promise
  }

  /**
   * Serialize writes for one key while allowing unrelated keys to proceed in
   * parallel. Queue state exists only while operations for that key are in
   * flight; the key is removed after its last operation settles.
   *
   * @param {string} key Stable resource key.
   * @param {Function} operation Async operation to execute.
   * @returns {Promise<*>}
   */
  enqueueForKey(key, operation) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('QueuedWriter key must be a non-empty string')
    }
    if (typeof operation !== 'function') {
      throw new TypeError('QueuedWriter operation must be a function')
    }

    let state = this.keyedQueues.get(key)
    if (!state) {
      state = { tail: Promise.resolve(), pending: 0 }
      this.keyedQueues.set(key, state)
    }

    state.pending += 1
    const current = state.tail.catch(() => {}).then(operation)
    state.tail = current.catch(() => {})
    return current.finally(() => {
      state.pending -= 1
      if (state.pending === 0 && this.keyedQueues.get(key) === state) {
        this.keyedQueues.delete(key)
      }
    })
  }

  async #drain() {
    if (this.writing) return
    this.writing = true

    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.queue.length)

        try {
          await this.writeFn(async (currentData) => {
            let data = currentData
            for (const { prepareFn } of batch) {
              data = await prepareFn(data)
            }
            return data
          })

          // 所有操作成功，resolve 所有 promise
          for (const { resolve } of batch) {
            resolve()
          }
        } catch (error) {
          // 批量失败，reject 所有 promise
          for (const { reject } of batch) {
            reject(error)
          }
        }
      }
    } finally {
      this.writing = false
    }
  }

  /**
   * 获取当前队列长度
   */
  get length() {
    return this.queue.length
  }

  /**
   * 检查是否正在写入
   */
  get isWriting() {
    return this.writing
  }

  /** Number of keys with queued or active keyed writes. */
  get keyedQueueCount() {
    return this.keyedQueues.size
  }
}
