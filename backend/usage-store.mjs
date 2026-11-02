import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createJsonStore } from './json-store.mjs'
import { aggregateUsage } from './orchestration/aggregation-utils.mjs'
import { QUEUE_CONFIG } from './config/constants.mjs'

const STORE_VERSION = 3

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
  const MAX_RECENT_ENTRY_IDS = QUEUE_CONFIG.MAX_RECENT_ENTRY_IDS

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
      // Total usage includes all input processing, including cached input.
      // Reasoning tokens are already included in output tokens.
      totalTokens: inputTokens + cacheReadTokens + outputTokens + cacheWriteTokens,
      costUsd: finiteNonNegative(record.costUsd),
    }
  }

  function bucketKey(bucket) {
    return `${bucket.date}\u0000${bucket.provider}\u0000${bucket.model}`
  }

  function compareBuckets(a, b) {
    return a.date.localeCompare(b.date)
      || a.provider.localeCompare(b.provider)
      || a.model.localeCompare(b.model)
  }

  function bucketsAreCanonical(buckets) {
    const seen = new Set()
    let previous
    for (const bucket of buckets) {
      const key = bucketKey(bucket)
      if (seen.has(key) || (previous && compareBuckets(previous, bucket) > 0)) return false
      seen.add(key)
      previous = bucket
    }
    return true
  }

  function mergeBucket(buckets, incoming) {
    // Version 3 buckets are kept in the same stable identity order as
    // aggregateBuckets. Update the existing daily row with a binary search;
    // only inserting a new identity has to shift the tail of the array.
    let low = 0
    let high = buckets.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (compareBuckets(buckets[middle], incoming) < 0) low = middle + 1
      else high = middle
    }

    let insertionIndex = low
    while (insertionIndex < buckets.length && compareBuckets(buckets[insertionIndex], incoming) === 0) {
      const existing = buckets[insertionIndex]
      if (existing.date === incoming.date
        && existing.provider === incoming.provider
        && existing.model === incoming.model) {
        buckets[insertionIndex] = {
          ...existing,
          ...(incoming.modelName ? { modelName: incoming.modelName } : {}),
          calls: (existing.calls ?? 0) + incoming.calls,
          inputTokens: (existing.inputTokens ?? 0) + incoming.inputTokens,
          outputTokens: (existing.outputTokens ?? 0) + incoming.outputTokens,
          cacheReadTokens: (existing.cacheReadTokens ?? 0) + incoming.cacheReadTokens,
          cacheWriteTokens: (existing.cacheWriteTokens ?? 0) + incoming.cacheWriteTokens,
          reasoningTokens: (existing.reasoningTokens ?? 0) + incoming.reasoningTokens,
          totalTokens: (existing.totalTokens ?? 0) + incoming.totalTokens,
          costUsd: (existing.costUsd ?? 0) + incoming.costUsd,
        }
        return buckets
      }
      insertionIndex += 1
    }

    buckets.splice(insertionIndex, 0, incoming)
    return buckets
  }

  function aggregateBuckets(buckets) {
    return aggregateUsage(buckets, bucketKey, (_key, bucket) => ({
      date: bucket.date,
      provider: bucket.provider,
      model: bucket.model,
    })).map(bucket => ({
      date: bucket.date,
      provider: bucket.provider,
      model: bucket.model,
      ...(bucket.modelName ? { modelName: bucket.modelName } : {}),
      calls: bucket.calls,
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
      cacheReadTokens: bucket.cacheReadTokens,
      cacheWriteTokens: bucket.cacheWriteTokens,
      reasoningTokens: bucket.reasoningTokens,
      totalTokens: bucket.totalTokens,
      costUsd: bucket.costUsd,
    })).sort(compareBuckets)
  }

  function aggregateLegacyRecords(records) {
    const buckets = []
    for (const record of records) {
      const timestamp = Number(record?.timestamp)
      if (!record || !Number.isFinite(timestamp) || timestamp <= 0) continue
      buckets.push(normalizedBucket(record, localDateKey(timestamp)))
    }
    return aggregateBuckets(buckets)
  }

  function migrateBuckets(buckets) {
    const normalized = buckets.flatMap(bucket => {
      if (!bucket || typeof bucket !== 'object') return []
      const provider = String(bucket.provider || 'default')
      const model = String(bucket.model || 'unknown')
      return [normalizedBucket({
        modelKey: provider === 'default' ? model : `${provider}/${model}`,
        modelName: bucket.modelName,
        inputTokens: bucket.inputTokens,
        outputTokens: bucket.outputTokens,
        cacheReadTokens: bucket.cacheReadTokens,
        cacheWriteTokens: bucket.cacheWriteTokens,
        reasoningTokens: bucket.reasoningTokens,
        costUsd: bucket.costUsd,
      }, String(bucket.date || ''), bucket.calls)]
    })
    return aggregateBuckets(normalized)
  }

  async function ensureMigrated() {
    if (!migrationPromise) {
      migrationPromise = store.update(current => {
        if (current?.version === STORE_VERSION && Array.isArray(current.buckets)) {
          return bucketsAreCanonical(current.buckets)
            ? current
            : { ...current, buckets: aggregateBuckets(current.buckets) }
        }
        const records = Array.isArray(current?.records) ? current.records : []
        const buckets = Array.isArray(current?.buckets)
          ? migrateBuckets(current.buckets)
          : aggregateLegacyRecords(records)
        return {
          ...emptyDocument({
            enabled: current?.enabled !== false,
            historyImported: current?.historyImported === true || records.length > 0,
          }),
          buckets,
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
    return aggregateUsage(
      buckets,
      bucket => `${bucket.provider}\u0000${bucket.model}`,
      (_key, bucket) => ({
        provider: bucket.provider,
        model: bucket.model,
        displayName: bucket.modelName || bucket.model,
        providerDisplayName: bucket.provider,
      }),
    ).map(row => ({
      provider: row.provider,
      model: row.model,
      displayName: row.modelName || row.displayName,
      providerDisplayName: row.providerDisplayName,
      calls: row.calls,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      reasoningTokens: row.reasoningTokens,
      totalTokens: row.totalTokens,
      costUsd: row.costUsd,
    })).sort((a, b) => b.totalTokens - a.totalTokens)
  }

  function aggregateTotals(buckets) {
    const totals = aggregateUsage(buckets, () => 'totals')[0]
    return {
      totalCalls: totals?.calls ?? 0,
      inputTokens: totals?.inputTokens ?? 0,
      outputTokens: totals?.outputTokens ?? 0,
      cacheReadTokens: totals?.cacheReadTokens ?? 0,
      cacheWriteTokens: totals?.cacheWriteTokens ?? 0,
      reasoningTokens: totals?.reasoningTokens ?? 0,
      totalTokens: totals?.totalTokens ?? 0,
      costUsd: totals?.costUsd ?? 0,
    }
  }

  function dailyTotals(buckets) {
    return aggregateUsage(buckets, bucket => bucket.date, (_key, bucket) => ({ date: bucket.date }))
      .map(row => ({
        date: row.date,
        calls: row.calls,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheWriteTokens: row.cacheWriteTokens,
        reasoningTokens: row.reasoningTokens,
        totalTokens: row.totalTokens,
        costUsd: row.costUsd,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
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
      debug: { version: '2026-taskweaver-daily-usage-v3' },
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

      const importedBuckets = []
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
          importedBuckets.push(normalizedBucket({
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
      return { ...current, historyImported: true, buckets: aggregateBuckets(importedBuckets) }
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
