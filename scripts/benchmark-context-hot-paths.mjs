#!/usr/bin/env node

/**
 * Reproducible local microbenchmarks for the Repo Map/token-estimation hot paths.
 * Timings are device-specific; algorithm outputs are checked before measurement.
 *
 * Run: node scripts/benchmark-context-hot-paths.mjs [--output path.json]
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { computePageRank, fitRepoMapLinesToBudget } from '../backend/repo-map-service.mjs'
import { estimateTokens } from '../backend/token-estimate.mjs'

const SAMPLE_COUNT = 7

function legacyEstimateTokens(text) {
  if (typeof text !== 'string' || text.length === 0) return 0
  const cjkScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
  let cjkCharacters = 0
  let otherUtf16Units = 0
  for (const character of text) {
    if (cjkScript.test(character)) cjkCharacters += 1
    else otherUtf16Units += character.length
  }
  return cjkCharacters + Math.ceil(otherUtf16Units / 3.5)
}

function legacyFitLines(lines, notice, maxTokens) {
  const keptLines = [...lines]
  while (keptLines.length > 0 && estimateTokens([...keptLines, notice].join('\n')) > maxTokens) {
    keptLines.pop()
  }
  if (estimateTokens(notice) <= maxTokens) keptLines.push(notice)
  return keptLines.join('\n')
}

function percentile(sortedValues, fraction) {
  return sortedValues[Math.max(0, Math.ceil(sortedValues.length * fraction) - 1)] ?? 0
}

function measure(fn, { samples = SAMPLE_COUNT, warmups = 2, repeats = 1 } = {}) {
  for (let index = 0; index < warmups; index += 1) {
    for (let repeat = 0; repeat < repeats; repeat += 1) fn()
  }
  const samplesMs = []
  for (let index = 0; index < samples; index += 1) {
    const start = performance.now()
    for (let repeat = 0; repeat < repeats; repeat += 1) fn()
    samplesMs.push((performance.now() - start) / repeats)
  }
  const sorted = [...samplesMs].sort((a, b) => a - b)
  return {
    samplesMs: samplesMs.map((value) => Number(value.toFixed(3))),
    medianMs: Number(percentile(sorted, 0.5).toFixed(3)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(3)),
  }
}

function makePageRankGraph(size, kind) {
  return Array.from({ length: size }, (_, index) => {
    const targets = kind === 'uniform-cycle'
      ? [(index + 1) % size]
      : [...new Set([(index + 1) % size, (index * 17 + 13) % size, ...(index % 5 === 0 ? [(index * 31 + 7) % size] : [])])]
    return {
      relativePath: `src/module-${index}.ts`,
      defs: new Set([`symbol-${index}`]),
      refs: new Set(targets.map((target) => `symbol-${target}`)),
    }
  })
}

function measurePageRank(graph, tolerance) {
  return measure(() => computePageRank(graph, { iterations: 20, tolerance }), { repeats: 3 })
}

const tokenText = Array.from({ length: 1800 }, (_, index) => {
  const sample = index % 4
  if (sample === 0) return `function validateUser${index}(input: UserProfile) { return token${index} } `
  if (sample === 1) return `用户认证与权限检查第${index}步，验证访问令牌并加载账户信息。`
  if (sample === 2) return `かなカナ한글 section-${index}🙂 `
  return `𠀀 supplementary-Han-${index} newline\n`
}).join('')
assert.equal(estimateTokens(tokenText), legacyEstimateTokens(tokenText), 'optimized token estimates must match the legacy formula')

const mapLines = Array.from({ length: 2400 }, (_, index) =>
  `src/feature-${index % 23}/module-${index}.ts: runTask${index} | parseInput${index} | validateResult${index}`,
)
const notice = '[Repo Map partial: output hit the 20000-token limit.]'
const mapBudget = 20_000
assert.equal(
  fitRepoMapLinesToBudget(mapLines, notice, mapBudget),
  legacyFitLines(mapLines, notice, mapBudget),
  'linear Repo Map fitting must preserve the legacy prefix and notice',
)

const pageRankResults = {}
for (const kind of ['uniform-cycle', 'sparse-directed']) {
  const graph = makePageRankGraph(1200, kind)
  const fixed = computePageRank(graph, { iterations: 20, tolerance: 0 })
  const earlyStop = computePageRank(graph, { iterations: 20, tolerance: 1e-8 })
  let maxRankDelta = 0
  for (const [key, rank] of fixed) maxRankDelta = Math.max(maxRankDelta, Math.abs(rank - earlyStop.get(key)))
  assert.ok(maxRankDelta <= 1e-8, `${kind} PageRank output must stay within the convergence tolerance`)
  pageRankResults[kind] = {
    nodes: graph.length,
    fixed20: measurePageRank(graph, 0),
    earlyStop: measurePageRank(graph, 1e-8),
    maxRankDelta: Number(maxRankDelta.toExponential(3)),
  }
  pageRankResults[kind].speedup = Number((pageRankResults[kind].fixed20.medianMs / pageRankResults[kind].earlyStop.medianMs).toFixed(2))
}

const result = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  samples: SAMPLE_COUNT,
  tokenEstimate: {
    textUtf16Units: tokenText.length,
    legacyPerRun: measure(() => legacyEstimateTokens(tokenText)),
    optimizedPerRun: measure(() => estimateTokens(tokenText)),
  },
  repoMapTailFit: {
    inputLines: mapLines.length,
    maxTokens: mapBudget,
    outputLines: fitRepoMapLinesToBudget(mapLines, notice, mapBudget).split('\n').length - 1,
    legacyPerRun: measure(() => legacyFitLines(mapLines, notice, mapBudget), { samples: 5, warmups: 1 }),
    optimizedPerRun: measure(() => fitRepoMapLinesToBudget(mapLines, notice, mapBudget), { samples: 5, warmups: 1 }),
  },
  pageRank: pageRankResults,
  interpretation: 'Local microbenchmark only. Compare runs on the same device/runtime; no cross-device latency claim is implied.',
}

const outputIndex = process.argv.indexOf('--output')
if (outputIndex !== -1) {
  const outputPath = process.argv[outputIndex + 1]
  if (!outputPath) throw new Error('--output requires a path')
  const absolutePath = path.resolve(outputPath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(`Saved benchmark results to ${absolutePath}`)
}
console.log(JSON.stringify(result, null, 2))
