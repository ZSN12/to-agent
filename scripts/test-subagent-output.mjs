import assert from 'node:assert/strict'
import {
  SUBAGENT_OUTPUT_MAX_ITEMS,
  SUBAGENT_OUTPUT_MAX_TEXT_LENGTH,
  SUBAGENT_OUTPUT_MAX_TOTAL_TEXT_LENGTH,
  mergeSubagentOutputs,
  subagentOutputsFromTasks,
} from '../backend/orchestration/subagent-output.mjs'

const task = (id, text, extra = {}) => ({
  id,
  title: `Task ${id}`,
  role: 'worker',
  messages: [
    { author: 'agent', text: 'draft' },
    { author: 'user', text: 'ignored' },
    { author: 'agent', text, modelKey: 'provider/model-a', usage: { inputTokens: 3, outputTokens: 4 } },
  ],
  ...extra,
})

// Only the final agent message is projected; empty outputs are skipped.
const basic = subagentOutputsFromTasks([
  task('a', '  final answer  ', { durationMs: -5, routeReason: '  cheap  ' }),
  task('b', '   '),
  null,
], 'run-1')
assert.equal(basic.length, 1)
assert.deepEqual(basic[0], {
  id: 'run-1:a:0',
  role: 'worker',
  title: 'Task a',
  model: 'provider/model-a',
  modelKey: 'provider/model-a',
  routeReason: 'cheap',
  durationMs: 0,
  usage: { inputTokens: 3, outputTokens: 4 },
  text: 'final answer',
})
assert.deepEqual(subagentOutputsFromTasks(undefined), [])

// A single huge output is truncated with a visible marker.
const [long] = subagentOutputsFromTasks([task('long', 'x'.repeat(SUBAGENT_OUTPUT_MAX_TEXT_LENGTH * 3))])
assert.equal(long.text.length, SUBAGENT_OUTPUT_MAX_TEXT_LENGTH)
assert.match(long.text, /已截断/)

// The item count and the total text budget are both enforced.
const many = subagentOutputsFromTasks(Array.from({ length: SUBAGENT_OUTPUT_MAX_ITEMS + 20 }, (_, index) => task(`t${index}`, 'ok')))
assert.equal(many.length, SUBAGENT_OUTPUT_MAX_ITEMS)
const heavy = subagentOutputsFromTasks(Array.from({ length: 20 }, (_, index) => task(`h${index}`, 'y'.repeat(SUBAGENT_OUTPUT_MAX_TEXT_LENGTH))))
const heavyTotal = heavy.reduce((sum, output) => sum + output.text.length, 0)
assert.ok(heavyTotal <= SUBAGENT_OUTPUT_MAX_TOTAL_TEXT_LENGTH)
assert.ok(heavy.length < 20)

// Merging outputs from several DAG runs in one turn stays within the budgets.
const merged = mergeSubagentOutputs(heavy, heavy)
assert.ok(merged.reduce((sum, output) => sum + output.text.length, 0) <= SUBAGENT_OUTPUT_MAX_TOTAL_TEXT_LENGTH)
assert.deepEqual(mergeSubagentOutputs(undefined, basic), basic)

console.log('subagent output projection and size limits passed')
