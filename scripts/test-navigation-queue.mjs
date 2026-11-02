import assert from 'node:assert/strict'
import { createNavigationQueue } from '../src/features/app/hooks/navigation-queue.ts'

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const queue = createNavigationQueue()
const first = deferred()
const calls = []
const a = queue.run(() => { calls.push('A'); return first.promise })
const b = queue.run(async () => { calls.push('B'); return 'thread-B' })
await Promise.resolve()
assert.deepEqual(calls, ['A'], 'only one backend mutation may run at a time')
first.resolve('thread-A')
assert.deepEqual(await a, { current: false }, 'late A must not replace the latest clicked conversation')
assert.deepEqual(await b, { current: true, ok: true, value: 'thread-B' })
assert.deepEqual(calls, ['A', 'B'])

const failed = deferred()
const c = queue.run(() => failed.promise)
const d = queue.run(async () => 'thread-D')
failed.reject(new Error('offline'))
assert.deepEqual(await c, { current: false }, 'a superseded failure must not show on the new conversation')
assert.deepEqual(await d, { current: true, ok: true, value: 'thread-D' }, 'a rejected operation must release the queue')
const failure = await queue.run(async () => { throw new Error('backend unavailable') })
assert.equal(failure.current, true)
assert.equal(failure.ok, false)
assert.equal(failure.error.message, 'backend unavailable')
console.log('navigation queue checks passed: ordering, stale results, stale failures, recovery')
