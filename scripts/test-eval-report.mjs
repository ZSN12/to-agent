import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { generateEvaluationReport, statistics, summarizeResults } from './eval-report.mjs'
assert.deepEqual(statistics([]), { n: 0, mean: null, min: null, max: null, ci95: null })
assert.equal(statistics([3]).ci95, null, 'a single run cannot produce an interval')

const records = [
  { kind: 'result', taskId: 'CA-01', repeat: 1, config: 'single', automatedPassed: true, elapsedMs: 100, hostToolCallCount: 4, inputTokens: 1000, outputTokens: 200, cacheTokens: 100, costUsd: 0.10 },
  { kind: 'result', taskId: 'CA-01', repeat: 2, config: 'single', automatedPassed: false, elapsedMs: 120, hostToolCallCount: 5, inputTokens: 1200, outputTokens: 250, cacheTokens: null, costUsd: null },
  { kind: 'result', taskId: 'CA-01', repeat: 1, config: 'dag-fixed', automatedPassed: true, elapsedMs: 80, hostToolCallCount: 6, inputTokens: 900, outputTokens: 180, cacheTokens: 90, costUsd: 0.12 },
  { kind: 'result', taskId: 'CA-01', repeat: 2, config: 'dag-fixed', automatedPassed: true, elapsedMs: 90, hostToolCallCount: 7, inputTokens: 1100, outputTokens: 220, cacheTokens: 100, costUsd: 0.14 },
]
const summary = summarizeResults(records)
assert.equal(summary.byConfig.single.runs, 2)
assert.equal(summary.byConfig.single.costUnavailableRuns, 1)
assert.equal(summary.byConfig.single.costUsd.n, 1)
assert.equal(summary.pairedAgainstBaseline['dag-fixed'].elapsedMsDelta.mean, -25)
assert.equal(summary.pairedAgainstBaseline['dag-fixed'].automatedPassRateDelta.mean, 0.5)

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskweaver-eval-report-test-'))
try {
  const jsonlPath = path.join(tempRoot, 'results.jsonl')
  await fs.writeFile(jsonlPath, `${JSON.stringify({ kind: 'start', runKey: 'ignored' })}\n${records.map(row => JSON.stringify(row)).join('\n')}\n`)
  const generated = await generateEvaluationReport(jsonlPath, tempRoot)
  const markdown = await fs.readFile(generated.markdownPath, 'utf8')
  assert.match(markdown, /95% CI/)
  assert.match(markdown, /费用不可用/)
  assert.match(markdown, /不代表 acceptance 条目已经人工评分/)
  assert.equal(JSON.parse(await fs.readFile(generated.jsonPath, 'utf8')).records, 4)
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
}

console.log('eval-report statistics, paired deltas, missing usage and output passed')
