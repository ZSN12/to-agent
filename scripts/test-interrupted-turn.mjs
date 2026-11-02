import assert from 'node:assert/strict'
import {
  findInterruptedTurn,
  loadDismissedInterruptedTurnIds,
  rememberDismissedInterruptedTurn,
} from '../src/features/chat/interrupted-turn-state.ts'

const request = { id: 'user-1', author: 'user', text: '检查这个项目' }
const ready = { sending: false, loading: false, running: false, runningStatusReady: true }
assert.deepEqual(findInterruptedTurn([request], ready, new Set()), {
  id: request.id,
  text: request.text,
}, 'a durable unanswered user request is reported after run state is known')

for (const visibility of [
  { ...ready, sending: true },
  { ...ready, loading: true },
  { ...ready, running: true },
  { ...ready, runningStatusReady: false },
]) {
  assert.equal(findInterruptedTurn([request], visibility, new Set()), null,
    'the warning stays hidden while the run is active or runtime status is unsettled')
}

assert.equal(findInterruptedTurn([
  request,
  { id: 'assistant-1', author: 'orchestrator', text: '检查完成' },
], ready, new Set()), null, 'a later assistant reply clears the warning')
assert.equal(findInterruptedTurn([request], ready, new Set([request.id])), null,
  'a dismissed request does not show the warning again')
assert.equal(findInterruptedTurn([
  request,
  { id: 'context-1', author: 'orchestrator', text: 'context', dshContext: { plugin: 'test' } },
], ready, new Set())?.id, request.id,
'a DSH context projection does not count as a user-visible answer')

let stored = null
const storage = {
  getItem() { return stored },
  setItem(_key, value) { stored = value },
}
let dismissed = loadDismissedInterruptedTurnIds(storage)
assert.equal(dismissed.size, 0)
dismissed = rememberDismissedInterruptedTurn(dismissed, request.id, storage)
assert.equal(loadDismissedInterruptedTurnIds(storage).has(request.id), true,
  'Ignore persists across app reloads and conversation switches')

stored = '{invalid'
assert.equal(loadDismissedInterruptedTurnIds(storage).size, 0,
  'corrupt local storage safely falls back to an empty dismissal list')

console.log('interrupted-turn visibility and persistent dismissal checks passed')
