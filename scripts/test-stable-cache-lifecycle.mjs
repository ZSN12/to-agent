import assert from 'node:assert/strict'
import { createStableCallbacks } from '../src/features/chat/stable-callbacks.ts'
import { createStableArrays } from '../src/features/chat/stable-messages.ts'

const callbacks = createStableCallbacks()
const arrays = createStableArrays()
const calls = []
const owner = { thread: 'temporary-a' }
callbacks.retain(owner, ['m1:edit', 'm2:edit'])
arrays.retain(owner, ['m1:rows', 'm2:rows'])
const firstCallback = callbacks('m1:edit', () => calls.push('first'))
const firstArray = arrays('m1:rows', [{ id: 'tool', status: 'done' }])
callbacks('m2:edit', () => calls.push('removed'))
arrays('m2:rows', [{ id: 'removed' }])
callbacks.retain(owner, ['m1:edit'])
arrays.retain(owner, ['m1:rows'])
assert.equal(callbacks.size, 1, 'rollback deletes callbacks outside the current message set')
assert.equal(arrays.size, 1, 'rollback deletes tool slices outside the current message set')
assert.equal(callbacks('m1:edit', () => calls.push('latest')), firstCallback, 'retaining a valid key preserves callback identity')
assert.equal(arrays('m1:rows', structuredClone(firstArray)), firstArray, 'retaining a valid key preserves equal array identity')
firstCallback()
assert.deepEqual(calls, ['latest'], 'active callbacks still invoke their latest implementation')

assert.equal(callbacks('m1:edit', undefined), undefined)
assert.equal(callbacks.size, 0, 'disabled actions release their closure entry immediately')
firstCallback()
assert.deepEqual(calls, ['latest'], 'a previously rendered disabled action is revoked')
const reenabled = callbacks('m1:edit', () => calls.push('reenabled'))
assert.notEqual(reenabled, firstCallback, 're-enabling creates a fresh entry rather than reviving stale callbacks')
assert.equal(arrays('m1:rows', undefined), undefined)
assert.equal(arrays.size, 0, 'undefined history releases the old array')
const restoredArray = arrays('m1:rows', structuredClone(firstArray))
assert.notEqual(restoredArray, firstArray, 'removed arrays do not return through a later equal projection')

const anotherTemporaryOwner = { thread: 'temporary-a' }
callbacks.retain(anotherTemporaryOwner, ['m1:edit'])
arrays.retain(anotherTemporaryOwner, ['m1:rows'])
assert.equal(callbacks.size, 0, 'different temporary thread identities isolate even equal labels')
assert.equal(arrays.size, 0)
const anotherCallback = callbacks('m1:edit', () => calls.push('other-owner'))
const anotherArray = arrays('m1:rows', structuredClone(firstArray))
assert.notEqual(anotherCallback, reenabled, 'identical message IDs cannot share callback entries across owners')
assert.notEqual(anotherArray, restoredArray, 'identical slice contents cannot share cache entries across owners')
reenabled()
assert.deepEqual(calls, ['latest'], 'old-owner callbacks do not call either old or new-owner implementations')
anotherCallback()
assert.deepEqual(calls, ['latest', 'other-owner'])

callbacks.retain(owner, ['m1:edit'])
arrays.retain(owner, ['m1:rows'])
assert.notEqual(callbacks('m1:edit', () => calls.push('back')), firstCallback, 'returning to an old owner does not revive an evicted closure')
assert.notEqual(arrays('m1:rows', structuredClone(firstArray)), firstArray)
anotherCallback()
assert.deepEqual(calls, ['latest', 'other-owner'], 'callbacks from an intervening owner remain revoked')

assert.equal(callbacks('not-active', () => calls.push('unexpected')), undefined, 'unowned keys cannot add callbacks beyond the active-key budget')
const uncached = [{ id: 'unowned' }]
assert.equal(arrays('not-active', uncached), uncached, 'unowned data can render without being retained')
assert.equal(callbacks.size, 1)
assert.equal(arrays.size, 1)

// Deterministic capacity checks, including overlapping IDs, deleted messages and rollback.
const heldCallbacks = []
for (let turn = 0; turn < 100; turn += 1) {
  const scope = `thread-${turn % 7}`
  const ids = Array.from({ length: 1 + turn % 40 }, (_, index) => `m${index}`)
  const callbackKeys = ids.flatMap((id) => ['fork', 'rewind', 'edit', 'regenerate', 'retry'].map((action) => `${id}:${action}`))
  const arrayKeys = ids.flatMap((id) => [`${id}:rows`, `${id}:traces`])
  callbacks.retain(scope, callbackKeys)
  arrays.retain(scope, arrayKeys)
  for (const key of callbackKeys) heldCallbacks.push(callbacks(key, () => calls.push(scope)))
  for (const key of arrayKeys) arrays(key, [{ id: `${scope}:${key}` }])
  assert.equal(callbacks.size, 5 * ids.length)
  assert.equal(arrays.size, 2 * ids.length)
  const callback = callbacks(`${ids[0]}:fork`, () => calls.push(scope))
  const slice = arrays(`${ids[0]}:rows`, [{ id: `${scope}:${ids[0]}:rows` }])
  callbacks.retain(scope, [`${ids[0]}:fork`])
  arrays.retain(scope, [`${ids[0]}:rows`])
  assert.equal(callbacks.size, 1, 'rollback shrinks to exactly the retained callback budget')
  assert.equal(arrays.size, 1, 'rollback shrinks to exactly the retained array budget')
  assert.equal(callbacks(`${ids[0]}:fork`, () => calls.push(scope)), callback)
  assert.equal(arrays(`${ids[0]}:rows`, [{ id: `${scope}:${ids[0]}:rows` }]), slice)
  callbacks.retain(scope, [])
  arrays.retain(scope, [])
  assert.equal(callbacks.size, 0, 'deleting all messages releases all callback entries')
  assert.equal(arrays.size, 0, 'deleting all messages releases all array entries')
}
const count = calls.length
for (const callback of heldCallbacks) callback()
assert.equal(calls.length, count, 'all retained references from deleted/switched conversations are inert')
callbacks.clear()
arrays.clear()
assert.equal(callbacks.size, 0)
assert.equal(arrays.size, 0)

// Independently gated row actions must use row keys; disabling one cannot revoke another.
callbacks.retain('fork-rows', ['user:fork', 'assistant:fork'])
const userFork = callbacks('user:fork', () => calls.push('user-fork'))
callbacks('assistant:fork', undefined)
userFork()
assert.equal(calls.at(-1), 'user-fork')
callbacks.clear()
userFork()
assert.equal(calls.length, count + 1, 'explicit clear revokes outstanding references too')

console.log('stable cache lifecycle passed: identity, latest implementations, revocation, owner isolation, 100-switch capacity, rollback and deletion')
