import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createJsonStore } from './json-store.mjs'

/**
 * @typedef {Object} UsageRecord
 * @property {string} id
 * @property {number} timestamp
 * @property {string} modelKey
 * @property {string} [modelName]
 * @property {string} [conversationId]
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} cacheReadTokens
 * @property {number} cacheWriteTokens
 * @property {number} totalTokens
 * @property {number} costUsd
 * @property {number} elapsedMs
 */

export function createUsageStore(userDataPath) {
  const filePath = path.join(userDataPath, 'taskweaver-model-usage.json')
  const store = createJsonStore(filePath, () => ({
    version: 1,
    records: [],
  }))

  async function record(entry) {
    if (!entry) return null
    const inputTokens = Math.max(0, Number(entry.inputTokens) || 0)
    const outputTokens = Math.max(0, Number(entry.outputTokens) || 0)
    const cacheReadTokens = Math.max(0, Number(entry.cacheReadTokens) || 0)
    const cacheWriteTokens = Math.max(0, Number(entry.cacheWriteTokens) || 0)
    const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
    const costUsd = Math.max(0, Number(entry.costUsd) || 0)
    const elapsedMs = Math.max(0, Number(entry.elapsedMs) || 0)

    if (totalTokens === 0 && costUsd === 0 && elapsedMs === 0) {
      return null
    }

    const item = {
      id: entry.id || randomUUID(),
      timestamp: entry.timestamp || Date.now(),
      modelKey: String(entry.modelKey || 'unknown'),
      modelName: entry.modelName ? String(entry.modelName) : undefined,
      conversationId: entry.conversationId ? String(entry.conversationId) : undefined,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens,
      costUsd,
      elapsedMs,
    }

    await store.update((current) => {
      const records = Array.isArray(current?.records) ? current.records : []
      // 最多保留最近 1000 条调用记录
      const nextRecords = [item, ...records].slice(0, 1000)
      return {
        ...current,
        version: 1,
        records: nextRecords,
      }
    })

    return item
  }

  async function getStats() {
    const data = await store.read()
    const records = Array.isArray(data?.records) ? data.records : []

    const totals = {
      totalCalls: records.length,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      totalDurationMs: 0,
    }

    const modelMap = new Map()
    const dailyMap = new Map()

    for (const r of records) {
      totals.inputTokens += r.inputTokens
      totals.outputTokens += r.outputTokens
      totals.cacheReadTokens += r.cacheReadTokens
      totals.cacheWriteTokens += r.cacheWriteTokens
      totals.totalTokens += r.totalTokens
      totals.costUsd += r.costUsd
      totals.totalDurationMs += r.elapsedMs

      // 按模型聚合
      const mk = r.modelKey || 'unknown'
      const mStats = modelMap.get(mk) || {
        modelKey: mk,
        modelName: r.modelName || mk.split('/').pop() || mk,
        callCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      }
      mStats.callCount += 1
      mStats.inputTokens += r.inputTokens
      mStats.outputTokens += r.outputTokens
      mStats.cacheReadTokens += r.cacheReadTokens
      mStats.totalTokens += r.totalTokens
      mStats.costUsd += r.costUsd
      modelMap.set(mk, mStats)

      // 按日期聚合 (YYYY-MM-DD)
      const dateStr = new Date(r.timestamp).toISOString().slice(0, 10)
      const dStats = dailyMap.get(dateStr) || {
        date: dateStr,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      }
      dStats.calls += 1
      dStats.inputTokens += r.inputTokens
      dStats.outputTokens += r.outputTokens
      dStats.totalTokens += r.totalTokens
      dStats.costUsd += r.costUsd
      dailyMap.set(dateStr, dStats)
    }

    const byModel = Array.from(modelMap.values()).sort((a, b) => b.totalTokens - a.totalTokens)
    const daily = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14)
    const recent = records.slice(0, 50)

    return {
      totals,
      byModel,
      daily,
      recent,
    }
  }

  function computeStreaks(activeDates) {
    if (!activeDates.length) return { currentStreak: 0, maxStreak: 0 }
    const set = new Set(activeDates)
    const sorted = Array.from(set).sort()
    let max = 0
    let cur = 0
    let prevMs = null
    const DAY_MS = 86_400_000

    for (const dStr of sorted) {
      const ms = new Date(dStr + 'T00:00:00').getTime()
      if (prevMs === null) {
        cur = 1
      } else if (Math.round((ms - prevMs) / DAY_MS) === 1) {
        cur += 1
      } else {
        cur = 1
      }
      if (cur > max) max = cur
      prevMs = ms
    }

    // 计算当前连续天数：检查今天或昨天是否在活跃集合中
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const yesterday = new Date(today.getTime() - DAY_MS)
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

    let currentStreak = 0
    let checkDate = set.has(todayStr) ? today : (set.has(yesterdayStr) ? yesterday : null)
    if (checkDate) {
      while (true) {
        const dStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`
        if (set.has(dStr)) {
          currentStreak += 1
          checkDate = new Date(checkDate.getTime() - DAY_MS)
        } else {
          break
        }
      }
    }

    return { currentStreak, maxStreak: max }
  }

  async function getReport(query = {}) {
    const data = await store.read()
    const records = Array.isArray(data?.records) ? data.records : []
    const filterModel = query.model ? String(query.model).trim() : ''
    const startMs = query.start != null ? Number(query.start) : null
    const endMs = query.end != null ? Number(query.end) : null

    const allDates = []
    let ovTotalTokens = 0
    let ovPeakTokens = 0
    let ovMaxDur = 0

    // 全量历史聚合
    const allModelsMap = new Map()

    for (const r of records) {
      const t = r.totalTokens || (r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens)
      const d = new Date(r.timestamp)
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      allDates.push(dateKey)
      ovTotalTokens += t
      if (t > ovPeakTokens) ovPeakTokens = t
      if ((r.elapsedMs || 0) > ovMaxDur) ovMaxDur = r.elapsedMs || 0

      // 解析 provider 与 model
      const slash = (r.modelKey || '').indexOf('/')
      const provider = slash > 0 ? r.modelKey.slice(0, slash) : 'default'
      const model = slash > 0 ? r.modelKey.slice(slash + 1) : (r.modelKey || 'default')
      const rowKey = `${provider}/${model}`

      let am = allModelsMap.get(rowKey)
      if (!am) {
        am = {
          provider,
          model,
          displayName: r.modelName || model,
          providerDisplayName: provider,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          firstAt: r.timestamp,
          lastAt: r.timestamp,
          peakTokens: 0,
          maxDur: 0,
          totalTokens: 0,
        }
        allModelsMap.set(rowKey, am)
      }
      am.calls += 1
      am.inputTokens += r.inputTokens || 0
      am.outputTokens += r.outputTokens || 0
      am.cacheReadTokens += r.cacheReadTokens || 0
      am.cacheWriteTokens += r.cacheWriteTokens || 0
      am.totalTokens += t
      if (t > am.peakTokens) am.peakTokens = t
      if ((r.elapsedMs || 0) > am.maxDur) am.maxDur = r.elapsedMs || 0
      if (r.timestamp < am.firstAt) am.firstAt = r.timestamp
      if (r.timestamp > am.lastAt) am.lastAt = r.timestamp
    }

    const { currentStreak, maxStreak } = computeStreaks(allDates)

    // 过滤窗口内的 records
    const inWindowRecords = records.filter((r) => {
      if (startMs != null && r.timestamp < startMs) return false
      if (endMs != null && r.timestamp > endMs) return false
      if (filterModel) {
        const slash = (r.modelKey || '').indexOf('/')
        const provider = slash > 0 ? r.modelKey.slice(0, slash) : 'default'
        const model = slash > 0 ? r.modelKey.slice(slash + 1) : (r.modelKey || 'default')
        if (`${provider}/${model}` !== filterModel && model !== filterModel) return false
      }
      return true
    })

    const daily = {}
    const windowRowsMap = new Map()
    const summary = {
      totalTokens: 0,
      peakTokens: 0,
      maxDur: 0,
      currentStreak,
      maxStreak,
      requests: inWindowRecords.length,
      costUsd: 0,
      cacheHitRate: 0,
      cacheReadTokens: 0,
      reasoningTokens: 0,
    }

    let sumInput = 0
    let sumOutput = 0
    let sumCacheRead = 0
    let sumCacheWrite = 0

    for (const r of inWindowRecords) {
      const t = r.totalTokens || (r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens)
      const d = new Date(r.timestamp)
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

      if (!daily[dateKey]) daily[dateKey] = { tokens: 0, calls: 0 }
      daily[dateKey].tokens += t
      daily[dateKey].calls += 1

      summary.totalTokens += t
      if (t > summary.peakTokens) summary.peakTokens = t
      if ((r.elapsedMs || 0) > summary.maxDur) summary.maxDur = r.elapsedMs || 0
      summary.costUsd += r.costUsd || 0
      summary.cacheReadTokens += r.cacheReadTokens || 0

      sumInput += r.inputTokens || 0
      sumOutput += r.outputTokens || 0
      sumCacheRead += r.cacheReadTokens || 0
      sumCacheWrite += r.cacheWriteTokens || 0

      const slash = (r.modelKey || '').indexOf('/')
      const provider = slash > 0 ? r.modelKey.slice(0, slash) : 'default'
      const model = slash > 0 ? r.modelKey.slice(slash + 1) : (r.modelKey || 'default')
      const rowKey = `${provider}/${model}`

      let row = windowRowsMap.get(rowKey)
      if (!row) {
        row = {
          provider,
          model,
          displayName: r.modelName || model,
          providerDisplayName: provider,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          firstAt: r.timestamp,
          lastAt: r.timestamp,
          peakTokens: 0,
          maxDur: 0,
          totalTokens: 0,
        }
        windowRowsMap.set(rowKey, row)
      }
      row.calls += 1
      row.inputTokens += r.inputTokens || 0
      row.outputTokens += r.outputTokens || 0
      row.cacheReadTokens += r.cacheReadTokens || 0
      row.cacheWriteTokens += r.cacheWriteTokens || 0
      row.totalTokens += t
      if (t > row.peakTokens) row.peakTokens = t
      if ((r.elapsedMs || 0) > row.maxDur) row.maxDur = r.elapsedMs || 0
      if (r.timestamp < row.firstAt) row.firstAt = r.timestamp
      if (r.timestamp > row.lastAt) row.lastAt = r.timestamp
    }

    const totalInAndCache = sumInput + sumCacheRead
    summary.cacheHitRate = totalInAndCache > 0 ? (sumCacheRead / totalInAndCache) : 0

    // 针对 daily 热力图：若没有筛选模型，补充历史 daily 以便热力图呈现全量近 6 个月趋势
    if (!filterModel) {
      for (const r of records) {
        const d = new Date(r.timestamp)
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const t = r.totalTokens || (r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens)
        if (!daily[dateKey]) daily[dateKey] = { tokens: 0, calls: 0 }
      }
    }

    return {
      allModels: Array.from(allModelsMap.values()).sort((a, b) => b.totalTokens - a.totalTokens),
      rows: Array.from(windowRowsMap.values()).sort((a, b) => b.totalTokens - a.totalTokens),
      totals: {
        calls: inWindowRecords.length,
        inputTokens: sumInput,
        outputTokens: sumOutput,
        cacheReadTokens: sumCacheRead,
        cacheWriteTokens: sumCacheWrite,
        reasoningTokens: 0,
      },
      daily,
      overview: {
        totalTokens: ovTotalTokens,
        peakTokens: ovPeakTokens,
        maxDur: ovMaxDur,
        currentStreak,
        maxStreak,
      },
      summary,
      debug: { version: '2026-taskweaver-dsh-v1' },
    }
  }

  async function clear() {
    await store.write({
      version: 1,
      records: [],
    })
    return { ok: true }
  }

  async function importHistoricalIfEmpty(conversationsOrMessages) {
    const data = await store.read()
    if (data?.records && data.records.length > 0) return

    const imported = []
    if (Array.isArray(conversationsOrMessages)) {
      for (const msg of conversationsOrMessages) {
        if (msg && msg.usage && (msg.usage.inputTokens > 0 || msg.usage.outputTokens > 0)) {
          const timestamp = msg.time ? new Date(msg.time).getTime() || Date.now() : Date.now()
          const inputTokens = msg.usage.inputTokens || 0
          const outputTokens = msg.usage.outputTokens || 0
          const cacheReadTokens = msg.usage.cacheReadTokens || 0
          const cacheWriteTokens = msg.usage.cacheWriteTokens || 0
          const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens
          imported.push({
            id: msg.id || randomUUID(),
            timestamp,
            modelKey: msg.modelKey || 'default',
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
            totalTokens,
            costUsd: msg.usage.costUsd || 0,
            elapsedMs: msg.usage.elapsedMs || 0,
          })
        }
      }
    }
    if (imported.length > 0) {
      await store.write({
        version: 1,
        records: imported,
      })
    }
  }

  return {
    filePath,
    record,
    getStats,
    getReport,
    clear,
    importHistoricalIfEmpty,
  }
}
