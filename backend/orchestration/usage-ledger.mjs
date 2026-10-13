export class UsageLedger {
  constructor({ onRecord = null } = {}) {
    this.records = []
    this.onRecord = onRecord
    this.pendingRecords = new Set()
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
    const record = {
      runId: entry.runId,
      taskId: entry.taskId,
      attempt: entry.attempt,
      modelKey: entry.modelKey,
      usage: entry.usage,
      outcome: entry.outcome,
      timestamp: Date.now()
    }
    this.records.push(record)
    if (typeof this.onRecord === 'function') {
      const pending = Promise.resolve()
        .then(() => this.onRecord(record))
        .catch(() => {})
        .finally(() => this.pendingRecords.delete(pending))
      this.pendingRecords.add(pending)
    }
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

      const tokens = (Number(u.inputTokens ?? u.promptTokens) || 0)
        + (Number(u.outputTokens ?? u.completionTokens) || 0)
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

  getTaskSummary(taskId) {
    const records = this.records.filter((record) => record.taskId === taskId)
    const byModel = new Map()
    for (const record of records) {
      const modelKey = record.modelKey || 'unknown'
      const current = byModel.get(modelKey) ?? {
        modelKey,
        attempts: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0,
      }
      const usage = record.usage ?? {}
      current.attempts += 1
      current.inputTokens += Number(usage.inputTokens ?? usage.promptTokens) || 0
      current.outputTokens += Number(usage.outputTokens ?? usage.completionTokens) || 0
      current.cacheReadTokens += Number(usage.cacheReadTokens) || 0
      current.cacheWriteTokens += Number(usage.cacheWriteTokens) || 0
      current.costUsd += Number(usage.costUsd) || 0
      byModel.set(modelKey, current)
    }
    const models = [...byModel.values()]
    return {
      attempts: records.length,
      inputTokens: models.reduce((sum, item) => sum + item.inputTokens, 0),
      outputTokens: models.reduce((sum, item) => sum + item.outputTokens, 0),
      cacheReadTokens: models.reduce((sum, item) => sum + item.cacheReadTokens, 0),
      cacheWriteTokens: models.reduce((sum, item) => sum + item.cacheWriteTokens, 0),
      costUsd: models.reduce((sum, item) => sum + item.costUsd, 0),
      byModel: models,
    }
  }

  async flush() {
    await Promise.allSettled([...this.pendingRecords])
  }
}
