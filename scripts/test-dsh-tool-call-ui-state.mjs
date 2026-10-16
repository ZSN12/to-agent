import assert from 'node:assert/strict'
import {
  dshToolCallUiStateKey,
  readDshToolCallUiState,
  saveDshToolCallUiState,
} from '../src/features/chat/dshToolCallUiState.ts'
import { dshToolRowPresentation } from '../src/features/chat/dshToolRowModel.ts'

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
assert.equal(dshToolRowPresentation('orchestrate', '{"goal":"拆分任务"}', null, 'running').title,
  '正在规划多智能体任务', 'the model-facing orchestration call has a localized title')
assert.equal(dshToolRowPresentation('orchestrate', '{"goal":"拆分任务"}').title,
  '多智能体编排', 'the settled orchestration call has a localized title')

console.log('dsh-tool-call-ui-state smoke passed')
