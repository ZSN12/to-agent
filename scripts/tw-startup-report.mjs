#!/usr/bin/env node
import fs from 'node:fs'

const args = process.argv.slice(2)
let isJsonMode = false
const filePaths = []

for (const arg of args) {
  if (arg === '--json') {
    isJsonMode = true
  } else if (!arg.startsWith('-')) {
    filePaths.push(arg)
  }
}

if (filePaths.length === 0) {
  console.error('Usage: node scripts/tw-startup-report.mjs [--json] <trace1.jsonl> [trace2.jsonl ...]')
  process.exit(2)
}

function parseTraceFile(filePath) {
  if (!fs.existsSync(filePath)) return []
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  const events = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line))
    } catch {}
  }
  return events
}

function extractMetricFromEvents(events) {
  if (events.length === 0) return null

  const at = (e) => {
    if (!e) return null
    return e.sinceT0Ms ?? e.elapsedMs ?? e.t ?? null
  }

  const isBundleEnd = (e) =>
    e.event === 'models:loadBundle-end' ||
    e.event === 'models:loadBundle' ||
    (e.event === 'ipc' && e.channel === 'models:loadBundle') ||
    e.event === 'models:bundle-resolved'

  const windowEvent = events.find((e) =>
    e.event === 'window:ready-to-show' ||
    e.event === 'swift:window-visible' ||
    e.event === 'window:visible' ||
    e.event === 'window:created'
  )

  const firstCatalogEvent = events.find(isBundleEnd)
  const firstFreshCatalogEvent = events.find((e) => isBundleEnd(e) && e.stale !== true)

  const hostStartCount = events.filter((e) => e.event === 'host:start:ready' || e.event === 'host:start').length
  const hostRestartEvents = events.filter((e) => e.event === 'host:restart' || e.event === 'sync:unconditional-restart')
  const restartReasons = hostRestartEvents.map((e) => e.reason).filter(Boolean)

  const firstMinuteLoadBundles = events.filter((e) => {
    const time = at(e)
    return isBundleEnd(e) && time !== null && time <= 60_000
  }).length

  const ocxCalls = events.filter((e) =>
    typeof e.event === 'string' &&
    (e.event.startsWith('ocx:') || e.event.startsWith('bridge:export')) &&
    !e.event.endsWith('-end') && !e.event.endsWith('-skipped')
  ).length

  const liveDiscoveryAtStartup = events.filter((e) =>
    typeof e.event === 'string' && e.event.startsWith('live-discovery:')
  ).length

  const tokenHelperCalls = events.filter((e) =>
    e.event === 'bridge:token-helper' || e.event === 'token:helper'
  ).length

  const mcpConnectEvents = events.filter((e) =>
    typeof e.event === 'string' && e.event.startsWith('mcp:connect:') && typeof e.ms === 'number'
  )
  const mcpSlowestConnectMs = mcpConnectEvents.length > 0
    ? Math.max(...mcpConnectEvents.map((e) => e.ms))
    : 0

  return {
    windowVisibleMs: at(windowEvent),
    firstCatalogMs: at(firstCatalogEvent),
    firstFreshCatalogMs: at(firstFreshCatalogEvent),
    hostStarts: hostStartCount,
    hostRestarts: hostRestartEvents.length,
    restartReasons,
    loadBundleFirstMinute: firstMinuteLoadBundles,
    ocxCalls,
    liveDiscoveryAtStartup,
    tokenHelperCalls,
    mcpSlowestConnectMs: Number(mcpSlowestConnectMs.toFixed(3)),
  }
}

// Group all events per file and extract runs
const allRuns = []
for (const file of filePaths) {
  const events = parseTraceFile(file)
  // Older child-process trace events may lack startupId. Attach them to the
  // sole identified run in a file; keep ambiguous events separate.
  const knownStartupIds = new Set(events.map((event) => event.startupId).filter(Boolean))
  const idsByPid = new Map()
  for (const event of events) {
    if (!event.startupId || event.pid === undefined) continue
    if (!idsByPid.has(event.pid)) idsByPid.set(event.pid, new Set())
    idsByPid.get(event.pid).add(event.startupId)
  }
  const byStartupId = new Map()
  for (const e of events) {
    const pidIds = e.pid === undefined ? null : idsByPid.get(e.pid)
    const id = e.startupId
      ?? (knownStartupIds.size === 1 ? knownStartupIds.values().next().value : null)
      ?? (pidIds?.size === 1 ? pidIds.values().next().value : null)
      ?? (knownStartupIds.size === 0 ? file : `${file}#unattributed:${e.pid ?? 'unknown'}`)
    if (!byStartupId.has(id)) byStartupId.set(id, [])
    byStartupId.get(id).push(e)
  }

  for (const [id, runEvents] of byStartupId.entries()) {
    const metrics = extractMetricFromEvents(runEvents)
    if (metrics) {
      allRuns.push({ file, startupId: id, ...metrics })
    }
  }
}

function computeStats(arr, key) {
  const vals = arr.map((r) => r[key]).filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (vals.length === 0) return { median: null, min: null, max: null }
  vals.sort((a, b) => a - b)
  const middle = Math.floor(vals.length / 2)
  const median = vals.length % 2 === 0
    ? (vals[middle - 1] + vals[middle]) / 2
    : vals[middle]
  return {
    median,
    min: vals[0],
    max: vals[vals.length - 1],
  }
}

const summary = {
  totalRuns: allRuns.length,
  files: filePaths,
  median: {
    windowVisibleMs: computeStats(allRuns, 'windowVisibleMs').median,
    firstCatalogMs: computeStats(allRuns, 'firstCatalogMs').median,
    firstFreshCatalogMs: computeStats(allRuns, 'firstFreshCatalogMs').median,
    hostStarts: computeStats(allRuns, 'hostStarts').median,
    hostRestarts: computeStats(allRuns, 'hostRestarts').median,
    loadBundleFirstMinute: computeStats(allRuns, 'loadBundleFirstMinute').median,
    ocxCalls: computeStats(allRuns, 'ocxCalls').median,
    liveDiscoveryAtStartup: computeStats(allRuns, 'liveDiscoveryAtStartup').median,
    tokenHelperCalls: computeStats(allRuns, 'tokenHelperCalls').median,
    mcpSlowestConnectMs: computeStats(allRuns, 'mcpSlowestConnectMs').median,
  },
  min: {
    windowVisibleMs: computeStats(allRuns, 'windowVisibleMs').min,
    firstCatalogMs: computeStats(allRuns, 'firstCatalogMs').min,
    firstFreshCatalogMs: computeStats(allRuns, 'firstFreshCatalogMs').min,
    hostStarts: computeStats(allRuns, 'hostStarts').min,
    hostRestarts: computeStats(allRuns, 'hostRestarts').min,
    loadBundleFirstMinute: computeStats(allRuns, 'loadBundleFirstMinute').min,
    ocxCalls: computeStats(allRuns, 'ocxCalls').min,
    liveDiscoveryAtStartup: computeStats(allRuns, 'liveDiscoveryAtStartup').min,
    tokenHelperCalls: computeStats(allRuns, 'tokenHelperCalls').min,
    mcpSlowestConnectMs: computeStats(allRuns, 'mcpSlowestConnectMs').min,
  },
  max: {
    windowVisibleMs: computeStats(allRuns, 'windowVisibleMs').max,
    firstCatalogMs: computeStats(allRuns, 'firstCatalogMs').max,
    firstFreshCatalogMs: computeStats(allRuns, 'firstFreshCatalogMs').max,
    hostStarts: computeStats(allRuns, 'hostStarts').max,
    hostRestarts: computeStats(allRuns, 'hostRestarts').max,
    loadBundleFirstMinute: computeStats(allRuns, 'loadBundleFirstMinute').max,
    ocxCalls: computeStats(allRuns, 'ocxCalls').max,
    liveDiscoveryAtStartup: computeStats(allRuns, 'liveDiscoveryAtStartup').max,
    tokenHelperCalls: computeStats(allRuns, 'tokenHelperCalls').max,
    mcpSlowestConnectMs: computeStats(allRuns, 'mcpSlowestConnectMs').max,
  },
  runs: allRuns,
}

if (isJsonMode) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  const fmt = (v) => (v === null || v === undefined ? '—' : (typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(1)) : v))
  const fmtRange = (med, min, max) => {
    if (med === null || med === undefined) return '—'
    if (min === max) return fmt(med)
    return `${fmt(med)} [${fmt(min)}, ${fmt(max)}]`
  }

  console.log(`# TaskWeaver 启动性能度量报告 (${allRuns.length} 次运行)\n`)
  console.log('| 指标 | 中位数 [最小, 最大] | 说明 |')
  console.log('|---|---|---|')
  console.log(`| 窗口可见 (windowVisibleMs) | ${fmtRange(summary.median.windowVisibleMs, summary.min.windowVisibleMs, summary.max.windowVisibleMs)} ms | 首个窗口渲染就绪耗时 |`)
  console.log(`| 首个目录 (firstCatalogMs) | ${fmtRange(summary.median.firstCatalogMs, summary.min.firstCatalogMs, summary.max.firstCatalogMs)} ms | 首个模型列表呈现（含缓存/快照） |`)
  console.log(`| 首个非 stale 目录 (firstFreshCatalogMs) | ${fmtRange(summary.median.firstFreshCatalogMs, summary.min.firstFreshCatalogMs, summary.max.firstFreshCatalogMs)} ms | 后端全量刷新后最新目录就绪 |`)
  console.log(`| Host 启动次数 (hostStarts) | ${fmtRange(summary.median.hostStarts, summary.min.hostStarts, summary.max.hostStarts)} 次 | 期望为 1 次 |`)
  console.log(`| Host 重启次数 (hostRestarts) | ${fmtRange(summary.median.hostRestarts, summary.min.hostRestarts, summary.max.hostRestarts)} 次 | 期望为 0 次 |`)
  console.log(`| 首分钟 loadBundle 次数 | ${fmtRange(summary.median.loadBundleFirstMinute, summary.min.loadBundleFirstMinute, summary.max.loadBundleFirstMinute)} 次 | 期望 ≤ 2 次 |`)
  console.log(`| ocx 调用次数 | ${fmtRange(summary.median.ocxCalls, summary.min.ocxCalls, summary.max.ocxCalls)} 次 | 启动阶段 ocx 子进程调用 |`)
  console.log(`| 启动期网络发现 (liveDiscovery) | ${fmtRange(summary.median.liveDiscoveryAtStartup, summary.min.liveDiscoveryAtStartup, summary.max.liveDiscoveryAtStartup)} 次 | 期望为 0 次 |`)
  console.log(`| Token Helper 次数 | ${fmtRange(summary.median.tokenHelperCalls, summary.min.tokenHelperCalls, summary.max.tokenHelperCalls)} 次 | 凭据获取子进程调用 |`)
  console.log(`| 最慢 MCP 连接耗时 | ${fmtRange(summary.median.mcpSlowestConnectMs, summary.min.mcpSlowestConnectMs, summary.max.mcpSlowestConnectMs)} ms | MCP 握手耗时 |`)
}
