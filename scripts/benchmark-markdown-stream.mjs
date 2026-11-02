import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { cpus, platform, arch } from 'node:os'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const baselineCommit = 'd48020732985086057c9e4c055eb1308bd2fbabb'
const sourcePath = 'src/features/chat/markdown-stream-blocks.ts'
const baselineFixturePath = 'scripts/fixtures/markdown-stream-baseline.ts'
const mode = process.argv.includes('--baseline') ? 'baseline' : 'current'
const source = mode === 'baseline'
  ? await readFile(baselineFixturePath, 'utf8')
  : await readFile(sourcePath, 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'esm' })
const markdown = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const percentile = (values, proportion) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * proportion) - 1]
const results = []
for (const lines of [1_000, 2_000, 4_000, 8_000]) {
  const input = Array.from({ length: lines }, (_, index) => `- list item ${index}`).join('\n')
  for (let warm = 0; warm < 5; warm += 1) markdown.splitMarkdownStableBlocks(input)
  const timings = []
  for (let trial = 0; trial < 20; trial += 1) {
    const start = performance.now()
    markdown.splitMarkdownStableBlocks(input)
    timings.push(performance.now() - start)
  }
  const result = { lines, singleParseMs: { p50: percentile(timings, 0.5), p95: percentile(timings, 0.95), samples: timings } }
  if (markdown.createMarkdownStreamSplitter) {
    let processedLines = 0
    const splitter = markdown.createMarkdownStreamSplitter({ onLineProcessed: () => { processedLines += 1 } })
    const start = performance.now()
    for (let end = 128; end < input.length; end += 128) splitter.splitMarkdownStableBlocks(input.slice(0, end))
    splitter.splitMarkdownStableBlocks(input)
    result.streamMs = performance.now() - start
    result.streamProcessedLines = processedLines
  }
  results.push(result)
}
const report = { mode, node: process.version, hardware: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model, cores: cpus().length }, baselineCommit, baselineFixturePath, headCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourcePath, sourceSha256: createHash('sha256').update(source).digest('hex'), warmups: 5, trials: 20, chunkCharacters: 128, results }
if (process.argv.includes('--save')) {
  const path = 'docs/benchmark-results/markdown-stream-2026-10-29.json'
  await mkdir('docs/benchmark-results', { recursive: true })
  let previous = {}
  try { previous = JSON.parse(await readFile(path, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  await writeFile(path, `${JSON.stringify({ ...previous, [mode]: report }, null, 2)}\n`)
}
console.log(JSON.stringify(report, null, 2))
