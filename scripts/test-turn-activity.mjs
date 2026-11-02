import assert from 'node:assert/strict'
import {
  createEmptyTurnActivity,
  recordTurnActivity,
  serializeTurnActivity,
  normalizeHostToolName,
} from '../backend/turn-activity.mjs'

assert.equal(normalizeHostToolName('ocx_client_read'), 'read')

const activity = createEmptyTurnActivity()
recordTurnActivity(activity, 'read', { file_path: 'src/a.ts' }, null, false, {
  id: 'read-1', inputSummary: 'src/a.ts', resultSummary: '执行完成 · 1 个结果块', outputId: 'output-1', durationMs: 12,
})
recordTurnActivity(activity, 'grep', { pattern: 'foo' }, null, false, {
  id: 'grep-1', inputSummary: 'foo', resultSummary: '执行完成 · 2 个结果块', durationMs: 8,
})
recordTurnActivity(activity, 'bash', { command: 'npm test' }, null, false, {
  id: 'bash-1', inputSummary: 'npm test', resultSummary: '执行完成',
  commandSummary: 'npm test',
  commandOutcome: { exitCode: 0, background: false, timedOut: false, sandboxDenied: false },
  commandOutputTail: 'tests passed\napi_key=example-secret-value',
  durationMs: 25,
})
recordTurnActivity(activity, 'edit', { path: 'src/a.ts' }, { path: 'src/a.ts', diff: '+new code', addedLines: 2, deletedLines: 1 }, false, {
  id: 'edit-1', inputSummary: 'src/a.ts', resultSummary: '执行完成',
  fileDiff: { type: 'edit', path: 'src/a.ts', diff: '+new code' }, durationMs: 18,
})

const fileChanges = new Map([
  ['src/a.ts', { path: 'src/a.ts', addedLines: 2, deletedLines: 1, statsComplete: true }],
])
const snap = serializeTurnActivity(activity, fileChanges)
assert.equal(snap.editedFileCount, 1)
assert.equal(snap.exploredFileCount, 1)
assert.equal(snap.searchCount, 1)
assert.equal(snap.commandCount, 1)
assert.equal(snap.addedLines, 2)
assert.equal(snap.deletedLines, 1)
assert.equal(snap.details.length, 4)
assert.deepEqual(snap.details[0], {
  id: 'read-1', toolName: 'read', inputSummary: 'src/a.ts', resultSummary: '执行完成 · 1 个结果块',
  outputId: 'output-1', durationMs: 12,
})
assert.deepEqual(snap.details[2].commandOutcome, {
  exitCode: 0, background: false, timedOut: false, sandboxDenied: false,
})
assert.equal(snap.details[2].commandSummary, 'npm test')
assert.match(snap.details[2].commandOutputTail, /tests passed/)
assert.doesNotMatch(snap.details[2].commandOutputTail, /example-secret-value/, 'command output evidence is redacted before persistence')
assert.deepEqual(snap.details[3].fileDiff, { type: 'edit', path: 'src/a.ts', diff: '+new code' })

const bounded = createEmptyTurnActivity()
for (let index = 0; index < 105; index += 1) {
  recordTurnActivity(bounded, 'grep', { pattern: `query-${index}` }, null, false, {
    id: `grep-${index}`, inputSummary: `query-${index}`, resultSummary: '执行完成',
  })
}
const boundedSnapshot = serializeTurnActivity(bounded, new Map())
assert.equal(boundedSnapshot.searchCount, 105, 'counts should include calls beyond the detail cap')
assert.equal(boundedSnapshot.details.length, 100, 'persisted details should be bounded')
assert.equal(boundedSnapshot.detailsTruncated, true)

console.log('test-turn-activity: ok')
