import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aggregateUsage, resolveEvaluationPreset, validateSuite } from './eval-run.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const suitePath = path.join(root, 'eval/coding-agent/tasks.json')
const rawText = await fs.readFile(suitePath, 'utf8')
const suite = JSON.parse(rawText)
assert.equal(suite.tasks.length, 52)
assert.deepEqual(validateSuite(suite, rawText), [])
assert.equal(resolveEvaluationPreset(suite.tasks[0], 'single'), 'taskweaver-readonly')
assert.equal(resolveEvaluationPreset(suite.tasks[0], 'dag-fixed'), 'tw-default', 'DAG mode needs an orchestrate-capable primary preset')
assert.equal(resolveEvaluationPreset(suite.tasks[3], 'dag-routed'), 'tw-default')
assert.equal(validateSuite({ ...suite, tasks: suite.tasks.map((task, index) => index === 3 ? { ...task, repeatCount: 1 } : task) }, rawText)
  .some(issue => issue.includes('high-stochasticity')), true)

const knownZeroCost = aggregateUsage({ result: { usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 2, cacheWriteTokens: 1, costUsd: 0 } } })
assert.deepEqual(knownZeroCost, { inputTokens: 10, outputTokens: 4, cacheTokens: 3, costUsd: 0 })
const unavailableCost = aggregateUsage({ result: { usage: { inputTokens: 10, outputTokens: 4 } } })
assert.equal(unavailableCost.costUsd, null, 'missing provider cost must remain unavailable')

const dryRun = spawnSync(process.execPath, ['scripts/eval-run.mjs', '--dry-run'], { cwd: root, encoding: 'utf8' })
assert.equal(dryRun.status, 0, dryRun.stderr)
const plan = JSON.parse(dryRun.stdout)
assert.equal(plan.status, 'dry-run-ok')
assert.equal(plan.taskCount, 52)
assert.equal(plan.selectedTaskCount, 5)
assert.equal(plan.plannedRuns, 27)
assert.equal(plan.modelCalls, 0)
assert.equal(plan.worktreesCreated, 0)
assert.equal(plan.networkCalls, 0)

const fixture = spawnSync(process.execPath, [
  'scripts/taskweaver-headless.mjs', '--fixture', '--json-summary', '--text', 'local eval fixture',
  '--evaluation-mode', 'dag-routed', '--eval-secure', '--permission-mode', 'readonly', '--preset', 'tw-default',
  '--report-dir', '/tmp/taskweaver-eval-fixture',
], { cwd: root, encoding: 'utf8' })
assert.equal(fixture.status, 0, fixture.stderr)
const summary = fixture.stdout.split(/\r?\n/).map(line => {
  try { return JSON.parse(line) } catch { return null }
}).findLast(row => row?.wrapper === 'taskweaver-headless')
assert.equal(summary?.ok, true)
assert.equal(summary?.fixture, true)

console.log('eval-run suite validation, usage accounting, dry-run and local fixture passed')
