#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { BM25Scorer } from '../packages/runtime/fs/tool-fs-semantic-search/lib/types/performance-utils.js'

const documentCount = 12_000
const candidateCount = 30
const queryCount = 100
const sampleCount = 7
const terms = Array.from({ length: 256 }, (_, index) => `identifier${index}`)

const documents = Array.from({ length: documentCount }, (_, docIndex) => {
  const offset = docIndex % terms.length
  const comments = terms.slice(offset, offset + 32).join(' ')
  const body = terms.map((_, index) => terms[(index * 17 + offset) % terms.length]).join(' ')
  return `Symbol: module${docIndex} function\nComments: ${comments}\n\n${body} return value${docIndex}`
})
const queries = Array.from({ length: queryCount }, (_, index) => `identifier${(index * 7) % terms.length} function module${index}`)
const makeCandidates = (start, count) => Array.from({ length: count }, (_, offset) => ({
  key: `chunk-${start + offset}`,
  document: documents[start + offset],
}))
const repeatedCandidates = makeCandidates(0, candidateCount)
const repeatedCandidateSets = Array.from({ length: queryCount }, () => repeatedCandidates)
const rotatingCandidateSets = Array.from({ length: queryCount }, (_, index) => makeCandidates(index * candidateCount, candidateCount))
const coldPrefillCandidates = makeCandidates(0, 512)
const lateHotCandidates = makeCandidates(1_000, candidateCount)
const lateHotCandidateSets = Array.from({ length: queryCount }, () => lateHotCandidates)

function tokenize(text) {
  return text.toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-$/.]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1)
}

function buildReferenceIndex(corpus) {
  const documentFrequency = new Map()
  let totalLength = 0
  for (const document of corpus) {
    const tokens = tokenize(document)
    totalLength += tokens.length
    for (const token of new Set(tokens)) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)
  }
  const inverseDocumentFrequency = new Map()
  for (const [token, frequency] of documentFrequency) {
    inverseDocumentFrequency.set(token, Math.log((corpus.length - frequency + 0.5) / (frequency + 0.5) + 1))
  }
  return { averageLength: totalLength / corpus.length, inverseDocumentFrequency }
}

function baselineScore(query, document, index) {
  const queryTokens = tokenize(query)
  const documentTokens = tokenize(document)
  const termFrequency = new Map()
  for (const token of documentTokens) termFrequency.set(token, (termFrequency.get(token) || 0) + 1)

  let score = 0
  for (const token of queryTokens) {
    const tf = termFrequency.get(token) || 0
    const idf = index.inverseDocumentFrequency.get(token) || 0
    score += idf * (tf * 2.5 / (tf + 1.5 * (1 - 0.75 + 0.75 * (documentTokens.length / index.averageLength))))
  }
  return score
}

function createScorer() {
  const scorer = new BM25Scorer()
  const start = performance.now()
  scorer.buildIndex(documents)
  return { scorer, indexBuildMs: performance.now() - start }
}

const referenceIndex = buildReferenceIndex(documents)
const averageTokensPerDocument = Math.round(documents.reduce((sum, document) => sum + tokenize(document).length, 0) / documents.length)

function runBaseline(candidateSets) {
  for (let index = 0; index < queries.length; index++) {
    for (const candidate of candidateSets[index]) baselineScore(queries[index], candidate.document, referenceIndex)
  }
}

function runOptimized(scorer, candidateSets) {
  for (let index = 0; index < candidateSets.length; index++) {
    const queryTokens = scorer.tokenizeQuery(queries[index])
    scorer.scoreManyCandidates(queryTokens, candidateSets[index])
  }
}

function verifyScores(scorer, candidateSets) {
  for (let index = 0; index < queries.length; index++) {
    const expected = candidateSets[index].map(candidate => baselineScore(queries[index], candidate.document, referenceIndex))
    const actual = scorer.scoreManyCandidates(scorer.tokenizeQuery(queries[index]), candidateSets[index])
    assert.deepEqual(actual, expected, 'optimized BM25 scores must match the pre-optimization formula exactly')
  }
}

function measure(fn) {
  const samples = []
  for (let sample = 0; sample < sampleCount; sample++) {
    const start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  return { medianTotalMs: samples[Math.floor(samples.length / 2)], samplesMs: samples }
}

function measureWithFreshCache(fn) {
  const samples = []
  for (let sample = 0; sample < sampleCount; sample++) {
    const { scorer } = createScorer()
    const start = performance.now()
    fn(scorer)
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  return { medianTotalMs: samples[Math.floor(samples.length / 2)], samplesMs: samples }
}

function benchmarkScenario(candidateSets, prefillCandidates = []) {
  const { scorer, indexBuildMs } = createScorer()
  const cacheWarmupStart = performance.now()
  if (prefillCandidates.length) {
    scorer.scoreManyCandidates(scorer.tokenizeQuery('cold cache warmup'), prefillCandidates)
  }
  const cacheWarmupMs = performance.now() - cacheWarmupStart
  verifyScores(scorer, candidateSets)

  // A separate fresh scorer measures the first search before candidate stats are cached.
  const { scorer: coldScorer } = createScorer()
  if (prefillCandidates.length) {
    coldScorer.scoreManyCandidates(coldScorer.tokenizeQuery('cold cache warmup'), prefillCandidates)
  }
  const coldStart = performance.now()
  coldScorer.scoreManyCandidates(coldScorer.tokenizeQuery(queries[0]), candidateSets[0])
  const coldFirstQueryMs = performance.now() - coldStart

  // Warm the runtime and candidate cache before timing steady-state repetitions.
  runBaseline(candidateSets)
  runOptimized(scorer, candidateSets)
  const baseline = measure(() => runBaseline(candidateSets))
  const optimized = measure(() => runOptimized(scorer, candidateSets))
  return { indexBuildMs, cacheWarmupMs, coldFirstQueryMs, baseline, optimized }
}

function benchmarkUniqueScenario(candidateSets) {
  const { indexBuildMs } = createScorer()
  verifyScores(createScorer().scorer, candidateSets)
  const baseline = measure(() => runBaseline(candidateSets))
  const optimized = measureWithFreshCache(scorer => runOptimized(scorer, candidateSets))
  const { scorer: coldScorer } = createScorer()
  const coldStart = performance.now()
  runOptimized(coldScorer, candidateSets.slice(0, 1))
  const coldFirstQueryMs = performance.now() - coldStart
  return { indexBuildMs, cacheWarmupMs: 0, coldFirstQueryMs, baseline, optimized }
}

const repeated = benchmarkScenario(repeatedCandidateSets)
const rotating = benchmarkScenario(rotatingCandidateSets)
const lateHot = benchmarkScenario(lateHotCandidateSets, coldPrefillCandidates)
const unique = benchmarkUniqueScenario(rotatingCandidateSets)

function scenarioSummary(result) {
  const baselinePerQueryMs = result.baseline.medianTotalMs / queryCount
  const optimizedPerQueryMs = result.optimized.medianTotalMs / queryCount
  return {
    indexBuildMs: Number(result.indexBuildMs.toFixed(2)),
    cacheWarmupMs: Number(result.cacheWarmupMs.toFixed(4)),
    coldFirstQueryMs: Number(result.coldFirstQueryMs.toFixed(4)),
    baseline: {
      medianTotalMs: Number(result.baseline.medianTotalMs.toFixed(2)),
      medianPerQueryMs: Number(baselinePerQueryMs.toFixed(4)),
      medianPerCandidateUs: Number((result.baseline.medianTotalMs * 1000 / (queryCount * candidateCount)).toFixed(2)),
      samplesMs: result.baseline.samplesMs.map(value => Number(value.toFixed(2))),
    },
    optimized: {
      medianTotalMs: Number(result.optimized.medianTotalMs.toFixed(2)),
      medianPerQueryMs: Number(optimizedPerQueryMs.toFixed(4)),
      medianPerCandidateUs: Number((result.optimized.medianTotalMs * 1000 / (queryCount * candidateCount)).toFixed(2)),
      samplesMs: result.optimized.samplesMs.map(value => Number(value.toFixed(2))),
    },
    speedup: Number((result.baseline.medianTotalMs / result.optimized.medianTotalMs).toFixed(2)),
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  documents: documentCount,
  averageTokensPerDocument,
  candidatesPerQuery: candidateCount,
  queriesPerSample: queryCount,
  bm25ScoreCallsPerSample: candidateCount * queryCount,
  samples: sampleCount,
  scenarios: {
    repeatedCandidates: scenarioSummary(repeated),
    rotatingCandidatesAcrossSamples: scenarioSummary(rotating),
    lateHotAfter512ColdDocuments: scenarioSummary(lateHot),
    uniqueCandidatesSinglePassWithFreshCache: scenarioSummary(unique),
  },
  interpretation: '本机微基准；前后算法分数经过逐项相等断言，不同设备的耗时不可直接比较。',
}

const outputIndex = process.argv.indexOf('--output')
if (outputIndex !== -1) {
  const outputPath = process.argv[outputIndex + 1]
  if (!outputPath) throw new Error('--output requires a path')
  const absolutePath = path.resolve(outputPath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Saved benchmark results to ${absolutePath}`)
}
console.log(JSON.stringify(report, null, 2))
