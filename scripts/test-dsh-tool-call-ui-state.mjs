import assert from 'node:assert/strict'
import {
  dshToolCallUiStateKey,
  readDshToolCallUiState,
  saveDshToolCallUiState,
} from '../src/features/chat/dshToolCallUiState.ts'

const rows = [{ callId: 'call-1', toolName: 'read', argsRaw: '{}', status: 'done', turn: 7, step: 2 }]
const keyDuringStreaming = dshToolCallUiStateKey('conversation-1', rows, [])
assert.ok(keyDuringStreaming)

saveDshToolCallUiState(keyDuringStreaming, {
  openId: 'call-1',
  batchExpandedOverride: true,
  stepExpandedOverrides: { 'task:main:turn:7:step:2': true },
})

const keyAfterCompletionRemount = dshToolCallUiStateKey('conversation-1', rows, [])
assert.equal(keyAfterCompletionRemount, keyDuringStreaming, 'streaming and settled message use the same conversation-turn scope')
assert.deepEqual(readDshToolCallUiState(keyAfterCompletionRemount), {
  openId: 'call-1',
  batchExpandedOverride: true,
  stepExpandedOverrides: { 'task:main:turn:7:step:2': true },
}, 'expanded call history survives the streaming-to-final-message remount')

const nextTurnKey = dshToolCallUiStateKey('conversation-1', [
  { callId: 'call-2', toolName: 'grep', argsRaw: '{}', status: 'running', turn: 8, step: 1 },
], [])
assert.notEqual(nextTurnKey, keyDuringStreaming)
assert.deepEqual(readDshToolCallUiState(nextTurnKey), {
  openId: null,
  batchExpandedOverride: null,
  stepExpandedOverrides: {},
}, 'a new turn retains the collapsed-by-default behavior')

console.log('dsh-tool-call-ui-state smoke passed')
