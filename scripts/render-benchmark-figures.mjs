#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index]
  if (key.startsWith('--')) args.set(key, process.argv[index + 1])
}
const dagPath = path.resolve(args.get('--dag') ?? path.join(root, 'docs/benchmark-results/dag-scalability-2026-10-26.json'))
const semanticPath = path.resolve(args.get('--semantic') ?? path.join(root, 'docs/benchmark-results/semantic-topk-2026-10-30.json'))
const markdownPath = path.resolve(args.get('--markdown') ?? path.join(root, 'docs/benchmark-results/markdown-stream-2026-10-29.json'))
const threadStorePath = path.resolve(args.get('--thread-store') ?? path.join(root, 'docs/benchmark-results/thread-store-2026-10-30.json'))
const outputDirectory = path.resolve(args.get('--out-dir') ?? path.join(root, 'docs/benchmark-results/figures'))

const dag = JSON.parse(await fs.readFile(dagPath, 'utf8'))
const semantic = JSON.parse(await fs.readFile(semanticPath, 'utf8'))
let markdown = null
try {
  markdown = JSON.parse(await fs.readFile(markdownPath, 'utf8'))
} catch {
  // 可选加载
}
let threadStore = null
try {
  threadStore = JSON.parse(await fs.readFile(threadStorePath, 'utf8'))
} catch {
  // 可选加载
}

const colors = { baseline: '#5278B8', optimized: '#0D9B82', grid: '#D9E2EC', text: '#182435', muted: '#526175', panel: '#F8FAFC' }
const fontFamily = 'PingFang SC, Noto Sans CJK SC, Microsoft YaHei, Arial, sans-serif'

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function text(x, y, value, options = {}) {
  const { size = 18, fill = colors.text, weight = 400, anchor = 'start' } = options
  return `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${xml(value)}</text>`
}

function panelFrame(x, y, width, height, title, subtitle = '') {
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="${colors.panel}" stroke="#DCE5EF" stroke-width="2"/>`,
    text(x + 26, y + 40, title, { size: 30, weight: 700 }),
    subtitle ? text(x + 26, y + 73, subtitle, { size: 18, fill: colors.muted }) : '',
  ].join('')
}

function chart({ x, y, width, height, values, xLabels, yTicks, yMin, yMax, logY = false, formatY = String, series, title, subtitle, yAxisLabel }) {
  const out = [panelFrame(x, y, width, height, title, subtitle)]
  const left = x + 82
  const right = x + width - 28
  const top = y + 103
  const bottom = y + height - 88
  const plotWidth = right - left
  const plotHeight = bottom - top
  const scale = (value) => {
    const low = logY ? Math.log10(yMin) : yMin
    const high = logY ? Math.log10(yMax) : yMax
    const current = logY ? Math.log10(value) : value
    return bottom - ((current - low) / (high - low)) * plotHeight
  }

  for (const tick of yTicks) {
    const ty = scale(tick)
    out.push(`<line x1="${left}" y1="${ty}" x2="${right}" y2="${ty}" stroke="${colors.grid}" stroke-width="1.5"/>`)
    out.push(text(left - 12, ty + 7, formatY(tick), { size: 18, fill: colors.muted, anchor: 'end' }))
  }
  out.push(`<line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#8492A6" stroke-width="2"/>`)
  out.push(`<line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#8492A6" stroke-width="2"/>`)
  if (yAxisLabel) out.push(text(left, top - 18, yAxisLabel, { size: 16, fill: colors.muted }))

  const step = plotWidth / (xLabels.length - 1 || 1)
  const coords = series.map((s) => s.values.map((v, i) => ({ px: left + i * step, py: scale(v) })))

  for (let sIdx = 0; sIdx < series.length; sIdx += 1) {
    const s = series[sIdx]
    const pts = coords[sIdx]
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px.toFixed(1)} ${p.py.toFixed(1)}`).join(' ')
    out.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`)
    for (const p of pts) {
      out.push(`<circle cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="6" fill="${s.color}"/>`)
      out.push(`<circle cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="3" fill="#FFFFFF"/>`)
    }
  }

  for (let i = 0; i < xLabels.length; i += 1) {
    const lx = left + i * step
    out.push(`<line x1="${lx}" y1="${bottom}" x2="${lx}" y2="${bottom + 6}" stroke="#8492A6" stroke-width="2"/>`)
    out.push(text(lx, bottom + 28, xLabels[i], { size: 18, fill: colors.muted, anchor: 'middle' }))
  }

  let lx = left
  for (const s of series) {
    out.push(`<circle cx="${lx + 8}" cy="${bottom + 62}" r="6" fill="${s.color}"/>`)
    out.push(text(lx + 24, bottom + 68, s.label, { size: 18, weight: 600 }))
    lx += s.legendWidth ?? 170
  }
  return out.join('')
}

function chartSvg({ width, height, title, description, content, footer }) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="#FFFFFF"/>`,
    text(52, 48, title, { size: 36, weight: 800 }),
    description ? text(52, 80, description, { size: 18, fill: colors.muted }) : '',
    content,
    footer ? text(52, height - 24, footer, { size: 16, fill: colors.muted }) : '',
    `</svg>`,
  ].join('\n')
}

const dagRows = dag.results
const nodeLabels = dagRows.map((row) => `${row.nodes}`)
const scheduler = chart({
  x: 52, y: 112, width: 550, height: 520,
  title: '(A) 拓扑排序调度耗时',
  subtitle: `单遍构建入度/出边 + IncrementalReadyQueue；中位时延（微秒）`,
  xLabels: nodeLabels,
  yTicks: [10, 50, 200, 1000], yMin: 10, yMax: 1000, logY: true,
  formatY: (value) => String(value), yAxisLabel: '微秒',
  series: [
    { label: '多遍扫描调度', color: colors.baseline, values: dagRows.map((row) => (row.scheduling?.reference?.medianMs ?? 0) * 1000), legendWidth: 190 },
    { label: '增量就绪队列', color: colors.optimized, values: dagRows.map((row) => (row.scheduling?.optimized?.medianMs ?? 0) * 1000), legendWidth: 220 },
  ],
})
const closure = chart({
  x: 625, y: 112, width: 550, height: 520,
  title: '(B) 传递闭包可达性判定',
  subtitle: 'Floyd-Warshall 位图矩阵 vs 逐对 DFS；中位时延（微秒）',
  xLabels: nodeLabels,
  yTicks: [1, 10, 100, 1000], yMin: 1, yMax: 1000, logY: true,
  formatY: (value) => value >= 1000 ? '1k' : String(value), yAxisLabel: '微秒',
  series: [
    { label: '逐对 DFS', color: colors.baseline, values: dagRows.map((row) => row.transitiveClosure.reference.medianMs * 1000), legendWidth: 180 },
    { label: '传递闭包', color: colors.optimized, values: dagRows.map((row) => row.transitiveClosure.optimized.medianMs * 1000), legendWidth: 180 },
  ],
})
const memory = chart({
  x: 1198, y: 112, width: 550, height: 520,
  title: '(C) 闭包位图空间',
  subtitle: 'n × n Uint8Array 的精确字节数',
  xLabels: nodeLabels,
  yTicks: [10, 100, 1000, 3000], yMin: 10, yMax: 3000, logY: true,
  formatY: (value) => value >= 1000 ? `${value / 1000}k` : String(value), yAxisLabel: '字节',
  series: [
    { label: 'n × n 位图', color: colors.optimized, values: dagRows.map((row) => row.transitiveClosure.matrixBytes), legendWidth: 230 },
  ],
})

const dagSvg = chartSvg({
  title: 'DAG 调度与可达性算法规模对照',
  description: '固定种子 DAG；生产增量队列与位图闭包对照参考算法。',
  width: 1800, height: 720,
  content: scheduler + closure + memory,
  footer: '顺序与可达对数逐项一致。15/30/50 节点仅为算法微基准；产品上限仍为 12。未测进程 RSS。',
})

const semanticRows = semantic.results
const chunkLabels = semanticRows.map((row) => row.documents >= 1000 ? `${row.documents / 1000}k` : String(row.documents))
const topkLatency = chart({
  x: 52, y: 112, width: 830, height: 570,
  title: '(A) 语义检索单次时延',
  subtitle: `${semantic.dimensions} 维向量、Top‑${semantic.topK}；中位时延（ms）`,
  xLabels: chunkLabels,
  yTicks: [0.1, 0.3, 1, 3, 10, 30], yMin: 0.1, yMax: 30, logY: true,
  formatY: (value) => String(value), yAxisLabel: '毫秒',
  series: [
    { label: '全量排序', color: colors.baseline, values: semanticRows.map((row) => row.fullSort.medianMs), legendWidth: 190 },
    { label: 'MinHeap Top‑K', color: colors.optimized, values: semanticRows.map((row) => row.minHeap.medianMs), legendWidth: 230 },
  ],
})
const topkMemory = chart({
  x: 918, y: 112, width: 830, height: 570,
  title: '(B) 选择阶段候选项工作集',
  subtitle: '选择阶段精确候选项数；不含 JavaScript 对象开销',
  xLabels: chunkLabels,
  yTicks: [10, 100, 1000, 10000, 50000], yMin: 10, yMax: 50000, logY: true,
  formatY: (value) => value >= 1000 ? `${value / 1000}k` : String(value), yAxisLabel: '候选项',
  series: [
    { label: '全量排序缓冲', color: colors.baseline, values: semanticRows.map((row) => row.workingSet.fullSortScoredEntries), legendWidth: 240 },
    { label: 'MinHeap 缓冲', color: colors.optimized, values: semanticRows.map((row) => row.workingSet.minHeapScoredEntries), legendWidth: 230 },
  ],
})
const semanticSvg = chartSvg({
  title: '语义向量检索的 MinHeap Top‑K 对照',
  description: '固定种子合成向量；生产 InMemoryVectorStore 与全量排序参考实现对照。',
  width: 1800, height: 760,
  content: topkLatency + topkMemory,
  footer: 'Top‑K 顺序与分数完全一致。64 维合成向量；不含 Embedding 服务或网络延迟。',
})

await fs.mkdir(outputDirectory, { recursive: true })
const dagOutput = path.join(outputDirectory, 'dag-scalability.svg')
const semanticOutput = path.join(outputDirectory, 'semantic-topk.svg')
await Promise.all([
  fs.writeFile(dagOutput, dagSvg, 'utf8'),
  fs.writeFile(semanticOutput, semanticSvg, 'utf8'),
])
console.log(`Wrote ${dagOutput}`)
console.log(`Wrote ${semanticOutput}`)

// 如果存在 Markdown 流式数据，渲染 Markdown 流式对比图与报告
if (markdown && markdown.baseline && markdown.current) {
  const mdBaseRows = markdown.baseline.results
  const mdCurrRows = markdown.current.results
  const mdLabels = mdBaseRows.map((row) => `${row.lines / 1000}k 行`)

  const mdLatency = chart({
    x: 52, y: 112, width: 830, height: 570,
    title: '(A) Markdown 流式单次解析时延',
    subtitle: '长列表流式输入增量切分；中位时延（ms）',
    xLabels: mdLabels,
    yTicks: [0.5, 2, 10, 50, 200, 1000, 3000], yMin: 0.5, yMax: 3000, logY: true,
    formatY: (value) => String(value), yAxisLabel: '毫秒',
    series: [
      { label: '旧版平方扫描 O(L²)', color: colors.baseline, values: mdBaseRows.map((row) => row.singleParseMs.p50), legendWidth: 220 },
      { label: '新版线性状态机 O(L)', color: colors.optimized, values: mdCurrRows.map((row) => row.singleParseMs.p50), legendWidth: 230 },
    ],
  })

  const mdSpeedup = chart({
    x: 918, y: 112, width: 830, height: 570,
    title: '(B) 优化后加速倍率',
    subtitle: '不同规模下旧算法耗时 / 新算法耗时（倍）',
    xLabels: mdLabels,
    yTicks: [10, 50, 200, 500, 1500], yMin: 10, yMax: 1500, logY: true,
    formatY: (value) => `${value}x`, yAxisLabel: '倍数',
    series: [
      {
        label: '加速比 (Speedup)',
        color: colors.optimized,
        values: mdBaseRows.map((row, i) => Math.round(row.singleParseMs.p50 / Math.max(0.1, mdCurrRows[i].singleParseMs.p50))),
        legendWidth: 220,
      },
    ],
  })

  const markdownSvg = chartSvg({
    title: 'Markdown 流式解析状态机性能对照',
    description: '对比旧版前缀切分 O(L²) 与新版增量状态机 O(L) 的执行耗时与加速比。',
    width: 1800, height: 760,
    content: mdLatency + mdSpeedup,
    footer: 'Apple M4 Pro (12 核) 实测；20 轮采样中位数。长文本下避免了流式追加卡顿。',
  })

  const markdownOutput = path.join(outputDirectory, 'markdown-stream.svg')
  await fs.writeFile(markdownOutput, markdownSvg, 'utf8')
  console.log(`Wrote ${markdownOutput}`)

  // Generate the report from the same JSON inputs as the figures so its values cannot drift.
  const formatMs = (value) => Number(value).toFixed(value < 1 ? 3 : 2)
  const markdownRows = markdown?.baseline?.results.map((baselineRow, index) => {
    const currentRow = markdown.current.results[index]
    const speedup = baselineRow.singleParseMs.p50 / currentRow.singleParseMs.p50
    return `| **${baselineRow.lines.toLocaleString('en-US')} 行** | ${formatMs(baselineRow.singleParseMs.p50)} / ${formatMs(baselineRow.singleParseMs.p95)} | ${formatMs(currentRow.singleParseMs.p50)} / ${formatMs(currentRow.singleParseMs.p95)} | **${speedup.toFixed(1)}x** |`
  }).join('\n') ?? ''
  const semanticRowsMarkdown = semantic.results.map((row) => {
    const speedup = row.fullSort.medianMs / row.minHeap.medianMs
    return `| **${row.documents.toLocaleString('en-US')}** | ${formatMs(row.fullSort.medianMs)} / ${formatMs(row.fullSort.p95Ms)} | ${formatMs(row.minHeap.medianMs)} / ${formatMs(row.minHeap.p95Ms)} | **${speedup.toFixed(2)}x** | ${row.workingSet.fullSortScoredEntries.toLocaleString('en-US')} → ${row.workingSet.minHeapScoredEntries.toLocaleString('en-US')} |`
  }).join('\n')
  const threadStoreRows = threadStore?.results.map((row) => {
    const speedup = row.legacyWholeFileJson.p50Ms / row.sqliteThreadStore.p50Ms
    return `| **${row.requestedArchiveTextMiB} MiB** | ${formatMs(row.legacyWholeFileJson.p50Ms)} / ${formatMs(row.legacyWholeFileJson.p95Ms)} | ${formatMs(row.sqliteThreadStore.p50Ms)} / ${formatMs(row.sqliteThreadStore.p95Ms)} | **${speedup.toFixed(1)}x** |`
  }).join('\n') ?? ''
  const hardware = semantic.hardware
  const summaryMarkdown = `# TaskWeaver 算法性能优化对比报告（毕业设计支撑数据）

生成日期：${new Date().toISOString().slice(0, 10)}
测试硬件：${hardware.cpu} (${hardware.logicalCores} 核), Node.js ${semantic.node}, pnpm ${semantic.pnpm}

所有耗时来自本机合成负载。原始样本、提交、源码哈希、预热/采样口径和运行命令保存在对应 JSON 中；不将微基准解释为生产 p95。

---

## 1. Markdown 流式解析性能对比 (A02)

| 输入规模 | 原始算法 p50 / p95 (ms) | 优化算法 p50 / p95 (ms) | p50 加速比 |
|:---|:---|:---|:---|
${markdownRows}

旧实现对已读前缀反复执行 \`slice/split/map\`；当前实现用状态扫描并只处理新增文本。基准以当前源码 SHA 与保留的旧实现 fixture 分别运行，详见 [Markdown benchmark JSON](markdown-stream-2026-10-29.json)。

---

## 2. 语义搜索 Top-K 堆选择性能对比 (A01)

| 向量数 | 全量排序 p50 / p95 (ms) | MinHeap p50 / p95 (ms) | p50 加速比 | 候选项工作集 |
|:---|:---|:---|:---|:---|
${semanticRowsMarkdown}

使用固定种子的 64 维合成向量、Top‑${semantic.topK}，预热 ${semantic.warmups} 次、采样 ${semantic.samples} 次。两种实现的 Top‑K 顺序与分数逐项一致。堆实现仍扫描并评分整个语料；这里只报告选择阶段候选项数量（N → K），没有测量进程总堆/RSS。小语料收益接近噪声区间，较大语料改善更明显。过滤漏召回由独立源码回归验证。原始数据见 [semantic Top-K JSON](semantic-topk-2026-10-30.json)。

---

## 3. 会话 SQLite 更新性能对比 (A13 / P6.3)

合成负载包含一个小目标会话和不同规模的归档会话。旧版完整读取、解析和写回 V1 JSON，再执行提交后重读；SQLite 使用正式 \`ThreadStore.updateConversation()\`，读取并写入目标正文和摘要行。每个规模预热 ${threadStore?.results?.[0]?.warmups ?? '—'} 次、采样 ${threadStore?.results?.[0]?.trials ?? '—'} 次。

| 归档正文规模 | V1 JSON 更新 p50 / p95 (ms) | SQLite 更新 p50 / p95 (ms) | p50 加速比 |
|:---|:---|:---|:---|
${threadStoreRows}

SQLite 列表读取只访问摘要；不相关正文的读写行数由确定性回归验证为零。损坏恢复需显式执行且只保留一代前值。数据和 I/O 计数见 [ThreadStore benchmark JSON](thread-store-2026-10-30.json)。

---

## 4. 可视化图表产物

- DAG 调度规模对比：\`docs/benchmark-results/figures/dag-scalability.svg\`
- 语义检索 Top-K 对比：\`docs/benchmark-results/figures/semantic-topk.svg\`
- Markdown 流式解析对比：\`docs/benchmark-results/figures/markdown-stream.svg\`
`
  const summaryPath = path.join(root, 'docs/benchmark-results/BENCHMARK_SUMMARY.md')
  await fs.writeFile(summaryPath, summaryMarkdown, 'utf8')
  console.log(`Wrote ${summaryPath}`)
}
