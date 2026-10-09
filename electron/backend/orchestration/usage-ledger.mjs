export class UsageLedger {
  constructor() {
    this.records = []
  }

  /**
   * 记录一次调用用量
   * @param {Object} entry 
   * @param {string} entry.runId 
   * @param {string} entry.taskId
   * @param {number} entry.attempt
   * @param {string} entry.modelKey
   * @param {Object} entry.usage
   * @param {string} entry.outcome
   */
  record(entry) {
    if (!entry || !entry.usage) return
    this.records.push({
      runId: entry.runId,
      taskId: entry.taskId,
      attempt: entry.attempt,
      modelKey: entry.modelKey,
      usage: entry.usage,
      outcome: entry.outcome,
      timestamp: Date.now()
    })
    // 累加到日汇总。D32：只保留「日期 + 模型 + provider」日汇总数字。
    // 在这里由于只需要内存账本，我们可以依赖使用端把账本结果拿去和真正的全局用量统计合并
  }

  getSummary() {
    let totalTokens = 0
    let totalCostUsd = 0
    const breakdown = {}

    for (const rec of this.records) {
      const u = rec.usage
      if (!u) continue

      const tokens = (u.promptTokens || 0) + (u.completionTokens || 0)
      const cost = u.costUsd || 0

      totalTokens += tokens
      totalCostUsd += cost

      const mk = rec.modelKey || 'unknown'
      if (!breakdown[mk]) {
        breakdown[mk] = { tokens: 0, costUsd: 0 }
      }
      breakdown[mk].tokens += tokens
      breakdown[mk].costUsd += cost
    }

    return {
      totalTokens,
      totalCostUsd,
      breakdown
    }
  }

  getRecords() {
    return this.records
  }
}
