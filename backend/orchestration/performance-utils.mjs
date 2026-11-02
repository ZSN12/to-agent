// 性能优化工具类：快速队列和增量就绪队列

/** @typedef {{ id: string, dependsOn: string[] }} DagTask */

/**
 * 快速队列 - 避免 Array.shift() 的 O(n) 开销
 * @template T
 */
export class FastQueue {
  constructor() {
    /** @type {T[]} */
    this.items = []
    this.head = 0
  }

  /** @param {T} item */
  enqueue(item) {
    this.items.push(item)
  }

  /** @returns {T | null} */
  dequeue() {
    if (this.head >= this.items.length) return null
    const item = this.items[this.head]
    this.head++

    // 定期清理，避免内存泄漏 (每 1000 个元素或当浪费超过 50%)
    if (this.head > 1000 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head)
      this.head = 0
    }

    return item
  }

  /** @returns {T | null} */
  peek() {
    return this.head < this.items.length ? this.items[this.head] : null
  }

  get length() {
    return this.items.length - this.head
  }

  clear() {
    this.items = []
    this.head = 0
  }
}

/**
 * 增量就绪队列 - 避免每轮循环都过滤整个任务数组
 * 使用入度跟踪和增量更新实现 O(1) 就绪判断
 */
export class IncrementalReadyQueue {
  /**
   * @param {DagTask[]} tasks
   * @param {Map<string, string[]>} dependents
   */
  constructor(tasks, dependents) {
    this.byId = new Map(tasks.map((t) => [t.id, t]))
    this.dependents = dependents

    // 用对象跟踪每个待执行节点的剩余依赖数。
    /** @type {Record<string, number>} */
    this.incomingCount = Object.create(null)

    // 初始化入度和就绪队列
    /** @type {DagTask[]} */
    this.ready = []
    for (const task of tasks) {
      const count = task.dependsOn.length
      this.incomingCount[task.id] = count
      if (count === 0) {
        this.ready.push(task)
      }
    }
  }

  /**
   * 标记任务完成，增量更新就绪队列
   * @param {string} taskId 已完成任务的 ID
   */
  markCompleted(taskId) {
    const children = this.dependents.get(taskId) ?? []

    for (const childId of children) {
      // Completed nodes are intentionally absent from the pending-task queue.
      if (!Object.prototype.hasOwnProperty.call(this.incomingCount, childId)) continue
      // 减少入度，如果降到 0 则加入就绪队列
      if (--this.incomingCount[childId] === 0) {
        const task = this.byId.get(childId)
        if (task) this.ready.push(task)
      }
    }
  }

  /**
   * 获取下一个就绪任务
   * @param {(a: DagTask, b: DagTask) => number} [priorityFn] 优先级比较函数
   * @returns {DagTask | null} 下一个任务或 null
   */
  getNext(priorityFn) {
    if (this.ready.length === 0) return null

    // 按优先级排序（仅对就绪队列，不是全图）
    if (this.ready.length > 1 && priorityFn) {
      this.ready.sort(priorityFn)
    }

    return this.ready.shift() ?? null
  }

  /**
   * 获取所有就绪任务并按优先级排序
   * @param {(a: DagTask, b: DagTask) => number} [priorityFn] 优先级比较函数
   * @returns {DagTask[]} 排序后的就绪任务数组
   */
  getAllReady(priorityFn) {
    if (this.ready.length === 0) return []

    if (priorityFn) {
      this.ready.sort(priorityFn)
    }

    return this.ready
  }

  /**
   * 移除指定任务（用于手动标记为已阻塞或取消）
   * @param {string} taskId 任务 ID
   */
  remove(taskId) {
    const index = this.ready.findIndex((t) => t.id === taskId)
    if (index >= 0) {
      this.ready.splice(index, 1)
    }
    // Prevent a later dependency completion from re-queueing a cancelled,
    // blocked, or already-launched task.
    this.byId.delete(taskId)
    delete this.incomingCount[taskId]
  }

  hasReady() {
    return this.ready.length > 0
  }

  get size() {
    return this.ready.length
  }
}

/**
 * Min-Heap 实现 - 用于 Top-K 选择算法
 * @template T
 */
export class MinHeap {
  /**
   * @param {number} k
   * @param {(a: T, b: T) => number} compareFn
   */
  constructor(k, compareFn) {
    this.k = k
    /** @type {T[]} */
    this.items = []
    this.compare = compareFn
  }

  /** @param {T} item */
  push(item) {
    if (this.items.length < this.k) {
      this.items.push(item)
      this._bubbleUp(this.items.length - 1)
    } else if (this.compare(item, this.items[0]) > 0) {
      // 如果新元素比堆顶大，替换堆顶
      this.items[0] = item
      this._bubbleDown(0)
    }
  }

  /** @returns {T[]} */
  toSortedArray() {
    // Sorting the backing array destroys the heap invariant. Callers may take
    // a snapshot while continuing to push, so sort a copy instead.
    return [...this.items].sort((a, b) => -this.compare(a, b))
  }

  /** @param {number} index */
  _bubbleUp(index) {
    const item = this.items[index]
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      const parent = this.items[parentIndex]
      if (this.compare(item, parent) >= 0) break
      this.items[index] = parent
      index = parentIndex
    }
    this.items[index] = item
  }

  /** @param {number} index */
  _bubbleDown(index) {
    const length = this.items.length
    const item = this.items[index]

    while (true) {
      const leftIndex = 2 * index + 1
      const rightIndex = 2 * index + 2
      let smallestIndex = index
      let smallest = item

      if (
        leftIndex < length &&
        this.compare(this.items[leftIndex], smallest) < 0
      ) {
        smallestIndex = leftIndex
        smallest = this.items[leftIndex]
      }
      if (
        rightIndex < length &&
        this.compare(this.items[rightIndex], smallest) < 0
      ) {
        smallestIndex = rightIndex
        smallest = this.items[rightIndex]
      }

      if (smallestIndex === index) break
      this.items[index] = this.items[smallestIndex]
      index = smallestIndex
    }
    this.items[index] = item
  }
}

/**
 * LRU 缓存 - 用于模型路由打分缓存
 * @template K, V
 */
export class LRUCache {
  /** @param {number} [maxSize] */
  constructor(maxSize = 100) {
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new TypeError('LRUCache maxSize 必须是正整数')
    }
    this.maxSize = maxSize
    /** @type {Map<K, V>} */
    this.cache = new Map()
  }

  /** @param {K} key @returns {V | undefined} */
  get(key) {
    if (!this.cache.has(key)) return undefined

    const value = /** @type {V} */ (this.cache.get(key))
    // 更新访问顺序 (Map 保持插入顺序)
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  /** @param {K} key @param {V} value */
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // 删除最早的项 (Map 的第一个键)
      const first = this.cache.keys().next()
      if (!first.done) this.cache.delete(first.value)
    }
    this.cache.set(key, value)
  }

  clear() {
    this.cache.clear()
  }

  get size() {
    return this.cache.size
  }
}
