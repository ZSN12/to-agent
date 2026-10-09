import assert from 'node:assert/strict'
import {
  createEmptyTurnActivity,
  recordTurnActivity,
  serializeTurnActivity,
  normalizeHostToolName,
} from '../electron/backend/turn-activity.mjs'

assert.equal(normalizeHostToolName('ocx_client_read'), 'read')

const activity = createEmptyTurnActivity()
recordTurnActivity(activity, 'read', { file_path: 'src/a.ts' }, null, false)
recordTurnActivity(activity, 'grep', { pattern: 'foo' }, null, false)
recordTurnActivity(activity, 'bash', { command: 'npm test' }, null, false)
recordTurnActivity(activity, 'edit', { path: 'src/a.ts' }, { path: 'src/a.ts', addedLines: 2, deletedLines: 1 }, false)

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

console.log('test-turn-activity: ok')
