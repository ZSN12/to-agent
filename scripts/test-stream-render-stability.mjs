import assert from 'node:assert/strict'
import { createFrameCoalescer } from '../src/features/chat/stream-frame-coalescer.ts'
import { createStableArrays, reuseUnchangedMessages } from '../src/features/chat/stable-messages.ts'
import { createStableCallbacks } from '../src/features/chat/stable-callbacks.ts'

function manualScheduler() {
  const pending = new Set()
  const schedule = (callback) => {
    pending.add(callback)
    return () => pending.delete(callback)
  }
  const runFrame = () => {
    const callbacks = [...pending]
    pending.clear()
    for (const callback of callbacks) callback()
  }
  return { schedule, runFrame, get size() { return pending.size } }
}

{
  const frames = manualScheduler()
  const batches = []
  const coalescer = createFrameCoalescer((items) => batches.push(items), frames.schedule)
  coalescer.push('a')
  coalescer.push('b')
  coalescer.push('c')
  assert.equal(batches.length, 0, 'queued items wait for the frame')
  assert.equal(frames.size, 1, 'one frame is scheduled per batch, not per item')
  frames.runFrame()
  assert.deepEqual(batches, [['a', 'b', 'c']], 'a frame applies every queued item once, in arrival order')

  coalescer.push('d')
  coalescer.flush()
  assert.deepEqual(batches.at(-1), ['d'], 'flush applies queued items before an order-sensitive event')
  assert.equal(frames.size, 0, 'flush cancels the pending frame')
  coalescer.flush()
  assert.equal(batches.length, 2, 'an empty flush applies nothing')

  coalescer.push('e')
  coalescer.dispose()
  frames.runFrame()
  assert.equal(batches.length, 2, 'dispose drops the scheduled frame')
}

{
  const user = { id: 'u1', author: 'user', name: '你', time: '10:00', text: 'hi' }
  const answer = { id: 'a1', author: 'orchestrator', name: 'TaskWeaver', time: '10:00', text: 'hello', usage: { inputTokens: 5, outputTokens: 2 } }
  const previous = reuseUnchangedMessages([], [user, answer])
  assert.equal(previous[0], user)

  const rebuilt = [structuredClone(user), structuredClone(answer)]
  assert.equal(
    reuseUnchangedMessages(previous, rebuilt),
    previous,
    'identical content rebuilt from JSON keeps the previous array',
  )

  const edited = [structuredClone(user), { ...structuredClone(answer), text: 'hello world' }]
  const next = reuseUnchangedMessages(previous, edited)
  assert.notEqual(next, previous)
  assert.equal(next[0], user, 'unchanged rows keep their identity')
  assert.equal(next[1], edited[1], 'changed rows take the new object')

  const nestedChange = [structuredClone(user), { ...structuredClone(answer), usage: { inputTokens: 5, outputTokens: 3 } }]
  assert.equal(reuseUnchangedMessages(previous, nestedChange)[1], nestedChange[1], 'nested field changes are detected')

  const appended = reuseUnchangedMessages(previous, [structuredClone(user), structuredClone(answer), { id: 'u2', author: 'user', name: '你', time: '10:01', text: 'more' }])
  assert.equal(appended.length, 3)
  assert.equal(appended[1], answer, 'appending keeps earlier rows')

  const removedKey = { ...structuredClone(answer) }
  delete removedKey.usage
  assert.equal(reuseUnchangedMessages(previous, [user, removedKey])[1], removedKey, 'a dropped field counts as a change')
}

{
  const bind = createStableCallbacks()
  const calls = []
  const first = bind('row:edit', (text) => calls.push(['v1', text]))
  const second = bind('row:edit', (text) => calls.push(['v2', text]))
  assert.equal(first, second, 'the bound callback keeps its identity across renders')
  first('x')
  assert.deepEqual(calls, [['v2', 'x']], 'the latest implementation runs')
  assert.equal(bind('row:edit', undefined), undefined, 'absent actions stay absent')
  assert.notEqual(bind('other', () => {}), first, 'keys are independent')
}

{
  const stableArray = createStableArrays()
  const rows = [{ id: 'r1', turn: 2, toolName: 'read', status: 'done' }]
  const first = stableArray('m1:rows', rows)
  assert.equal(stableArray('m1:rows', structuredClone(rows)), first, 'a rebuilt slice with equal rows keeps its identity')
  const empty = stableArray('m2:rows', [])
  assert.equal(stableArray('m2:rows', []), empty, 'repeated empty slices stay one array')
  const changed = [{ ...rows[0], status: 'error' }]
  assert.equal(stableArray('m1:rows', changed), changed, 'a changed row yields the new slice')
  assert.equal(stableArray('m1:rows', undefined), undefined, 'absent history stays absent')
}

console.log('stream render stability: ok')
