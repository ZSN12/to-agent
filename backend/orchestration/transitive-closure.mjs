/**
 * 使用 Floyd–Warshall 算法和位图计算传递闭包。
 * 构建耗时为 O(V³)，之后路径查询为 O(1)；实际收益取决于图规模与查询次数。
 */

/**
 * 计算 DAG 的传递闭包
 * @param {Array<{id: string, dependsOn?: string[]}>} tasks 任务数组
 * @returns {TransitiveClosure} 包含路径查询方法的闭包对象
 */
export function computeTransitiveClosure(tasks) {
  const n = tasks.length
  const idToIndex = new Map(tasks.map((t, i) => [t.id, i]))

  // 使用 Uint8Array 位图节省内存 (~80% 比 Set)
  const closure = new Uint8Array(n * n)

  // 初始化直接边
  for (let i = 0; i < n; i++) {
    const task = tasks[i]
    const deps = task.dependsOn ?? []
    for (const depId of deps) {
      const j = idToIndex.get(depId)
      if (j !== undefined) {
        closure[i * n + j] = 1
      }
    }
  }

  // Floyd-Warshall 算法计算传递闭包
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      // 剪枝：如果 i->k 不存在，跳过内层循环
      if (closure[i * n + k] === 0) continue

      for (let j = 0; j < n; j++) {
        // 如果存在 i->k 和 k->j，则 i->j 存在
        if (closure[k * n + j] === 1) {
          closure[i * n + j] = 1
        }
      }
    }
  }

  return {
    /**
     * 检查是否存在从 fromId 到 toId 的路径
     * @param {string} fromId 起始任务 ID
     * @param {string} toId 目标任务 ID
     * @returns {boolean} 是否存在路径
     */
    hasPath(fromId, toId) {
      const i = idToIndex.get(fromId)
      const j = idToIndex.get(toId)
      return i !== undefined && j !== undefined && closure[i * n + j] === 1
    },

    /**
     * 获取任务的所有祖先
     * @param {string} taskId 任务 ID
     * @returns {Array<string>} 祖先任务 ID 数组
     */
    getAncestors(taskId) {
      const i = idToIndex.get(taskId)
      if (i === undefined) return []

      const ancestors = []
      for (let j = 0; j < n; j++) {
        if (closure[i * n + j] === 1) {
          ancestors.push(tasks[j].id)
        }
      }
      return ancestors
    },

    /**
     * 获取任务的所有后继
     * @param {string} taskId 任务 ID
     * @returns {Array<string>} 后继任务 ID 数组
     */
    getDescendants(taskId) {
      const j = idToIndex.get(taskId)
      if (j === undefined) return []

      const descendants = []
      for (let i = 0; i < n; i++) {
        if (closure[i * n + j] === 1) {
          descendants.push(tasks[i].id)
        }
      }
      return descendants
    },

    /**
     * 检查是否存在环路
     * @returns {boolean} 是否存在环路
     */
    hasCycle() {
      // 如果存在 i->i 的路径，说明有环
      for (let i = 0; i < n; i++) {
        if (closure[i * n + i] === 1) return true
      }
      return false
    },
  }
}

/**
 * @typedef {object} TransitiveClosure
 * @property {(fromId: string, toId: string) => boolean} hasPath
 * @property {(taskId: string) => string[]} getAncestors
 * @property {(taskId: string) => string[]} getDescendants
 * @property {() => boolean} hasCycle
 */

/**
 * 检查两个任务是否可以并行执行（没有依赖关系）
 * @param {TransitiveClosure} closure 传递闭包对象
 * @param {string} id1 任务 1 ID
 * @param {string} id2 任务 2 ID
 * @returns {boolean} 是否可以并行
 */
export function canRunInParallel(closure, id1, id2) {
  return !closure.hasPath(id1, id2) && !closure.hasPath(id2, id1)
}
