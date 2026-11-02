#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { InMemoryVectorStore } from '../packages/runtime/fs/tool-fs-semantic-search/lib/types/vector-store.js'

const DOCUMENT_COUNTS = [1_000, 5_000, 10_000, 25_000, 50_000]
const DIMENSIONS = 64
const TOP_K = 30
const WARMUP_COUNT = 5
const SAMPLE_COUNT = 20

function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function normalizedVector(random) {
  const values = Array.from({ length: DIMENSIONS }, () => random() * 2 - 1)
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
  return values.map((value) => value / norm)
}

function makeChunks(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `chunk-${index}`,
    file: `src/module-${index % 997}.ts`,
    language: 'typescript',
    type: 'function',
    name: `symbol${index}`,
    content: `function symbol${index}() { return ${index} }`,
    startLine: index + 1,
    endLine: index + 2,
    metadata: { imports: [], exports: [], comments: '' },
  }))
}

function referenceCosine(a, b) {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let index = 0; index < a.length; index += 1) {
    dotProduct += a[index] * b[index]
    normA += a[index] * a[index]
    normB += b[index] * b[index]
  }
  normA = Math.sqrt(normA)
  normB = Math.sqrt(normB)
  if (Math.abs(normA - 1) < 0.001 && Math.abs(normB - 1) < 0.001) return dotProduct
  return normA > 0 && normB > 0 ? dotProduct / (normA * normB) : 0
}

function fullSortTopK(chunks, embeddings, queryEmbedding, topK) {
  const scored = embeddings.map((embedding, index) => ({
    index,
    score: referenceCosine(queryEmbedding, embedding),
  }))
  scored.sort((left, right) => right.score - left.score)
  return scored.slice(0, topK).map(({ index, score }) => ({ chunk: chunks[index], score }))
}

async function timedSamples(reference, optimized) {
  for (let warmup = 0; warmup < WARMUP_COUNT; warmup += 1) {
    if (warmup % 2 === 0) {
      await reference()
      await optimized()
    } else {
      await optimized()
      await reference()
    }
  }
  const referenceSamples = []
  const optimizedSamples = []
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const run = async (fn) => {
      const start = performance.now()
      await fn()
      return performance.now() - start
    }
    if (sample % 2 === 0) {
      referenceSamples.push(await run(reference))
      optimizedSamples.push(await run(optimized))
    } else {
      optimizedSamples.push(await run(optimized))
      referenceSamples.push(await run(reference))
    }
  }
  const summarize = (samples) => {
    const sorted = [...samples].sort((left, right) => left - right)
    return {
      medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
      p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3)),
      samplesMs: samples.map((value) => Number(value.toFixed(3))),
    }
  }
  return { reference: summarize(referenceSamples), optimized: summarize(optimizedSamples) }
}

function toCsv(results) {
  const header = [
    'documents', 'dimensions', 'topK', 'referenceMedianMs', 'minHeapMedianMs',
    'speedup', 'scoreOrderExact', 'referenceScoreEntries', 'minHeapScoreEntries',
    'vectorScalarCount', 'approxVectorPayloadBytes',
  ]
  const lines = results.map((row) => [
    row.documents,
    row.dimensions,
    row.topK,
    row.fullSort.medianMs,
    row.minHeap.medianMs,
    row.speedup,
    row.scoreOrderExact,
    row.workingSet.fullSortScoredEntries,
    row.workingSet.minHeapScoredEntries,
    row.workingSet.vectorScalarCount,
    row.workingSet.approxVectorPayloadBytes,
  ])
  return `${[header, ...lines].map((line) => line.join(',')).join('\n')}\n`
}

const results = []
for (let corpusIndex = 0; corpusIndex < DOCUMENT_COUNTS.length; corpusIndex += 1) {
  const documents = DOCUMENT_COUNTS[corpusIndex]
  const random = createRandom(0x51ea0000 + documents)
  const chunks = makeChunks(documents)
  const embeddings = Array.from({ length: documents }, () => normalizedVector(random))
  const queryEmbedding = normalizedVector(random)
  const store = new InMemoryVectorStore()
  const setupStart = performance.now()
  await store.add(chunks, embeddings)
  const setupMs = performance.now() - setupStart

  const fullSortResult = fullSortTopK(chunks, embeddings, queryEmbedding, TOP_K)
  const heapResult = await store.search('', queryEmbedding, TOP_K)
  assert.deepEqual(
    heapResult.map((item) => item.chunk.id),
    fullSortResult.map((item) => item.chunk.id),
    'MinHeap results must match full-sort Top-K ordering',
  )
  for (let index = 0; index < TOP_K; index += 1) {
    assert.equal(heapResult[index].score, fullSortResult[index].score, 'MinHeap scores must exactly match reference cosine scores')
  }

  const timings = await timedSamples(
    () => fullSortTopK(chunks, embeddings, queryEmbedding, TOP_K),
    () => store.search('', queryEmbedding, TOP_K),
  )
  const row = {
    documents,
    dimensions: DIMENSIONS,
    topK: TOP_K,
    seed: 0x51ea0000 + documents,
    setupMs: Number(setupMs.toFixed(3)),
    fullSort: timings.reference,
    minHeap: timings.optimized,
    speedup: Number((timings.reference.medianMs / timings.optimized.medianMs).toFixed(3)),
    scoreOrderExact: true,
    workingSet: {
      fullSortScoredEntries: documents,
      minHeapScoredEntries: Math.min(documents, TOP_K),
      vectorScalarCount: documents * DIMENSIONS,
      // Number payload only; JS array/object headers and allocator overhead are excluded.
      approxVectorPayloadBytes: documents * DIMENSIONS * Float64Array.BYTES_PER_ELEMENT,
      measuredProcessMemory: false,
    },
  }
  results.push(row)
  console.log(
    `${documents} chunks, k=${TOP_K}: full sort ${row.fullSort.medianMs.toFixed(3)} ms, ` +
    `MinHeap ${row.minHeap.medianMs.toFixed(3)} ms (${row.speedup}x), exact ordering`,
  )
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
  hardware: {
    platform: os.platform(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model ?? 'unknown',
    logicalCores: os.cpus().length,
  },
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  worktreeDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  dimensions: DIMENSIONS,
  topK: TOP_K,
  warmups: WARMUP_COUNT,
  samples: SAMPLE_COUNT,
  command: ['node', ...process.argv.slice(1)].join(' '),
  workingDirectory: process.cwd(),
  baseline: {
    name: 'full-sort reference over the same cosine scores',
    sourcePath: path.relative(process.cwd(), fileURLToPath(import.meta.url)),
    sourceSha256: createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex'),
  },
  implementation: {
    name: 'Production InMemoryVectorStore.search using MinHeap',
    sourcePath: 'packages/runtime/fs/tool-fs-semantic-search/src/vector-store.ts',
    sourceSha256: createHash('sha256').update(await fs.readFile(
      'packages/runtime/fs/tool-fs-semantic-search/src/vector-store.ts',
    )).digest('hex'),
    packagePath: 'packages/runtime/fs/tool-fs-semantic-search/lib/types/vector-store.js',
    packageSha256: createHash('sha256').update(await fs.readFile(
      'packages/runtime/fs/tool-fs-semantic-search/lib/types/vector-store.js',
    )).digest('hex'),
  },
  results,
  interpretation: 'Deterministic same-machine microbenchmark. Working-set entries and vector numeric payload are reported; total JavaScript heap/RSS is not measured. Index/vector construction time is reported separately from query latency.',
}

const outputIndex = process.argv.indexOf('--output')
if (outputIndex !== -1) {
  const outputPath = process.argv[outputIndex + 1]
  if (!outputPath) throw new Error('--output requires a path')
  const absolutePath = path.resolve(outputPath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await fs.writeFile(absolutePath.replace(/\.json$/i, '.csv'), toCsv(results), 'utf8')
  console.log(`Saved JSON and CSV results to ${absolutePath}`)
}
console.log(JSON.stringify(report, null, 2))
