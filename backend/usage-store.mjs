import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createJsonStore } from './json-store.mjs'

const STORE_VERSION = 2

/**
 * The durable usage format deliberately has no invocation ids, timestamps,
 * conversation ids, or per-call measurements. Each row is a daily aggregate
 * keyed by date + provider + model.
 */
export function createUsageStore(userDataPath) {
  const filePath = path.join(userDataPath, 'taskweaver-model-usage.json')
  const store = createJsonStore(filePath, () => ({
    version: STORE_VERSION,
    enabled: true,
    historyImported: false,
    buckets: [],
  }))

  let migrationPromise = null
  const recentEntryIds = new Map()
  const pendingEntries = new Map()
  const MAX_RECENT_ENTRY_IDS = 4096

  function localDateKey(timestamp) {
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  function parseModelKey(value) {
    const modelKey = String(value || 'unknown')
    const slash = modelKey.indexOf('/')
    return slash > 0
      ? { provider: modelKey.slice(0, slash), model: modelKey.slice(slash + 1) }
      : { provider: 'default', model: modelKey || 'default' }
  }

  function finiteNonNegative(value) {
    const number = Number(value)
    return Number.isFinite(number) ? Math.max(0, number) : 0
  }

  function emptyDocument({ enabled = true, historyImported = false } = {}) {
    return { version: STORE_VERSION, enabled, historyImported, buckets: [] }
  }

  function normalizedBucket(record, dateKey, callCount = 1) {
    const identity = parseModelKey(record.modelKey)
    const inputTokens = finiteNonNegative(record.inputTokens)
    const outputTokens = finiteNonNegative(record.outputTokens)
    const cacheReadTokens = finiteNonNegative(record.cacheReadTokens)
    const cacheWriteTokens = finiteNonNegative(record.cacheWriteTokens)
    const reasoningTokens = finiteNonNegative(record.reasoningTokens)
    return {
      date: dateKey,
      provider: identity.provider,
      model: identity.model,
      ...(record.modelName ? { modelName: String(record.modelName) } : {}),
      calls: Math.round(finiteNonNegative(callCount)),
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      reasoningTokens,
      // Cache reads are reported separately so they do not inflate billed-use
      // totals. Reasoning tokens are already included in output tokens.
      totalTokens: inputTokens + outputTokens + cacheWriteTokens,
      costUsd: finiteNonNegative(record.costUsd),
    }
  }

  function bucketKey(bucket) {
    return `${bucket.date}\u0000${bucket.provider}\u0000${bucket.model}`
  }

  function mergeBucket(buckets, incoming) {
    const byKey = new Map(buckets.map(bucket => [bucketKey(bucket), bucket]))
    const key = bucketKey(incoming)
    const current = byKey.get(key)
    if (!current) {
      byKey.set(key, incoming)
    } else {
      current.calls += incoming.calls
      current.inputTokens += incoming.inputTokens
      current.outputTokens += incoming.outputTokens
      current.cacheReadTokens += incoming.cacheReadTokens
      current.cacheWriteTokens += incoming.cacheWriteTokens
      current.reasoningTokens += incoming.reasoningTokens
      current.totalTokens += incoming.totalTokens
      current.costUsd += incoming.costUsd
      if (incoming.modelName) current.modelName = incoming.modelName
    }
    return Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date)
      || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model))
  }

  function aggregateLegacyRecords(records) {
    let buckets = []
    for (const record of records) {
      const timestamp = Number(record?.timestamp)
      if (!record || !Number.isFinite(timestamp) || timestamp <= 0) continue
      buckets = mergeBucket(buckets, normalizedBucket(record, localDateKey(timestamp)))
    }
    return buckets
  }

  async function ensureMigrated() {
    if (!migrationPromise) {
      migrationPromise = store.update(current => {
        if (current?.version === STORE_VERSION && Array.isArray(current.buckets)) return current
        const records = Array.isArray(current?.records) ? current.records : []
        return {
          ...emptyDocument({
            enabled: current?.enabled !== false,
            historyImported: current?.historyImported === true || records.length > 0,
          }),
          buckets: aggregateLegacyRecords(records),
        }
      }).then(() => undefined).catch(error => {
        migrationPromise = null
        throw error
      })
    }
    return migrationPromise
  }

  function normalizeEntry(entry) {
    if (!entry) return null
    const timestamp = Number(entry.timestamp)
    const safeTimestamp = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now()
    const normalized = normalizedBucket({
      modelKey: entry.modelKey,
      modelName: entry.modelName,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      cacheReadTokens: entry.cacheReadTokens,
      cacheWriteTokens: entry.cacheWriteTokens,
      reasoningTokens: entry.reasoningTokens,
      totalTokens: entry.totalTokens,
      costUsd: entry.costUsd,
    }, localDateKey(safeTimestamp))
    if (normalized.totalTokens === 0 && normalized.reasoningTokens === 0 && normalized.costUsd === 0) {
      return null
    }
    return { id: String(entry.id || randomUUID()), bucket: normalized }
  }

  function rememberEntryId(id) {
    recentEntryIds.set(id, true)
    while (recentEntryIds.size > MAX_RECENT_ENTRY_IDS) {
      recentEntryIds.delete(recentEntryIds.keys().next().value)
    }
  }

  async function writeEntry(item) {
    let recorded = false
    await store.update(current => {
      if (current?.enabled === false) return current
      if (recentEntryIds.has(item.id)) return current
      const incoming = { ...item.bucket, calls: 1 }
      recorded = true
      return { ...current, buckets: mergeBucket(current.buckets, incoming) }
    })
    if (!recorded) return null
    rememberEntryId(item.id)
    return item.bucket
  }

  async function record(entry) {
    const item = normalizeEntry(entry)
    if (!item) return null
    await ensureMigrated()
    if (recentEntryIds.has(item.id)) return null
    const pending = pendingEntries.get(item.id)
    if (pending) return pending
    const promise = writeEntry(item)
    pendingEntries.set(item.id, promise)
    try {
      return await promise
    } finally {
      pendingEntries.delete(item.id)
    }
  }

  function aggregateByModel(buckets) {
    const byModel = new Map()
    for (const bucket of buckets) {
      const rowKey = `${bucket.provider}\u0000${bucket.model}`
      let row = byModel.get(rowKey)
      if (!row) {
        row = {
          provider: bucket.provider,
          model: bucket.model,
          displayName: bucket.modelName || bucket.model,
          providerDisplayName: bucket.provider,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
          costUsd: 0,
        }
        byModel.set(rowKey, row)
      }
      row.calls += bucket.calls
      row.inputTokens += bucket.inputTokens
      row.outputTokens += bucket.outputTokens
      row.cacheReadTokens += bucket.cacheReadTokens
      row.cacheWriteTokens += bucket.cacheWriteTokens
      row.reasoningTokens += bucket.reasoningTokens || 0
      row.totalTokens += bucket.totalTokens
      row.costUsd += bucket.costUsd
      if (bucket.modelName) row.displayName = bucket.modelName
    }
    return Array.from(byModel.values()).sort((a, b) => b.totalTokens - a.totalTokens)
  }

  function aggregateTotals(buckets) {
    return buckets.reduce((totals, bucket) => {
      totals.totalCalls += bucket.calls
      totals.inputTokens += bucket.inputTokens
      totals.outputTokens += bucket.outputTokens
      totals.cacheReadTokens += bucket.cacheReadTokens
      totals.cacheWriteTokens += bucket.cacheWriteTokens
      totals.reasoningTokens += bucket.reasoningTokens || 0
      totals.totalTokens += bucket.totalTokens
      totals.costUsd += bucket.costUsd
      return totals
    }, {
      totalCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    })
  }

  function dailyTotals(buckets) {
    const byDate = new Map()
    for (const bucket of buckets) {
      const row = byDate.get(bucket.date) || {
        date: bucket.date,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        costUsd: 0,
      }
      row.calls += bucket.calls
      row.inputTokens += bucket.inputTokens
      row.outputTokens += bucket.outputTokens
      row.cacheReadTokens += bucket.cacheReadTokens
      row.cacheWriteTokens += bucket.cacheWriteTokens
      row.reasoningTokens += bucket.reasoningTokens || 0
      row.totalTokens += bucket.totalTokens
      row.costUsd += bucket.costUsd
      byDate.set(bucket.date, row)
    }
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date))
  }

  async function getStats() {
    await ensureMigrated()
    const data = await store.read()
    const buckets = data.buckets
    const totals = aggregateTotals(buckets)
    const daily = dailyTotals(buckets).slice(0, 14)
    const earliestDate = buckets.reduce((earliest, bucket) => !earliest || bucket.date < earliest ? bucket.date : earliest, null)
    return {
      enabled: data.enabled !== false,
      earliestDate,
      totals,
      byModel: aggregateByModel(buckets).map(row => ({
        modelKey: row.provider === 'default' ? row.model : `${row.provider}/${row.model}`,
        modelName: row.displayName,
        callCount: row.calls,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        reasoningTokens: row.reasoningTokens,
        totalTokens: row.totalTokens,
        costUsd: row.costUsd,
      })),
      daily,
    }
  }

  function computeStreaks(activeDates) {
    if (!activeDates.length) return { currentStreak: 0, maxStreak: 0 }
    const set = new Set(activeDates)
    const sorted = Array.from(set).sort()
    let max = 0
    let streak = 0
    let previousUtcDay = null
    const DAY_MS = 86_400_000
    for (const date of sorted) {
      const utcDay = Date.parse(`${date}T00:00:00Z`)
      streak = previousUtcDay !== null && utcDay - previousUtcDay === DAY_MS ? streak + 1 : 1
      max = Math.max(max, streak)
      previousUtcDay = utcDay
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayKey = localDateKey(today.getTime())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    let currentStreak = 0
    let check = set.has(todayKey) ? today : (set.has(localDateKey(yesterday.getTime())) ? yesterday : null)
    while (check) {
      const key = localDateKey(check.getTime())
      if (!set.has(key)) break
      currentStreak += 1
      check = new Date(check)
      check.setDate(check.getDate() - 1)
    }
    return { currentStreak, maxStreak: max }
  }

  async function getReport(query = {}) {
    await ensureMigrated()
    const data = await store.read()
    const buckets = data.buckets
    const filterModel = query.model ? String(query.model).trim() : ''
    const startDate = query.start != null && Number.isFinite(Number(query.start))
      ? localDateKey(Number(query.start)) : null
    const endDate = query.end != null && Number.isFinite(Number(query.end))
      ? localDateKey(Number(query.end)) : null
    const matchesModel = bucket => !filterModel
      || bucket.model === filterModel
      || (bucket.provider === 'default' ? bucket.model : `${bucket.provider}/${bucket.model}`) === filterModel
    const matchingBuckets = buckets.filter(matchesModel)
    const inWindowBuckets = matchingBuckets.filter(bucket =>
      (!startDate || bucket.date >= startDate) && (!endDate || bucket.date <= endDate))
    const allModels = aggregateByModel(matchingBuckets)
    const rows = aggregateByModel(inWindowBuckets)
    const dailyAll = dailyTotals(matchingBuckets)
    const dailyWindow = dailyTotals(inWindowBuckets)
    const daily = Object.fromEntries(dailyAll.map(row => [row.date, { tokens: row.totalTokens, calls: row.calls }]))
    const totals = aggregateTotals(inWindowBuckets)
    const allTotals = aggregateTotals(buckets)
    const { currentStreak, maxStreak } = computeStreaks(dailyAll.map(row => row.date))
    const { currentStreak: windowCurrentStreak, maxStreak: windowMaxStreak } = computeStreaks(dailyWindow.map(row => row.date))
    const dailyPeakTokens = rows => rows.reduce((peak, row) => Math.max(peak, row.totalTokens), 0)
    const cacheDenominator = totals.inputTokens + totals.cacheReadTokens
    const earliestDate = buckets.reduce((earliest, bucket) => !earliest || bucket.date < earliest ? bucket.date : earliest, null)

    return {
      enabled: data.enabled !== false,
      earliestDate,
      allModels,
      rows,
      totals: {
        calls: totals.totalCalls,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheReadTokens: totals.cacheReadTokens,
        cacheWriteTokens: totals.cacheWriteTokens,
        reasoningTokens: totals.reasoningTokens,
      },
      daily,
      overview: {
        totalTokens: allTotals.totalTokens,
        peakTokens: dailyPeakTokens(dailyAll),
        currentStreak,
        maxStreak,
        earliestDate,
      },
      summary: {
        totalTokens: totals.totalTokens,
        peakTokens: dailyPeakTokens(dailyWindow),
        currentStreak: windowCurrentStreak,
        maxStreak: windowMaxStreak,
        requests: totals.totalCalls,
        costUsd: totals.costUsd,
        cacheHitRate: cacheDenominator > 0 ? totals.cacheReadTokens / cacheDenominator : 0,
        cacheReadTokens: totals.cacheReadTokens,
        reasoningTokens: totals.reasoningTokens,
      },
      debug: { version: '2026-taskweaver-daily-usage-v2' },
    }
  }

  async function clear() {
    await ensureMigrated()
    recentEntryIds.clear()
    await store.update(current => ({
      ...emptyDocument({ enabled: current?.enabled !== false, historyImported: true }),
    }))
    return { ok: true }
  }

  async function setEnabled(enabled) {
    await ensureMigrated()
    const value = enabled !== false
    const next = await store.update(current => ({ ...current, enabled: value }))
    return { ok: true, enabled: next.enabled !== false }
  }

  async function importHistoricalIfEmpty(conversationsOrMessages) {
    await ensureMigrated()
    await store.update(current => {
      if (current.historyImported === true) return current
      const existing = Array.isArray(current.buckets) ? current.buckets : []
      if (existing.length > 0) return { ...current, historyImported: true }
      if (current.enabled === false) return { ...current, historyImported: true }

      let buckets = []
      if (Array.isArray(conversationsOrMessages)) {
        for (const message of conversationsOrMessages) {
          if (!message?.usage) continue
          const usage = message.usage
          const inputTokens = finiteNonNegative(usage.inputTokens)
          const outputTokens = finiteNonNegative(usage.outputTokens)
          const cacheReadTokens = finiteNonNegative(usage.cacheReadTokens)
          const cacheWriteTokens = finiteNonNegative(usage.cacheWriteTokens)
          const reasoningTokens = finiteNonNegative(usage.reasoningTokens)
          if (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + reasoningTokens === 0
            && finiteNonNegative(usage.costUsd) === 0) continue
          const timestamp = Number.isFinite(message.timestamp) && message.timestamp > 0
            ? message.timestamp
            : message.time ? new Date(message.time).getTime() || Date.now() : Date.now()
          buckets = mergeBucket(buckets, normalizedBucket({
            modelKey: message.modelKey || 'default',
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
            reasoningTokens,
            costUsd: usage.costUsd,
          }, localDateKey(timestamp)))
        }
      }
      return { ...current, historyImported: true, buckets }
    })
  }

  return {
    filePath,
    record,
    getStats,
    getReport,
    clear,
    setEnabled,
    importHistoricalIfEmpty,
  }
}
